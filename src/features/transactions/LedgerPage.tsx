import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Repeat, Search } from 'lucide-react'
import { IconButton, SegmentedControl, iconButtonClass } from '../../components/ui'
import {
  useAccounts,
  useCategories,
  useDeleteTransactions,
  useMonthTransactions,
  useProfile,
  useRangeTransactions,
  useRates,
  useTags,
  useTransactionTags,
} from '../../hooks/queries'
import { confirmDialog, showToast } from '../../lib/dialog'
import {
  addDaysISO,
  addMonths,
  formatMonthLabel,
  getMonthRange,
  monthKeyForDate,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { monthlySeries } from '../reports/aggregate'
import { tagsByTransaction } from '../tags/aggregate'
import type { TransactionRow } from '../../types/database.types'
import { RemindersBanner } from '../reminders/RemindersBanner'
import { NotificationBell } from '../notifications/NotificationBell'
import { NotificationBoundary } from '../notifications/NotificationBoundary'
import { CalendarView } from './CalendarView'
import { DailyView } from './DailyView'
import { EditTransactionSheet } from './EditTransactionSheet'
import { MonthlyView } from './MonthlyView'
import { SelectionActionBar } from './SelectionActionBar'
import { SummaryView } from './SummaryView'
import { useTxSelection } from './useTxSelection'

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
  const { data: tags = [] } = useTags()
  const { data: tagLinks = [] } = useTransactionTags()
  const { base, rates } = useRates()

  // Nhãn của từng giao dịch — dựng một lần cho cả tháng thay vì tra bảng liên
  // kết trong mỗi dòng (danh sách có thể vài trăm dòng).
  const tagsOfTx = useMemo(() => tagsByTransaction(tagLinks, tags), [tagLinks, tags])

  // Kỳ đang xem, dạng ISO — thẻ "Chi theo nhãn" ở tab Tổng hợp cần để deep-link
  // sang Tìm kiếm. `end` của getMonthRange là mốc mở [start, end) nên lùi 1 ngày.
  const monthRange = useMemo(
    () => getMonthRange(activeMonthKey, monthStartDay),
    [activeMonthKey, monthStartDay],
  )

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

  // Chọn nhiều để xóa hàng loạt — chỉ ở tab "Ngày" (danh sách phẳng).
  const selection = useTxSelection()
  const bulkDelete = useDeleteTransactions()
  const canSelect = view === 'daily'
  const allSelected =
    transactions.length > 0 && transactions.every((t) => selection.isSelected(t.id))

  // Rời tab Ngày thì thoát chế độ chọn (Lịch/Tháng/Tổng hợp không phải danh sách).
  useEffect(() => {
    if (view !== 'daily') selection.exit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  async function handleBulkDelete() {
    const ids = selection.selectedIds
    if (ids.length === 0) return
    if (
      !(await confirmDialog({
        title: `Xóa ${ids.length} giao dịch?`,
        message: 'Không hoàn tác được.',
        danger: true,
        confirmLabel: 'Xóa',
      }))
    )
      return
    await bulkDelete.mutateAsync(ids)
    showToast(`Đã xóa ${ids.length} giao dịch`)
    selection.exit()
  }

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

  // Sổ GD giữ một cột hẹp kể cả trên PC (khung ngoài của AppLayout đã nới lên 6xl):
  // danh sách giao dịch kéo ngang cả màn thì mắt phải rà rất xa mới nối được ngày với
  // số tiền ở đầu kia dòng.
  return (
    <div className="mx-auto w-full max-w-2xl p-3 lg:p-6">
      <NotificationBoundary>
        <RemindersBanner />
      </NotificationBoundary>

      {/* Chuyển kỳ + tìm kiếm */}
      <div className="mb-3 flex items-center gap-2">
        <IconButton
          onClick={() => setMonthKey((k) => addMonths(k ?? activeMonthKey, -step))}
          aria-label={yearNav ? 'Năm trước' : 'Tháng trước'}
        >
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
        <h1 className="flex-1 text-center text-lg font-bold text-fg-primary">{label}</h1>
        <IconButton
          onClick={() => setMonthKey((k) => addMonths(k ?? activeMonthKey, step))}
          aria-label={yearNav ? 'Năm sau' : 'Tháng sau'}
        >
          <ChevronRight className="h-5 w-5" />
        </IconButton>
        <Link to="/search" className={iconButtonClass()} aria-label="Tìm kiếm giao dịch">
          <Search className="h-5 w-5" />
        </Link>
        {/* Định kỳ dời từ Cài đặt về đây (nó là giao dịch tương lai, không phải cấu hình).
            Đặt ở header chứ KHÔNG thành tab con thứ 5: 5 mục segmented control quá chật
            trên mobile, và đây là danh sách quy tắc chứ không phải một cách xem cùng dữ
            liệu như 4 tab kia. Xem docs/information-architecture.md §2.1. */}
        <Link to="/recurring" className={iconButtonClass()} aria-label="Giao dịch định kỳ">
          <Repeat className="h-5 w-5" />
        </Link>
        <NotificationBoundary>
          <NotificationBell className="lg:hidden" />
        </NotificationBoundary>
      </div>

      {/* Tab đổi cách xem */}
      <SegmentedControl
        items={VIEWS.map((v) => ({ value: v.key, label: v.label }))}
        value={view}
        onChange={setView}
        label="Cách xem sổ giao dịch"
        className="mb-4"
      />

      {view === 'daily' && (
        <>
          {transactions.length > 0 && (
            <div className="mb-2 flex justify-end px-1">
              <button
                type="button"
                onClick={() => (selection.selecting ? selection.exit() : selection.enter())}
                // -my-2 để vùng chạm 44px không đẩy danh sách xuống thêm
                className="-my-2 inline-flex min-h-11 items-center justify-center px-2 text-xs font-medium text-green-700 dark:text-green-400"
              >
                {selection.selecting ? 'Xong' : 'Chọn'}
              </button>
            </div>
          )}
          <DailyView
            transactions={transactions}
            isLoading={isLoading}
            accountOf={accountOf}
            categoryOf={categoryOf}
            currencyOf={currencyOf}
            base={base}
            rates={rates}
            onEdit={setEditing}
            selecting={selection.selecting}
            isSelected={selection.isSelected}
            onToggleSelect={selection.toggle}
            tagsOfTx={tagsOfTx}
          />
        </>
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
          tagsOfTx={tagsOfTx}
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
          tags={tags}
          tagLinks={tagLinks}
          rangeFrom={monthRange.start}
          rangeTo={addDaysISO(monthRange.end, -1)}
        />
      )}

      {canSelect && selection.selecting && <div className="h-20" />}

      {editing && <EditTransactionSheet tx={editing} onClose={() => setEditing(null)} />}

      {canSelect && selection.selecting && (
        <SelectionActionBar
          count={selection.count}
          allSelected={allSelected}
          onToggleAll={() =>
            allSelected ? selection.clear() : selection.selectAll(transactions.map((t) => t.id))
          }
          onDelete={handleBulkDelete}
        />
      )}
    </div>
  )
}
