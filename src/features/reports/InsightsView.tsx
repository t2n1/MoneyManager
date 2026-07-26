import { useMemo } from 'react'
import {
  useAccounts,
  useCategories,
  useMonthTransactions,
  useProfile,
  useRangeTransactions,
  useRates,
  useRecurringRules,
} from '../../hooks/queries'
import {
  addDaysISO,
  addMonths,
  getMonthRange,
  monthKeyForDate,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import { categoryBreakdown, categoryComparison, dailyExpenseTotals, monthlySeries } from './aggregate'
import { buildInsights, detectAnomalies, noSpendStreak, savingsRate } from './insights'
import { useMonthPace } from './monthPace'
import { SavingsRateTrendCard } from './SavingsRateTrendCard'
import { CategoryCompareBarsCard } from './CategoryCompareBarsCard'
import { ParetoCard } from './ParetoCard'
import { SpendSizeCard } from './SpendSizeCard'
import { SpendRhythmCard } from './SpendRhythmCard'
import { SubscriptionsCard } from './SubscriptionsCard'
import {
  detectPaydays,
  paydayEffect,
  spendPercentiles,
  subscriptionSummary,
  weekdayProfile,
} from './behavior'

export function InsightsView({ monthKey }: { monthKey: MonthKey }) {
  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { base, rates } = useRates()
  const r = rates ?? {}
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: monthTxs = [] } = useMonthTransactions(monthKey)
  // Dự báo cuối tháng dùng chung với tab Ngân sách (các khối nhịp chi nằm bên đó)
  const { forecast, forecastApprox } = useMonthPace(monthKey)

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

  // --- Sức khỏe tài chính (V, Q) ---
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

  // --- Phát hiện chi bất thường (U) ---
  const range = getMonthRange(monthKey, monthStartDay)
  const historyTxs = useMemo(
    () => rangeTxs.filter((t) => t.occurred_on < range.start),
    [rangeTxs, range.start],
  )
  const anomalyResult = useMemo(
    () => detectAnomalies(monthTxs, historyTxs, currencyOf, base, r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, historyTxs, accounts, base, rates],
  )
  const anomalies = anomalyResult.anomalies.slice(0, 5)

  // --- Hành vi chi tiêu: tính trên cả 6 tháng để mẫu đủ lớn, không chỉ 1 tháng ---
  const { data: recurringRules = [] } = useRecurringRules()
  const sixMonthDaily = useMemo(
    () =>
      dailyExpenseTotals(
        rangeTxs,
        sixMonthRange.start,
        addDaysISO(sixMonthRange.end, -1),
        currencyOf,
        base,
        r,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeTxs, sixMonthRange, accounts, base, rates],
  )
  const sizes = useMemo(
    () => spendPercentiles(rangeTxs, currencyOf, base, r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeTxs, accounts, base, rates],
  )
  const PAYDAY_WINDOW = 3
  const rhythm = useMemo(() => {
    const paydays = detectPaydays(rangeTxs, currencyOf, base, r)
    return {
      payday: paydayEffect(sixMonthDaily.points, paydays, PAYDAY_WINDOW),
      weekdays: weekdayProfile(sixMonthDaily.points),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeTxs, sixMonthDaily, accounts, base, rates])
  const subscriptions = useMemo(
    () => subscriptionSummary(recurringRules, todayISO, currencyOf, base, r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recurringRules, todayISO, accounts, base, rates],
  )
  // Thu nhập trung bình tháng của 6 tháng có giao dịch — mẫu số cho tỷ trọng thuê bao
  const activeIncomeMonths = series.points.filter((p) => p.income > 0)
  const avgMonthlyIncome =
    activeIncomeMonths.length > 0
      ? activeIncomeMonths.reduce((s, p) => s + p.income, 0) / activeIncomeMonths.length
      : 0

  const hasMissingRate =
    series.hasMissingRate ||
    expenseBreakdown.hasMissingRate ||
    forecastApprox ||
    comparison.hasMissingRate ||
    anomalyResult.hasMissingRate

  // Thẻ tổng quan trên cùng — chỉ hiện khi có ít nhất một chỉ số
  const hasOverview = rate !== null || forecast !== null || (streak !== null && streak > 0)
  const hasAny =
    hasOverview || comparison.rows.length > 0 || anomalies.length > 0 || insights.length > 0

  const labelOf = (k: MonthKey) => `${k.month}/${String(k.year).slice(2)}`

  return (
    <div className="flex flex-col gap-3">
      {hasMissingRate && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 p-2 text-xs text-amber-700 dark:text-amber-300">
          Một phần giao dịch ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên có thể thiếu.
        </div>
      )}

      {/* Tổng quan — các chỉ số then chốt */}
      {hasOverview && (
        <section className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-white dark:bg-gray-900 p-3 text-center shadow-sm">
            <div
              className={`text-lg font-bold ${
                rate === null
                  ? 'text-gray-500 dark:text-gray-400'
                  : rate >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
              }`}
            >
              {rate === null ? '—' : `${Math.round(rate * 100)}%`}
            </div>
            <div className="mt-0.5 text-[0.6875rem] text-gray-500 dark:text-gray-400">Tỷ lệ tiết kiệm</div>
          </div>
          <div className="rounded-xl bg-white dark:bg-gray-900 p-3 text-center shadow-sm">
            <div className="text-lg font-bold text-gray-800 dark:text-gray-100">
              {forecast ? `${forecastApprox ? '≈' : ''}${formatCompact(forecast.projected, base)}` : '—'}
            </div>
            <div className="mt-0.5 text-[0.6875rem] text-gray-500 dark:text-gray-400">Dự báo cuối tháng</div>
          </div>
          <div className="rounded-xl bg-white dark:bg-gray-900 p-3 text-center shadow-sm">
            <div className="text-lg font-bold text-gray-800 dark:text-gray-100">
              {streak !== null ? streak : '—'}
            </div>
            <div className="mt-0.5 text-[0.6875rem] text-gray-500 dark:text-gray-400">Ngày không chi</div>
          </div>
        </section>
      )}

      {/* Gợi ý — đặt ngay đầu tab: đây là phần tóm tắt, không phải phụ lục */}
      {insights.length > 0 && (
        <section className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">Gợi ý</h2>
          <ul className="space-y-1">
            {insights.map((i) => (
              <li
                key={i.id}
                className="rounded-lg bg-green-50 dark:bg-green-900/30 px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300"
              >
                {i.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Xu hướng tỷ lệ tiết kiệm 6 tháng */}
      <SavingsRateTrendCard series={series} labelOf={labelOf} />

      {/* So sánh chi theo danh mục — bar ngang */}
      <CategoryCompareBarsCard rows={comparison.rows} categories={categories} base={base} />

      {/* Pareto 80/20 của tháng đang xem */}
      <ParetoCard
        slices={expenseBreakdown.slices}
        categories={categories}
        base={base}
        periodNoun="tháng này"
      />

      {/* Độ lớn một khoản chi điển hình (6 tháng cho mẫu đủ lớn) */}
      <SpendSizeCard
        data={sizes}
        base={base}
        periodNoun="trong 6 tháng"
        hourlyWage={profile?.hourly_wage ?? null}
      />

      {/* Nhịp chi tiêu: sau ngày lương & theo thứ */}
      <SpendRhythmCard
        payday={rhythm.payday}
        weekdays={rhythm.weekdays}
        base={base}
        windowDays={PAYDAY_WINDOW}
      />

      {/* Khoản tự động trừ mỗi tháng */}
      <SubscriptionsCard
        data={subscriptions}
        base={base}
        monthlyIncome={avgMonthlyIncome}
        hourlyWage={profile?.hourly_wage ?? null}
      />

      {/* Chi tiêu bất thường */}
      {anomalies.length > 0 && (
        <section className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">Chi tiêu bất thường</h2>
          <ul className="space-y-1">
            {anomalies.map((a) => {
              const cat = categoryOf(a.categoryId)
              return (
                <li
                  key={a.transactionId}
                  className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 px-2 py-1.5 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
                    {cat?.icon ?? '📦'} {cat?.name ?? '?'}
                  </span>
                  <span className="shrink-0 font-medium text-gray-800 dark:text-gray-100">{formatMoney(a.amount, base)}</span>
                  <span className="shrink-0 text-amber-600">gấp {Math.round(a.ratio)}× thường ngày</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {!hasAny && (
        <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">Chưa đủ dữ liệu để phân tích.</p>
      )}
    </div>
  )
}
