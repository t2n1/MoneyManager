import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton, SegmentedControl, type SegmentedItem } from '../../components/ui'
import { RemittanceSection } from '../remittance/RemittanceSection'
import { InsightsView } from './InsightsView'
import { TrendsView } from './TrendsView'
import { CategoryBreakdownCard } from './CategoryBreakdownCard'
import { MonthlyBarsCard } from './MonthlyBarsCard'
import { MonthStrip } from './MonthStrip'
import { NetCashflowCard } from './NetCashflowCard'
import { headlineOf } from './headline'
import { noSpendStreak } from './insights'
import { useMonthPace } from './monthPace'
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
import { useMonthKey } from '../../hooks/useMonthKey'
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
import type { CurrencyCode } from '../../lib/money'
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

/**
 * BA tab (§4.5 của bản 1a), thay bốn tab × ba kỳ = 12 tổ hợp trước đây.
 *
 * Mười hai tổ hợp là con số thật, không phải cách nói: người dùng phải nhớ mình đang ở
 * ô nào của một lưới 4×3 mà lưới đó không hiện ra ở đâu cả, và 3/4 tab chỉ tồn tại ở
 * chế độ Tháng. Ba tab mới chia theo CÂU HỎI, mỗi tab tự chốt phạm vi của nó:
 *   · Tháng này — "tháng đang chạy thế nào": gộp Biểu đồ(Tháng) + Thấu hiểu.
 *   · Dài hạn   — "nhiều tháng/năm gộp lại nói gì": gộp Xu hướng + Biểu đồ(Năm) +
 *                 Nhiều năm, chọn phạm vi bằng một công tắc 12T · 3N · Tất cả.
 *   · Sức khỏe  — giữ nguyên.
 */
type ReportView = 'month' | 'long' | 'health'

const VIEW_TABS: readonly SegmentedItem<ReportView>[] = [
  { value: 'month', label: 'Tháng này' },
  { value: 'long', label: 'Dài hạn' },
  { value: 'health', label: 'Sức khỏe' },
]

const isView = (v: string | null): v is ReportView => VIEW_TABS.some((t) => t.value === v)

/** Phạm vi của tab Dài hạn. `year` = một năm (12 tháng của năm đang chọn). */
type LongScope = 'year' | '3y' | 'all'

const SCOPE_TABS: readonly SegmentedItem<LongScope>[] = [
  { value: 'year', label: '12T' },
  { value: '3y', label: '3N' },
  { value: 'all', label: 'Tất cả' },
]

const isScope = (v: string | null): v is LongScope => SCOPE_TABS.some((t) => t.value === v)

/**
 * Đường CŨ → tab mới. Bookmark, lịch sử trình duyệt và link trong thông báo đẩy đều
 * còn mang `?view=charts|trends|insights` — bỏ qua là chúng hỏng IM LẶNG (mở ra tab
 * mặc định, không báo gì). R3 của bộ tài liệu ghi đúng rủi ro này.
 */
export function migrateReportView(view: string | null): ReportView | null {
  if (view === 'charts' || view === 'insights') return 'month'
  if (view === 'trends' || view === 'trend') return 'long'
  if (isView(view)) return view
  return null
}

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


// `parseYm` chuyển sang src/hooks/useMonthKey.tsx — đường vào `?ym=` nay do provider
// đọc một lần cho cả app, thay vì mỗi trang một bản chép tay.

