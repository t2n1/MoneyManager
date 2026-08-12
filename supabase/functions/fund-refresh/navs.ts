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

  // Gom mọi dòng HỢP LỆ, giữ nguyên thứ tự file (cũ → mới). Không giả định file luôn
  // được sắp: lấy hai dòng hợp lệ cuối theo đúng thứ tự xuất hiện.
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
