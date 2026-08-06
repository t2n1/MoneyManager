// "Xem thử bằng tiền khác" cho tab Hiện tại của Tài sản: MỘT chỗ quyết định số nào
// quy đổi, số nào giữ nguyên, và khi nào phải kèm ≈ — thay vì mỗi khối (tổng, nhóm,
// dòng tài khoản, thẻ tín dụng) tự lặp lại bộ ba convert/fallback/approx.
//
// Luật:
//   · Đang xem bằng tiền gốc → giữ nguyên MỌI số như trước giờ (dòng tài khoản vẫn
//     hiện tiền riêng của nó), không thêm ≈.
//   · Xem bằng tiền khác → mọi số quy đổi về đồng tiền đang xem, kèm ≈ vì chỉ là
//     ước chừng theo tỷ giá cache. Số vốn đã đúng đồng tiền đang xem thì giữ nguyên,
//     không ≈ (nó là số thật, không qua tỷ giá).
//   · Thiếu tỷ giá → giữ nguyên số ở tiền cũ (thà lệch đồng tiền còn hơn hiện số sai).
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { convertBetween, type Rates } from '../../lib/rates'

export interface ViewMoney {
  amount: number
  currency: CurrencyCode
  /** true khi số này đã đi qua tỷ giá → UI phải kèm ≈. */
  approx: boolean
}

export interface MoneyView {
  /** Đồng tiền đang xem. */
  cur: CurrencyCode
  /** true khi đang xem thử bằng tiền khác tiền gốc. */
  converted: boolean
  /** Quy đổi một số tiền (mặc định tính theo tiền gốc) sang đồng tiền đang xem. */
  view: (minor: number, from?: CurrencyCode) => ViewMoney
  /**
   * view + formatMoney, tự kèm '≈ ' khi có quy đổi. `extraApprox` để cộng thêm cờ
   * ước chừng sẵn có của con số (vd. tổng gộp ngoại tệ, thiếu tỷ giá một phần).
   */
  fmt: (minor: number, from?: CurrencyCode, extraApprox?: boolean) => string
}

export function makeMoneyView(
  base: CurrencyCode,
  viewCur: CurrencyCode,
  rates: Rates,
): MoneyView {
  const converted = viewCur !== base
  const view = (minor: number, from: CurrencyCode = base): ViewMoney => {
    if (!converted || from === viewCur) return { amount: minor, currency: from, approx: false }
    const out = convertBetween(minor, from, viewCur, base, rates)
    if (out == null) return { amount: minor, currency: from, approx: false }
    return { amount: out, currency: viewCur, approx: true }
  }
  const fmt = (minor: number, from?: CurrencyCode, extraApprox = false): string => {
    const v = view(minor, from)
    return `${v.approx || extraApprox ? '≈ ' : ''}${formatMoney(v.amount, v.currency)}`
  }
  return { cur: viewCur, converted, view, fmt }
}
