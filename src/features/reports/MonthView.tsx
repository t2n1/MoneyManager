// Tab "Tháng này" — bản 26a. Thay hẳn lưới thẻ cũ + tab "Thấu hiểu".
//
// VÌ SAO DỰNG LẠI
// Bản trước có 18 thẻ cho 6 câu trả lời. Chi theo danh mục xuất hiện BA lần (Cơ cấu chi
// theo danh mục · So sánh chi theo danh mục · Ít danh mục nhiều tiền), tỷ lệ giữ lại BỐN
// lần (ô KPI · vòng tròn · dòng Tiết kiệm trong 50/30/20 · ba ô lặp giữa trang), sáu tháng
// gần nhất vẽ HAI biểu đồ cùng một bộ số. Và mọi thẻ mang cùng một cỡ chữ tiêu đề, nên
// không gì nổi lên trước và không có trật tự đọc nào.
//
// 26a rút còn 9 thẻ trong 5 khối ĐÁNH SỐ, mỗi khối trả đúng một câu:
//   01 tiền vào từ đâu, ra theo đường nào
//   02 chi tiêu đi vào đâu            ← khối chính: MỘT bảng 12 danh mục
//   03 so với trước, cùng số ngày
//   04 phần không tiêu đã đi đâu
//   05 đáng để ý
//
// ĐÃ BỎ khỏi tab, mỗi cái một lý do:
//   · vòng tròn "Giữ lại được bao nhiêu"  → ô KPI đã nói đúng con số đó
//   · ba ô lặp giữa trang                  → lặp lần thứ ba
//   · "So sánh chi theo danh mục"          → thành cột Δ của bảng khối 02
//   · "Ít danh mục nhiều tiền" (Pareto)    → thành một mệnh đề ở tiêu đề bảng khối 02
//   · vòng tròn "Cố định vs Biến đổi"      → hai miếng thì dùng thanh, không dùng bánh
//   · "Dòng tiền ròng 6 tháng"             → trùng bộ số với biểu đồ thu/chi 6 tháng
//   · thẻ "Gợi ý"                          → gợi ý về đúng chỗ nó nói tới
//   · "Nhịp chi tiêu theo thứ"             → chuyển sang tab Sức khỏe
//   · ô KPI "Ngày không chi"               → với người chi hằng ngày nó LUÔN bằng 0
//
// Thu tách "định kỳ vs một lần" đọc `transactions.recurring_rule_id` — cờ THẬT do người
// dùng khai một quy tắc định kỳ, không suy từ số tiền. Cột có từ migration 0008 nhưng tới
// gần đây chưa có gì ghi vào; EntryPage giờ gắn nó khi form mở từ `?rule=`. Chưa có khoản
// thu nào gắn quy tắc thì khối đó ẨN, không đoán.

