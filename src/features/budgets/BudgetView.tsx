import { useState } from 'react'
import {
  useBudgetReport,
  useBudgets,
  useCategories,
  useCopyBudgetsFromPreviousMonth,
  useRates,
} from '../../hooks/queries'
import { monthKeyString, type MonthKey } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { showToast } from '../../lib/dialog'
import { BudgetEditSheet } from './BudgetEditSheet'
import type { BudgetStatus } from './progress'

const BAR_COLOR: Record<BudgetStatus, string> = {
  ok: 'bg-green-500',
  warn: 'bg-amber-500',
  over: 'bg-red-500',
}
const TEXT_COLOR: Record<BudgetStatus, string> = {
  ok: 'text-gray-800 dark:text-gray-100',
  warn: 'text-amber-600',
  over: 'text-red-600 dark:text-red-400',
}

export function BudgetView({ monthKey }: { monthKey: MonthKey }) {
  const monthKeyStr = monthKeyString(monthKey)
  const { base } = useRates()
  const { report, isLoading } = useBudgetReport(monthKey)
  const { data: budgets = [] } = useBudgets(monthKeyStr)
  const { data: categories = [] } = useCategories()
  const copy = useCopyBudgetsFromPreviousMonth()

  // Danh mục đang sửa hạn mức (null = đóng sheet)
  const [editing, setEditing] = useState<{
    categoryId: string
    current: number
    rollover?: boolean
    budgetId?: string
  } | null>(null)

  const catOf = (id: string) => categories.find((c) => c.id === id)
  const expenseCats = categories.filter((c) => c.type === 'expense' && !c.is_archived)
  const childrenOf = (id: string) =>
    categories.filter((c) => c.parent_id === id && !c.is_archived)
  const budgetedIds = new Set(budgets.map((b) => b.category_id))
  const unbudgeted = expenseCats.filter((c) => !budgetedIds.has(c.id))

  async function handleCopy() {
    const n = await copy.mutateAsync(monthKeyStr)
    showToast(
      n > 0 ? `Đã chép ${n} hạn mức từ tháng trước` : 'Tháng trước không có hạn mức để chép',
      n > 0 ? 'success' : 'info',
    )
  }

  if (isLoading || !report) {
    return <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">Đang tải…</p>
  }

  const totalPct = report.totalBudgeted > 0 ? (report.totalSpent / report.totalBudgeted) * 100 : 0

  return (
    <div className="flex flex-col gap-3">
      {report.hasMissingRate && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 p-2 text-xs text-amber-700 dark:text-amber-300">
          Một phần chi ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên có thể thiếu.
        </div>
      )}

      {/* Dòng tổng */}
      <section className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400">Tổng ngân sách</h2>
          <span className="flex gap-2 text-xs font-medium">
            {report.warnCount > 0 && (
              <span className="text-amber-600 dark:text-amber-400">{report.warnCount} sắp vượt</span>
            )}
            {report.overCount > 0 && (
              <span className="text-red-600 dark:text-red-400">{report.overCount} danh mục vượt</span>
            )}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className={`text-lg font-bold ${TEXT_COLOR[report.totalStatus]}`}>
            {formatMoney(report.totalSpent, base)}
          </span>
          <span className="text-sm text-gray-400 dark:text-gray-500">/ {formatMoney(report.totalBudgeted, base)}</span>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(totalPct)}
        >
          <div
            className={`h-full rounded-full ${BAR_COLOR[report.totalStatus]}`}
            style={{ width: `${Math.min(totalPct, 100)}%` }}
          />
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="mt-3 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Chép hạn mức tháng trước
        </button>
      </section>

      {/* Danh mục có hạn mức */}
      {report.lines.length > 0 && (
        <section className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
          <ul className="space-y-3">
            {report.lines.map((line) => {
              const cat = catOf(line.categoryId)
              const budget = budgets.find((b) => b.category_id === line.categoryId)
              const kidCount = childrenOf(line.categoryId).length
              const pct = Math.round(line.ratio * 100)
              return (
                <li key={line.categoryId}>
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        categoryId: line.categoryId,
                        current: budget?.amount ?? line.budgeted,
                        rollover: budget?.rollover,
                        budgetId: budget?.id,
                      })
                    }
                    className="w-full text-left"
                  >
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">
                        {cat?.icon ?? '📦'} {cat?.name ?? '?'}
                        {kidCount > 0 && (
                          <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">(gồm {kidCount} mục con)</span>
                        )}
                      </span>
                      <span className={`text-xs ${TEXT_COLOR[line.status]}`}>{pct}%</span>
                    </div>
                    <div
                      className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pct}
                    >
                      <div
                        className={`h-full rounded-full ${BAR_COLOR[line.status]}`}
                        style={{ width: `${Math.min(line.ratio * 100, 100)}%` }}
                      />
                    </div>
                    <div className="mt-0.5 flex justify-between text-xs text-gray-400 dark:text-gray-500">
                      <span className={TEXT_COLOR[line.status]}>{formatMoney(line.spent, base)}</span>
                      <span>
                        {formatMoney(line.budgeted, base)}
                        {line.carried > 0 && (
                          <span className="ml-1 text-green-600 dark:text-green-400">
                            (dồn +{formatMoney(line.carried, base)})
                          </span>
                        )}
                      </span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Danh mục chưa đặt hạn mức */}
      {unbudgeted.length > 0 && (
        <section className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">Chưa đặt hạn mức</h2>
          <ul className="flex flex-wrap gap-2">
            {unbudgeted.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setEditing({ categoryId: c.id, current: 0 })}
                  className="rounded-full border border-dashed border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  {c.parent_id && <span className="text-gray-400 dark:text-gray-500">↳ </span>}
                  {c.icon} {c.name} +
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <BudgetEditSheet
          key={editing.categoryId}
          monthKey={monthKeyStr}
          categoryId={editing.categoryId}
          categoryLabel={`${catOf(editing.categoryId)?.icon ?? '📦'} ${catOf(editing.categoryId)?.name ?? ''}`}
          current={editing.current}
          currentRollover={editing.rollover}
          budgetId={editing.budgetId}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
