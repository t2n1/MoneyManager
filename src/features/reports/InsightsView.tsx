import { useMemo } from 'react'
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
  addMonths,
  daysBetween,
  getMonthRange,
  monthKeyForDate,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { convertToBase } from '../../lib/rates'
import { categoryBreakdown, monthlySeries } from './aggregate'
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

  const hasMissingRate = series.hasMissingRate || expenseBreakdown.hasMissingRate || forecastApprox
  const hasAny = hasHealth || forecast

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

      {!hasAny && (
        <p className="py-10 text-center text-sm text-gray-400">Chưa đủ dữ liệu để phân tích.</p>
      )}
    </div>
  )
}
