// Nhắc nhở trong app (mục AN): thuần, tính từ dữ liệu sẵn có → test được.
// Nguồn nhắc: nợ đến hạn/quá hạn, vượt ngân sách, quên ghi sổ nhiều ngày.
import type { DebtRow } from '../../types/database.types'

export interface Reminder {
  id: string
  tone: 'warn' | 'info'
  message: string
  /** Route điều hướng khi bấm. */
  to: string
}

/** Số ngày từ aISO đến bISO (ISO 'YYYY-MM-DD'); dương nếu b sau a. */
export function diffDays(aISO: string, bISO: string): number {
  return Math.round((Date.parse(bISO) - Date.parse(aISO)) / 86_400_000)
}

export interface ReminderInput {
  debts: DebtRow[]
  todayISO: string
  overBudgetCount: number
  /** occurred_on của giao dịch gần nhất; null = chưa có giao dịch nào. */
  lastTxISO: string | null
  /** Ngưỡng "sắp đến hạn" (ngày) và "quên ghi sổ" (ngày). */
  dueSoonDays?: number
  staleDays?: number
}

/** Dựng danh sách nhắc nhở theo thứ tự ưu tiên (quan trọng trước). */
export function buildReminders(input: ReminderInput): Reminder[] {
  const { debts, todayISO, overBudgetCount, lastTxISO } = input
  const dueSoonDays = input.dueSoonDays ?? 7
  const staleDays = input.staleDays ?? 3
  const out: Reminder[] = []

  const open = debts.filter((d) => d.status === 'open' && d.due_on)
  let overdue = 0
  let dueSoon = 0
  for (const d of open) {
    const days = diffDays(todayISO, d.due_on as string)
    if (days < 0) overdue++
    else if (days <= dueSoonDays) dueSoon++
  }
  if (overdue > 0)
    out.push({
      id: 'debt-overdue',
      tone: 'warn',
      message: `${overdue} khoản nợ đã quá hạn`,
      to: '/settings/debts',
    })
  if (dueSoon > 0)
    out.push({
      id: 'debt-due-soon',
      tone: 'info',
      message: `${dueSoon} khoản nợ sắp đến hạn`,
      to: '/settings/debts',
    })

  if (overBudgetCount > 0)
    out.push({
      id: 'budget-over',
      tone: 'warn',
      message: `${overBudgetCount} danh mục vượt ngân sách tháng này`,
      to: '/reports?view=budget',
    })

  if (lastTxISO) {
    const idle = diffDays(lastTxISO, todayISO)
    if (idle >= staleDays)
      out.push({
        id: 'stale',
        tone: 'info',
        message: `Đã ${idle} ngày chưa ghi giao dịch nào`,
        to: '/entry',
      })
  }

  return out
}
