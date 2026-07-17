import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BudgetView } from '../budgets/BudgetView'
import {
  useAccounts,
  useCategories,
  useMonthTransactions,
  useProfile,
  useRangeTransactions,
  useRates,
} from '../../hooks/queries'
import {
  addMonths,
  formatMonthLabel,
  getMonthRange,
  monthKeyForDate,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import { CURRENCIES, formatMoney, type CurrencyCode } from '../../lib/money'
import { categoryBreakdown, monthlySeries } from './aggregate'
import { buildInsights, noSpendStreak, savingsRate } from './insights'

// Bảng màu cho lát bánh (lặp lại nếu > 12 danh mục)
const PALETTE = [
  '#16a34a', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7',
]

/** minor units → nhãn ngắn cho trục biểu đồ (¥300k, 1.5M…). */
function formatCompact(minor: number, base: CurrencyCode): string {
  const major = minor / 10 ** CURRENCIES[base].decimals
  const abs = Math.abs(major)
  if (abs >= 1_000_000) return `${(major / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${Math.round(major / 1_000)}k`
  return String(Math.round(major))
}

export function ReportsPage() {
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [searchParams] = useSearchParams()
  const [view, setView] = useState<'charts' | 'budget'>(
    searchParams.get('view') === 'budget' ? 'budget' : 'charts',
  )

  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { base, rates } = useRates()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()

  const [monthKey, setMonthKey] = useState<MonthKey | null>(null)
  const activeMonthKey = monthKey ?? monthKeyForDate(toISODate(new Date()), monthStartDay)

  const { data: monthTxs = [] } = useMonthTransactions(activeMonthKey)

  // Khoảng 6 tháng gần nhất (tính cả tháng đang xem) cho biểu đồ cột
  const sixMonths = useMemo(
    () => Array.from({ length: 6 }, (_, i) => addMonths(activeMonthKey, i - 5)),
    [activeMonthKey],
  )
  const sixMonthRange = useMemo(
    () => ({
      start: getMonthRange(sixMonths[0], monthStartDay).start,
      end: getMonthRange(activeMonthKey, monthStartDay).end,
    }),
    [sixMonths, activeMonthKey, monthStartDay],
  )
  const { data: rangeTxs = [] } = useRangeTransactions(sixMonthRange, !!profile && view === 'charts')

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? base
  const categoryOf = (id: string) => categories.find((c) => c.id === id)

  const breakdown = useMemo(
    () => categoryBreakdown(monthTxs, kind, currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, kind, accounts, base, rates],
  )

  const series = useMemo(
    () => monthlySeries(rangeTxs, sixMonths, monthStartDay, currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeTxs, sixMonths, monthStartDay, accounts, base, rates],
  )

  const pieData = breakdown.slices.map((s, i) => {
    const cat = categoryOf(s.categoryId)
    return {
      name: cat?.name ?? '?',
      icon: cat?.icon ?? '📦',
      value: s.amount,
      color: PALETTE[i % PALETTE.length],
      pct: breakdown.total > 0 ? (s.amount / breakdown.total) * 100 : 0,
    }
  })

  const barData = series.points.map((p) => ({
    label: `${p.key.month}/${String(p.key.year).slice(2)}`,
    income: p.income,
    expense: p.expense,
  }))

  const approx = breakdown.hasForeign ? '≈ ' : ''

  // --- Sức khỏe tài chính + thẻ gợi ý (V, Q) ---
  const expenseBreakdown = useMemo(
    () => categoryBreakdown(monthTxs, 'expense', currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, accounts, base, rates],
  )
  const thisPoint = series.points[series.points.length - 1]
  const prevPoint = series.points[series.points.length - 2]
  const rate = thisPoint ? savingsRate(thisPoint.income, thisPoint.expense) : null
  const streak = useMemo(
    () => noSpendStreak(monthTxs, toISODate(new Date()), monthStartDay),
    [monthTxs, monthStartDay],
  )
  const topSlice = expenseBreakdown.slices[0]
  const topCat = topSlice ? categoryOf(topSlice.categoryId) : undefined
  const insights = buildInsights(
    {
      expenseThis: thisPoint?.expense ?? 0,
      expensePrev: prevPoint?.expense ?? 0,
      topCategoryName: topCat?.name ?? null,
      topCategoryAmount: topSlice?.amount ?? 0,
      expenseTotal: expenseBreakdown.total,
    },
    (m) => formatMoney(m, base),
  )
  const hasHealth = rate !== null || streak > 0 || insights.length > 0

  return (
    <div className="flex flex-col gap-4 p-3 lg:p-6">
      {/* Header chuyển tháng */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonthKey((k) => addMonths(k ?? activeMonthKey, -1))}
          className="rounded-lg bg-white px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Tháng trước"
        >
          ←
        </button>
        <h1 className="text-lg font-bold text-gray-800">{formatMonthLabel(activeMonthKey)}</h1>
        <button
          type="button"
          onClick={() => setMonthKey((k) => addMonths(k ?? activeMonthKey, 1))}
          className="rounded-lg bg-white px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Tháng sau"
        >
          →
        </button>
      </div>

      {/* Chọn tab: Biểu đồ | Ngân sách */}
      <div className="flex rounded-lg bg-gray-100 p-0.5 text-sm font-medium">
        <button
          type="button"
          onClick={() => setView('charts')}
          className={`flex-1 rounded-md py-1.5 ${view === 'charts' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
        >
          Biểu đồ
        </button>
        <button
          type="button"
          onClick={() => setView('budget')}
          className={`flex-1 rounded-md py-1.5 ${view === 'budget' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
        >
          Ngân sách
        </button>
      </div>

      {view === 'charts' && (breakdown.hasMissingRate || series.hasMissingRate) && (
        <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
          Một phần giao dịch ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên có thể thiếu.
        </div>
      )}

      {view === 'charts' && (
        <>
      {/* Sức khỏe tài chính + thẻ gợi ý (V, Q) */}
      {hasHealth && (
        <section className="rounded-xl bg-white p-3 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-gray-500">Sức khỏe tài chính</h2>
          <div className="mb-2 flex gap-2">
            {rate !== null && (
              <div className="flex-1 rounded-lg bg-gray-50 p-2 text-center">
                <div className={`text-lg font-bold ${rate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {Math.round(rate * 100)}%
                </div>
                <div className="text-[11px] text-gray-500">Tỷ lệ tiết kiệm</div>
              </div>
            )}
            <div className="flex-1 rounded-lg bg-gray-50 p-2 text-center">
              <div className="text-lg font-bold text-gray-800">{streak}</div>
              <div className="text-[11px] text-gray-500">Ngày liên tiếp không chi</div>
            </div>
          </div>
          {insights.length > 0 && (
            <ul className="space-y-1">
              {insights.map((i) => (
                <li key={i.id} className="rounded-lg bg-green-50 px-2 py-1.5 text-xs text-gray-700">
                  {i.text}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Biểu đồ tròn theo danh mục */}
      <section className="rounded-xl bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500">Cơ cấu theo danh mục</h2>
          <div className="flex rounded-lg bg-gray-100 p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setKind('expense')}
              className={`rounded-md px-3 py-1 ${kind === 'expense' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}
            >
              Chi
            </button>
            <button
              type="button"
              onClick={() => setKind('income')}
              className={`rounded-md px-3 py-1 ${kind === 'income' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500'}`}
            >
              Thu
            </button>
          </div>
        </div>

        {pieData.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">
            Chưa có {kind === 'expense' ? 'chi tiêu' : 'thu nhập'} trong tháng này
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
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => formatMoney(Number(v), base)}
                    contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] text-gray-400">Tổng</span>
                <span className="text-sm font-bold text-gray-800">
                  {approx}
                  {formatCompact(breakdown.total, base)}
                </span>
              </div>
            </div>

            <ul className="flex-1 space-y-1.5 self-stretch">
              {pieData.map((d) => (
                <li key={d.name} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: d.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-gray-700">
                    {d.icon} {d.name}
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">{d.pct.toFixed(0)}%</span>
                  <span className="shrink-0 font-medium text-gray-800">
                    {formatMoney(d.value, base)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Biểu đồ cột thu/chi 6 tháng */}
      <section className="rounded-xl bg-white p-3 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-500">Thu / chi 6 tháng gần nhất</h2>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={(v: number) => formatCompact(v, base)}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip
                formatter={(v, name) => [
                  formatMoney(Number(v), base),
                  name === 'income' ? 'Thu' : 'Chi',
                ]}
                labelFormatter={(l) => `Tháng ${l}`}
                contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
              />
              <Bar dataKey="income" fill="#16a34a" radius={[3, 3, 0, 0]} />
              <Bar dataKey="expense" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 flex justify-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-green-600" /> Thu
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Chi
          </span>
        </div>
      </section>
        </>
      )}

      {view === 'budget' && <BudgetView monthKey={activeMonthKey} />}
    </div>
  )
}
