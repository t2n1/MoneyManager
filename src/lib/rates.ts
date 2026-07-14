// Tỷ giá tự động cho tổng quan/báo cáo quy đổi về base currency (mặc định JPY).
// Nguồn: open.er-api.com — miễn phí, không cần API key, có VND (ECB/frankfurter thì không).
// Fallback: cache localStorage → lỗi mạng vẫn dùng tỷ giá cũ; chưa từng có → UI
// tự tách tổng theo từng loại tiền (convertToBase trả null).

import { CURRENCIES, type CurrencyCode } from './money'

/** major units: 1 đơn vị base đổi được rates[X] đơn vị X */
export type Rates = Partial<Record<CurrencyCode, number>>

const CACHE_KEY = (base: string) => `sct-rates-${base}`

export async function fetchRates(base: CurrencyCode): Promise<Rates> {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as { result: string; rates: Record<string, number> }
    if (json.result !== 'success') throw new Error('API không trả về success')
    const rates: Rates = {}
    for (const code of Object.keys(CURRENCIES) as CurrencyCode[]) {
      if (json.rates[code]) rates[code] = json.rates[code]
    }
    localStorage.setItem(CACHE_KEY(base), JSON.stringify({ rates, fetchedAt: Date.now() }))
    return rates
  } catch (err) {
    const cached = localStorage.getItem(CACHE_KEY(base))
    if (cached) return (JSON.parse(cached) as { rates: Rates }).rates
    throw err
  }
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
