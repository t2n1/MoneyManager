import { useState } from 'react'
import { Plus, Target } from 'lucide-react'
import { useAccountBalances, useAccounts, useSavingsGoals } from '../../hooks/queries'
import { formatMoney } from '../../lib/money'
import type { SavingsGoalRow } from '../../types/database.types'
import { SavingsGoalFormSheet } from './SavingsGoalFormSheet'

/** Số ngày còn lại tới hạn (âm = quá hạn); null nếu không đặt hạn. */
function daysLeft(targetDate: string | null): number | null {
  if (!targetDate) return null
  const today = new Date().toISOString().slice(0, 10)
  return Math.round((Date.parse(targetDate) - Date.parse(today)) / 86_400_000)
}

/** Khu "Mục tiêu tiết kiệm" trên trang Tài sản (mục AD). */
export function SavingsGoalsSection() {
  const { data: goals = [] } = useSavingsGoals()
  const { data: accounts = [] } = useAccounts()
  const { data: balances = [] } = useAccountBalances()
  const [sheet, setSheet] = useState<{ open: boolean; goal?: SavingsGoalRow }>({ open: false })

  const selectableAccounts = accounts.filter((a) => !a.is_archived)

  return (
    <section className="rounded-2xl bg-white dark:bg-gray-900 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5 text-green-600 dark:text-green-400" />
        <h2 className="flex-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
          Mục tiêu tiết kiệm
        </h2>
        <button
          type="button"
          onClick={() => setSheet({ open: true })}
          disabled={selectableAccounts.length === 0}
          className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white active:scale-95 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Thêm
        </button>
      </div>

      {goals.length === 0 ? (
        <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
          Chưa có mục tiêu nào. Đặt một đích tiết kiệm để theo dõi tiến độ.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {goals.map((g) => {
            const bal = balances.find((b) => b.id === g.account_id)
            const currency = bal?.currency ?? 'JPY'
            const current = Math.max(0, bal?.balance ?? 0)
            const pct = g.target_amount > 0 ? Math.min(100, Math.round((current / g.target_amount) * 100)) : 0
            const done = current >= g.target_amount
            const dl = daysLeft(g.target_date)
            return (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => setSheet({ open: true, goal: g })}
                  className="flex w-full items-center justify-between text-left"
                >
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{g.name}</span>
                  <span className={`text-xs font-semibold ${done ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {pct}%
                  </span>
                </button>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className={`h-full rounded-full ${done ? 'bg-green-500' : 'bg-green-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span className="tabular-nums">
                    {formatMoney(current, currency)} / {formatMoney(g.target_amount, currency)}
                  </span>
                  {dl != null && (
                    <span className={dl < 0 ? 'text-red-500' : ''}>
                      {dl < 0 ? `Quá hạn ${-dl} ngày` : dl === 0 ? 'Đến hạn hôm nay' : `Còn ${dl} ngày`}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {sheet.open && (
        <SavingsGoalFormSheet
          accounts={selectableAccounts}
          goal={sheet.goal}
          onClose={() => setSheet({ open: false })}
        />
      )}
    </section>
  )
}
