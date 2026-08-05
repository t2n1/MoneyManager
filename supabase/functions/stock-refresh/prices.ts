// Hút giá cổ phiếu Việt Nam từ Yahoo Finance (spark API), sau khi SSI iBoard bị loại.
//
// Vì sao không còn SSI: đo ngày 2026-08-06 từ đúng function đã deploy (region Mumbai,
// ap-south-1) — cả `iboard-query.ssi.com.vn/stock/exchange/{hose,hnx,upcom}` lẫn host
// khác `iboard-api.ssi.com.vn` đều trả 403 "Security Check", kể cả khi giả dạng trình
// duyệt đầy đủ (User-Agent + Referer + Origin + Accept). SSI chặn theo DẢI IP trung tâm
// dữ liệu, không phải theo header — cùng URL gọi từ máy cá nhân vẫn trả 200. Không có
// cách né từ Supabase. Chi tiết + bằng chứng: docs/co-phieu-viet-nam.md.
//
// Vì sao Yahoo: `query1.finance.yahoo.com/v8/finance/spark?symbols=...` trả 200 từ
// đúng function đó, và nhận NHIỀU mã trong một cuộc gọi (khác `/v8/finance/chart/` chỉ
// nhận một mã, và khác `v7/finance/quote` đòi xác thực → 401).
//
// Giới hạn phải chấp nhận: Yahoo phục vụ cổ phiếu Việt Nam qua hậu tố `.VN`, và hậu tố
// đó CHỈ là sàn Hồ Chí Minh (HOSE) — mã HNX/UPCOM trả "Not Found" (đã thử PVS, VGI).
// Chủ app chỉ giữ cổ phiếu HOSE nên đây là quyết định chấp nhận được, không phải sơ sót:
// một mã HNX/UPCOM sẽ không có giá, hiện "chưa có giá" trên UI, và bị việc 2 bỏ qua
// tài khoản đó (`thieu-gia-moi-ma`) thay vì ghi một con số sai.
//
// Bug nghiêm trọng đã sửa (2026-08-06): CHUNK_SIZE từng là 40, nhưng Yahoo giới hạn
// CỨNG 20 mã/lô (HTTP 400 "Number of symbols needs to be less than or equal to 20" —
// xem chỗ khai báo CHUNK_SIZE). Với 40, MỌI lô đều hỏng — chưa từng có giá nào được
// hút thật sự kể từ khi chuyển sang Yahoo cho tới khi sửa.
//
// Hút cả sàn HOSE, không chỉ mã đã giao dịch: trước đây chỉ hút mã trong sổ lệnh
// (loadTradedSymbols), nghĩa là một mã vừa mua hôm nay chưa có giá cho tới lượt cron kế
// tiếp — hiện "chưa có giá" ngay ngày ghi lệnh. Hút cả HOSE_SYMBOLS (403 mã) thì mã nào
// cũng có giá sẵn ngay khi ghi vào sổ lệnh. Đổi lại là ~21 lô một lượt thay vì vài lô —
// bù bằng buildFetchOrder (mã đang giữ luôn được gọi trước) và FETCH_BUDGET_MS (dừng
// sạch nếu Yahoo chậm/treo, không kéo cả invocation vượt giới hạn wall-clock).
//
// parseYahooSpark, chunkSymbols, buildFetchOrder tách khỏi fetchYahooPrices để test
// được bằng file mẫu / dữ liệu giả, không cần mạng.

import { HOSE_SYMBOLS } from './_holdings.js'

/** Luôn 'hose' — hậu tố `.VN` của Yahoo CHÍNH LÀ sàn Hồ Chí Minh, không phải chỗ tạm. */
export interface PriceUpsert {
  symbol: string
  exchange: 'hose'
  /**
   * Tên công ty, điền từ danh sách tĩnh HOSE_SYMBOLS (Yahoo không trả tên công ty).
   * Rỗng nếu mã không có trong danh sách đó — mã mới lên sàn sau lần hút danh sách gần
   * nhất, hoặc gõ nhầm trong sổ lệnh; Yahoo vẫn có thể trả giá nên hàng giá vẫn giữ,
   * chỉ riêng tên là không biết. UI (HoldingsSection, TradeFormSheet) đã tự tra
   * HOSE_SYMBOLS từ trước và không đọc cột này — điền ở đây là để `stock_prices` tự
   * mô tả được chính nó, không phải để phục vụ UI.
   */
  name: string
  /** đồng/cổ; luôn > 0 */
  price: number
  prior_close: number | null
  /** ISO date, tính theo giờ Việt Nam — xem isoDateInVietnam */
  trading_date: string
}

