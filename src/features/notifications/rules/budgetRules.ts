// Luật ngân sách (mục 5, 6, 7 của spec) — THUẦN.
// Chu kỳ tháng theo month_start_day, KHÔNG phải ngày 1 dương lịch.
import { daysBetween, getMonthRange, monthKeyForDate } from '../../../lib/dates'
import type { AppNotification, NotificationInput } from '../types'

/** Tiêu vượt nhịp bao nhiêu điểm phần trăm thì báo. */
export const PACE_GAP = 0.25
/** Phải qua ít nhất bấy nhiêu phần của kỳ mới xét nhịp. */
export const PACE_MIN_ELAPSED = 1 / 3
/** Hạn mức phải chiếm ít nhất bấy nhiêu phần tổng hạn mức mới đáng báo. */
export const PACE_MIN_SHARE = 0.05

const BUDGET_ROUTE = '/reports?view=budget'

export function budgetRules(input: NotificationInput): AppNotification[] {
  const report = input.budgetReport
  if (!report) return [] // thiếu dữ liệu thì im, không đoán

  const out: AppNotification[] = []
  const nameOf = (id: string) =>
    input.categories.find((c) => c.id === id)?.name ?? 'Danh mục đã xóa'

  // Tỷ lệ ngày đã qua trong kỳ hiện tại.
  const monthKey = monthKeyForDate(input.todayISO, input.monthStartDay)
  const range = getMonthRange(monthKey, input.monthStartDay)
  const totalDays = daysBetween(range.start, range.end)
  const elapsedDays = daysBetween(range.start, input.todayISO)
  const elapsed = totalDays > 0 ? Math.min(1, Math.max(0, elapsedDays / totalDays)) : 0

  const realLines = report.lines.filter((l) => !l.isMarker && l.budgeted > 0)
  const totalBudgeted = realLines.reduce((s, l) => s + l.budgeted, 0)

  for (const l of realLines) {
    // --- Mục 5: đã vượt ---
    if (l.spent >= l.budgeted) {
      out.push({
        key: `budget-over:${l.categoryId}`,
        kind: 'action',
        type: 'budget-over',
        severity: 'high',
        title: `${nameOf(l.categoryId)} đã vượt ngân sách ${input.formatMoney(l.spent - l.budgeted, input.base)}`,
        detail: `Đã tiêu ${input.formatMoney(l.spent, input.base)} / ${input.formatMoney(l.budgeted, input.base)}`,
        to: BUDGET_ROUTE,
      })
      continue // đã vượt thì không nói thêm chuyện nhịp
    }

    // --- Mục 6: tiêu nhanh hơn nhịp ---
    if (elapsed < PACE_MIN_ELAPSED) continue
    if (totalBudgeted > 0 && l.budgeted / totalBudgeted < PACE_MIN_SHARE) continue
    const spentRatio = l.spent / l.budgeted
    if (spentRatio - elapsed <= PACE_GAP) continue

    out.push({
      key: `budget-pace:${l.categoryId}`,
      kind: 'action',
      type: 'budget-pace',
      severity: 'medium',
      title: `${nameOf(l.categoryId)} tiêu nhanh hơn nhịp`,
      detail: `Mới qua ${Math.round(elapsed * 100)}% tháng đã dùng ${Math.round(spentRatio * 100)}% hạn mức (${input.formatMoney(l.spent, input.base)} / ${input.formatMoney(l.budgeted, input.base)})`,
      to: BUDGET_ROUTE,
    })
  }

  // --- Mục 7: tổng chi các mục con vượt trần cha ---
  for (const l of realLines) {
    const children = input.categories.filter((c) => c.parent_id === l.categoryId)
    if (children.length === 0) continue
    const childSpent = children.reduce(
      (s, c) => s + (report.spentByCategory.get(c.id) ?? 0),
      0,
    )
    if (childSpent <= l.budgeted) continue
    out.push({
      key: `budget-parent-over:${l.categoryId}`,
      kind: 'action',
      type: 'budget-parent-over',
      severity: 'medium',
      title: `Nhóm ${nameOf(l.categoryId)}: các mục con đã tiêu vượt trần ${input.formatMoney(childSpent - l.budgeted, input.base)}`,
      detail: `Các con tiêu ${input.formatMoney(childSpent, input.base)} / trần nhóm ${input.formatMoney(l.budgeted, input.base)}`,
      to: BUDGET_ROUTE,
    })
  }

  return out
}
