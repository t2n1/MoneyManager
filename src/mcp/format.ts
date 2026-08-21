// Hình dạng số tiền trả cho Claude.
//
// Vì sao không dùng `formatMoney` của lib/money.ts: money.ts gọi `isPrivacyEnabled()` nên
// kéo theo lib/privacy.ts, mà file đó import React và đọc localStorage ngay lúc nạp module —
// xem features/notifications/purity.test.ts. Ngoài ra chế độ riêng tư biến số thành '•••',
// thứ tuyệt đối không được lọt vào dữ liệu máy đọc. Nên bám lib/currencies.ts (module lá).
//
// Trả CẢ `so` (số nguyên minor units, đúng như DB) VÀ `hien` (chuỗi đã format): Claude đọc
// `hien` để nói cho người, và không bao giờ phải tự chia đơn vị — chia đơn vị là chỗ nó sẽ
// sai với JPY/VND (0 chữ số thập phân) so với USD (2 chữ số).
import { CURRENCIES, groupThousands, type CurrencyCode } from '../lib/currencies'

export interface Tien {
  don_vi: CurrencyCode
  /** Số nguyên minor units (yên / đồng / cent) — đúng như DB, không phải major. */
  so: number
  /** Chuỗi đã format theo quy ước của chính đồng tiền đó. */
  hien: string
}

export function tien(minor: number, don_vi: CurrencyCode): Tien {
  const { symbol, decimals, position, group, decimal } = CURRENCIES[don_vi]
  const sign = minor < 0 ? '-' : ''
  const abs = Math.trunc(Math.abs(minor)).toString().padStart(decimals + 1, '0')
  const intPart = decimals > 0 ? abs.slice(0, -decimals) : abs
  const fracPart = decimals > 0 ? `${decimal}${abs.slice(-decimals)}` : ''
  const body = `${groupThousands(intPart, group)}${fracPart}`
  const hien = position === 'prefix' ? `${sign}${symbol}${body}` : `${sign}${body} ${symbol}`
  return { don_vi, so: minor, hien }
}
