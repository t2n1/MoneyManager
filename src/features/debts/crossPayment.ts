// Trả nợ XUYÊN TỆ — khoản nợ ghi bằng một loại tiền, tiền trả về lại bằng loại khác.
// Ca thật: người ta nợ mình bằng Yên, trả lại bằng VNĐ vào tài khoản Việt Nam.
//
// Một lần trả khi đó mang HAI số, đi hai chỗ khác nhau trong DB:
//   • `debt_payments.amount` — số XOÁ NỢ, theo tệ của KHOẢN NỢ (¥)
//   • `transactions.amount`  — số THẬT đổi số dư, theo tệ của VÍ (₫)
// DB chưa bao giờ bắt hai số này bằng nhau (supabaseRepo ghi hai chỗ độc lập); chỉ
// giao diện v1 bắt, bằng cách lọc ví theo tệ khoản nợ. Bỏ được phép lọc đó thì mọi
// thứ còn lại chỉ là hỏi cho đủ hai số.
//
// LUẬT CỦA MODULE NÀY: tỷ giá của một lần trả là tỷ giá HAI BÊN THOẢ THUẬN, không
// phải tỷ giá thị trường. Nên hai hàm dưới đây chỉ GỢI Ý và HIỂN THỊ — số người dùng
// gõ luôn thắng, và không có chỗ nào ở đây được phép ghi đè nó.

import { CURRENCIES, type CurrencyCode } from '../../lib/currencies'
import { convertBetween, type Rates } from '../../lib/rates'

/**
 * Số TIẾP THEO cho ô đối ứng khi số bên kia đổi.
 *
 * Cùng một nếp với `nextReceived` của remitDerive.ts, và cùng một lý do: một khi
 * người dùng đã gõ tay ô này thì KHÔNG lần đổi nào được đạp lên số đó nữa. Ở màn Gửi
 * tiền, số người nhận báo lại là sự thật còn tỷ giá chỉ là ước lượng; ở đây cũng vậy
 * — hai bên chốt "15 triệu ₫ xoá hết 100 nghìn ¥" thì con số đó là thoả thuận, chợ
 * hôm nay ăn 166 ₫/¥ không liên quan.
 *
 * Suy không được (thiếu tỷ giá, chưa nhập số nguồn) thì GIỮ NGUYÊN số hiện tại —
 * không xoá về 0 chỉ vì dữ liệu tạm thiếu, giống quy ước "thiếu rate thì loại ra,
 * không bịa" của cả repo.
 */
export function nextCounterAmount(args: {
  /** Số đang có trong ô đối ứng. */
  current: number
  /** true = người dùng đã gõ tay ô này ít nhất một lần — không được ghi đè nữa. */
  touched: boolean
  /** Số ở ô bên kia (nguồn để suy). */
  source: number
  from: CurrencyCode
  to: CurrencyCode
  base: CurrencyCode
  rates: Rates
}): number {
  const { current, touched, source, from, to, base, rates } = args
  if (touched) return current
  if (source <= 0) return current
  return convertBetween(source, from, to, base, rates) ?? current
}

/**
 * Tỷ giá NGẦM của lần trả này: 1 đơn vị tệ nợ = bao nhiêu đơn vị tệ ví, tính theo
 * MAJOR units (¥1 = 150 ₫, không phải theo minor units).
 *
 * Đọc ra từ chính hai số người dùng gõ, để bày lại cho họ tự kiểm — gõ nhầm một số 0
 * ở ô 15 triệu thì dòng tỷ giá nhảy từ 150 lên 1.500 và nhìn là thấy, còn hai con số
 * đứng cạnh nhau thì không.
 *
 * null = không có gì để nói: cùng loại tiền, hoặc chưa đủ hai số.
 */
export function impliedRate(
  debtMinor: number,
  debtCurrency: CurrencyCode,
  accountMinor: number,
  accountCurrency: CurrencyCode,
): number | null {
  if (debtCurrency === accountCurrency) return null
  if (debtMinor <= 0 || accountMinor <= 0) return null
  const debtMajor = debtMinor / 10 ** CURRENCIES[debtCurrency].decimals
  const accountMajor = accountMinor / 10 ** CURRENCIES[accountCurrency].decimals
  return accountMajor / debtMajor
}
