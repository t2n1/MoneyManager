// Hút 基準価額 quỹ đầu tư Nhật từ thư viện tra cứu của 投資信託協会.
//
// Endpoint (đo thật 2026-08-12, gọi bằng curl):
//   https://toushin-lib.fwg.ne.jp/FdsWeb/FDST030000/csv-file-download
//     ?isinCd=<ISIN>&associFundCd=<協会コード>
// Miễn phí, không khoá, không đăng nhập. Trả CSV đủ lịch sử từ ngày lập quỹ.
//
// BỐN CÁI BẪY, cả bốn đều thuộc loại "trông như chạy đúng":
//
// ① File là Shift-JIS, NHƯNG server khai `Content-Type: text/plain; charset=utf-8`.
//    Đọc bằng res.text() thì cột SỐ vẫn đúng, chỉ cột NGÀY và tên ra rác — nên phép tính
//    tiền vẫn ra số trông hợp lý, chỉ có nav_date sai, và từ đó valued_on sai. Vì vậy
//    parseNavCsv nhận `Uint8Array` chứ không nhận string: việc giải mã nằm TRONG hàm để
//    bài test bắt được nếu ai đó đổi sang UTF-8.
//    Nhãn phải là 'shift_jis' — 'cp932' KHÔNG được Node hỗ trợ (đã đo).
//
// ② Thiếu một trong hai tham số → HTTP **200** kèm body `{"statusCode":null}` (19 byte),
//    không phải CSV. Cả hai mã sai → 500 kèm cùng body. Nên điều kiện nhận là DÒNG ĐẦU
//    decode ra đúng `年月日`, không phải res.ok.
//
// ③ Không có header CORS → trình duyệt của app không gọi thẳng được, bắt buộc qua edge
//    function. Giống Yahoo và SSI; đừng mất một lượt đi thử lại.
//
// ④ Endpoint chỉ nhận MỘT quỹ mỗi lần — không có dạng gọi nhiều mã như Yahoo spark.
//
// parseNavCsv tách khỏi fetchFundNavs để test bằng file mẫu, không cần mạng lẫn Deno.
// Xem thêm: docs/quy-nhat.md

/** Một hàng để upsert vào `fund_prices`. */
export interface NavUpsert {
  assoc_fund_cd: string
  /** ¥/10.000口; luôn > 0 */
  nav: number
  /** phiên trước; null = CSV chỉ có một phiên hợp lệ */
  prior_nav: number | null
  /** 純資産総額, TRIỆU yên; null = cột thiếu/hỏng. KHÔNG dùng để tính tiền. */
  net_assets_m: number | null
  /** ngày PHIÊN của giá, ISO date */
  nav_date: string
}

export type NavParseError =
  /** Không phải CSV giá — mã sai, thiếu tham số, hoặc giải mã sai (xem bẫy ① và ②). */
  | 'ma-sai'
  /** Đúng là CSV giá nhưng không có dòng dữ liệu nào hợp lệ. */
  | 'khong-co-dong-nao'

export type NavParseResult = { ok: true; row: NavUpsert } | { ok: false; loi: NavParseError }

/** Dòng header của file giá, sau khi decode đúng. Là trọng tài duy nhất — xem bẫy ②. */
const COT_NGAY = '年月日'

/** `2026年08月10日` → `2026-08-10`; null nếu không đúng dạng. */
function ngayNhatSangISO(s: string): string | null {
  const m = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(s.trim())
  if (!m) return null
  const [, y, thang, ngay] = m
  return `${y}-${thang.padStart(2, '0')}-${ngay.padStart(2, '0')}`
}

/** '1,175,583' → 1175583; null nếu không phải số hữu hạn > 0. */
function soDuong(s: string | undefined): number | null {
  if (s == null) return null
  const v = Number(s.replace(/,/g, '').trim())
  return Number.isFinite(v) && v > 0 ? Math.round(v) : null
}