/** Tên công ty tra theo mã, dựng một lần từ danh sách tĩnh HOSE_SYMBOLS. */
const TEN_CONG_TY: ReadonlyMap<string, string> = new Map(HOSE_SYMBOLS)

const SPARK_URL = 'https://query1.finance.yahoo.com/v8/finance/spark'
// Đo trực tiếp ngày 2026-08-06: gọi Yahoo với 403, 250, 150, 100, 60 mã một lần đều trả
// HTTP 400, body:
//   {"spark":{"result":null,"error":{"code":"Bad Request",
//   "description":"Number of symbols needs to be less than or equal to 20"}}}
// Yahoo tự nói rõ giới hạn: TỐI ĐA 20 mã một cuộc gọi. CHUNK_SIZE=40 (bản trước) khiến
// MỌI lô đều hỏng — không có mã nào từng được hút thật sự cho tới khi sửa. Đừng tăng
// con số này lên trên 20 mà không đo lại — xem chunkSymbols.test (prices.test.ts) canh
// đúng ranh giới này.
const CHUNK_SIZE = 20
// Ngân sách cho CẢ khối hút giá (mọi lô cộng lại), không phải cho một lô. 403 mã ở
// CHUNK_SIZE=20 là 21 lô tuần tự, thực đo ~0,6s/lô nên tổng khoảng 13s — nhưng edge
// function có giới hạn wall-clock, và Yahoo chậm/treo giữa chừng vẫn có thể xảy ra.
// Hết ngân sách thì DỪNG SẠCH (không gọi thêm lô nào nữa) và báo thật đã hút được bao
// nhiêu, thay vì để cả invocation chết vì vượt giới hạn của Supabase.
const FETCH_BUDGET_MS = 90_000
// Không giả dạng bot — trước đây UA tự xưng "so-chi-tieu stock-refresh", nhiều hạ tầng
// chặn thẳng UA tự xưng bot. Yahoo không đòi hỏi gì đặc biệt nhưng không có lý do để lộ.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** Ép về số nguyên dương, hoặc null nếu không phải số hữu hạn > 0. */
function positive(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null
}

/**
 * Unix giây → 'YYYY-MM-DD' theo giờ Việt Nam.
 *
 * `trading_date` nghĩa là "phiên nào", và phiên thuộc về SÀN GIAO DỊCH (giờ Việt Nam),
 * không phải giờ UTC của server hay giờ máy người chạy cron. Việt Nam không có giờ mùa
 * hè nên không cần lo lệch múi theo mùa (khác lịch hẹn giờ push, xem NotificationSettingsPage).
 */
function isoDateInVietnam(epochSeconds: number): string {
  // Locale 'en-CA' là mẹo quen dùng trong repo (xem src/lib/pushSchedule.ts) để
  // Intl.DateTimeFormat trả thẳng dạng YYYY-MM-DD, khỏi tự ghép parts.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(epochSeconds * 1000))
}

/**
 * Payload spark của Yahoo → hàng để upsert vào `stock_prices`.
 *
 * Shape: `{ "FPT.VN": { timestamp: [1785915907], close: [70300], chartPreviousClose:
 * 71500, ... }, ... }`. Một mã Yahoo không biết bị ÂM THẦM vắng mặt trong response (đã
 * kiểm: hỏi kèm một mã bịa cùng ba mã thật, response chỉ có ba mã thật) — nên không cần
 * xử lý riêng mã lạ, `close`/`timestamp` rỗng đã tự bị lọc bởi các điều kiện dưới.
 *
 * `price` lấy `close[0]`. Không phải số hữu hạn > 0 (null, 0, âm, thiếu mảng) → BỎ mã đó:
 * cột `price` có `check (price > 0)`, và một mã giá 0 còn tệ hơn một mã thiếu — thiếu thì
 * UI cảnh báo "chưa có giá", còn 0 thì âm thầm làm tổng tài sản tụt.
 *
 * `trading_date` cũng bắt buộc (cột `not null`): thiếu hoặc hỏng `timestamp[0]` → BỎ mã
 * đó luôn, vì không biết giá thuộc phiên nào thì không ghi được.
 */
