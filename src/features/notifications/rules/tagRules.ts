// Luật trần theo nhãn (migration 0036) — THUẦN.
//
// Không tự cộng tiền: `input.tagBudgets` đã được tính sẵn ở nơi gọi. Trần kiểu
// 'total' cần chi CẢ ĐỜI nhãn, mà bộ luật chỉ có `recentTxs` 90 ngày — tự tính ở
// đây là lặng lẽ ra số nhỏ hơn thật rồi im khi đáng lẽ phải báo.
import type { AppNotification, NotificationInput } from '../types'

export function tagRules(input: NotificationInput): AppNotification[] {
  // undefined = chưa tải xong hoặc chưa nhãn nào đặt trần → im, không đoán.
  if (!input.tagBudgets) return []

  const out: AppNotification[] = []
  for (const l of input.tagBudgets) {
    if (l.status !== 'over') continue

    const over = Math.round(l.spent - l.budget)
    out.push({
      // Kỳ 'monthly' phải có phần kỳ trong mã, nếu không thì tháng sau vẫn im vì
      // người dùng đã đọc tin của tháng này. Kỳ 'total' KHÔNG có kỳ — nó vượt một
      // lần rồi vượt mãi, và đọc xong là xong, không có mốc nào để hiện lại.
      key:
        l.period === 'monthly'
          ? `tag-budget-over:${l.tagId}:${monthKeyOf(input)}`
          : `tag-budget-over:${l.tagId}`,
      kind: 'action',
      type: 'tag-budget-over',
      severity: 'medium',
      title: `Nhãn "${l.name}" vượt trần ${input.formatMoney(over, input.base)}`,
      detail:
        l.period === 'monthly'
          ? `Tháng này ${input.formatMoney(Math.round(l.spent), input.base)} / trần ${input.formatMoney(l.budget, input.base)}.`
          : `Cả đợt ${input.formatMoney(Math.round(l.spent), input.base)} / dự trù ${input.formatMoney(l.budget, input.base)}.`,
      to: '/budget',
    })
  }
  return out
}

/**
 * Kỳ tháng của hôm nay theo `month_start_day`, dạng 'YYYY-MM'.
 *
 * Viết tay chứ không gọi `monthKeyForDate`: dùng ĐÚNG chu kỳ tháng của app là chủ ý —
 * trần nhãn kỳ 'monthly' reset theo kỳ của app (giống hạn mức danh mục), khác hẳn kỳ
 * sao kê của thẻ ở cardRules.ts.
 */
function monthKeyOf(input: NotificationInput): string {
  const [y, m, d] = input.todayISO.split('-').map(Number)
  // Ngày trước mốc bắt đầu kỳ thì vẫn thuộc kỳ của tháng TRƯỚC.
  const shift = d < input.monthStartDay ? -1 : 0
  const total = y * 12 + (m - 1) + shift
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}`
}
