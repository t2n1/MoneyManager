// Hút bảng giá cổ phiếu Việt Nam từ SSI iBoard.
//
// Vì sao SSI: đã đo ngày 2026-08-05 — trả đủ ba sàn, giá theo ĐỒNG, miễn phí, không
// khoá. TCBS bị Cloudflare chặn, VNDirect trả rỗng. Chi tiết trong spec.
//
// Vì sao ở server chứ không ở app: SSI trả `Access-Control-Allow-Origin:
// https://iboard.ssi.com.vn` nên trình duyệt không gọi được. Đây là ràng buộc, không
// phải lựa chọn.
//
// parseBoard tách khỏi fetchBoard để test được bằng file mẫu, không cần mạng.

export type Exchange = 'hose' | 'hnx' | 'upcom'

export interface PriceUpsert {
  symbol: string
  exchange: Exchange
  name: string
  /** đồng/cổ; luôn > 0 */
  price: number
  prior_close: number | null
  /** ISO date */
  trading_date: string
}

const BOARD_URL = (ex: Exchange) => `https://iboard-query.ssi.com.vn/stock/exchange/${ex}`

/** 'YYYYMMDD' của SSI → 'YYYY-MM-DD'. Chuỗi không đúng 8 số → null. */
function isoFromCompact(s: unknown): string | null {
  if (typeof s !== 'string' || !/^\d{8}$/.test(s)) return null
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

function positive(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null
}

/**
 * Bảng giá SSI → hàng để upsert.
 *
 * Giá lấy `matchedPrice` (giá khớp lệnh). Ngoài giờ giao dịch hoặc mã không khớp lệnh
 * thì nó bằng 0 — rơi về `priorClosePrice`, rồi `refPrice`. Không có giá nào dùng được
 * thì BỎ mã đó: cột `price` có check > 0, và một mã giá 0 trong bảng còn tệ hơn một mã
 * thiếu (thiếu thì UI cảnh báo "chưa có giá", còn 0 thì âm thầm làm tổng tài sản tụt).
 */
export function parseBoard(exchange: Exchange, json: unknown): PriceUpsert[] {
  const data = (json as { data?: unknown } | null)?.data
  if (!Array.isArray(data)) return []

  const out: PriceUpsert[] = []
  for (const raw of data) {
    const r = raw as Record<string, unknown>
    const symbol = typeof r.stockSymbol === 'string' ? r.stockSymbol.trim().toUpperCase() : ''
    if (!symbol) continue

    const trading_date = isoFromCompact(r.tradingDate)
    if (!trading_date) continue

    const price = positive(r.matchedPrice) ?? positive(r.priorClosePrice) ?? positive(r.refPrice)
    if (price === null) continue

    out.push({
      symbol,
      exchange,
      name: typeof r.companyNameVi === 'string' ? r.companyNameVi : '',
      price,
      prior_close: positive(r.priorClosePrice),
      trading_date,
    })
  }
  return out
}

/** Gọi một sàn. Lỗi mạng / HTTP → throw, người gọi tự quyết bỏ sàn đó. */
export async function fetchBoard(exchange: Exchange): Promise<PriceUpsert[]> {
  const res = await fetch(BOARD_URL(exchange), {
    headers: { 'User-Agent': 'Mozilla/5.0 (so-chi-tieu stock-refresh)' },
  })
  if (!res.ok) throw new Error(`SSI ${exchange}: HTTP ${res.status}`)
  return parseBoard(exchange, await res.json())
}
