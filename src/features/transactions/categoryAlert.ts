import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { CapBase } from './entryShape'

export interface AlertInput {
  /** null = chưa chọn danh mục → chưa có gì để cảnh báo. */
  categoryName: string | null
  currency: CurrencyCode
  /** hạn mức tháng này; null = chưa đặt. */
  cap: number | null
  /** đã chi trong danh mục này, tháng này, CHƯA tính khoản đang nhập. */
  spent: number
  /** số tiền đang nhập (toàn bộ). */
  amount: number
  /** phần mình chịu — bằng `amount` ở mọi dạng trừ Trả hộ. */
  myShare: number
  capBase: CapBase
}

/**
 * Câu cảnh báo về ĐÚNG danh mục vừa chọn, chỉ hiện sau khi chọn.
 *
 * Thay dải đỏ "4 danh mục vượt ngân sách tháng này" ở đầu form: dải đó hiện ở MỌI
 * dạng — kể cả sáu dạng không thuộc danh mục nào — và người ta đang ghi một khoản,
 * tin đó không giúp gì lúc này mà lại tô đỏ dòng đầu.
 */
export function categoryAlert(i: AlertInput): string | null {
  if (!i.categoryName || i.capBase === 'none' || i.cap === null) return null

  // Ở Trả hộ, con số cộng vào là PHẦN MÌNH CHỊU, không phải tổng đã trả — bản đang
  // chạy sẽ tính cả ¥12,400 thay vì ¥4,200, sai đúng bằng phần người khác nợ lại.
  const add = i.capBase === 'myShare' ? i.myShare : i.amount
  const suffix = i.capBase === 'myShare' ? ' phần mình chịu' : ''
  const m = (v: number) => formatMoney(v, i.currency)

  if (i.spent > i.cap) {
    const over = i.spent - i.cap
    return `${i.categoryName} đã vượt trần ${m(over)}. Cộng ${m(add)}${suffix} thì thành ${m(over + add)}.`
  }
  const left = i.cap - i.spent
  if (add > left) {
    return `${i.categoryName} còn ${m(left)} trong trần. Khoản ${m(add)}${suffix} này làm vượt ${m(add - left)}.`
  }
  return null
}
