// Luật "khoản sắp chi" (migration 0038) — THUẦN.
//
// Khác `bill-due` (rules/billRules.ts): tin kia là khoản LẶP MÃI theo chu kỳ. Tin này
// là khoản MỘT LẦN — đóng phí vệ sinh 20/8, sửa nhà tháng 10. Xong là hết, không có
// kỳ sau nào để nhắc nữa.
import { addDaysISO } from '../../../lib/dates'
import { plannedDue } from '../../planned/planned'
import { tr } from '../../../i18n'
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
      // Khoản chỉ biết tháng: `dueISO` là ngày 1 do quy ước lưu, nói "N ngày nữa tới hạn"
      // là bịa ra một ngày hạn. Nói đúng điều người dùng đã ghi: "trong tháng 9".
      title:
        d.daysLeft < 0
          ? tr('Chưa chi "{name}"{amount}', { name: d.title, amount: money })
          : d.duePrecision === 'month'
            ? tr('Trong tháng {month} cần chi "{name}"{amount}', {
                month: Number(d.dueISO.slice(5, 7)),
                name: d.title,
                amount: money,
              })
            : d.daysLeft === 0
              ? tr('Hôm nay tới hạn "{name}"{amount}', { name: d.title, amount: money })
              : tr('{n} ngày nữa tới hạn "{name}"{amount}', { n: d.daysLeft, name: d.title, amount: money }),
      detail:
        d.daysLeft < 0
          ? tr('Quá hạn {n} ngày. Bấm để ghi khoản này.', { n: -d.daysLeft })
          : tr('Bấm để ghi khoản này, hoặc dời hạn / bỏ nếu không cần nữa.'),
      // Khoản chỉ biết tháng: đưa HẠN CHÓT (ngày cuối tháng) chứ không phải ngày 1 đang
      // lưu — Việc cần làm tính nhãn và "có hạn trong tuần" từ đây, đưa ngày 1 là cả
      // tháng 9 hiện đỏ "QUÁ HẠN" dưới tiêu đề "Trong tháng 9…".
      onISO: d.duePrecision === 'month' ? addDaysISO(input.todayISO, d.daysLeft) : d.dueISO,
      ...(d.duePrecision === 'month' ? { onPrecision: 'month' as const } : {}),
      to: '/planned',
    }
  })
}