/**
 * Byte CSV của 投信協会 → một hàng `fund_prices` cho phiên MỚI NHẤT.
 *
 * Nhận `Uint8Array` chứ không nhận string là CỐ Ý — xem bẫy ① ở đầu file.
 *
 * `nav_date` parse từ chuỗi `2026年08月10日` bằng regex, **không** đưa qua `new Date()`:
 * chuỗi đó đã là ngày phiên theo giờ Nhật, cho `Date` xử lý là mời một lỗi múi giờ. Dòng
 * nào có ngày hỏng hoặc nav không phải số dương thì BỎ dòng đó — cột `nav` có
 * `check (nav > 0)` và cột `nav_date` là `not null`.
 */
export function parseNavCsv(bytes: Uint8Array, assocFundCd: string): NavParseResult {
  // 'shift_jis': nhãn duy nhất dùng trong repo này. Deno và Node (ICU đầy đủ) đều nhận.
  const text = new TextDecoder('shift_jis').decode(bytes)
  const dong = text.split(/\r?\n/)

  // Trọng tài: dòng đầu phải chứa 年月日. Body {"statusCode":null}, trang HTML lỗi, hay
  // một lần giải mã sai đều rơi vào đây.
  if (!dong[0] || !dong[0].includes(COT_NGAY)) return { ok: false, loi: 'ma-sai' }

  // Gom mọi dòng HỢP LỆ rồi lấy hai dòng CUỐI THEO THỨ TỰ XUẤT HIỆN trong file — tức là
  // có giả định file xếp cũ → mới (đo trên file thật: đúng). Điều KHÔNG giả định là các
  // dòng hợp lệ nằm liền nhau: một dòng hỏng chen giữa vẫn bị bỏ đúng, nên `prior_nav`
  // luôn là dòng HỢP LỆ kế cuối chứ không phải `dong[n-2]`.
  const hopLe: { navDate: string; nav: number; netAssetsM: number | null }[] = []
  for (const raw of dong.slice(1)) {
    if (!raw.trim()) continue
    const o = raw.split(',')
    const navDate = ngayNhatSangISO(o[0] ?? '')
    if (navDate === null) continue
    const nav = soDuong(o[1])
    if (nav === null) continue
    hopLe.push({ navDate, nav, netAssetsM: soDuong(o[2]) })
  }

  if (hopLe.length === 0) return { ok: false, loi: 'khong-co-dong-nao' }

  const cuoi = hopLe[hopLe.length - 1]
  const keCuoi = hopLe.length >= 2 ? hopLe[hopLe.length - 2] : null

  return {
    ok: true,
    row: {
      assoc_fund_cd: assocFundCd,
      nav: cuoi.nav,
      prior_nav: keCuoi?.nav ?? null,
      net_assets_m: cuoi.netAssetsM,
      nav_date: cuoi.navDate,
    },
  }
}

/** Một điểm trong lịch sử 基準価額. */
export interface NavPoint {
  /** ISO date */
  navDate: string
  /** ¥/10.000口 */
  nav: number
}

/**
 * TOÀN BỘ lịch sử 基準価額 trong file, xếp theo ngày tăng dần, mỗi ngày một điểm.
 *
 * Dùng cho chế độ lấp lịch sử: CSV tải về đã có đủ lịch sử từ ngày lập quỹ, nên dựng lại
 * `account_valuations` cho các phiên đã qua KHÔNG tốn thêm một cuộc gọi mạng nào.
 *
 * Không phải CSV giá (mã sai, thiếu tham số, giải mã hỏng) → mảng RỖNG. Nơi gọi tự hiểu
 * là không có gì để lấp; ném lỗi ở đây sẽ làm chết cả lượt lấp vì một quỹ hỏng.
 */
