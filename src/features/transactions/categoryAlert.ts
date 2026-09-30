import { tr } from '../../i18n'
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
  /** phần người khác trả lại / nợ lại — cùng nghĩa với `SplitValue.others`. */
  othersShare?: number
  capBase: CapBase
}

/**
 * Câu cảnh báo về ĐÚNG danh mục vừa chọn, chỉ hiện sau khi chọn.
 *
 * Thay dải đỏ "4 danh mục vượt ngân sách tháng này" ở đầu form: dải đó hiện ở MỌI
 * dạng — kể cả sáu dạng không thuộc danh mục nào — và người ta đang ghi một khoản,
 * tin đó không giúp gì lúc này mà lại tô đỏ dòng đầu.
 *
 * Caller: `capWarning` trong TransactionForm.tsx — trần và "đã chi" lấy từ
 * `useBudgetReport`, không cộng lại ở đây.
 */
export function categoryAlert(i: AlertInput): string | null {
  // Chuỗi rỗng rơi cùng nhánh với `null` là CỐ Ý: danh mục chưa có tên thì không có gì
  // để gọi trong câu cảnh báo.
  if (!i.categoryName || i.capBase === 'none' || i.cap === null) return null

  // `othersShare` chứ không `myShare`: hai số CÙNG ĐƠN VỊ mà một là tổng, một là phần —
  // caller nối lẫn thì type vẫn sạch và cảnh báo vẫn ra, chỉ sai số. Nhận "phần người
  // khác" thì không còn gì để lẫn với tổng, và nó khớp 1:1 với `SplitValue.others` đã có
  // nên caller chuyền thẳng qua. Mặc định 0 → phần mình = toàn bộ, đúng cho chín dạng kia.
  const myShare = i.amount - (i.othersShare ?? 0)
  const add = i.capBase === 'myShare' ? myShare : i.amount
  const mine = i.capBase === 'myShare'
  const m = (v: number) => formatMoney(v, i.currency)

  if (i.spent > i.cap) {
    const over = i.spent - i.cap
    const vars = { name: i.categoryName, over: m(over), add: m(add), total: m(over + add) }
    return mine
      ? tr('{name} đã vượt trần {over}. Cộng {add} phần mình chịu thì thành {total}.', vars)
      : tr('{name} đã vượt trần {over}. Cộng {add} thì thành {total}.', vars)
  }
  const left = i.cap - i.spent
  if (add > left) {
    const vars = { name: i.categoryName, left: m(left), add: m(add), over: m(add - left) }
    return mine
      ? tr('{name} còn {left} trong trần. Khoản {add} phần mình chịu này làm vượt {over}.', vars)
      : tr('{name} còn {left} trong trần. Khoản {add} này làm vượt {over}.', vars)
  }
  return null
}
