import { useMemo } from 'react'
import { Card } from '../../components/ui'
import { VerdictNote } from '../../components/VerdictNote'
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
import { weekPace } from './weekPace'
import { CategoryCompareBarsCard } from './CategoryCompareBarsCard'
import { Section, SectionIndex, type IndexItem } from './SectionIndex'
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

// Nhãn ngắn cho hàng chip cuộn ngang ("Chi tiêu bất thường" → "Bất thường").
const ALWAYS: readonly IndexItem[] = [
  { id: 'ins-so-sanh', label: 'So sánh' },
  { id: 'ins-pareto', label: '80/20' },
  { id: 'ins-do-lon', label: 'Độ lớn' },
  { id: 'ins-nhip', label: 'Nhịp chi' },
  { id: 'ins-thue-bao', label: 'Định kỳ' },
]

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
  // --- Nhịp chi tuần này vs tuần trước, cắt tới cùng số ngày ---
  //
  // Chỉ có nghĩa khi đang xem tháng HIỆN TẠI: xem tháng cũ thì "tuần này" không nằm
  // trong kỳ, câu chữ sẽ nói về một tuần không liên quan tới thứ trên màn hình.
  //
  // Tuần bắt đầu từ thứ Hai. getDay() trả 0 cho Chủ nhật nên phải xoay, nếu không thì
  // Chủ nhật thành ngày ĐẦU tuần và cửa sổ so sánh lệch cả tuần.
  const dayOfWeek = ((new Date(todayISO).getDay() + 6) % 7) + 1
  const pace = useMemo(() => {
    if (!isCurrentMonth) return null
    const expenseOn = new Map(sixMonthDaily.points.map((p) => [p.date, p.expense]))
    const thisWeekStart = addDaysISO(todayISO, -(dayOfWeek - 1))
    const lastWeekStart = addDaysISO(thisWeekStart, -7)
    const week = (startISO: string) =>
      Array.from({ length: 7 }, (_, i) => expenseOn.get(addDaysISO(startISO, i)) ?? 0)
    const lastWeek = week(lastWeekStart)
    // Cả tuần trước không có NGÀY NÀO trong dữ liệu → coi như chưa có tuần trước để so.
    // Khác với "tuần trước chi 0đ": chỗ đó weekPace tự trả deltaPct null.
    const hasLastWeek = lastWeek.some(
      (_, i) => expenseOn.has(addDaysISO(lastWeekStart, i)),
    )
    return weekPace({
      thisWeek: week(thisWeekStart),
      lastWeek: hasLastWeek ? lastWeek : [],
      dayOfWeek,
    })
  }, [isCurrentMonth, sixMonthDaily, todayISO, dayOfWeek])

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

  // Ba khối đầu/cuối là có điều kiện, nên mục lục phải dùng CHÍNH những điều kiện đó —
  // chip trỏ vào khối không render là chip bấm không đi đâu.
  const sections = useMemo(
    () => [
      ...(hasOverview ? [{ id: 'ins-tong-quan', label: 'Tổng quan' }] : []),
      ...(insights.length > 0 ? [{ id: 'ins-goi-y', label: 'Gợi ý' }] : []),
      ...ALWAYS,
      ...(anomalies.length > 0 ? [{ id: 'ins-bat-thuong', label: 'Bất thường' }] : []),
    ],
    [hasOverview, insights.length, anomalies.length],
  )

  return (
    <div className="flex flex-col gap-3">
      {hasMissingRate && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 p-2 text-xs text-amber-700 dark:text-amber-300">
          Một phần giao dịch ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên có thể thiếu.
        </div>
      )}

      <SectionIndex items={sections} />

      {/* Tổng quan — các chỉ số then chốt */}
      {hasOverview && (
        <section id="ins-tong-quan" className="scroll-mt-16 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-surface p-3 text-center shadow-sm">
            <div
              className={`text-lg font-bold ${
                rate === null
                  ? 'text-fg-muted'
                  : rate >= 0
                    ? 'text-money-in'
                    : 'text-money-out'
              }`}
            >
              {rate === null ? '—' : `${Math.round(rate * 100)}%`}
            </div>
            <div className="mt-0.5 text-2xs text-fg-muted">Tỷ lệ tiết kiệm</div>
          </div>
          <div className="rounded-xl bg-surface p-3 text-center shadow-sm">
            <div className="text-lg font-bold text-fg-primary">
              {forecast ? `${forecastApprox ? '≈' : ''}${formatCompact(forecast.projected, base)}` : '—'}
            </div>
            <div className="mt-0.5 text-2xs text-fg-muted">Dự báo cuối tháng</div>
          </div>
          <div className="rounded-xl bg-surface p-3 text-center shadow-sm">
            <div className="text-lg font-bold text-fg-primary">
              {streak !== null ? streak : '—'}
            </div>
            <div className="mt-0.5 text-2xs text-fg-muted">Ngày không chi</div>
          </div>
        </section>
      )}

      {/* Gợi ý — đặt ngay đầu tab: đây là phần tóm tắt, không phải phụ lục */}
      {insights.length > 0 && (
        <section id="ins-goi-y" className="scroll-mt-16 rounded-xl bg-surface p-3 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-fg-muted">Gợi ý</h2>
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

      {/* Tỷ lệ tiết kiệm 6 tháng đã CHUYỂN sang tab Biểu đồ, nằm chung khung với cột
          thu/chi (MonthlyBarsCard) trên trục phải. Trước đây nó là thẻ riêng ở đây: cùng
          một chuỗi tháng vẽ hai lần ở hai tab, mà "giữ được mấy %" chỉ có nghĩa khi thấy
          ngay bên cạnh thu và chi sinh ra nó. */}

      {/* So sánh chi theo danh mục — bar ngang */}
      <Section id="ins-so-sanh">
        <CategoryCompareBarsCard rows={comparison.rows} categories={categories} base={base} />
      </Section>

      {/* Pareto 80/20 của tháng đang xem */}
      <Section id="ins-pareto">
        <ParetoCard
          slices={expenseBreakdown.slices}
          categories={categories}
          base={base}
          periodNoun="tháng này"
        />
      </Section>

      {/* Độ lớn một khoản chi điển hình (6 tháng cho mẫu đủ lớn) */}
      <Section id="ins-do-lon">
        <SpendSizeCard
          data={sizes}
          base={base}
          periodNoun="trong 6 tháng"
          hourlyWage={profile?.hourly_wage ?? null}
        />
      </Section>

      {/* Nhịp chi tiêu: tuần này vs tuần trước, sau ngày lương & theo thứ */}
      <Section id="ins-nhip">
        {pace && (
          <Card as="section" className="mb-2">
            <h2 className="mb-2 text-sm font-semibold text-fg-muted">Tuần này so với tuần trước</h2>
            <VerdictNote tone={pace.tone}>
              Ngày {pace.dayOfWeek}/7 — đã chi <b>{formatMoney(pace.spent, base)}</b>
              {pace.deltaPct === null ? (
                <>. Tuần trước tính tới ngày này chưa chi gì nên không so được.</>
              ) : pace.deltaPct === 0 ? (
                <>, đúng bằng nhịp tuần trước ({formatMoney(pace.priorSameDays, base)}).</>
              ) : (
                <>
                  , {pace.deltaPct > 0 ? 'nhanh hơn' : 'chậm hơn'} nhịp tuần trước{' '}
                  <b>{Math.abs(pace.deltaPct)}%</b> ({formatMoney(pace.priorSameDays, base)} cùng{' '}
                  {pace.dayOfWeek} ngày đầu tuần).
                </>
              )}
            </VerdictNote>
            {/* Nói rõ đang so trên nền mấy ngày — nếu không, người đọc mặc định đang so
                với TRỌN tuần trước và sẽ thấy con số quá thấp một cách vô lý.
                Không có so sánh nào thì cũng không có gì phải giải thích. */}
            {pace.deltaPct !== null && (
              <p className="mt-1.5 text-2xs text-fg-muted">
                Chỉ so tới ngày thứ {pace.dayOfWeek} của tuần trước, không so với cả 7 ngày — tuần
                đang dở mà đem so với tuần đủ thì lúc nào cũng ra “đang tiêu ít hơn”.
              </p>
            )}
          </Card>
        )}
        <SpendRhythmCard
          payday={rhythm.payday}
          weekdays={rhythm.weekdays}
          base={base}
          windowDays={PAYDAY_WINDOW}
        />
      </Section>

      {/* Khoản tự động trừ mỗi tháng */}
      <Section id="ins-thue-bao">
        <SubscriptionsCard
          data={subscriptions}
          base={base}
          monthlyIncome={avgMonthlyIncome}
          hourlyWage={profile?.hourly_wage ?? null}
        />
      </Section>

      {/* Chi tiêu bất thường */}
      {anomalies.length > 0 && (
        <section id="ins-bat-thuong" className="scroll-mt-16 rounded-xl bg-surface p-3 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-fg-muted">Chi tiêu bất thường</h2>
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
                  <span className="shrink-0 font-medium text-fg-primary">{formatMoney(a.amount, base)}</span>
                  <span className="shrink-0 text-fg-warn">gấp {Math.round(a.ratio)}× thường ngày</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {!hasAny && (
        <p className="py-10 text-center text-sm text-fg-muted">Chưa đủ dữ liệu để phân tích.</p>
      )}
    </div>
  )
}