import { useMemo } from 'react'
import { Guide } from '../../components/Guide'
import { Card, EmptyState, Money, Num, SectionTitle, StatTile, Swap } from '../../components/ui'
import { ConclusionLine, VerdictNote } from '../../components/VerdictNote'
import {
  useAccounts,
  useBudgetReport,
  useCategories,
  useMonthTransactions,
  usePlannedExpenses,
  useProfile,
  useRangeTransactions,
  useRates,
  useRecurringRules,
  useTags,
  useTrips,
  useTransactionTags,
  useTransferCategoryIds,
} from '../../hooks/queries'
import {
  addDaysISO,
  addMonths,
  getMonthRange,
  monthKeyForDate,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import { convertToBase } from '../../lib/rates'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { collectCommitments } from '../budgets/commitments'
import { resolveMethod, savingsTargetShare } from '../budgets/budgetMethods'
import { classifiableExpenses } from '../categories/leaf'
import { tagBreakdown } from '../tags/aggregate'
import {
  categoryBreakdown,
  categoryComparison,
  classificationBreakdown,
  dailyExpenseTotals,
  monthDaysElapsed,
  monthExpenseCompare,
  monthlySeries,
  sumIncomeExpense,
} from './aggregate'
import { detectAnomalies } from './insights'
import { headlineOf } from './headline'
import { monthStory } from './monthStory'
import { MonthStoryNote } from './MonthStoryNote'
import { useMonthPace } from './monthPace'
import { periodDaysLabel } from './periodCompare'
import {
  categorySparks,
  incomeSplit,
  keptDestinations,
  monthWordLabel,
  outflowTiers,
  remainingPlan,
  spendShape,
  type MonthTableRow,
} from './monthReport'
import { spendPercentiles, subscriptionSummary } from './behavior'
import { dongChiChuaGhi, tongChiCoPhanChuaGhi } from './chiChuaGhi'
import { GhiChuChuyenDi } from './GhiChuChuyenDi'
import { ngayDiVang, thangCoChuyenDi } from './ngayDiVang'
import { useChiChuaGhi } from './useChiChuaGhi'
import { MonthCategoryTable } from './MonthCategoryTable'
import {
  KeptWhereCard,
  MoreCountList,
  OutflowTiersCard,
  RemainingCard,
  SameDaysCard,
  type MoreItem,
} from './MonthFlowCards'
import { MonthlyBarsCard } from './MonthlyBarsCard'
import { Section, SectionIndex, type IndexItem } from './SectionIndex'
import { SpendClassificationCard } from './SpendClassificationCard'
import { SpendSizeCard } from './SpendSizeCard'
import { SubscriptionsCard } from './SubscriptionsCard'
import { TagBreakdownCard } from './TagBreakdownCard'
import { UncategorizedBacklogCard } from './UncategorizedBacklogCard'
import { uncategorizedByMonth } from './uncategorized'
import { ReportBlock } from './ReportBlock'

/** Cửa sổ cho đường tí hon, cột TB 3 tháng và biểu đồ 6 tháng. */
const WINDOW = 6

/** Dải chip mục lục — GIỮ ở mobile, bỏ ở desktop (§4.5). */
const SECTIONS: readonly IndexItem[] = [
  { id: 'm-vao-ra', label: 'Vào / ra' },
  { id: 'm-danh-muc', label: 'Danh mục' },
  { id: 'm-so-truoc', label: 'So trước' },
  { id: 'm-khong-tieu', label: 'Không tiêu' },
  { id: 'm-dang-de-y', label: 'Đáng để ý' },
]

export function MonthView({ monthKey }: { monthKey: MonthKey }) {
  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { base, rates } = useRates()
  const r = rates ?? {}
  const transferIds = useTransferCategoryIds()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: tags = [] } = useTags()
  // Chuyến đi: tập ngày/tháng loại khỏi mốc so (spec chuyen-di). Biểu đồ giữ nguyên.
  const { data: trips = [] } = useTrips()
  const vang = useMemo(() => ngayDiVang(trips), [trips])
  const thangVang = useMemo(() => thangCoChuyenDi(trips, monthStartDay), [trips, monthStartDay])
  const { data: tagLinks = [] } = useTransactionTags()
  const { data: recurringRules = [] } = useRecurringRules()
  const { data: plannedExpenses = [] } = usePlannedExpenses()

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? base
  const categoryOf = (id: string) => categories.find((c) => c.id === id)

  const todayISO = toISODate(new Date())
  const range = useMemo(() => getMonthRange(monthKey, monthStartDay), [monthKey, monthStartDay])
  const monthLastISO = addDaysISO(range.end, -1)
  const prevRange = useMemo(
    () => getMonthRange(addMonths(monthKey, -1), monthStartDay),
    [monthKey, monthStartDay],
  )

  const months = useMemo(
    () => Array.from({ length: WINDOW }, (_, i) => addMonths(monthKey, i - (WINDOW - 1))),
    [monthKey],
  )
  const windowRange = useMemo(
    () => ({
      start: getMonthRange(months[0], monthStartDay).start,
      end: range.end,
    }),
    [months, monthStartDay, range.end],
  )

  const { data: monthTxs = [], isFetched: monthFetched } = useMonthTransactions(monthKey)
  const { data: rangeTxs = [] } = useRangeTransactions(windowRange, !!profile)

  // ---------------------------------------------------------------- số của kỳ
  const sums = useMemo(
    () => sumIncomeExpense(monthTxs, currencyOf, base, r, transferIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, accounts, base, rates, transferIds],
  )
  // Phần đã rời ví mà chưa ai ghi sổ — khoản bù của "Điều chỉnh số dư" đã nằm sẵn trong
  // giao dịch của tháng, chỉ bị vòng lặp của aggregate.ts bỏ qua vì exclude_from_stats.
  // Cố ý KHÔNG sửa sumIncomeExpense: hàm đó có 11 file gọi, tính cả src/mcp/.
  // Dùng chung hook với màn Ngân sách để hai màn không ra hai con số. Xem chiChuaGhi.ts.
  const chuaGhi = useChiChuaGhi(monthKey)
  const chiCoPhanChuaGhi = tongChiCoPhanChuaGhi(sums.expense, chuaGhi)
  const breakdown = useMemo(
    () => categoryBreakdown(monthTxs, 'expense', currencyOf, base, r, transferIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, accounts, base, rates, transferIds],
  )
  const classification = useMemo(
    () => classificationBreakdown(breakdown.slices, categories),
    [breakdown, categories],
  )
  const monthTags = useMemo(
    () => tagBreakdown(monthTxs, tagLinks, tags, currencyOf, base, r, transferIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, tagLinks, tags, accounts, base, rates, transferIds],
  )
  const series = useMemo(
    () => monthlySeries(rangeTxs, months, monthStartDay, currencyOf, base, r, transferIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeTxs, months, monthStartDay, accounts, base, rates, transferIds],
  )

  const { daysElapsed, daysInPeriod } = useMemo(
    () => monthDaysElapsed(monthKey, monthStartDay, todayISO),
    [monthKey, monthStartDay, todayISO],
  )
  const cutoffDay = daysElapsed >= daysInPeriod ? null : daysElapsed
  const cmp = useMemo(
    () => monthExpenseCompare(rangeTxs, monthKey, monthStartDay, todayISO, currencyOf, base, r, transferIds, vang),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeTxs, monthKey, monthStartDay, todayISO, accounts, base, rates, transferIds, vang],
  )

  const { report: budgetReport } = useBudgetReport(monthKey)
  const pace = useMonthPace(monthKey)

  // ---------------------------------------------------------------- khối 01
  const tiers = useMemo(
    () => outflowTiers(sums.income, chiCoPhanChuaGhi, sums.transfer, breakdown.slices.length),
    [sums, chiCoPhanChuaGhi, breakdown.slices.length],
  )
  const income = useMemo(
    () => incomeSplit(monthTxs, sums.expense, currencyOf, base, r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, sums.expense, accounts, base, rates],
  )

  // ---------------------------------------------------------------- khối 02: bảng
  const comparison = useMemo(
    () =>
      categoryComparison(rangeTxs, monthKey, monthStartDay, currencyOf, base, r, cutoffDay, transferIds, thangVang),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeTxs, monthKey, monthStartDay, accounts, base, rates, cutoffDay, transferIds, thangVang],
  )
  // Đường tí hon 6 tháng cho ĐÚNG những danh mục có mặt trong bảng — không fetch thêm.
  const sparkIds = useMemo(
    () => new Set(comparison.rows.map((row) => row.categoryId)),
    [comparison],
  )
  const catSeries = useMemo(
    () =>
      categorySparks(rangeTxs, months, monthStartDay, sparkIds, currencyOf, base, r, transferIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeTxs, months, sparkIds, monthStartDay, accounts, base, rates, transferIds],
  )
  const tableRows = useMemo<MonthTableRow[]>(() => {
    const total = comparison.rows.reduce((s, row) => s + Math.max(row.thisMonth, 0), 0)
    const budgetOf = (id: string) => {
      const line = budgetReport?.lines.find((l) => l.categoryId === id)
      return line ? line.budgeted : null
    }
    return comparison.rows
      .filter((row) => row.thisMonth > 0)
      .map((row) => {
        const cat = categoryOf(row.categoryId)
        return {
          categoryId: row.categoryId,
          name: cat?.name ?? 'Danh mục đã xoá',
          icon: cat?.icon ?? '📦',
          thisMonth: row.thisMonth,
          pct: total > 0 ? Math.round((row.thisMonth / total) * 100) : 0,
          avg3: row.avg3,
          deltaPct: row.deltaPct,
          isNew: row.isNew,
          spark: catSeries.get(row.categoryId) ?? [],
          budgeted: budgetOf(row.categoryId),
          fixed: cat?.cost_type === 'fixed',
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparison, catSeries, budgetReport, categories])

  // ---------------------------------------------------------------- khối 03
  const isVariable = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c.cost_type]))
    return (id: string | null) => (id === null ? false : byId.get(id) === 'variable')
  }, [categories])

  const shapes = useMemo(() => {
    if (cmp === null) return null
    const days = cmp.daysElapsed
    if (days <= 0) return null
    const shape = (startISO: string) =>
      spendShape(
        rangeTxs,
        startISO,
        addDaysISO(startISO, days - 1),
        isVariable,
        currencyOf,
        base,
        r,
        transferIds,
      )
    return { current: shape(range.start), prior: shape(prevRange.start), days }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmp, rangeTxs, range.start, prevRange.start, isVariable, accounts, base, rates, transferIds])

  // ---------------------------------------------------------------- khối 04
  const kept = useMemo(
    () => keptDestinations(monthTxs, accounts, range.start, monthLastISO, base, r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, accounts, range.start, monthLastISO, base, rates],
  )
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? 'Tài khoản đã xoá'

  // Cam kết CHƯA bị trừ = khoản định kỳ có kỳ hạn rơi vào phần CÒN LẠI của kỳ. Lấy cả kỳ
  // rồi trừ đi phần đã trôi là đếm luôn những khoản đã trả — chúng đã nằm trong `spent`.
  const committed = useMemo(() => {
    if (cutoffDay === null) return 0
    const rest = { start: addDaysISO(todayISO, 1), end: range.end }
    if (rest.start >= rest.end) return 0
    const convert = (amount: number, c: CurrencyCode) => convertToBase(amount, c, base, r)
    return collectCommitments(recurringRules, plannedExpenses, rest, currencyOf, convert).total
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutoffDay, todayISO, range.end, recurringRules, plannedExpenses, accounts, base, rates])

  const remaining = useMemo(
    () =>
      remainingPlan({
        incomeSoFar: sums.income,
        spentSoFar: sums.expense,
        committed,
        daysElapsed,
        daysInPeriod,
        periodStartISO: range.start,
        // CÙNG dự báo với ô "Dự báo cuối tháng" cách vài trăm px — hai mô hình song song
        // trong một trang là hai con số cãi nhau về cùng phần còn lại của kỳ.
        projectedMonthEnd: pace.forecast?.projected ?? null,
      }),
    [sums, committed, daysElapsed, daysInPeriod, range.start, pace.forecast],
  )

  // ---------------------------------------------------------------- khối 05
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
  const subscriptions = useMemo(
    () => subscriptionSummary(recurringRules, todayISO, currencyOf, base, r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recurringRules, todayISO, accounts, base, rates],
  )
  const sizes = useMemo(
    () => spendPercentiles(rangeTxs, currencyOf, base, r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeTxs, accounts, base, rates],
  )
  const backlogRows = useMemo(() => uncategorizedByMonth(rangeTxs), [rangeTxs])
  const sixMonthDaily = useMemo(
    () =>
      dailyExpenseTotals(
        rangeTxs,
        windowRange.start,
        addDaysISO(windowRange.end, -1),
        currencyOf,
        base,
        r,
        transferIds,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeTxs, windowRange, accounts, base, rates, transferIds],
  )

  // ---------------------------------------------------------------- câu kết luận
  // Cùng mốc với thẻ "Cơ cấu chi tiêu" và thanh "Giữ lại" — lấy từ khoản Để dành của
  // phương pháp đang chọn, không phải hằng số 20% cứng.
  const savingsShare = savingsTargetShare(resolveMethod(profile))
  const headline = monthFetched
    ? headlineOf({
        income: sums.income,
        expense: sums.expense,
        priorExpense: cmp?.priorSameDays ?? null,
        periodNoun: 'tháng này',
        pace:
          pace.forecast && budgetReport
            ? { forecast: pace.forecast.projected, budgeted: budgetReport.totalBudgeted }
            : null,
        savingsTargetShare: savingsShare,
      })
    : null

  // Phần câu tổng KHÔNG nói được: tháng này lệch thế nào so với chính thói quen của người
  // dùng. Đọc cả cửa sổ 6 tháng chứ không riêng tháng đang xem — không có mấy tháng trước
  // thì không có "mức thường" nào để so, và bộ dò tự im.
  const story = useMemo(
    () =>
      monthStory({
        txs: rangeTxs,
        months,
        monthStartDay,
        categories,
        currencyOf,
        base,
        rates: r,
        transferIds,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeTxs, months, monthStartDay, categories, accounts, base, rates, transferIds],
  )

  // Cùng tập với màn Phân loại nhanh (`classifiableExpenses` — lá VÀ cha). Đếm theo
  // `expenseLeaves` là nói "còn 0" trong khi trang kia còn 3 dòng phải bấm.
  const unclassifiedCount = useMemo(
    () =>
      classifiableExpenses(categories).filter((c) => c.need_level == null || c.cost_type == null)
        .length,
    [categories],
  )

  const avgMonthlyIncome = (() => {
    const active = series.points.filter((p) => p.income > 0)
    return active.length > 0 ? active.reduce((s, p) => s + p.income, 0) / active.length : 0
  })()

  const hasMissingRate =
    sums.hasMissingRate ||
    breakdown.hasMissingRate ||
    series.hasMissingRate ||
    comparison.hasMissingRate ||
    kept.hasMissingRate ||
    anomalyResult.hasMissingRate ||
    story.hasMissingRate

  const moreItems: MoreItem[] = [
    ...(anomalies.length > 0
      ? [{ label: 'Chi lạ so với thường ngày', value: `${anomalies.length} khoản`, to: '#m-dang-de-y' }]
      : []),
    ...(subscriptions.count > 0
      ? [
          {
            label: 'Tự động trừ mỗi tháng',
            value: formatMoney(Math.round(subscriptions.monthly), base),
            to: '#m-dang-de-y',
          },
        ]
      : []),
    ...(sizes
      ? [
          {
            label: 'Một lần chi to cỡ nào',
            value: `trung vị ${formatMoney(Math.round(sizes.median), base)}`,
            to: '#m-dang-de-y',
          },
        ]
      : []),
    ...(backlogRows.length > 0
      ? [
          {
            label: 'Khoản chưa gắn danh mục',
            value: `${backlogRows.reduce((s, b) => s + b.pending, 0)} khoản`,
            to: '#m-dang-de-y',
          },
        ]
      : []),
  ]

  if (!monthFetched) {
    return <EmptyState>Đang tải…</EmptyState>
  }

  const monthLabel = monthWordLabel(monthKey)
  const priorLabel = monthWordLabel(addMonths(monthKey, -1))

  return (
    <div className="flex flex-col gap-2.5">
      {hasMissingRate && (
        <div className="rounded-lg bg-state-warn-bg p-2 text-sm text-state-warn-fg">
          Một phần giao dịch ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên số liệu có thể
          thiếu.
        </div>
      )}

      {/* Nhãn kỳ đứng TRƯỚC mọi con số: mọi phép so trên trang này đều cắt về số ngày đã
          trôi, không nói ra thì người đọc mặc định con số là của cả tháng. */}
      {cmp?.partial && (
        <Num tone="muted" className="text-2xs">
          {periodDaysLabel(cmp)}
        </Num>
      )}

      {headline && (
        <ConclusionLine tone={headline.tone} short={headline.short}>
          {headline.text}
        </ConclusionLine>
      )}

      {/* Đứng ngay dưới câu tổng, KHÔNG nằm trong một thẻ riêng: nó là phần bổ nghĩa cho
          câu đó ("vì đâu"), tách ra thành thẻ là biến nó thành một khối phải tìm. */}
      <MonthStoryNote findings={story.findings} base={base} approx={story.hasMissingRate} />


      {/* BỐN ô, không năm: "Ngày không chi" bị bỏ vì với người chi hằng ngày nó luôn bằng
          0, và một ô luôn bằng 0 chỉ dạy người đọc bỏ qua cả hàng. Ô thứ tư là "Còn tự
          do" — con số duy nhất trong hàng nói về phần CHƯA xảy ra của kỳ. */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatTile label={cmp?.partial ? `Chi tiêu · ${cmp.daysElapsed} ngày` : 'Chi tiêu'} center>
          <Swap on={sums.expense}>
            <Money amount={sums.expense} currency={base} tone="out" compact approx={sums.hasForeign} />
          </Swap>
        </StatTile>
        <StatTile label="Không tiêu" center>
          <Swap
            on={headline?.ratePct ?? null}
            className={
              headline?.ratePct !== undefined && headline?.ratePct !== null && headline.ratePct < 0
                ? 'text-money-out'
                : ''
            }
          >
            {headline?.ratePct === null || headline?.ratePct === undefined
              ? '—'
              : `${headline.ratePct}%`}
          </Swap>
        </StatTile>
        <StatTile label="Dự báo cuối tháng" center>
          <Swap on={pace.forecast?.projected ?? null}>
            {pace.forecast ? (
              <Money
                amount={pace.forecast.projected}
                currency={base}
                tone="out"
                compact
                approx={sums.hasForeign}
              />
            ) : (
              <span className="text-fg-muted">—</span>
            )}
          </Swap>
        </StatTile>
        <StatTile label="Còn tự do" center>
          <Swap on={remaining?.free ?? null}>
            {remaining ? (
              <Money
                amount={remaining.free}
                currency={base}
                tone={remaining.free >= 0 ? 'in' : 'out'}
                compact
                approx={sums.hasForeign}
              />
            ) : (
              <span className="text-fg-muted">—</span>
            )}
          </Swap>
        </StatTile>
      </div>

      <div className="lg:hidden">
        <SectionIndex items={SECTIONS} />
      </div>

      {/* Hai cột từ `xl`: cột phụ 380px như §1.4. Ở `lg` (1024–1280) một cột — cột phụ co
          xuống dưới 320px thì thẻ Nhãn và thẻ Cấu trúc đều bị bóp đến mức phải cuộn ngang. */}
      <div className="flex flex-col gap-2.5 xl:grid xl:grid-cols-[minmax(0,1fr)_23.75rem] xl:items-start xl:gap-2.5">
        <div className="contents xl:flex xl:flex-col xl:gap-4">
          <ReportBlock id="m-vao-ra" no="01" title="Tiền vào từ đâu, ra theo đường nào">
            <OutflowTiersCard
              tiers={tiers}
              income={sums.income}
              base={base}
              approx={sums.hasForeign}
            />
            {/* Thu định kỳ vs một lần. ẨN khi chưa khoản thu nào gắn quy tắc định kỳ —
                lúc đó mọi khoản thu rơi hết vào cột "một lần" và khối này chỉ nói lại tổng
                thu bằng một hình khác. */}
            {income.hasSignal && (
              <Card as="section" elevation="panel" padding="panel">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <SectionTitle as="h3">Thu từ đâu</SectionTitle>
                  <span className="text-2xs text-fg-muted">định kỳ vs một lần</span>
                </div>
                <ul className="flex flex-col">
                  {[
                    { label: 'Lương định kỳ', v: income.recurring, tone: 'bg-money-in' },
                    { label: 'Một lần', v: income.oneOff, tone: 'bg-money-in/40' },
                  ].map((row) => (
                    <li
                      key={row.label}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(6rem,auto)_2.75rem] items-baseline gap-x-2 border-b border-border-subtle py-2 last:border-0 last:pb-0"
                    >
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${row.tone}`} />
                        <span className="text-sm text-fg-primary">{row.label}</span>
                      </span>
                      <Money
                        amount={row.v}
                        currency={base}
                        approx={sums.hasForeign}
                        className="text-right text-sm"
                      />
                      <span className="text-right text-sm">
                        <Num tone="muted">
                          {sums.income > 0 ? `${Math.round((row.v / sums.income) * 100)}%` : '—'}
                        </Num>
                      </span>
                    </li>
                  ))}
                </ul>
                {/* Con số đáng biết nhất của khối, và nó KHÔNG đi qua <Guide>: giữ lại 46%
                    mà một phần thu là thưởng thì con số sẽ LẶP LẠI tháng sau là con số
                    tính trên lương định kỳ, không phải trên tổng thu. */}
                {income.oneOff > 0 && income.keptOnRecurringPct !== null && (
                  <p className="mt-2 text-sm text-fg-primary">
                    Tính theo <b>lương định kỳ</b> thì tỷ lệ không tiêu là{' '}
                    <b
                      className={income.keptOnRecurringPct < 0 ? 'text-money-out' : 'text-money-in'}
                    >
                      {income.keptOnRecurringPct}%
                    </b>
                    {/* Không có dấu cách trước dấu phẩy: JSX ăn khoảng trắng đầu chuỗi ở
                        dòng riêng, nên `<> , không phải…` in ra "68% , không phải". */}
                    {headline?.ratePct != null &&
                      headline.ratePct !== income.keptOnRecurringPct &&
                      `, không phải ${headline.ratePct}% như tính trên tổng thu`}
                    .
                  </p>
                )}
                <Guide className="mt-1.5 text-2xs text-fg-muted">
                  “Định kỳ” = khoản thu ghi từ một <b>lời nhắc định kỳ</b> bạn đã khai. Lương ghi
                  TAY sẽ nằm ở cột “một lần” — app không đoán theo số tiền, vì phép đoán đó sẽ sai
                  đúng vào tháng có thưởng.
                </Guide>
              </Card>
            )}
          </ReportBlock>

          <ReportBlock id="m-danh-muc" no="02" title="Chi tiêu đi vào đâu">
            <GhiChuChuyenDi trips={trips} range={range} />
            <MonthCategoryTable
              rows={tableRows}
              total={chiCoPhanChuaGhi}
              monthLabel={monthLabel}
              base={base}
              overCount={budgetReport?.overCount ?? 0}
              approx={sums.hasForeign || chuaGhi.hasMissingRate}
              chuaGhi={dongChiChuaGhi(chuaGhi)}
            />
          </ReportBlock>

          <ReportBlock id="m-so-truoc" no="03" title="So với trước — cùng số ngày">
            <MonthlyBarsCard
              series={series}
              markedKeys={thangVang}
              base={base}
              title={`Thu / chi ${WINDOW} tháng gần nhất`}
              labelOf={(k) => `${k.year}/${k.month}`}
              currentKey={monthKeyForDate(todayISO, monthStartDay)}
            />
            {shapes && cmp && (
              <SameDaysCard
                days={shapes.days}
                current={shapes.current}
                prior={shapes.prior}
                priorFull={cmp.priorFull}
                currentLabel={monthLabel}
                priorLabel={priorLabel}
                base={base}
              />
            )}
          </ReportBlock>

          <ReportBlock id="m-khong-tieu" no="04" title="Phần không tiêu đã đi đâu">
            <KeptWhereCard data={kept} nameOf={accountName} />
            {remaining && <RemainingCard plan={remaining} base={base} />}
          </ReportBlock>

          <ReportBlock id="m-dang-de-y" no="05" title="Đáng để ý">
            {anomalies.length > 0 && (
              <Card as="section" elevation="panel" padding="panel">
                <SectionTitle as="h3" className="mb-2">
                  Chi lạ so với thường ngày
                </SectionTitle>
                <ul className="flex flex-col">
                  {anomalies.map((a) => {
                    const cat = categoryOf(a.categoryId)
                    return (
                      <li
                        key={a.transactionId}
                        className="grid grid-cols-[minmax(0,1fr)_minmax(5.5rem,auto)_minmax(4rem,auto)] items-baseline gap-x-2 border-b border-border-subtle py-2 last:border-0 last:pb-0"
                      >
                        <span className="min-w-0 truncate text-sm text-fg-primary">
                          {cat?.icon ?? '📦'} {cat?.name ?? 'Danh mục đã xoá'}
                        </span>
                        <Money
                          amount={a.amount}
                          currency={base}
                          className="text-right text-sm"
                        />
                        <span className="text-right text-sm">
                          <Num tone="warn">{Math.round(a.ratio)}×</Num>
                        </span>
                      </li>
                    )
                  })}
                </ul>
                <Guide className="mt-2 text-2xs text-fg-muted">
                  “Lạ” = lớn hơn 3 lần mức điển hình của CHÍNH danh mục đó trong{' '}
                  {WINDOW - 1} tháng trước, và chỉ xét danh mục có đủ 5 lần chi để có mức điển
                  hình. Không phải lời phán rằng khoản đó sai.
                </Guide>
              </Card>
            )}
            <SubscriptionsCard
              data={subscriptions}
              base={base}
              monthlyIncome={avgMonthlyIncome}
              hourlyWage={profile?.hourly_wage ?? null}
            />
            <SpendSizeCard
              data={sizes}
              base={base}
              periodNoun={`trong ${WINDOW} tháng`}
              hourlyWage={profile?.hourly_wage ?? null}
            />
            {backlogRows.length > 0 && (
              <UncategorizedBacklogCard rows={backlogRows} monthsWindow={WINDOW} />
            )}
            {anomalies.length === 0 &&
              subscriptions.count === 0 &&
              !sizes &&
              backlogRows.length === 0 && (
                <Card as="section" elevation="panel" padding="panel">
                  <p className="text-sm text-fg-muted">
                    Không có gì bất thường trong kỳ này.
                  </p>
                </Card>
              )}
          </ReportBlock>
        </div>

        {/* Cột phụ. `contents` ở mobile để DOM giữ đúng thứ tự đọc, không dùng `order-*`
            (WCAG 2.4.3 — thứ tự tab phải khớp thứ tự nhìn). */}
        <div className="contents xl:flex xl:flex-col xl:gap-2.5">
          <Section id="m-co-cau">
            <SpendClassificationCard
              data={classification}
              income={sums.income}
              expense={sums.expense}
              base={base}
              periodNoun="tháng này"
              unclassifiedCount={unclassifiedCount}
            />
          </Section>
          <Section id="m-nhan">
            <TagBreakdownCard
              data={monthTags}
              base={base}
              periodNoun="tháng này"
              noTags={tags.length === 0}
              rangeFrom={range.start}
              rangeTo={monthLastISO}
            />
          </Section>
          <MoreCountList items={moreItems} />
        </div>
      </div>

      {/* Chân trang nói nguồn MỘT LẦN (§G: ước chừng nói nguồn một lần, không lặp từng
          dòng), và nói ra hai quy ước quyết định mọi con số ở trên. */}
      <p className="px-1 pb-2 text-2xs text-fg-muted">
        Tháng bắt đầu ngày {monthStartDay} · so cùng số ngày · quy đổi ≈ {base} theo tỷ giá
        cuối kỳ · khoản chuyển tài sản tính riêng, không vào chi tiêu.
      </p>

      {/* Dấu vết của tab "Thấu hiểu" cũ: khối "Nhịp chi tiêu theo thứ" và "Tuần này so
          tuần trước" đã chuyển sang tab Sức khỏe (26a). Chúng nói về NẾP, không về kỳ. */}
      {sixMonthDaily.points.length === 0 && (
        <VerdictNote tone="info" short="Chưa có giao dịch">
          Chưa có giao dịch nào trong {WINDOW} tháng gần đây nên các khối so sánh còn trống.
        </VerdictNote>
      )}
    </div>
  )
}
