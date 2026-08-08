// Luật "khoản sắp chi" (migration 0038) — THUẦN.
//
// Khác `bill-due` (rules/billRules.ts): tin kia là khoản LẶP MÃI theo chu kỳ. Tin này
// là khoản MỘT LẦN — đóng phí vệ sinh 20/8, sửa nhà tháng 10. Xong là hết, không có
// kỳ sau nào để nhắc nữa.
import { plannedDue } from '../../planned/planned'
import type { AppNotification, NotificationInput } from '../types'

export function plannedRules(input: NotificationInput): AppNotification[] {
  // undefined = chưa tải xong → im, không đoán.
  if (!input.plannedExpenses) return []

  return plannedDue(input.plannedExpenses, input.todayISO).map((d): AppNotification => {
    const money = d.amount > 0 ? ` ${input.formatMoney(d.amount, d.currency)}` : ''
    return {
      // KHÔNG có phần kỳ trong mã: khoản một lần chỉ tới hạn đúng một lần, và đọc
      // xong vẫn phải bám tới khi được đánh dấu đã chi (kind = 'action').
      key: `planned-due:${d.id}`,
      kind: 'action',
      type: 'planned-due',
      // Quá hạn là mức đỏ — nổi lên cả dải nhắc ở đầu Sổ.
      severity: d.daysLeft < 0 ? 'high' : d.daysLeft === 0 ? 'medium' : 'low',
      title:
        d.daysLeft < 0
          ? `Chưa chi "${d.title}"${money}`
          : d.daysLeft === 0
            ? `Hôm nay tới hạn "${d.title}"${money}`
            : `${d.daysLeft} ngày nữa tới hạn "${d.title}"${money}`,
      detail:
        d.daysLeft < 0
          ? `Quá hạn ${-d.daysLeft} ngày. Bấm để ghi khoản này.`
          : 'Bấm để ghi khoản này, hoặc dời hạn / bỏ nếu không cần nữa.',
      onISO: d.dueISO,
      to: '/planned',
    }
  })
}
