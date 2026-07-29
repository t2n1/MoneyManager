import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { MonthKey } from '../../lib/dates'
import type { MonthlyPoint } from '../reports/aggregate'

interface Props {
  points: MonthlyPoint[]
  base: CurrencyCode
  hasForeign: boolean
  isLoading: boolean
  onSelectMonth: (key: MonthKey) => void
}

/** Xem theo tháng: mỗi dòng là một tháng trong năm với thu / chi / còn lại. Chạm để mở tháng đó. */
export function MonthlyView({ points, base, hasForeign, isLoading, onSelectMonth }: Props) {
  const approx = hasForeign ? '≈ ' : ''
  const yearIncome = points.reduce((s, p) => s + p.income, 0)
  const yearExpense = points.reduce((s, p) => s + p.expense, 0)
  const active = points.some((p) => p.income > 0 || p.expense > 0)

  return (
    <div className="flex flex-col gap-3">
      {/* Tổng cả năm */}
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-white dark:bg-gray-900 p-3 text-center shadow-sm">
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Thu cả năm</div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums text-money-in">
            {approx}
            {formatMoney(yearIncome, base)}
          </div>
        </div>
        <div className="border-x border-gray-100 dark:border-gray-800">
          <div className="text-xs text-gray-500 dark:text-gray-400">Chi cả năm</div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums text-money-out">
            {approx}
            {formatMoney(yearExpense, base)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Còn lại</div>
          <div
            className={`mt-0.5 text-sm font-semibold tabular-nums ${yearIncome - yearExpense < 0 ? 'text-money-out' : 'text-gray-800 dark:text-gray-100'}`}
          >
            {approx}
            {formatMoney(yearIncome - yearExpense, base)}
          </div>
        </div>
      </div>

      {isLoading && !active ? (
        <p className="py-10 text-center text-gray-500 dark:text-gray-400">Đang tải…</p>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white dark:bg-gray-900 shadow-sm">
          <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-2 border-b border-gray-100 dark:border-gray-800 px-3 py-2 text-[0.6875rem] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <span>Tháng</span>
            <span className="text-right">Thu</span>
            <span className="text-right">Chi</span>
            <span className="text-right">Còn lại</span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {points.map((p) => {
              const net = p.income - p.expense
              const empty = p.income === 0 && p.expense === 0
              return (
                <button
                  key={`${p.key.year}-${p.key.month}`}
                  type="button"
                  onClick={() => onSelectMonth(p.key)}
                  className="grid w-full grid-cols-[auto_1fr_1fr_1fr] items-center gap-2 px-3 py-2.5 text-right text-sm transition hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-800"
                >
                  <span className="text-left font-medium text-gray-700 dark:text-gray-300">Th {p.key.month}</span>
                  <span className={`tabular-nums ${empty ? 'text-gray-300 dark:text-gray-600' : 'text-money-in'}`}>
                    {p.income > 0 ? formatMoney(p.income, base) : '–'}
                  </span>
                  <span className={`tabular-nums ${empty ? 'text-gray-300 dark:text-gray-600' : 'text-money-out'}`}>
                    {p.expense > 0 ? formatMoney(p.expense, base) : '–'}
                  </span>
                  <span
                    className={`tabular-nums font-medium ${
                      empty ? 'text-gray-300 dark:text-gray-600' : net < 0 ? 'text-money-out' : 'text-gray-800 dark:text-gray-100'
                    }`}
                  >
                    {empty ? '–' : formatMoney(net, base)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
