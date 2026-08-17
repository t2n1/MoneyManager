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

/**
 * Che phần SỐ bằng đúng bấy nhiêu ký tự (§4.8 / 20c).
 *
 * Trước đây che bằng bốn chấm cố định (`¥••••`), nên bật/tắt chế độ riêng tư là cả cột
 * số bên phải XÊ DỊCH: `¥1,234,567` (10 ký tự) co xuống `¥••••` (5), rồi bung ra lại.
 * Ở một bảng hai chục dòng thì đó là cả bảng nhảy — và người bật che số thường đang ở
 * chỗ đông người, tức đúng lúc không muốn màn hình động đậy.
 *
 * Che CẢ dấu phân cách nghìn, không giữ lại: `¥•,•••,•••` vẫn vẽ ra đúng cấu trúc hàng
 * triệu. Bề rộng thì dù sao cũng lộ độ lớn — nhưng đó là cái giá của yêu cầu "rộng đúng
 * bằng số thật", không cần lộ thêm.
 *
 * Từ bản 1a mọi con số đi qua <Money> đều là font ĐƠN CÁCH, nên "bằng số ký tự" chính
 * là "bằng số pixel". Ở font sans thì nó chỉ xấp xỉ — chấp nhận được, và không có chỗ
 * nào trong app còn in tiền bằng font sans.
 *
 * Dấu âm GIỮ NGUYÊN: nó nói chiều, không nói số tiền, và giữ nó thì bề rộng vẫn khớp
 * đúng chuỗi thật.
 */
function maskDigits(body: string): string {
  return '•'.repeat(body.length)
}

/** minor units → chuỗi hiển thị: ¥1,234 · 1.234.000 ₫ · $1.234,56 */
export function formatMoney(minor: number, currency: CurrencyCode): string {
  const { symbol, decimals, position, group, decimal } = CURRENCIES[currency]
  const sign = minor < 0 ? '-' : ''
  const abs = Math.trunc(Math.abs(minor)).toString().padStart(decimals + 1, '0')
  const intPart = decimals > 0 ? abs.slice(0, -decimals) : abs
  const fracPart = decimals > 0 ? `${decimal}${abs.slice(-decimals)}` : ''
  const real = `${groupThousands(intPart, group)}${fracPart}`
  const body = isPrivacyEnabled() ? maskDigits(real) : real
  return position === 'prefix' ? `${sign}${symbol}${body}` : `${sign}${body} ${symbol}`
}

/** Chuỗi bất kỳ → minor units (chỉ giữ chữ số). Không có chữ số → 0. */
export function parseMoney(input: string): number {
  const digits = input.replace(/\D/g, '')
  return digits === '' ? 0 : Number(digits)
}

/** minor units → nhãn ngắn cho trục biểu đồ (¥300k, 1.5M…). Giữ dấu âm. */
export function formatCompact(minor: number, currency: CurrencyCode): string {
  // Che bằng ĐÚNG số ký tự của nhãn thật, cùng lý do với formatMoney: nhãn trục co
  // từ "300M" xuống "•••" là cả trục tung xê sang, kéo theo vùng vẽ của biểu đồ.
  if (isPrivacyEnabled()) return maskDigits(formatCompactReal(minor, currency))
  return formatCompactReal(minor, currency)
}

function formatCompactReal(minor: number, currency: CurrencyCode): string {
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
