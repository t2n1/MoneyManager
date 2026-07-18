import { useMemo } from 'react'
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  useAccounts,
  useBudgetReport,
  useCategories,
  useMonthTransactions,
  useProfile,
  useRangeTransactions,
  useRates,
} from '../../hooks/queries'
import {
  addDaysISO,
  addMonths,
  daysBetween,
  getMonthRange,
  monthKeyForDate,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import { convertToBase } from '../../lib/rates'
import { categoryBreakdown, categoryComparison, cumulativeDailyBalance, monthlySeries } from './aggregate'
import { buildInsights, forecastMonthEnd, noSpendStreak, savingsRate } from './insights'

export function InsightsView({ monthKey }: { monthKey: MonthKey }) {
  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { base, rates } = useRates()
  const r = rates ?? {}
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: monthTxs = [] } = useMonthTransactions(monthKey)
  const { report } = useBudgetReport(monthKey)

  // 6 tháng gần nhất (gồm tháng đang xem) — nền cho so sánh (S) và bất thường (U)
  const sixMonths = useMemo(
    () => Array.from({ length: 6 }, (_, i) => addMonths(monthKey, i - 5)),
    [monthKey],
  )
  const sixMonthRange = useMemo(
    () => ({
      start: getMonthRange(sixMonths[0], monthStartDay).start,
      end: getMonthRange(monthKey, monthStartDay).end,
    }),
    [sixMonths, monthKey, monthStartDay],
  )
  const { data: rangeTxs = [] } = useRangeTransactions(sixMonthRange, !!profile)

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? base
  const categoryOf = (id: string) => categories.find((c) => c.id === id)

  const series = useMemo(
    () => monthlySeries(rangeTxs, sixMonths, monthStartDay, currencyOf, base, r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeTxs, sixMonths, monthStartDay, accounts, base, rates],
  )
  const expenseBreakdown = useMemo(
    () => categoryBreakdown(monthTxs, 'expense', currencyOf, base, r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, accounts, base, rates],
  )
  const comparison = useMemo(
    () => categoryComparison(rangeTxs, monthKey, monthStartDay, currencyOf, base, r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeTxs, monthKey, monthStartDay, accounts, base, rates],
  )

  // --- Sức khỏe tài chính (V, Q) — chuyển từ ReportsPage ---
  const todayISO = toISODate(new Date())
  const currentKey = monthKeyForDate(todayISO, monthStartDay)
  const isCurrentMonth = monthKey.year === currentKey.year && monthKey.month === currentKey.month
  const thisPoint = series.points[series.points.length - 1]
  const prevPoint = series.points[series.points.length - 2]
  const rate = thisPoint ? savingsRate(thisPoint.income, thisPoint.expense) : null
  const streak = useMemo(
    () => (isCurrentMonth ? noSpendStreak(monthTxs, todayISO, monthStartDay) : null),
    [monthTxs, monthStartDay, isCurrentMonth, todayISO],
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
  const hasHealth = rate !== null || (streak !== null && streak > 0) || insights.length > 0

  // --- Dự báo cuối tháng (R) — chỉ tháng hiện tại ---
  const range = getMonthRange(monthKey, monthStartDay)
  const daysInMonth = daysBetween(range.start, range.end)
  const daysElapsed = Math.min(daysBetween(range.start, todayISO) + 1, daysInMonth)
  let spentSoFar = 0
  let forecastApprox = false
  for (const t of monthTxs) {
    if (t.type !== 'expense' || t.occurred_on > todayISO) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, r)
    if (v === null) {
      forecastApprox = true
      continue
    }
    spentSoFar += v
  }
  const forecast = isCurrentMonth ? forecastMonthEnd(spentSoFar, daysElapsed, daysInMonth) : null
  const totalBudgeted = report?.totalBudgeted ?? 0

  // --- Dòng tiền tích lũy trong tháng (W) ---
  const cashLastISO = isCurrentMonth ? todayISO : addDaysISO(range.end, -1)
  const cashflow = useMemo(
    () => cumulativeDailyBalance(monthTxs, range.start, cashLastISO, currencyOf, base, r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, range.start, cashLastISO, accounts, base, rates],
  )
  const cashflowData = cashflow.points.map((p) => ({ day: Number(p.date.slice(8)), balance: p.balance }))
  const hasCashflow = cashflow.points.some((p) => p.balance !== 0)

  const hasMissingRate =
    series.hasMissingRate ||
    expenseBreakdown.hasMissingRate ||
    forecastApprox ||
    comparison.hasMissingRate ||
    cashflow.hasMissingRate
  const hasAny = hasHealth || forecast || comparison.rows.length > 0 || hasCashflow

  return (
    <div className="flex flex-col gap-3">
      {hasMissingRate && (
        <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
          Một phần giao dịch ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên có thể thiếu.
        </div>
      )}

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
            {streak !== null && (
              <div className="flex-1 rounded-lg bg-gray-50 p-2 text-center">
                <div className="text-lg font-bold text-gray-800">{streak}</div>
                <div className="text-[11px] text-gray-500">Ngày liên tiếp không chi</div>
              </div>
            )}
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

      {forecast && (
        <section className="rounded-xl bg-white p-3 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-500">Dự báo cuối tháng</h2>
          <div className="text-2xl font-bold text-gray-800">
            {forecastApprox ? '≈ ' : ''}
            {formatMoney(forecast.projected, base)}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Đã chi {formatMoney(forecast.spentSoFar, base)} sau {forecast.daysElapsed}/
            {forecast.daysInMonth} ngày
          </p>
          {totalBudgeted > 0 ? (
            forecast.projected > totalBudgeted ? (
              <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600">
                Với đà này bạn sẽ vượt ngân sách {formatMoney(forecast.projected - totalBudgeted, base)}.
              </p>
            ) : (
              <p className="mt-2 rounded-lg bg-green-50 px-2 py-1.5 text-xs text-green-700">
                Với đà này bạn vẫn trong ngân sách ({formatMoney(totalBudgeted, base)}).
              </p>
            )
          ) : (
            <p className="mt-2 text-xs text-gray-400">Đặt ngân sách tháng để so sánh với dự báo.</p>
          )}
        </section>
      )}

      {comparison.rows.length > 0 && (
        <section className="rounded-xl bg-white p-3 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-gray-500">So sánh chi theo danh mục</h2>
          <ul className="space-y-2">
            {comparison.rows.map((row) => {
              const cat = categoryOf(row.categoryId)
              return (
                <li key={row.categoryId} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                    {cat?.icon ?? '📦'} {cat?.name ?? '?'}
                  </span>
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1 text-sm font-medium text-gray-800">
                      {formatMoney(row.thisMonth, base)}
                      {row.isNew ? (
                        <span className="rounded bg-sky-50 px-1 text-[10px] text-sky-600">mới</span>
                      ) : row.deltaPct !== null && row.deltaPct !== 0 ? (
                        <span className={`text-[11px] ${row.deltaPct > 0 ? 'text-red-500' : 'text-green-600'}`}>
                          {row.deltaPct > 0 ? '▲' : '▼'}
                          {Math.abs(row.deltaPct)}%
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      Trước {formatMoney(row.prevMonth, base)} · TB3 {formatMoney(row.avg3, base)}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {hasCashflow && (
        <section className="rounded-xl bg-white p-3 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-gray-500">Dòng tiền tích lũy trong tháng</h2>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cashflowData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  interval={4}
                />
                <YAxis
                  tickFormatter={(v: number) => formatCompact(v, base)}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <ReferenceLine y={0} stroke="#e5e7eb" />
                <Tooltip
                  formatter={(v) => formatMoney(Number(v), base)}
                  labelFormatter={(l) => `Ngày ${l}`}
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
                />
                <Line type="monotone" dataKey="balance" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {!hasAny && (
        <p className="py-10 text-center text-sm text-gray-400">Chưa đủ dữ liệu để phân tích.</p>
      )}
    </div>
  )
}