export function parseYahooSpark(json: unknown): PriceUpsert[] {
  if (typeof json !== 'object' || json === null) return []

  const out: PriceUpsert[] = []
  for (const [key, raw] of Object.entries(json as Record<string, unknown>)) {
    const r = raw as Record<string, unknown> | null
    if (!r || typeof r !== 'object') continue

    const closeArr = Array.isArray(r.close) ? r.close : []
    const price = positive(closeArr[0])
    if (price === null) continue

    const tsArr = Array.isArray(r.timestamp) ? r.timestamp : []
    const ts = tsArr[0]
    if (typeof ts !== 'number' || !Number.isFinite(ts)) continue

    // Hậu tố '.VN' là thứ Yahoo tự thêm khi trả lời — bóc ra vì stock_trades.symbol
    // (và cột stock_prices.symbol) lưu mã KHÔNG hậu tố.
    const symbol = key.replace(/\.VN$/i, '').trim().toUpperCase()
    if (!symbol) continue

    out.push({
      symbol,
      exchange: 'hose',
      name: TEN_CONG_TY.get(symbol) ?? '',
      price,
      prior_close: positive(r.chartPreviousClose),
      trading_date: isoDateInVietnam(ts),
    })
  }
  return out
}

/**
 * Chia một danh sách mã thành các lô tối đa `size` phần tử, giữ nguyên thứ tự. Hàm
 * thuần, tách khỏi fetchYahooPrices để test được đúng RANH GIỚI lô mà không cần gọi
 * mạng — đây là bài canh chống lại lỗi ngày 2026-08-06 (CHUNK_SIZE=40 cũ vượt giới hạn
 * 20 mã/lô của Yahoo, khiến mọi lô đều hỏng).
 */
export function chunkSymbols(symbols: string[], size: number = CHUNK_SIZE): string[][] {
  const out: string[][] = []
  for (let i = 0; i < symbols.length; i += size) out.push(symbols.slice(i, i + size))
  return out
}

/**
 * Ghép thứ tự hút giá: mã ĐANG/ĐÃ giao dịch (`heldSymbols`, từ `loadTradedSymbols`)
 * đứng TRƯỚC, phần còn lại của sàn (`universeSymbols`, từ HOSE_SYMBOLS) đứng SAU.
 *
 * Vì sao thứ tự quan trọng: hút cả sàn là hơn 20 lô gọi tuần tự; nếu Yahoo giới hạn tốc
 * độ hoặc mạng chập chờn giữa chừng, lô nào gọi SAU sẽ là lô hỏng. Mã người dùng thực sự
 * đang giữ mới là mã cần có giá — không thể để nó may rủi theo thứ tự alphabet của cả
 * sàn. `loadTradedSymbols` vì vậy giờ quyết định ƯU TIÊN gọi trước, không còn quyết định
 * mã nào ĐƯỢC hút hay không (đó là việc của universeSymbols = cả sàn) — đừng tưởng nó là
 * thứ thừa nếu thấy universe đã có sẵn mọi mã.
 *
 * Không lặp mã: một mã vừa giữ vừa có trong universe chỉ xuất hiện một lần (ở đầu, không
 * lặp lại ở phần sau). Mã giữ nhưng KHÔNG có trong universe (đã hủy niêm yết, gõ sai mã,
 * hoặc lọt HNX/UPCOM vào sổ lệnh) vẫn được xếp ở đầu — hút thử vẫn rẻ hơn bỏ sót, và
 * Yahoo tự bỏ qua mã nó không biết (xem parseYahooSpark).
 */
