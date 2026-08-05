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
// parseYahooSpark tách khỏi fetchYahooPrices để test được bằng file mẫu, không cần mạng.

/** Luôn 'hose' — hậu tố `.VN` của Yahoo CHÍNH LÀ sàn Hồ Chí Minh, không phải chỗ tạm. */
export interface PriceUpsert {
  symbol: string
  exchange: 'hose'
  /** Yahoo không trả tên công ty — luôn rỗng. UI lấy tên từ src/features/assets/hoseSymbols.ts. */
  name: string
  /** đồng/cổ; luôn > 0 */
  price: number
  prior_close: number | null
  /** ISO date, tính theo giờ Việt Nam — xem isoDateInVietnam */
  trading_date: string
}

const SPARK_URL = 'https://query1.finance.yahoo.com/v8/finance/spark'
// Vài chục mã một lô: đủ nhỏ để URL không quá dài (query string có giới hạn thực tế ở
// nhiều hạ tầng, dù Yahoo không công bố con số), và một lô hỏng (mạng, rate limit) chỉ
// mất đúng số mã của lô đó, không kéo sập các lô khác đã gọi xong.
const CHUNK_SIZE = 40
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
      name: '',
      price,
      prior_close: positive(r.chartPreviousClose),
      trading_date: isoDateInVietnam(ts),
    })
  }
  return out
}

/** Kết quả một lượt gọi Yahoo cho nhiều mã, có thể bị chia thành nhiều lô. */
export interface YahooFetchResult {
  rows: PriceUpsert[]
  /** Lỗi của TỪNG lô bị hỏng — lô khác vẫn có mặt trong `rows`, không mất theo. */
  errors: string[]
}

/**
 * Gọi Yahoo cho một danh sách mã KHÔNG hậu tố, chia lô để URL không phình to và để một
 * lô hỏng không kéo mất các lô đã gọi thành công. Mỗi lô lỗi (HTTP không phải 2xx, hoặc
 * mạng đứt) bị bắt riêng và góp vào `errors` — người gọi (index.ts) tự quyết ghi log,
 * không throw làm mất luôn những lô đã có kết quả.
 */
export async function fetchYahooPrices(symbols: string[]): Promise<YahooFetchResult> {
  const rows: PriceUpsert[] = []
  const errors: string[] = []

  for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
    const chunk = symbols.slice(i, i + CHUNK_SIZE)
    const query = chunk.map((s) => `${s}.VN`).join(',')
    const url = `${SPARK_URL}?symbols=${encodeURIComponent(query)}&range=1d&interval=1d`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } })
      if (!res.ok) throw new Error(`Yahoo spark: HTTP ${res.status} (lô ${i / CHUNK_SIZE + 1})`)
      rows.push(...parseYahooSpark(await res.json()))
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  return { rows, errors }
}
