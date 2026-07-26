import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, HeartPulse } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BudgetView } from '../budgets/BudgetView'
import { RemittanceSection } from '../remittance/RemittanceSection'
import { InsightsView } from './InsightsView'
import { TrendsView } from './TrendsView'
import { CategoryBreakdownCard } from './CategoryBreakdownCard'
import { MonthlyBarsCard } from './MonthlyBarsCard'
import { NetCashflowCard } from './NetCashflowCard'
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
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import {
  categoryBreakdown,
  categoryMonthlySeries,
  classificationBreakdown,
  monthlySeries,
  sumIncomeExpense,
} from './aggregate'

type ReportView = 'charts' | 'trends' | 'insights' | 'budget'

const VIEW_TABS: { key: ReportView; label: string }[] = [
  { key: 'charts', label: 'Biểu đồ' },
  { key: 'trends', label: 'Xu hướng' },
  { key: 'insights', label: 'Thấu hiểu' },
  { key: 'budget', label: 'Ngân sách' },
]

/** Đọc 'YYYY-MM' thành MonthKey; null nếu không hợp lệ. */
function parseYm(s: string | null): MonthKey | null {
  if (!s) return null
  const [y, m] = s.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return null
  return { year: y, month: m }
}

export function ReportsPage() {
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [searchParams, setSearchParams] = useSearchParams()
  const [period, setPeriod] = useState<'month' | 'year'>(
    searchParams.get('period') === 'year' ? 'year' : 'month',
  )
  const [view, setView] = useState<ReportView>(() => {
    const v = searchParams.get('view')
    return v === 'budget' || v === 'insights' || v === 'trends' ? v : 'charts'
  })

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
  const { data: rangeTxs = [] } = useRangeTransactions(
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
  const { data: yearTxs = [], isFetched: yearFetched } = useRangeTransactions(yearRange, !!profile && period === 'year')

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

  // monthSums nuôi phần Thu của thẻ Cơ cấu chi tiêu → thiếu tỷ giá ở đó cũng phải cảnh báo.
  const monthMissingRate =
    breakdown.hasMissingRate || monthSums.hasMissingRate || series.hasMissingRate
  const yearMissingRate =
    yearBreakdown.hasMissingRate || yearSeries.hasMissingRate || yearSums.hasMissingRate
  const showMissingRate =
    period === 'year' ? yearMissingRate : view === 'charts' && monthMissingRate

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
        Báo cáo {period === 'month' ? formatMonthLabel(activeMonthKey) : formatYearLabel(activeYear)}
      </h1>

      {/* Header điều hướng tháng/năm */}
      <div className="flex items-center justify-between print:hidden">
        <button
          type="button"
          onClick={() =>
            period === 'month'
              ? setMonthKey((k) => addMonths(k ?? activeMonthKey, -1))
              : setYear((y) => (y ?? activeYear) - 1)
          }
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label={period === 'month' ? 'Tháng trước' : 'Năm trước'}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">
          {period === 'month' ? formatMonthLabel(activeMonthKey) : formatYearLabel(activeYear)}
        </h1>
        <button
          type="button"
          onClick={() =>
            period === 'month'
              ? setMonthKey((k) => addMonths(k ?? activeMonthKey, 1))
              : setYear((y) => (y ?? activeYear) + 1)
          }
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label={period === 'month' ? 'Tháng sau' : 'Năm sau'}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Lối vào trang khám tổng quát — không phụ thuộc tháng/năm đang xem */}
      <Link
        to="/health"
        className="flex min-h-11 items-center justify-between gap-2 rounded-xl bg-white px-3 py-2.5 shadow-sm active:scale-[0.99] dark:bg-gray-900 print:hidden"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          <HeartPulse className="h-4 w-4 text-rose-500" aria-hidden />
          Sức khỏe tài chính
        </span>
        <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
          Quỹ dự phòng, nợ, rủi ro
          <ChevronRight className="h-4 w-4" aria-hidden />
        </span>
      </Link>

      {/* Nút gạt Tháng | Năm */}
      <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 text-sm font-medium print:hidden">
        <button
          type="button"
          onClick={() => setPeriod('month')}
          className={`flex-1 rounded-md py-2.5 ${period === 'month' ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
        >
          Tháng
        </button>
        <button
          type="button"
          onClick={() => setPeriod('year')}
          className={`flex-1 rounded-md py-2.5 ${period === 'year' ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
        >
          Năm
        </button>
      </div>

      {/* Tab chỉ hiện ở chế độ Tháng */}
      {period === 'month' && (
        <div className="flex rounded-lg bg-gray-100 p-0.5 text-sm font-medium dark:bg-gray-800 print:hidden">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setView(tab.key)}
              aria-current={view === tab.key ? 'page' : undefined}
              className={`flex-1 rounded-md px-1 py-2.5 ${
                view === tab.key
                  ? 'bg-white text-gray-800 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {showMissingRate && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 p-2 text-xs text-amber-700 dark:text-amber-300">
          Một phần giao dịch ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên có thể thiếu.
        </div>
      )}

      {/* Nội dung THÁNG */}
      {period === 'month' && view === 'charts' && (
        <>
          <CategoryBreakdownCard
            breakdown={breakdown}
            categories={categories}
            base={base}
            kind={kind}
            onKindChange={setKind}
            periodNoun="tháng này"
            lineSeries={lineSeriesMonth}
            lineLabelOf={lineLabelMonth}
          />
          <SpendClassificationCard
            data={monthClass}
            income={monthSums.income}
            expense={monthSums.expense}
            base={base}
            periodNoun="tháng này"
            unclassifiedCount={unclassifiedCount}
          />
          <MonthlyBarsCard
            series={series}
            base={base}
            title="Thu / chi 6 tháng gần nhất"
            labelOf={(k) => `${k.month}/${String(k.year).slice(2)}`}
          />
          <NetCashflowCard
            series={series}
            base={base}
            title="Dòng tiền ròng 6 tháng gần nhất"
            labelOf={(k) => `${k.month}/${String(k.year).slice(2)}`}
          />
          <TagBreakdownCard
            data={monthTags}
            base={base}
            periodNoun="tháng này"
            noTags={tags.length === 0}
            rangeFrom={monthRange.start}
            rangeTo={addDaysISO(monthRange.end, -1)}
          />
        </>
      )}
      {period === 'month' && view === 'trends' && <TrendsView />}
      {period === 'month' && view === 'insights' && <InsightsView monthKey={activeMonthKey} />}
      {period === 'month' && view === 'budget' && <BudgetView monthKey={activeMonthKey} />}

      {/* Nội dung NĂM */}
      {period === 'year' && (
        <>
          <section className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
              <p className="text-xs text-gray-500 dark:text-gray-400">Thu</p>
              <p className="mt-1 text-sm font-bold text-green-600 dark:text-green-400">
                {yearApprox}
                {formatCompact(yearSums.income, base)}
              </p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
              <p className="text-xs text-gray-500 dark:text-gray-400">Chi</p>
              <p className="mt-1 text-sm font-bold text-red-600 dark:text-red-400">
                {yearApprox}
                {formatCompact(yearSums.expense, base)}
              </p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
              <p className="text-xs text-gray-500 dark:text-gray-400">Số dư</p>
              <p
                className={`mt-1 text-sm font-bold ${yearNet >= 0 ? 'text-gray-800 dark:text-gray-100' : 'text-red-600 dark:text-red-400'}`}
              >
                {yearApprox}
                {formatCompact(yearNet, base)}
              </p>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
              <p className="text-xs text-gray-500 dark:text-gray-400">Chi TB/tháng</p>
              <p className="mt-1 text-sm font-bold text-gray-800 dark:text-gray-100">
                {yearApprox}
                {formatMoney(avgExpense, base)}
              </p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
              <p className="text-xs text-gray-500 dark:text-gray-400">Tỷ lệ tiết kiệm</p>
              <p
                className={`mt-1 text-sm font-bold ${savingsRate !== null && savingsRate < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-100'}`}
              >
                {savingsRate === null ? '—' : `${savingsRate}%`}
              </p>
            </div>
          </section>

          <CategoryBreakdownCard
            breakdown={yearBreakdown}
            categories={categories}
            base={base}
            kind={kind}
            onKindChange={setKind}
            periodNoun="năm này"
            lineSeries={lineSeriesYear}
            lineLabelOf={lineLabelYear}
          />
          <SpendClassificationCard
            data={yearClass}
            income={yearSums.income}
            expense={yearSums.expense}
            base={base}
            periodNoun="năm này"
            unclassifiedCount={unclassifiedCount}
          />
          <MonthlyBarsCard
            series={yearSeries}
            base={base}
            title="Thu / chi 12 tháng"
            labelOf={(k) => String(k.month)}
          />
          <NetCashflowCard
            series={yearSeries}
            base={base}
            title="Dòng tiền ròng 12 tháng"
            labelOf={(k) => String(k.month)}
          />
          <TagBreakdownCard
            data={yearTags}
            base={base}
            periodNoun="năm này"
            noTags={tags.length === 0}
            rangeFrom={yearRange.start}
            rangeTo={addDaysISO(yearRange.end, -1)}
          />
          <RemittanceSection txs={yearTxs} year={activeYear} annualIncome={yearSums.income} />
        </>
      )}
    </div>
  )
}
