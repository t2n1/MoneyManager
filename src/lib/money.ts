// Tiền luôn lưu ở ĐƠN VỊ NHỎ NHẤT (minor units, khớp bigint trong DB):
// JPY = yên, VND = đồng, USD = cent. Không bao giờ dùng float.
// Nhập liệu kiểu ATM: chuỗi chữ số chính là minor units ("1050" USD → $10,50).

export type CurrencyCode = 'JPY' | 'VND' | 'USD'

export const CURRENCIES: Record<
  CurrencyCode,
  { symbol: string; decimals: number; label: string; position: 'prefix' | 'suffix' }
> = {
  JPY: { symbol: '¥', decimals: 0, label: 'Yên Nhật', position: 'prefix' },
  VND: { symbol: '₫', decimals: 0, label: 'Đồng Việt Nam', position: 'suffix' },
  USD: { symbol: '$', decimals: 2, label: 'Đô la Mỹ', position: 'prefix' },
}

const groupThousands = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/** minor units → chuỗi hiển thị: ¥1.234 · 1.234.000 ₫ · $1.234,56 */
export function formatMoney(minor: number, currency: CurrencyCode): string {
  const { symbol, decimals, position } = CURRENCIES[currency]
  const sign = minor < 0 ? '-' : ''
  const abs = Math.trunc(Math.abs(minor)).toString().padStart(decimals + 1, '0')
  const intPart = decimals > 0 ? abs.slice(0, -decimals) : abs
  const fracPart = decimals > 0 ? `,${abs.slice(-decimals)}` : ''
  const body = `${groupThousands(intPart)}${fracPart}`
  return position === 'prefix' ? `${sign}${symbol}${body}` : `${sign}${body} ${symbol}`
}

/** Chuỗi bất kỳ → minor units (chỉ giữ chữ số). Không có chữ số → 0. */
export function parseMoney(input: string): number {
  const digits = input.replace(/\D/g, '')
  return digits === '' ? 0 : Number(digits)
}