export function parseNavHistory(bytes: Uint8Array): NavPoint[] {
  const text = new TextDecoder('shift_jis').decode(bytes)
  const dong = text.split(/\r?\n/)
  if (!dong[0] || !dong[0].includes(COT_NGAY)) return []

  // Map để một ngày chỉ còn một điểm (file thật không lặp, nhưng đừng tin mù — hai điểm
  // cùng ngày sẽ làm phép lấp ghi hai giá trị khác nhau cho cùng một valued_on).
  const theoNgay = new Map<string, number>()
  for (const raw of dong.slice(1)) {
    if (!raw.trim()) continue
    const o = raw.split(',')
    const navDate = ngayNhatSangISO(o[0] ?? '')
    if (navDate === null) continue
    const nav = soDuong(o[1])
    if (nav === null) continue
    theoNgay.set(navDate, nav)
  }

  return [...theoNgay.entries()]
    .map(([navDate, nav]) => ({ navDate, nav }))
    .sort((a, b) => a.navDate.localeCompare(b.navDate))
}

/**
 * Endpoint CSV của 投信協会. Export vì chế độ lấp lịch sử trong `index.ts` cũng gọi nó —
 * và một URL viết ở hai chỗ là một URL sẽ lệch: đổi endpoint thì sửa một chỗ, quên chỗ
 * kia, và không test nào bắt được vì cả hai đều "chạy".
 */
export const CSV_URL = 'https://toushin-lib.fwg.ne.jp/FdsWeb/FDST030000/csv-file-download'

// Ngân sách cho CẢ khối hút giá (mọi quỹ cộng lại), không phải cho một quỹ. Danh bạ dự
// kiến vài quỹ chứ không phải vài trăm, nhưng edge function có giới hạn wall-clock và
// nguồn chậm/treo giữa chừng vẫn có thể xảy ra. Hết ngân sách thì DỪNG SẠCH (không gọi
// thêm quỹ nào) và báo thật đã hút được bao nhiêu, thay vì để cả invocation chết.
const FETCH_BUDGET_MS = 60_000

// Không giả dạng bot: nhiều hạ tầng chặn thẳng User-Agent tự xưng bot. Cùng lý do với
// stock-refresh/prices.ts.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** Một quỹ trong danh bạ. Cần CẢ hai mã mới gọi được — xem bẫy ②. */
export interface FundRef {
  assocFundCd: string
  isinCd: string
}

export interface NavFetchResult {
  rows: NavUpsert[]
  /**
   * assocFundCd → kết quả, để `index.ts` ghi vào `funds.last_status`. Quỹ CHƯA KỊP GỌI
   * (hết ngân sách) cố ý KHÔNG có mặt: đánh dấu 'ma-sai' cho nó là vu oan, và lượt sau
   * nó được gọi trước nhờ buildFundFetchOrder.
   */
  trangThai: Map<string, 'ok' | 'ma-sai' | 'loi-mang'>
  /** Lỗi của TỪNG quỹ — quỹ khác vẫn có mặt trong `rows`, không mất theo. */
  errors: string[]
  /** true nếu dừng giữa chừng vì hết FETCH_BUDGET_MS — KHÁC "một quỹ bị lỗi". */
  hetNganSach: boolean
}

/**
 * Thứ tự hút: quỹ ĐANG giữ trước, phần còn lại của danh bạ sau.
 *
 * Mỗi quỹ là một cuộc gọi riêng (endpoint không nhận nhiều quỹ một lần), nên hết ngân
 * sách giữa chừng thì quỹ gọi SAU là quỹ thiếu giá. Quỹ người dùng thực sự đang giữ mới
 * là quỹ cần có giá hôm nay — không để nó may rủi theo thứ tự danh bạ.
 *
 * Mã giữ mà KHÔNG có trong danh bạ thì bỏ qua: khác cổ phiếu (Yahoo tự bỏ qua mã lạ nên
 * hút thử vẫn rẻ), ở đây không có ISIN thì không gọi được gì cả. FK của `fund_trades` đã
 * chặn ca này ở DB, nhưng hàm vẫn không được nổ nếu nó xảy ra.
 */