export function buildFetchOrder(heldSymbols: string[], universeSymbols: string[]): string[] {
  const chuan = (s: string) => s.trim().toUpperCase()
  const held: string[] = []
  const heldSet = new Set<string>()
  for (const s of heldSymbols.map(chuan)) {
    if (s && !heldSet.has(s)) {
      heldSet.add(s)
      held.push(s)
    }
  }

  const rest: string[] = []
  const seenRest = new Set<string>()
  for (const s of universeSymbols.map(chuan)) {
    if (s && !heldSet.has(s) && !seenRest.has(s)) {
      seenRest.add(s)
      rest.push(s)
    }
  }

  return [...held, ...rest]
}

/** Kết quả một lượt gọi Yahoo cho nhiều mã, có thể bị chia thành nhiều lô. */
export interface YahooFetchResult {
  rows: PriceUpsert[]
  /** Lỗi của TỪNG lô bị hỏng — lô khác vẫn có mặt trong `rows`, không mất theo. */
  errors: string[]
  /**
   * true nếu dừng giữa chừng vì hết ngân sách thời gian (FETCH_BUDGET_MS) — KHÔNG phải
   * vì một lô bị lỗi. Tách riêng khỏi `errors` (dù cũng góp một dòng vào đó để không
   * mất thông tin khi log) để người gọi phân biệt được "Yahoo từ chối một lô" với "hết
   * giờ, còn lô chưa kịp gọi".
   */
  hetNganSach: boolean
}

/** Tuỳ chọn cho fetchYahooPrices — chỉ dùng để test (đồng hồ giả, ngân sách giả). */
interface FetchYahooOptions {
  /** Mặc định FETCH_BUDGET_MS (90s). */
  budgetMs?: number
  /** Mặc định Date.now — tiêm vào để test canh mốc thời gian mà không cần sleep thật. */
  now?: () => number
}

/**
 * Gọi Yahoo cho một danh sách mã KHÔNG hậu tố, chia lô (chunkSymbols) để URL không
 * phình to và để một lô hỏng không kéo mất các lô đã gọi thành công. Mỗi lô lỗi (HTTP
 * không phải 2xx, hoặc mạng đứt) bị bắt riêng và góp vào `errors` — người gọi
 * (index.ts) tự quyết ghi log, không throw làm mất luôn những lô đã có kết quả.
 *
 * Có ngân sách thời gian cho CẢ khối (không phải từng lô): hết ngân sách thì DỪNG SẠCH
 * trước khi gọi lô tiếp theo, không cắt ngang một lô đang chạy — trả về đúng những gì
 * đã hút được, `hetNganSach: true`, và một dòng trong `errors` nói rõ đã hút xong bao
 * nhiêu lô để phân biệt với lỗi của một lô cụ thể.
 */
export async function fetchYahooPrices(
  symbols: string[],
  opts: FetchYahooOptions = {},
): Promise<YahooFetchResult> {
  const budgetMs = opts.budgetMs ?? FETCH_BUDGET_MS
  const now = opts.now ?? Date.now

  const rows: PriceUpsert[] = []
  const errors: string[] = []
  const chunks = chunkSymbols(symbols)
  const start = now()
  let hetNganSach = false
  let soLoDaGoi = 0

  for (const chunk of chunks) {
    if (now() - start >= budgetMs) {
      hetNganSach = true
      break
    }

    const query = chunk.map((s) => `${s}.VN`).join(',')
    const url = `${SPARK_URL}?symbols=${encodeURIComponent(query)}&range=1d&interval=1d`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } })
      if (!res.ok) throw new Error(`Yahoo spark: HTTP ${res.status} (lô ${soLoDaGoi + 1}/${chunks.length})`)
      rows.push(...parseYahooSpark(await res.json()))
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
    soLoDaGoi++
  }

  if (hetNganSach) {
    errors.push(
      `hết ngân sách thời gian hút giá sau ${soLoDaGoi}/${chunks.length} lô (đã hút ${rows.length} mã)`,
    )
  }

  return { rows, errors, hetNganSach }
}
