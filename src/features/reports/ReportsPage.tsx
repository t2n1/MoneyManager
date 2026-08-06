import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  IconButton,
  Money,
  SegmentedControl,
  StatTile,
  type SegmentedItem,
} from '../../components/ui'
import { DataFreshness } from '../../components/DataFreshness'
import { useRatesFreshness } from '../../hooks/useDataFreshness'
import { RemittanceSection } from '../remittance/RemittanceSection'
import { InsightsView } from './InsightsView'
import { TrendsView } from './TrendsView'
import { CategoryBreakdownCard } from './CategoryBreakdownCard'
import { MonthlyBarsCard } from './MonthlyBarsCard'
import { MonthStrip } from './MonthStrip'
import { NetCashflowCard } from './NetCashflowCard'
import { headlineOf } from './headline'
import { PeriodHeadline } from './PeriodHeadline'
import { SavingsDonutCard } from './SavingsDonutCard'
import { Section, SectionIndex, type IndexItem } from './SectionIndex'
import { SpendClassificationCard } from './SpendClassificationCard'
import { expenseLeaves } from '../categories/leaf'
import {
  useAccounts,
  useCategories,
  useMonthTransactions,
  useProfile,
  useRangeTransactions,
  useRates,
  useTags,
  useTransactionTags,
} from '../../hooks/queries'
import { tagBreakdown } from '../tags/aggregate'
import { TagBreakdownCard } from './TagBreakdownCard'
import {
  addMonths,
  formatMonthLabel,
  addDaysISO,
  formatYearLabel,
  getMonthRange,
  getYearRange,
  monthKeyForDate,
  monthKeyString,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import {
  categoryBreakdown,
  categoryMonthlySeries,
  classificationBreakdown,
  monthlySeries,
  sumIncomeExpense,
} from './aggregate'

// Sức khỏe là 532 dòng tính toán mà 3 tab kia không cần — lazy để mở tab Biểu đồ (mặc
// định) không phải tải nó.
const HealthView = lazy(() =>
  import('../health/HealthView').then((m) => ({ default: m.HealthView })),
)

// Nhiều năm là màn riêng (bảng theo năm + mùa vụ), và nó tải TOÀN BỘ lịch sử nên chỉ
// nạp code khi người dùng thật sự gạt sang.
const MultiYearView = lazy(() =>
  import('./MultiYearView').then((m) => ({ default: m.MultiYearView })),
)

type ReportView = 'charts' | 'trends' | 'insights' | 'health'
type ReportPeriod = 'month' | 'year' | 'multi'

const VIEW_TABS: readonly SegmentedItem<ReportView>[] = [
  { value: 'charts', label: 'Biểu đồ' },
  { value: 'trends', label: 'Xu hướng' },
  { value: 'insights', label: 'Thấu hiểu' },
  { value: 'health', label: 'Sức khỏe' },
]

const isView = (v: string | null): v is ReportView => VIEW_TABS.some((t) => t.value === v)

const PERIOD_TABS: readonly SegmentedItem<ReportPeriod>[] = [
  { value: 'month', label: 'Tháng' },
  { value: 'year', label: 'Năm' },
  { value: 'multi', label: 'Nhiều năm' },
]

const isPeriod = (v: string | null): v is ReportPeriod =>
  PERIOD_TABS.some((t) => t.value === v)

// Mục lục của hai chế độ dài. Nhãn ngắn hơn tiêu đề thẻ vì đây là chip cuộn ngang:
// "Cơ cấu chi tiêu" → "Cơ cấu", đủ để nhận ra mà không đẩy các mục sau ra ngoài màn.
const MONTH_SECTIONS: readonly IndexItem[] = [
  { id: 'sec-giu-lai', label: 'Giữ lại' },
  { id: 'sec-danh-muc', label: 'Danh mục' },
  { id: 'sec-co-cau', label: 'Cơ cấu' },
  { id: 'sec-thu-chi', label: 'Thu/chi' },
  { id: 'sec-dong-tien', label: 'Dòng tiền' },
  { id: 'sec-nhan', label: 'Nhãn' },
]

const YEAR_SECTIONS: readonly IndexItem[] = [
  ...MONTH_SECTIONS,
  { id: 'sec-gui-tien', label: 'Gửi về VN' },
]

/** Đọc 'YYYY-MM' thành MonthKey; null nếu không hợp lệ. */
function parseYm(s: string | null): MonthKey | null {
  if (!s) return null
  const [y, m] = s.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return null
  return { year: y, month: m }
}

export function ReportsPage() {
  const ratesFreshness = useRatesFreshness()
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  // Câu tổng của kỳ — dựng ở dưới, sau khi có monthSums/yearSums.
  const [searchParams, setSearchParams] = useSearchParams()
  const [period, setPeriod] = useState<ReportPeriod>(() => {
    const p = searchParams.get('period')
    return isPeriod(p) ? p : 'month'
  })
  // Tab giữ trong URL (không phải useState) — nếu không, đường chuyển tiếp
  // `/health` → `/reports?view=health` sẽ để `view=health` kẹt lại trong thanh địa chỉ:
  // bấm sang tab khác không xoá nó, và tải lại trang là quay về Sức khỏe dù đang xem
  // Biểu đồ. Cũng nhờ vậy mà link vào thẳng một tab luôn ăn, kể cả khi đã ở /reports.
  const view: ReportView = isView(searchParams.get('view')) ? (searchParams.get('view') as ReportView) : 'charts'
  const setView = (v: ReportView) =>
    setSearchParams(
      (prev) => {
        prev.set('view', v)
        return prev
      },
      { replace: true },
    )

  // Biểu đồ đi theo nút gạt Tháng|Năm; Thấu hiểu chỉ theo tháng; Xu hướng và Sức khỏe tự
  // chốt cửa sổ 12 tháng nên không có mũi chuyển kỳ nào.
  // "Nhiều năm" là toàn bộ lịch sử nên không có kỳ trước/kỳ sau để chuyển.
  const needsPeriodNav = (view === 'charts' && period !== 'multi') || view === 'insights'
  const navPeriod: ReportPeriod = view === 'charts' ? period : 'month'

  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { base, rates } = useRates()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: tags = [] } = useTags()
  const { data: tagLinks = [] } = useTransactionTags()

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? base

  // ----- Chế độ THÁNG -----
  const [monthKey, setMonthKey] = useState<MonthKey | null>(() => parseYm(searchParams.get('ym')))
  const activeMonthKey = monthKey ?? monthKeyForDate(toISODate(new Date()), monthStartDay)
  // Tháng THẬT đang chạy dở (không phải tháng đang xem): các thẻ loại nó khỏi câu kết
  // luận để không khen "chi giảm 60%" vào ngày mùng 3.
  const currentKey = monthKeyForDate(toISODate(new Date()), monthStartDay)
  const { data: monthTxs = [], isFetched: monthFetched } = useMonthTransactions(activeMonthKey)
  // Khoảng ngày của kỳ đang xem, dạng BAO GỒM cả hai đầu — dùng cho link sang Tìm kiếm
  const monthRange = useMemo(
    () => getMonthRange(activeMonthKey, monthStartDay),
    [activeMonthKey, monthStartDay],
  )

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
  const { data: rangeTxs = [], isFetched: rangeFetched } = useRangeTransactions(
    sixMonthRange,
    !!profile && period === 'month' && view === 'charts',
  )

  const breakdown = useMemo(
    () => categoryBreakdown(monthTxs, kind, currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, kind, accounts, base, rates],
  )
  const monthSums = useMemo(
    () => sumIncomeExpense(monthTxs, currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, accounts, base, rates],
  )
  // Thẻ "Cơ cấu chi tiêu" LUÔN dùng số CHI, không phụ thuộc nút gạt Chi/Thu ở thẻ trên.
  // Khi đang xem Thu thì tính thêm một breakdown chi riêng (cùng dữ liệu đã tải, không gọi mạng).
  const monthExpenseBreakdown = useMemo(
    () =>
      kind === 'expense'
        ? breakdown
        : categoryBreakdown(monthTxs, 'expense', currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [breakdown, kind, monthTxs, accounts, base, rates],
  )
  const monthClass = useMemo(
    () => classificationBreakdown(monthExpenseBreakdown.slices, categories),
    [monthExpenseBreakdown, categories],
  )
  const monthTags = useMemo(
    () => tagBreakdown(monthTxs, tagLinks, tags, currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthTxs, tagLinks, tags, accounts, base, rates],
  )
  const series = useMemo(
    () => monthlySeries(rangeTxs, sixMonths, monthStartDay, currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rangeTxs, sixMonths, monthStartDay, accounts, base, rates],
  )

  // ----- Chế độ NĂM -----
  const [year, setYear] = useState<number | null>(() => {
    const y = Number(searchParams.get('year'))
    return Number.isFinite(y) && y > 0 ? y : null
  })
  const activeYear = year ?? monthKeyForDate(toISODate(new Date()), monthStartDay).year
  const yearRange = useMemo(
    () => getYearRange(activeYear, monthStartDay),
    [activeYear, monthStartDay],
  )
  const { data: yearTxs = [], isFetched: yearFetched } = useRangeTransactions(
    yearRange,
    !!profile && period === 'year' && view === 'charts',
  )

  const twelveMonths = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ year: activeYear, month: i + 1 })),
    [activeYear],
  )
  const yearBreakdown = useMemo(
    () => categoryBreakdown(yearTxs, kind, currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yearTxs, kind, accounts, base, rates],
  )
  // Như chế độ Tháng: thẻ Cơ cấu chi tiêu luôn ăn dữ liệu CHI.
  const yearExpenseBreakdown = useMemo(
    () =>
      kind === 'expense'
        ? yearBreakdown
        : categoryBreakdown(yearTxs, 'expense', currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yearBreakdown, kind, yearTxs, accounts, base, rates],
  )
  const yearClass = useMemo(
    () => classificationBreakdown(yearExpenseBreakdown.slices, categories),
    [yearExpenseBreakdown, categories],
  )
  const yearTags = useMemo(
    () => tagBreakdown(yearTxs, tagLinks, tags, currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yearTxs, tagLinks, tags, accounts, base, rates],
  )
  const yearSeries = useMemo(
    () => monthlySeries(yearTxs, twelveMonths, monthStartDay, currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yearTxs, twelveMonths, monthStartDay, accounts, base, rates],
  )
  const yearSums = useMemo(
    () => sumIncomeExpense(yearTxs, currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yearTxs, accounts, base, rates],
  )
  // Đếm danh mục Chi LÁ chưa phân loại (định nghĩa "lá" dùng chung với màn Phân loại).
  const unclassifiedCount = useMemo(
    () => expenseLeaves(categories).filter((c) => c.need_level == null || c.cost_type == null).length,
    [categories],
  )
  const yearNet = yearSums.income - yearSums.expense
  const avgExpense = Math.round(yearSums.expense / 12)
  const savingsRate = yearSums.income > 0 ? Math.round((yearNet / yearSums.income) * 100) : null
  const yearApprox = yearSums.hasForeign ? '≈ ' : ''
  // Chưa fetch xong thì KHÔNG được vẽ số: `yearTxs` mặc định là mảng rỗng nên mọi tổng
  // ra 0, mà "0" trong app tiền đọc y như số thật ("năm nay chi 0đ"). Hiện '—' cho tới
  // khi biết chắc. Dùng isFetched chứ không phải isLoading: isLoading tắt khi có dữ liệu
  // cache cũ, còn đây cần "đã về ít nhất một lần cho kỳ ĐANG xem".
  const yearNum = (render: () => string) => (yearFetched ? render() : '—')

  // Câu tổng đầu trang. Chi kỳ trước lấy từ `series` (6 tháng gần nhất, đã tải cho biểu
  // đồ cột) — điểm kế cuối chính là tháng liền trước, nên không phải gọi thêm dữ liệu.
  const priorMonthExpense =
    series.points.length >= 2 ? series.points[series.points.length - 2].expense : null
  const monthHeadline = monthFetched
    ? headlineOf({
        income: monthSums.income,
        expense: monthSums.expense,
        priorExpense: priorMonthExpense,
        periodNoun: 'tháng này',
      })
    : null
  // Chế độ NĂM không so với năm trước: dữ liệu năm trước không được tải ở trang này, và
  // gọi thêm một năm giao dịch chỉ để lấy một con số so sánh là không đáng.
  const yearHeadline = yearFetched
    ? headlineOf({
        income: yearSums.income,
        expense: yearSums.expense,
        priorExpense: null,
        periodNoun: 'năm này',
      })
    : null

  // monthSums nuôi phần Thu của thẻ Cơ cấu chi tiêu → thiếu tỷ giá ở đó cũng phải cảnh báo.
  const monthMissingRate =
    breakdown.hasMissingRate || monthSums.hasMissingRate || series.hasMissingRate
  const yearMissingRate =
    yearBreakdown.hasMissingRate || yearSeries.hasMissingRate || yearSums.hasMissingRate
  const showMissingRate =
    view === 'charts' && (period === 'year' ? yearMissingRate : monthMissingRate)

  // In một lần cho mỗi lần mở trang. Cờ reset khi trang bị gỡ (rời khỏi /reports),
  // nên muốn in lại phải điều hướng vào lại — đủ cho luồng hiện tại (in từ trang Dữ liệu).
  const printedRef = useRef(false)
  const wantPrint = searchParams.get('print') === '1'
  const printDataReady = period === 'year' ? yearFetched : monthFetched
  useEffect(() => {
    if (!wantPrint || printedRef.current || !printDataReady) return
    // Chờ biểu đồ (Recharts) vẽ xong rồi mới in. Đặt cờ TRONG timeout (không đặt
    // đồng bộ) để nếu StrictMode huỷ timeout lúc mount thì effect còn lên lịch lại được.
    const t = setTimeout(() => {
      printedRef.current = true
      window.print()
      // Gỡ cờ print khỏi URL để không in lại khi điều hướng nội bộ
      const next = new URLSearchParams(searchParams)
      next.delete('print')
      setSearchParams(next, { replace: true })
    }, 700)
    return () => clearTimeout(t)
  }, [wantPrint, printDataReady, period, searchParams, setSearchParams])

  // Đường xu hướng một danh mục — dùng lại dữ liệu nhiều tháng đã fetch (không gọi thêm mạng).
  const lineSeriesMonth = (ids: string[]) =>
    categoryMonthlySeries(rangeTxs, sixMonths, kind, new Set(ids), monthStartDay, currencyOf, base, rates ?? {}).points
  const lineSeriesYear = (ids: string[]) =>
    categoryMonthlySeries(yearTxs, twelveMonths, kind, new Set(ids), monthStartDay, currencyOf, base, rates ?? {}).points
  const lineLabelMonth = (k: MonthKey) => `${k.month}/${String(k.year).slice(2)}`
  const lineLabelYear = (k: MonthKey) => String(k.month)

  return (
    <div className="flex flex-col gap-4 p-3 lg:p-6">
      {/* Tiêu đề chỉ hiện khi in (thay cho thanh điều hướng bị ẩn) */}
      <h1 className="hidden text-center text-xl font-bold text-gray-900 print:block">
        Báo cáo{' '}
        {period === 'month'
          ? formatMonthLabel(activeMonthKey)
          : period === 'year'
            ? formatYearLabel(activeYear)
            : 'nhiều năm'}
      </h1>

      {/* Tab nội dung đứng TRƯỚC mọi điều khiển kỳ, và luôn đủ 4 mục.
          Trước đây dải này nằm DƯỚI nút gạt Tháng|Năm và tự ẩn khi gạt sang Năm (vì 3/4
          tab chỉ tồn tại ở chế độ Tháng) — tức đổi kỳ là mất luôn thanh điều hướng, và
          layout nhảy. Nay thứ bậc đúng chiều: tab = "đang xem cái gì" (đứng yên), điều
          khiển kỳ = "lát nào" (đổi theo tab). Xem docs/information-architecture.md §2.4. */}
      <SegmentedControl
        items={VIEW_TABS}
        value={view}
        onChange={setView}
        label="Nội dung báo cáo"
        className="print:hidden"
      />

      {/* Kỳ báo cáo chỉ có nghĩa với Biểu đồ. Xu hướng (12 tháng), Sức khỏe (12 tháng đã
          hoàn tất) và Thấu hiểu (tháng hiện tại) đều tự chốt cửa sổ thời gian của mình. */}
      {view === 'charts' && (
        <SegmentedControl
          items={PERIOD_TABS}
          value={period}
          onChange={setPeriod}
          label="Kỳ báo cáo"
          className="print:hidden"
        />
      )}

      {/* Mũi chuyển kỳ — Biểu đồ chuyển tháng hoặc năm, Thấu hiểu chỉ chuyển tháng */}
      {needsPeriodNav && (
        <div className="flex items-center justify-between print:hidden">
          <IconButton
            onClick={() =>
              navPeriod === 'month'
                ? setMonthKey((k) => addMonths(k ?? activeMonthKey, -1))
                : setYear((y) => (y ?? activeYear) - 1)
            }
            aria-label={navPeriod === 'month' ? 'Tháng trước' : 'Năm trước'}
          >
            <ChevronLeft className="h-5 w-5" />
          </IconButton>
          <h1 className="text-lg font-bold text-fg-primary">
            {navPeriod === 'month' ? formatMonthLabel(activeMonthKey) : formatYearLabel(activeYear)}
          </h1>
          <IconButton
            onClick={() =>
              navPeriod === 'month'
                ? setMonthKey((k) => addMonths(k ?? activeMonthKey, 1))
                : setYear((y) => (y ?? activeYear) + 1)
            }
            aria-label={navPeriod === 'month' ? 'Tháng sau' : 'Năm sau'}
          >
            <ChevronRight className="h-5 w-5" />
          </IconButton>
        </div>
      )}

      {/* Dải tháng — chỉ ở chế độ THÁNG, và dùng đúng 6 tháng đã tải cho biểu đồ cột nên
          không phát sinh thêm request nào. Đứng dưới mũi chuyển kỳ: mũi tên để nhích từng
          tháng, dải để nhảy thẳng và để so tháng nào nặng nhẹ. */}
      {needsPeriodNav && navPeriod === 'month' && (
        <MonthStrip
          // Chưa tải xong thì amount = null → dải hiện "—". Truyền thẳng p.expense sẽ ra
          // "0" ở MỌI tháng trong lúc chờ, mà "0" trong app tiền đọc y như số thật.
          items={series.points.map((p) => ({
            key: p.key,
            amount: rangeFetched ? p.expense : null,
          }))}
          active={activeMonthKey}
          onPick={setMonthKey}
          base={base}
          label="Chọn tháng xem báo cáo — số dưới mỗi tháng là tổng chi"
        />
      )}

      {showMissingRate && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 p-2 text-xs text-amber-700 dark:text-amber-300">
          Một phần giao dịch ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên có thể thiếu.
        </div>
      )}

      {/* Tuổi tỷ giá — mọi con số quy đổi trên trang này đều dựa vào nó. Đứng dưới cảnh
          báo THIẾU tỷ giá ở trên: thiếu hẳn là chuyện nặng hơn cũ, nên nó lên trước. */}
      <DataFreshness summary={ratesFreshness} />

      {/* Nội dung THÁNG */}
      {view === 'charts' && period === 'month' && (
        <>
          {/* Câu tổng đứng TRƯỚC mục lục: nó là kết luận của cả kỳ, không phải một khối
              để nhảy tới. */}
          <PeriodHeadline
            headline={monthHeadline}
            income={monthSums.income}
            expense={monthSums.expense}
            base={base}
            approx={monthSums.hasForeign}
          />
          <SectionIndex items={MONTH_SECTIONS} />
          {/* Lưới hai cột từ `lg` trở lên. `lg:items-start` là BẮT BUỘC: thiếu nó thì
              hai thẻ cạnh nhau bị kéo cao bằng nhau, thẻ ngắn thừa ra một mảng trống.
              Thẻ có biểu đồ ngang dài (thu/chi, dòng tiền) chiếm cả hai cột. */}
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3">
            <Section id="sec-giu-lai">
              <SavingsDonutCard
                income={monthSums.income}
                expense={monthSums.expense}
                base={base}
                periodNoun="tháng này"
                approx={monthSums.hasForeign}
              />
            </Section>
            <Section id="sec-danh-muc">
              <CategoryBreakdownCard
                breakdown={breakdown}
                categories={categories}
                base={base}
                kind={kind}
                onKindChange={setKind}
                periodNoun="tháng này"
                lineSeries={lineSeriesMonth}
                lineLabelOf={lineLabelMonth}
                periodType="month"
                periodKey={monthKeyString(activeMonthKey)}
              />
            </Section>
            <Section id="sec-co-cau">
              <SpendClassificationCard
                data={monthClass}
                income={monthSums.income}
                expense={monthSums.expense}
                base={base}
                periodNoun="tháng này"
                unclassifiedCount={unclassifiedCount}
              />
            </Section>
            <Section id="sec-thu-chi" className="lg:col-span-2">
              <MonthlyBarsCard
                series={series}
                base={base}
                title="Thu / chi 6 tháng gần nhất"
                labelOf={(k) => `${k.month}/${String(k.year).slice(2)}`}
                currentKey={currentKey}
              />
            </Section>
            <Section id="sec-dong-tien" className="lg:col-span-2">
              <NetCashflowCard
                series={series}
                base={base}
                title="Dòng tiền ròng 6 tháng gần nhất"
                labelOf={(k) => `${k.month}/${String(k.year).slice(2)}`}
                currentKey={currentKey}
              />
            </Section>
            <Section id="sec-nhan">
              <TagBreakdownCard
                data={monthTags}
                base={base}
                periodNoun="tháng này"
                noTags={tags.length === 0}
                rangeFrom={monthRange.start}
                rangeTo={addDaysISO(monthRange.end, -1)}
              />
            </Section>
          </div>
        </>
      )}
      {view === 'trends' && <TrendsView />}
      {view === 'insights' && <InsightsView monthKey={activeMonthKey} />}
      {view === 'health' && (
        <Suspense fallback={<p className="py-10 text-center text-sm text-fg-muted">Đang tính…</p>}>
          <HealthView />
        </Suspense>
      )}

      {/* Nội dung NĂM */}
      {view === 'charts' && period === 'year' && (
        <>
          <section className="grid grid-cols-3 gap-2">
            <StatTile label="Thu">
              {yearFetched ? (
                <Money
                  amount={yearSums.income}
                  currency={base}
                  tone="in"
                  compact
                  approx={yearSums.hasForeign}
                />
              ) : (
                '—'
              )}
            </StatTile>
            <StatTile label="Chi">
              {yearFetched ? (
                <Money
                  amount={yearSums.expense}
                  currency={base}
                  tone="out"
                  compact
                  approx={yearSums.hasForeign}
                />
              ) : (
                '—'
              )}
            </StatTile>
            <StatTile label="Số dư">
              {yearFetched ? (
                // 'bySign' thay cho điều kiện màu viết tay: dương → màu thu, âm → màu chi.
                <Money
                  amount={yearNet}
                  currency={base}
                  tone={yearNet >= 0 ? 'neutral' : 'out'}
                  compact
                  approx={yearSums.hasForeign}
                />
              ) : (
                '—'
              )}
            </StatTile>
          </section>

          <section className="grid grid-cols-2 gap-2">
            <StatTile label="Chi TB/tháng">
              {yearNum(() => `${yearApprox}${formatMoney(avgExpense, base)}`)}
            </StatTile>
            <StatTile label="Tỷ lệ tiết kiệm">
              {/* Không phải tiền nên không dùng <Money>; màu âm vẫn theo token chi. */}
              <span
                className={
                  yearFetched && savingsRate !== null && savingsRate < 0 ? 'text-money-out' : ''
                }
              >
                {yearNum(() => (savingsRate === null ? '—' : `${savingsRate}%`))}
              </span>
            </StatTile>
          </section>

          {/* Chế độ Năm đã có năm ô thống kê ngay trên, nên chỉ lấy CÂU, tắt ô số. */}
          <PeriodHeadline
            headline={yearHeadline}
            income={yearSums.income}
            expense={yearSums.expense}
            base={base}
            tiles={false}
          />
          <SectionIndex items={YEAR_SECTIONS} />
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3">
            <Section id="sec-giu-lai">
              <SavingsDonutCard
                income={yearSums.income}
                expense={yearSums.expense}
                base={base}
                periodNoun="năm này"
                approx={yearSums.hasForeign}
              />
            </Section>
            <Section id="sec-danh-muc">
              <CategoryBreakdownCard
                breakdown={yearBreakdown}
                categories={categories}
                base={base}
                kind={kind}
                onKindChange={setKind}
                periodNoun="năm này"
                lineSeries={lineSeriesYear}
                lineLabelOf={lineLabelYear}
                periodType="year"
                periodKey={String(activeYear)}
              />
            </Section>
            <Section id="sec-co-cau">
              <SpendClassificationCard
                data={yearClass}
                income={yearSums.income}
                expense={yearSums.expense}
                base={base}
                periodNoun="năm này"
                unclassifiedCount={unclassifiedCount}
              />
            </Section>
            <Section id="sec-thu-chi" className="lg:col-span-2">
              <MonthlyBarsCard
                series={yearSeries}
                base={base}
                title="Thu / chi 12 tháng"
                labelOf={(k) => String(k.month)}
                currentKey={currentKey}
              />
            </Section>
            <Section id="sec-dong-tien" className="lg:col-span-2">
              <NetCashflowCard
                series={yearSeries}
                base={base}
                title="Dòng tiền ròng 12 tháng"
                labelOf={(k) => String(k.month)}
                currentKey={currentKey}
              />
            </Section>
            <Section id="sec-nhan">
              <TagBreakdownCard
                data={yearTags}
                base={base}
                periodNoun="năm này"
                noTags={tags.length === 0}
                rangeFrom={yearRange.start}
                rangeTo={addDaysISO(yearRange.end, -1)}
              />
            </Section>
            <Section id="sec-gui-tien">
              <RemittanceSection txs={yearTxs} year={activeYear} annualIncome={yearSums.income} />
            </Section>
          </div>
        </>
      )}

      {view === 'charts' && period === 'multi' && (
        <Suspense
          fallback={
            <p className="rounded-xl bg-surface p-6 text-center text-sm text-fg-muted shadow-sm">
              Đang tải…
            </p>
          }
        >
          <MultiYearView
            monthStartDay={monthStartDay}
            base={base}
            rates={rates ?? {}}
            currencyOf={currencyOf}
            enabled={!!profile}
          />
        </Suspense>
      )}
    </div>
  )
}
