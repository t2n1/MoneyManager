import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
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
import type { CurrencyCode } from '../../lib/money'
import { monthlySeries } from '../reports/aggregate'
import type { TransactionRow } from '../../types/database.types'
import { OnboardingCard } from '../onboarding/OnboardingCard'
import { RemindersBanner } from '../reminders/RemindersBanner'
import { CalendarView } from './CalendarView'
import { DailyView } from './DailyView'
import { EditTransactionSheet } from './EditTransactionSheet'
import { MonthlyView } from './MonthlyView'
import { SummaryView } from './SummaryView'

const VIEWS = [
  { key: 'daily', label: 'Ngày' },
  { key: 'calendar', label: 'Lịch' },
  { key: 'monthly', label: 'Tháng' },
  { key: 'summary', label: 'Tổng hợp' },
] as const

type LedgerView = (typeof VIEWS)[number]['key']

const isView = (v: string | null): v is LedgerView => VIEWS.some((x) => x.key === v)

export function LedgerPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const view: LedgerView = isView(searchParams.get('view')) ? (searchParams.get('view') as LedgerView) : 'daily'
  const setView = (v: LedgerView) =>
    setSearchParams(
      (prev) => {
        prev.set('view', v)
        return prev
      },
      { replace: true },
    )

  // null = "kỳ hiện tại": tính lazy theo month_start_day (profile tải async,
  // khởi tạo cứng trong useState sẽ chốt nhầm kỳ với ngày bắt đầu ≠ 1)
  const [monthKey, setMonthKey] = useState<MonthKey | null>(null)
  const [editing, setEditing] = useState<TransactionRow | null>(null)

  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const activeMonthKey = monthKey ?? monthKeyForDate(toISODate(new Date()), monthStartDay)
  const { data: transactions = [], isLoading } = useMonthTransactions(activeMonthKey)
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { base, rates } = useRates()

  const yearNav = view === 'monthly'

  // Phím tắt desktop: ←/→ chuyển kỳ (tháng, hoặc năm ở tab Tháng)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'))
        return
      const step = yearNav ? 12 : 1
      const fallback = () => monthKeyForDate(toISODate(new Date()), monthStartDay)
      if (e.key === 'ArrowLeft') setMonthKey((k) => addMonths(k ?? fallback(), -step))
      if (e.key === 'ArrowRight') setMonthKey((k) => addMonths(k ?? fallback(), step))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [yearNav, monthStartDay])

  const accountOf = (id: string | null) => accounts.find((a) => a.id === id)
  const currencyOf = (id: string): CurrencyCode => accountOf(id)?.currency ?? base
  const categoryOf = (id: string | null) => categories.find((c) => c.id === id)

  // Tab Tháng cần dữ liệu cả năm (12 tháng của monthKey.year)
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ year: activeMonthKey.year, month: i + 1 })),
    [activeMonthKey.year],
  )
  const yearRange = useMemo(
    () => ({
      start: getMonthRange(months[0], monthStartDay).start,
      end: getMonthRange(months[11], monthStartDay).end,
    }),
    [months, monthStartDay],
  )
  const { data: yearTxs = [], isLoading: yearLoading } = useRangeTransactions(
    yearRange,
    !!profile && yearNav,
  )
  const yearSeries = useMemo(
    () => monthlySeries(yearTxs, months, monthStartDay, currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yearTxs, months, monthStartDay, accounts, base, rates],
  )
  const yearHasForeign = yearTxs.some((t) => currencyOf(t.account_id) !== base)

  const label = yearNav ? `Năm ${activeMonthKey.year}` : formatMonthLabel(activeMonthKey)
  const step = yearNav ? 12 : 1

  return (
    <div className="p-3 lg:p-6">
      <OnboardingCard txCount={transactions.length} monthKey={activeMonthKey} />
      <RemindersBanner />

      {/* Chuyển kỳ + tìm kiếm */}
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMonthKey((k) => addMonths(k ?? activeMonthKey, -step))}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white dark:bg-gray-900 px-3 text-lg shadow-sm active:scale-95"
          aria-label={yearNav ? 'Năm trước' : 'Tháng trước'}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="flex-1 text-center text-lg font-bold text-gray-800 dark:text-gray-100">{label}</h1>
        <button
          type="button"
          onClick={() => setMonthKey((k) => addMonths(k ?? activeMonthKey, step))}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white dark:bg-gray-900 px-3 text-lg shadow-sm active:scale-95"
          aria-label={yearNav ? 'Năm sau' : 'Tháng sau'}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <Link
          to="/search"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white dark:bg-gray-900 px-3 text-lg shadow-sm active:scale-95"
          aria-label="Tìm kiếm giao dịch"
        >
          <Search className="h-5 w-5" />
        </Link>
      </div>

      {/* Tab đổi cách xem */}
      <div className="mb-4 flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 text-sm font-medium">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            className={`flex-1 rounded-md py-2.5 transition ${
              view === v.key ? 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'daily' && (
        <DailyView
          transactions={transactions}
          isLoading={isLoading}
          accountOf={accountOf}
          categoryOf={categoryOf}
          currencyOf={currencyOf}
          base={base}
          rates={rates}
          onEdit={setEditing}
        />
      )}

      {view === 'calendar' && (
        <CalendarView
          // remount khi đổi kỳ để reset ngày đang chọn (không giữ ngày của kỳ cũ)
          key={`${activeMonthKey.year}-${activeMonthKey.month}-${monthStartDay}`}
          transactions={transactions}
          monthKey={activeMonthKey}
          monthStartDay={monthStartDay}
          accountOf={accountOf}
          categoryOf={categoryOf}
          currencyOf={currencyOf}
          base={base}
          rates={rates}
          onEdit={setEditing}
        />
      )}

      {view === 'monthly' && (
        <MonthlyView
          points={yearSeries.points}
          base={base}
          hasForeign={yearHasForeign}
          isLoading={yearLoading}
          onSelectMonth={(k) => {
            setMonthKey(k)
            setView('daily')
          }}
        />
      )}

      {view === 'summary' && (
        <SummaryView
          transactions={transactions}
          categoryOf={categoryOf}
          currencyOf={currencyOf}
          base={base}
          rates={rates}
          isLoading={isLoading}
        />
      )}

      {editing && <EditTransactionSheet tx={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
