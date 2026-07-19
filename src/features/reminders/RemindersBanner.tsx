import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Bell, X } from 'lucide-react'
import { useBudgetAlert, useDebts, useRangeTransactions } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { buildReminders } from './reminders'

const DISMISS_KEY = 'sct-dismissed-reminders'

function readDismissed(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(DISMISS_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

/** Banner nhắc nhở khi mở app (nợ đến hạn, vượt ngân sách, quên ghi sổ). */
export function RemindersBanner() {
  const today = toISODate(new Date())
  const rangeStart = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return toISODate(d)
  }, [])
  const rangeEnd = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return toISODate(d)
  }, [])

  const { data: debts = [] } = useDebts()
  const { overCount } = useBudgetAlert()
  const { data: recentTxs = [] } = useRangeTransactions({ start: rangeStart, end: rangeEnd })

  const lastTxISO =
    recentTxs.length > 0
      ? recentTxs.reduce((m, t) => (t.occurred_on > m ? t.occurred_on : m), recentTxs[0].occurred_on)
      : rangeStart

  const [dismissed, setDismissed] = useState<string[]>(readDismissed)

  const reminders = useMemo(
    () =>
      buildReminders({ debts, todayISO: today, overBudgetCount: overCount, lastTxISO }).filter(
        (r) => !dismissed.includes(r.id),
      ),
    [debts, today, overCount, lastTxISO, dismissed],
  )

  function dismiss(id: string) {
    const next = [...dismissed, id]
    setDismissed(next)
    try {
      sessionStorage.setItem(DISMISS_KEY, JSON.stringify(next))
    } catch {
      // bỏ qua nếu sessionStorage không khả dụng
    }
  }

  if (reminders.length === 0) return null

  return (
    <div className="mb-3 flex flex-col gap-2">
      {reminders.map((r) => {
        const warn = r.tone === 'warn'
        return (
          <div
            key={r.id}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              warn
                ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
            }`}
          >
            {warn ? (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            ) : (
              <Bell className="h-4 w-4 shrink-0" />
            )}
            <Link to={r.to} className="flex-1 font-medium hover:underline">
              {r.message}
            </Link>
            <button
              type="button"
              onClick={() => dismiss(r.id)}
              aria-label="Bỏ qua nhắc nhở"
              className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