export function buildFundFetchOrder(held: string[], all: FundRef[]): FundRef[] {
  const theoMa = new Map(all.map((f) => [f.assocFundCd, f]))
  const truoc: FundRef[] = []
  const daXep = new Set<string>()
  for (const ma of held) {
    const f = theoMa.get(ma)
    if (f && !daXep.has(ma)) {
      daXep.add(ma)
      truoc.push(f)
    }
  }
  return [...truoc, ...all.filter((f) => !daXep.has(f.assocFundCd))]
}

/** Tuỳ chọn cho fetchFundNavs — chỉ để test (đồng hồ giả, fetch giả, ngân sách giả). */
interface FetchNavOptions {
  /** Mặc định FETCH_BUDGET_MS (60s). */
  budgetMs?: number
  /** Mặc định Date.now — tiêm vào để canh mốc thời gian mà không sleep thật. */
  now?: () => number
  /** Mặc định fetch toàn cục. */
  fetchImpl?: typeof fetch
}

/**
 * Gọi CSV cho từng quỹ trong danh sách, theo đúng thứ tự đã truyền vào (dùng
 * `buildFundFetchOrder` để dựng thứ tự đó). Một quỹ lỗi bị bắt riêng và góp vào `errors`;
 * không throw làm mất luôn những quỹ đã hút được.
 *
 * Đọc `arrayBuffer()` chứ KHÔNG `text()`: file là Shift-JIS trong khi server khai UTF-8 —
 * xem bẫy ① ở đầu file. Việc giải mã nằm trong parseNavCsv.
 *
 * Ngân sách được kiểm ở đầu MỌI vòng lặp, kể cả vòng đầu — cùng hình dạng với
 * `fetchYahooPrices` trong stock-refresh/prices.ts. Với đồng hồ thật, `start` và lần kiểm
 * đầu tiên cách nhau vài micro-giây nên vòng đầu không bao giờ vướng; giữ đúng khuôn để
 * người đọc so hai file không gặp một khác biệt không ai giải thích được.
 */
export async function fetchFundNavs(
  funds: FundRef[],
  opts: FetchNavOptions = {},
): Promise<NavFetchResult> {
  const budgetMs = opts.budgetMs ?? FETCH_BUDGET_MS
  const now = opts.now ?? Date.now
  const goi = opts.fetchImpl ?? fetch

  const rows: NavUpsert[] = []
  const trangThai = new Map<string, 'ok' | 'ma-sai' | 'loi-mang'>()
  const errors: string[] = []
  const start = now()
  let hetNganSach = false
  let soQuyDaGoi = 0

  for (const f of funds) {
    if (now() - start >= budgetMs) {
      hetNganSach = true
      break
    }

    // Cả hai tham số, luôn luôn. Thiếu một cái thì server trả 200 kèm 19 byte JSON và
    // parseNavCsv sẽ báo 'ma-sai' — đúng nhưng đi sai hướng debug.
    const url =
      `${CSV_URL}?isinCd=${encodeURIComponent(f.isinCd)}` +
      `&associFundCd=${encodeURIComponent(f.assocFundCd)}`
    try {
      const res = await goi(url, { headers: { 'User-Agent': BROWSER_UA } })
      if (!res.ok) throw new Error(`toushin: HTTP ${res.status} (${f.assocFundCd})`)
      const kq = parseNavCsv(new Uint8Array(await res.arrayBuffer()), f.assocFundCd)
      if (kq.ok) {
        rows.push(kq.row)
        trangThai.set(f.assocFundCd, 'ok')
      } else {
        trangThai.set(f.assocFundCd, 'ma-sai')
        errors.push(`${f.assocFundCd}: ${kq.loi}`)
      }
    } catch (err) {
      trangThai.set(f.assocFundCd, 'loi-mang')
      errors.push(`${f.assocFundCd}: ${err instanceof Error ? err.message : String(err)}`)
    }
    soQuyDaGoi++
  }

  if (hetNganSach) {
    errors.push(
      `hết ngân sách thời gian hút giá sau ${soQuyDaGoi}/${funds.length} quỹ (đã hút ${rows.length} quỹ)`,
    )
  }

  return { rows, trangThai, errors, hetNganSach }
}
