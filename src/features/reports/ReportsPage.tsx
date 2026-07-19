import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { BudgetView } from '../budgets/BudgetView'
import { InsightsView } from './InsightsView'
import { CategoryBreakdownCard } from './CategoryBreakdownCard'
import { MonthlyBarsCard } from './MonthlyBarsCard'
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
  formatYearLabel,
  getMonthRange,
  getYearRange,
  monthKeyForDate,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import { categoryBreakdown, monthlySeries, sumIncomeExpense } from './aggregate'

export function ReportsPage() {
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [searchParams] = useSearchParams()
  const [period, setPeriod] = useState<'month' | 'year'>('month')
  const [view, setView] = useState<'charts' | 'insights' | 'budget'>(
    searchParams.get('view') === 'budget'
      ? 'budget'
      : searchParams.get('view') === 'insights'
        ? 'insights'
        : 'charts',
  )

  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { base, rates } = useRates()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? base

  // ----- Chế độ THÁNG -----
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
  const { data: rangeTxs = [] } = useRangeTransactions(
    sixMonthRange,
    !!profile && period === 'month' && view === 'charts',
  )

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

  // ----- Chế độ NĂM -----
  const [year, setYear] = useState<number | null>(null)
  const activeYear = year ?? monthKeyForDate(toISODate(new Date()), monthStartDay).year
  const yearRange = useMemo(
    () => getYearRange(activeYear, monthStartDay),
    [activeYear, monthStartDay],
  )
  const { data: yearTxs = [] } = useRangeTransactions(yearRange, !!profile && period === 'year')

  const twelveMonths = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ year: activeYear, month: i + 1 })),
    [activeYear],
  )
  const yearBreakdown = useMemo(
    () => categoryBreakdown(yearTxs, kind, currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yearTxs, kind, accounts, base, rates],
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
  const yearNet = yearSums.income - yearSums.expense
  const avgExpense = Math.round(yearSums.expense / 12)
  const savingsRate = yearSums.income > 0 ? Math.round((yearNet / yearSums.income) * 100) : null
  const yearApprox = yearSums.hasForeign ? '≈ ' : ''

  const monthMissingRate = breakdown.hasMissingRate || series.hasMissingRate
  const yearMissingRate =
    yearBreakdown.hasMissingRate || yearSeries.hasMissingRate || yearSums.hasMissingRate
  const showMissingRate =
    period === 'year' ? yearMissingRate : view === 'charts' && monthMissingRate

  return (
    <div className="flex flex-col gap-4 p-3 lg:p-6">
      {/* Header điều hướng tháng/năm */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            period === 'month'
              ? setMonthKey((k) => addMonths(k ?? activeMonthKey, -1))
              : setYear((y) => (y ?? activeYear) - 1)
          }
          className="rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-lg shadow-sm active:scale-95"
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
          className="rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label={period === 'month' ? 'Tháng sau' : 'Năm sau'}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Nút gạt Tháng | Năm */}
      <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 text-sm font-medium">
        <button
          type="button"
          onClick={() => setPeriod('month')}
          className={`flex-1 rounded-md py-1.5 ${period === 'month' ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
        >
          Tháng
        </button>
        <button
          type="button"
          onClick={() => setPeriod('year')}
          className={`flex-1 rounded-md py-1.5 ${period === 'year' ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
        >
          Năm
        </button>
      </div>

      {/* Tab chỉ hiện ở chế độ Tháng */}
      {period === 'month' && (
        <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 text-sm font-medium">
          <button
            type="button"
            onClick={() => setView('charts')}
            className={`flex-1 rounded-md py-1.5 ${view === 'charts' ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
          >
            Biểu đồ
          </button>
          <button
            type="button"
            onClick={() => setView('insights')}
            className={`flex-1 rounded-md py-1.5 ${view === 'insights' ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
          >
            Thấu hiểu
          </button>
          <button
            type="button"
            onClick={() => setView('budget')}
            className={`flex-1 rounded-md py-1.5 ${view === 'budget' ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
          >
            Ngân sách
          </button>
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
          />
          <MonthlyBarsCard
            series={series}
            base={base}
            title="Thu / chi 6 tháng gần nhất"
            labelOf={(k) => `${k.month}/${String(k.year).slice(2)}`}
          />
        </>
      )}
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
          />
          <MonthlyBarsCard
            series={yearSeries}
            base={base}
            title="Thu / chi 12 tháng"
            labelOf={(k) => String(k.month)}
          />
        </>
      )}
    </div>
  )
}