export function ReportsPage() {
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  // Câu tổng của kỳ — dựng ở dưới, sau khi có monthSums/yearSums.
  const [searchParams, setSearchParams] = useSearchParams()
  // Phạm vi của tab Dài hạn. Khoá `period` cũ vẫn đọc được để link cũ mở đúng lát:
  // `period=year` → 12T, `period=multi` → Tất cả.
  const [scope, setScope] = useState<LongScope>(() => {
    const s = searchParams.get('scope')
    if (isScope(s)) return s
    return searchParams.get('period') === 'multi' ? 'all' : 'year'
  })
  // Tab giữ trong URL (không phải useState) — nếu không, đường chuyển tiếp
  // `/health` → `/reports?view=health` sẽ để `view=health` kẹt lại trong thanh địa chỉ:
  // bấm sang tab khác không xoá nó, và tải lại trang là quay về Sức khỏe dù đang xem
  // Biểu đồ. Cũng nhờ vậy mà link vào thẳng một tab luôn ăn, kể cả khi đã ở /reports.
  const view: ReportView = migrateReportView(searchParams.get('view')) ?? 'month'
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
  // Tab "Tháng này" luôn chuyển theo THÁNG; tab Dài hạn chỉ chuyển kỳ khi đang ở lát
  // 12T (một năm cụ thể) — 3N và Tất cả là toàn bộ lịch sử, không có kỳ trước/kỳ sau.
  const needsPeriodNav = view === 'month' || (view === 'long' && scope === 'year')
  const navPeriod: 'month' | 'year' = view === 'month' ? 'month' : 'year'

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
  // Kỳ đang xem là state DÙNG CHUNG cả app (src/hooks/useMonthKey), không còn của riêng
  // trang: bộ đổi tháng của bản 1a nằm trên top bar. Đường vào `?ym=` vẫn còn — provider
  // đọc nó, nên mọi link cũ (thông báo đẩy, `/reports?view=budget&ym=…`) vẫn mở đúng kỳ.
  const { activeMonthKey, setMonthKey, stepMonth } = useMonthKey()
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
    !!profile && view === 'month',
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
    !!profile && view === 'long' && scope === 'year',
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
  // Hai ô số kéo từ tab "Thấu hiểu" lên hàng KPI (§4.5): Dự báo cuối tháng · Ngày không
  // chi. Cả hai trả lời "tháng này rồi sẽ ra sao" — đúng câu người ta mở Báo cáo để hỏi
  // — mà trước đây lại nằm sau một tab nữa.
  //
  // Dùng lại `useMonthPace` (hook tab Ngân sách đã gọi để vẽ nhịp chi) chứ KHÔNG tự gọi
  // `forecastMonthEnd` ở đây: dự báo có bốn tham số dễ tính lệch (ngày đã trôi, ngày
  // trong tháng, chuỗi chi biến đổi, phần cố định đã trả), và hai màn nói hai con số dự
  // báo khác nhau thì người dùng không biết tin cái nào. Hook cũng đã tự trả null khi
  // đang xem tháng cũ — dự báo cuối tháng của một tháng đã xong là chính số đã chi.
  const pace = useMonthPace(activeMonthKey)
  const todayISO = toISODate(new Date())
  const noSpendDays = pace.isCurrentMonth ? noSpendStreak(monthTxs, todayISO, monthStartDay) : null

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

  // monthSums nuôi phần Thu của thẻ Cơ cấu chi tiêu → thiếu tỷ giá ở đó cũng phải cảnh báo.
  const monthMissingRate =
    breakdown.hasMissingRate || monthSums.hasMissingRate || series.hasMissingRate
  const yearMissingRate =
    yearBreakdown.hasMissingRate || yearSeries.hasMissingRate || yearSums.hasMissingRate
  const showMissingRate =
    view === 'month' ? monthMissingRate : view === 'long' && scope === 'year' ? yearMissingRate : false

  // In một lần cho mỗi lần mở trang. Cờ reset khi trang bị gỡ (rời khỏi /reports),
  // nên muốn in lại phải điều hướng vào lại — đủ cho luồng hiện tại (in từ trang Dữ liệu).
  const printedRef = useRef(false)
  const wantPrint = searchParams.get('print') === '1'
  const printDataReady = view === 'month' ? monthFetched : yearFetched
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
  }, [wantPrint, printDataReady, view, searchParams, setSearchParams])

  // Đường xu hướng một danh mục — dùng lại dữ liệu nhiều tháng đã fetch (không gọi thêm mạng).
  const lineLabelMonth = (k: MonthKey) => `${k.year}/${k.month}`
  const lineSeriesMonth = (ids: string[]) =>
    categoryMonthlySeries(rangeTxs, sixMonths, kind, new Set(ids), monthStartDay, currencyOf, base, rates ?? {}).points

  return (
    <div className="flex flex-col gap-4 p-3 lg:p-6">
      {/* Tiêu đề trên màn hình — mọi trang khác đều mở đầu bằng tên trang 18px;
          Báo cáo là trang duy nhất từng mở thẳng bằng dải tab, phá nhịp và người
          dùng máy đọc màn hình không nghe được tên trang. Bản in có h1 riêng bên
          dưới (kèm kỳ đang xem) nên bản màn hình ẩn khi in. */}
      <h1 className="text-lg font-bold text-fg-primary print:hidden">Báo cáo</h1>
      {/* Tiêu đề chỉ hiện khi in (thay cho thanh điều hướng bị ẩn) */}
      <p className="hidden text-center text-xl font-bold text-gray-900 print:block">
        Báo cáo{' '}
        {view === 'month'
          ? formatMonthLabel(activeMonthKey)
          : scope === 'year'
            ? formatYearLabel(activeYear)
            : scope === '3y'
              ? 'ba năm gần nhất'
              : 'toàn bộ lịch sử'}
      </p>

      {/* Cảnh báo THIẾU tỷ giá ở lại đầu trang, không xuống chân trang cùng dòng tuổi dữ
          liệu: nó nói "số đang hiện bị thiếu", tức là đọc trước khi đọc số thì mới kịp.
          Tuổi dữ liệu là thông tin nền, đọc lúc nào cũng được. Đứng trên mọi dải điều
          khiển vì bốn khối bên dưới đều có điều kiện — nằm sau chúng thì mỗi lần gạt tab
          là cảnh báo lại nhảy sang một độ cao khác. */}
      {showMissingRate && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 p-2 text-xs text-amber-700 dark:text-amber-300">
          Một phần giao dịch ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên có thể thiếu.
        </div>
      )}

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

      {/* Công tắc phạm vi — CHỈ của tab Dài hạn (§4.5), thay hai tab + nút gạt kỳ riêng.
          Tab Tháng này tự chốt cửa sổ của nó (tháng đang xem, đổi bằng ‹ › trên top
          bar), Sức khỏe chốt 12 tháng đã hoàn tất. */}
      {view === 'long' && (
        <SegmentedControl
          items={SCOPE_TABS}
          value={scope}
          onChange={setScope}
          label="Phạm vi"
          className="print:hidden"
        />
      )}

      {/* Mũi chuyển kỳ — Biểu đồ chuyển tháng hoặc năm, Thấu hiểu chỉ chuyển tháng */}
      {/* Ẩn từ lg: bộ ‹ › của top bar làm đúng việc này ở chế độ THÁNG. Vẫn giữ nguyên
          ở chế độ NĂM — top bar không có bộ chuyển năm, nên `navPeriod === 'year'` bỏ
          `lg:hidden` đi, nếu không thì Nhiều năm mất đường chuyển kỳ trên desktop. */}
      {needsPeriodNav && (
        <div
          className={`flex items-center justify-between print:hidden ${
            navPeriod === 'month' ? 'lg:hidden' : ''
          }`}
        >
          <IconButton
            onClick={() => (navPeriod === 'month' ? stepMonth(-1) : setYear((y) => (y ?? activeYear) - 1))}
            aria-label={navPeriod === 'month' ? 'Tháng trước' : 'Năm trước'}
          >
            <ChevronLeft className="h-5 w-5" />
          </IconButton>
          {/* <p> chứ KHÔNG <h1>: trang đã có <h1>Báo cáo</h1> ở trên, để đây là h1 nữa thì
              một trang có hai h1 — cây tiêu đề hỏng, trình đọc màn hình đọc thành hai đầu
              mục ngang cấp trong khi đây chỉ là nhãn kỳ đang xem. aria-live để khi bấm mũi
              tên thì kỳ mới được đọc lên (nhãn đổi nhưng tiêu điểm vẫn ở nút). */}
          <p
            aria-live="polite"
            className="text-lg font-bold text-fg-primary"
          >
            {navPeriod === 'month' ? formatMonthLabel(activeMonthKey) : formatYearLabel(activeYear)}
          </p>
          <IconButton
            onClick={() => (navPeriod === 'month' ? stepMonth(1) : setYear((y) => (y ?? activeYear) + 1))}
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

      {/* Nội dung THÁNG */}
      {view === 'month' && (
        <>
          {/* Câu tổng đứng TRƯỚC mục lục: nó là kết luận của cả kỳ, không phải một khối
              để nhảy tới. */}
          <PeriodHeadline
            headline={monthHeadline}
            income={monthSums.income}
            expense={monthSums.expense}
            base={base}
            approx={monthSums.hasForeign}
            forecast={pace.forecast?.projected ?? null}
            noSpendDays={noSpendDays}
          />
          {/* Dải chip mục lục: BỎ ở desktop, GIỮ ở mobile (§4.5). Trên màn rộng lưới hai
              cột đã cho thấy gần hết các thẻ cùng lúc nên mục lục chỉ là một hàng chip
              thừa; trên điện thoại thì trang dài mấy màn, không có nó là phải vuốt mò. */}
          <div className="lg:hidden">
            <SectionIndex items={MONTH_SECTIONS} />
          </div>
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
                labelOf={(k) => `${k.year}/${k.month}`}
                currentKey={currentKey}
              />
            </Section>
            <Section id="sec-dong-tien" className="lg:col-span-2">
              <NetCashflowCard
                series={series}
                base={base}
                title="Dòng tiền ròng 6 tháng gần nhất"
                labelOf={(k) => `${k.year}/${k.month}`}
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

          {/* Tab "Thấu hiểu" cũ gộp thẳng vào đây (§4.5): Định kỳ và Độ lớn giao dịch
              nằm trong danh sách lưới của 14a, và ba khối còn lại (so sánh danh mục,
              80/20, nhịp chi) cũng chỉ nói về THÁNG ĐANG XEM — tách chúng ra một tab
              riêng là bắt người dùng nhớ mình để câu trả lời ở đâu. */}
          <InsightsView monthKey={activeMonthKey} />
        </>
      )}

      {view === 'health' && (
        <Suspense fallback={<p className="py-10 text-center text-sm text-fg-muted">Đang tính…</p>}>
          <HealthView />
        </Suspense>
      )}

      {/* Phạm vi 12T — Xu hướng: cửa sổ trượt 12 tháng gần nhất (điểm gãy, mùa vụ,
          độ co giãn). Đây là bản thay cho tab "Xu hướng" cũ.

          Khối "Biểu đồ · Năm" (một năm dương lịch: 5 ô thống kê + danh mục theo năm
          + cột theo tháng) ĐÃ BỎ ở bước này. Không phải cắt bớt cho gọn: §4.5 rút
          mười hai tổ hợp xuống ba tab, và mọi con số của khối đó đã có chỗ khác —
          bảng "theo năm" của MultiYearView cho một dòng mỗi năm kèm thanh so sánh,
          còn cơ cấu danh mục thì thuộc về tháng đang xem. Riêng "Gửi về VN" KHÔNG
          mất: nó chuyển sang 3N/Tất cả, đúng như R8 chốt. */}
      {view === 'long' && scope === 'year' && <TrendsView />}

      {view === 'long' && scope !== 'year' && (
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
            maxYears={scope === '3y' ? 3 : undefined}
          />
          {/* Gửi về VN — R8 ĐÃ CHỐT: thuộc Dài hạn, hiện ở 3N và Tất cả, đứng SAU bảng
              theo năm. Nó vốn là chuyện nhiều năm ("lần gửi được giá nhất / thiệt nhất"
              chỉ có nghĩa khi so nhiều lần gửi). */}
          <RemittanceSection txs={yearTxs} year={activeYear} annualIncome={yearSums.income} />
        </Suspense>
      )}

      {/* Phạm vi 12T: một dòng dẫn thay cho cả khối (R8). Ẩn hẳn thì người đang tìm nó
          không biết nó đi đâu. */}
      {view === 'long' && scope === 'year' && (
        <p className="text-[0.8125rem] text-fg-muted">
          Gửi về VN ·{' '}
          <button
            type="button"
            onClick={() => setScope('3y')}
            className="font-medium text-fg-accent hover:underline"
          >
            xem ở 3N
          </button>
        </p>
      )}
    </div>
  )
}
