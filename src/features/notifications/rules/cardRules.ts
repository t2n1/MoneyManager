// Luật thẻ tín dụng (mục 8 của spec) — THUẦN.
import type { AppNotification, NotificationInput } from '../types'

const pad = (n: number) => String(n).padStart(2, '0')
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate()

export function cardRules(input: NotificationInput): AppNotification[] {
  const [y, m, d] = input.todayISO.split('-').map(Number)
  const lastDay = daysInMonth(y, m)
  const out: AppNotification[] = []

  for (const a of input.accounts) {
    if (a.type !== 'card' || a.is_archived) continue
    if (a.statement_day == null) continue
    // Ngày chốt của tháng dương lịch này, kẹp về cuối tháng khi tháng ngắn hơn.
    const closeDay = Math.min(a.statement_day, lastDay)
    if (d !== closeDay) continue

    out.push({
      key: `card-statement-day:${a.id}:${y}-${pad(m)}`,
      kind: 'info',
      type: 'card-statement-day',
      severity: 'low',
      title: `Hôm nay ${a.name} chốt sao kê`,
      detail: 'Mua từ mai sẽ trả vào kỳ tháng sau.',
      onISO: input.todayISO,
      to: `/assets/${a.id}`,
    })
  }

  return out
}
