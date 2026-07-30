// Luật nợ / cho vay (mục 3, 4 của spec) — THUẦN.
import { daysBetween } from '../../../lib/dates'
import type { DebtRow } from '../../../types/database.types'
import type { AppNotification, NotificationInput, NotificationType } from '../types'

/** Còn bao nhiêu ngày thì tính là "sắp đến hạn". */
export const DUE_SOON_DAYS = 7
/** Từ bao nhiêu khoản trở lên thì gộp thành một dòng. */
export const GROUP_FROM = 3

const DEBTS_ROUTE = '/debts'

function label(d: DebtRow): string {
  return d.direction === 'i_owe' ? `Mình nợ ${d.counterparty}` : `${d.counterparty} nợ mình`
}

function lines(
  list: DebtRow[],
  type: NotificationType,
  severity: 'high' | 'medium',
  one: (d: DebtRow) => string,
  many: (n: number) => string,
): AppNotification[] {
  if (list.length === 0) return []
  if (list.length >= GROUP_FROM) {
    return [
      {
        key: `${type}:group`,
        kind: 'action' as const,
        type,
        severity,
        title: many(list.length),
        to: DEBTS_ROUTE,
      },
    ]
  }
  return list.map((d) => ({
    key: `${type}:${d.id}`,
    kind: 'action' as const,
    type,
    severity,
    title: one(d),
    onISO: d.due_on ?? undefined,
    to: DEBTS_ROUTE,
  }))
}

export function debtRules(input: NotificationInput): AppNotification[] {
  const open = input.debts.filter((d) => d.status === 'open' && d.due_on)

  const overdue: DebtRow[] = []
  const dueSoon: DebtRow[] = []
  for (const d of open) {
    const days = daysBetween(input.todayISO, d.due_on as string)
    if (days < 0) overdue.push(d)
    else if (days <= DUE_SOON_DAYS) dueSoon.push(d)
  }

  return [
    ...lines(
      overdue,
      'debt-overdue',
      'high',
      (d) =>
        `${label(d)} ${input.formatMoney(d.principal, d.currency)} — quá hạn ${-daysBetween(input.todayISO, d.due_on as string)} ngày`,
      (n) => `${n} khoản nợ đã quá hạn`,
    ),
    ...lines(
      dueSoon,
      'debt-due-soon',
      'medium',
      (d) => {
        const days = daysBetween(input.todayISO, d.due_on as string)
        const when = days === 0 ? 'hôm nay' : `trong ${days} ngày`
        return `${label(d)} ${input.formatMoney(d.principal, d.currency)} — đến hạn ${when}`
      },
      (n) => `${n} khoản nợ sắp đến hạn`,
    ),
  ]
}
