// Tiền luôn lưu ở ĐƠN VỊ NHỎ NHẤT (minor units, khớp bigint trong DB):
// JPY = yên, VND = đồng, USD = cent. Không bao giờ dùng float.
// Nhập liệu kiểu ATM: chuỗi chữ số chính là minor units ("1050" USD → $10,50).
import { isPrivacyEnabled } from './privacy'
import { CURRENCIES, groupThousands, type CurrencyCode } from './currencies'

// Bảng loại tiền sống ở module lá ./currencies (không import gì) để những nơi chỉ
// cần bảng — assets/aggregate.ts, lib/rates.ts — không bị kéo theo lib/privacy.ts
// (React + localStorage). Xuất lại ở đây để mọi chỗ import cũ khỏi phải sửa.
export { CURRENCIES } from './currencies'
export type { CurrencyCode } from './currencies'

/** Chuỗi thay thế khi bật chế độ riêng tư, giữ đúng vị trí ký hiệu tiền tệ. */
function maskMoney(currency: CurrencyCode): string {
  const { symbol, position } = CURRENCIES[currency]
  return position === 'prefix' ? `${symbol}••••` : `•••• ${symbol}`
}

/** minor units → chuỗi hiển thị: ¥1,234 · 1.234.000 ₫ · $1.234,56 */
export function formatMoney(minor: number, currency: CurrencyCode): string {
  if (isPrivacyEnabled()) return maskMoney(currency)
  const { symbol, decimals, position, group, decimal } = CURRENCIES[currency]
  const sign = minor < 0 ? '-' : ''
  const abs = Math.trunc(Math.abs(minor)).toString().padStart(decimals + 1, '0')
  const intPart = decimals > 0 ? abs.slice(0, -decimals) : abs
  const fracPart = decimals > 0 ? `${decimal}${abs.slice(-decimals)}` : ''
  const body = `${groupThousands(intPart, group)}${fracPart}`
  return position === 'prefix' ? `${sign}${symbol}${body}` : `${sign}${body} ${symbol}`
}

/** Chuỗi bất kỳ → minor units (chỉ giữ chữ số). Không có chữ số → 0. */
export function parseMoney(input: string): number {
  const digits = input.replace(/\D/g, '')
  return digits === '' ? 0 : Number(digits)
}

/** minor units → nhãn ngắn cho trục biểu đồ (¥300k, 1.5M…). Giữ dấu âm. */
export function formatCompact(minor: number, currency: CurrencyCode): string {
  if (isPrivacyEnabled()) return '•••'
  const major = minor / 10 ** CURRENCIES[currency].decimals
  const abs = Math.abs(major)
  // Bỏ đuôi ".0" khi số chẵn: trục tung ghi "300M" chứ không "300.0M" — phần lẻ
  // bằng 0 là nhiễu, nhất là khi 5-6 nhãn trục xếp dọc cùng lúc.
  //
  // Có bậc B (tỷ): bản chiếu Lifetime theo VND chạm hàng trăm tỷ, thiếu bậc này thì
  // trục tung ghi "110000M" — về mặt kỹ thuật đúng, về mặt đọc là một chuỗi phải
  // ngồi đếm chữ số.
  if (abs >= 1_000_000_000) return `${(major / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`
  if (abs >= 1_000_000) return `${(major / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (abs >= 1_000) return `${Math.round(major / 1_000)}k`
  return String(Math.round(major))
}
