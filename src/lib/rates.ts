// Tỷ giá tự động cho tổng quan/báo cáo quy đổi về base currency (mặc định JPY).
// Nguồn: open.er-api.com — miễn phí, không cần API key, có VND (ECB/frankfurter thì không).
// Fallback: cache localStorage → lỗi mạng vẫn dùng tỷ giá cũ; chưa từng có → UI
// tự tách tổng theo từng loại tiền (convertToBase trả null).

// Nhập từ module lá ./currencies (KHÔNG phải ./money): convertToBase được bộ luật
// thông báo gọi, mà money.ts kéo theo lib/privacy.ts (React + localStorage).
import { CURRENCIES, type CurrencyCode } from './currencies'

/** major units: 1 đơn vị base đổi được rates[X] đơn vị X */
export type Rates = Partial<Record<CurrencyCode, number>>

const CACHE_KEY = (base: string) => `sct-rates-${base}`

/** Số ngày cũ tối đa trước khi UI kêu. Nguồn chỉ đổi số 1 lần/ngày nên 1–2 ngày
 *  cũ là chuyện thường (offline qua đêm); quá 3 ngày là hỏng thật. */
export const STALE_RATE_DAYS = 3

export type RatesCache = {
  rates: Rates
  /** epoch ms — lúc APP tải số về. Giữ để soi lỗi, KHÔNG dùng để phán "cũ". */
  fetchedAt: number
  /** epoch ms — lúc NGUỒN định giá con số (`time_last_update_unix` × 1000).
   *  Thiếu = bản ghi cache viết trước khi có tính năng này. */
  sourceUpdatedAt?: number
}

export async function fetchRates(base: CurrencyCode): Promise<Rates> {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as {
      result: string
      rates: Record<string, number>
      time_last_update_unix?: number
    }
    if (json.result !== 'success') throw new Error('API không trả về success')
    const rates: Rates = {}
    for (const code of Object.keys(CURRENCIES) as CurrencyCode[]) {
      if (json.rates[code]) rates[code] = json.rates[code]
    }
    // Nguồn không trả mốc thời gian thì BỎ QUA — việc lấy tỷ giá không được hỏng vì nó.
    const src = json.time_last_update_unix
    const cache: RatesCache = {
      rates,
      fetchedAt: Date.now(),
      ...(typeof src === 'number' && src > 0 ? { sourceUpdatedAt: src * 1000 } : {}),
    }
    localStorage.setItem(CACHE_KEY(base), JSON.stringify(cache))
    return rates
  } catch (err) {
    const cached = readRatesMeta(base)
    if (cached) return cached.rates
    throw err
  }
}

/**
 * Đọc bản ghi cache tỷ giá. null khi chưa có, JSON hỏng, hoặc thiếu `rates`.
 * Không bao giờ ném lỗi — nơi gọi là đường dự phòng lúc mạng đã hỏng sẵn.
 */
export function readRatesMeta(base: CurrencyCode): RatesCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY(base))
    if (raw === null) return null
    const parsed = JSON.parse(raw) as Partial<RatesCache>
    if (typeof parsed?.rates !== 'object' || parsed.rates === null) return null
    return {
      rates: parsed.rates,
      fetchedAt: typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : 0,
      ...(typeof parsed.sourceUpdatedAt === 'number'
        ? { sourceUpdatedAt: parsed.sourceUpdatedAt }
        : {}),
    }
  } catch {
    return null
  }
}

/** Số ngày trọn vẹn từ lúc nguồn định giá tới `now`. Mốc ở tương lai → 0. */
export function rateAgeDays(sourceUpdatedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - sourceUpdatedAt) / 86_400_000))
}

/**
 * Đổi minor units của `from` sang minor units của `base`.
 * Trả null nếu thiếu tỷ giá — caller phải fallback (hiển thị tách loại tiền).
 */
export function convertToBase(
  minor: number,
  from: CurrencyCode,
  base: CurrencyCode,
  rates: Rates,
): number | null {
  if (from === base) return minor
  const rate = rates[from]
  if (!rate) return null
  const fromMajor = minor / 10 ** CURRENCIES[from].decimals
  const baseMajor = fromMajor / rate
  return Math.round(baseMajor * 10 ** CURRENCIES[base].decimals)
}
