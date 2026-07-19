import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import type { CategoryRow } from '../../types/database.types'
import type { Breakdown } from './aggregate'

// Bảng màu cho lát bánh (lặp lại nếu > 12 danh mục)
const PALETTE = [
  '#16a34a', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7',
]

interface Props {
  breakdown: Breakdown
  categories: CategoryRow[]
  base: CurrencyCode
  kind: 'expense' | 'income'
  onKindChange: (kind: 'expense' | 'income') => void
  periodNoun: string
}

export function CategoryBreakdownCard({
  breakdown,
  categories,
  base,
  kind,
  onKindChange,
  periodNoun,
}: Props) {
  const pieData = breakdown.slices.map((s, i) => {
    const cat = categories.find((c) => c.id === s.categoryId)
    return {
      categoryId: s.categoryId,
      name: cat?.name ?? '?',
      icon: cat?.icon ?? '📦',
      value: s.amount,
      color: PALETTE[i % PALETTE.length],
      pct: breakdown.total > 0 ? (s.amount / breakdown.total) * 100 : 0,
    }
  })
  const approx = breakdown.hasForeign ? '≈ ' : ''

  return (
    <section className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400">Cơ cấu theo danh mục</h2>
        <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => onKindChange('expense')}
            className={`rounded-md px-3 py-1 ${kind === 'expense' ? 'bg-white dark:bg-gray-900 text-red-600 dark:text-red-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
          >
            Chi
          </button>
          <button
            type="button"
            onClick={() => onKindChange('income')}
            className={`rounded-md px-3 py-1 ${kind === 'income' ? 'bg-white dark:bg-gray-900 text-green-600 dark:text-green-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
          >
            Thu
          </button>
        </div>
      </div>

      {pieData.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">
          Chưa có {kind === 'expense' ? 'chi tiêu' : 'thu nhập'} trong {periodNoun}
        </p>
      ) : (
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <div className="relative h-48 w-48 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={80}
                  paddingAngle={1}
                  strokeWidth={0}
                >
                  {pieData.map((d) => (
                    <Cell key={d.categoryId} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => formatMoney(Number(v), base)}
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] text-gray-400 dark:text-gray-500">Tổng</span>
              <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                {approx}
                {formatCompact(breakdown.total, base)}
              </span>
            </div>
          </div>

          <ul className="flex-1 space-y-1.5 self-stretch">
            {pieData.map((d) => (
              <li key={d.categoryId} className="flex items-center gap-2 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: d.color }}
                />
                <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
                  {d.icon} {d.name}
                </span>
                <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">{d.pct.toFixed(0)}%</span>
                <span className="shrink-0 font-medium text-gray-800 dark:text-gray-100">
                  {formatMoney(d.value, base)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
