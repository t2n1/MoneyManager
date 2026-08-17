import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarClock, ChevronLeft, ChevronRight, Repeat, Search } from 'lucide-react'
import { IconButton, SegmentedControl, iconButtonClass } from '../../components/ui'
import { repo } from '../../data'
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
import { confirmDialog } from '../../lib/dialog'
import { scrollContentToTop } from '../../lib/scroll'
import { showUndoToast } from '../../lib/undoToast'
import { addDaysISO, formatMonthLabel, getMonthRange, toISODate } from '../../lib/dates'
import { useMonthKey } from '../../hooks/useMonthKey'
import type { CurrencyCode } from '../../lib/money'
import { categoryBreakdown, cumulativeDailyBalance, monthlySeries } from '../reports/aggregate'
import { tagsByTransaction } from '../tags/aggregate'
import type { TransactionRow } from '../../types/database.types'
import { AxisStrip } from '../budgets/AxisStrip'
import { useAxisProgress } from '../budgets/useAxisProgress'
import { RemindersBanner } from '../reminders/RemindersBanner'
import { NotificationBell } from '../notifications/NotificationBell'
import { NotificationBoundary } from '../notifications/NotificationBoundary'
import { BulkEditSheet } from './BulkEditSheet'
import { CalendarView } from './CalendarView'
import { DailyView } from './DailyView'
import { EditTransactionSheet } from './EditTransactionSheet'
import { convertToBase } from '../../lib/rates'
import { LedgerAside } from './LedgerAside'
import { monthHeatmap } from './ledgerHeat'
import { LedgerFilterBar } from './LedgerFilterBar'
import {
  applyLedgerFilter,
  balanceByDay,
  EMPTY_LEDGER_FILTER,
  uncategorizedSummary,
  type LedgerFilter,
} from './ledgerView'
import { MonthlyView } from './MonthlyView'
import { toNewTransaction } from './restore'
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
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const view: LedgerView = isView(searchParams.get('view')) ? (searchParams.get('view') as LedgerView) : 'daily'
  const setView = (v: LedgerView) => {
    setSearchParams(
      (prev) => {
        prev.set('view', v)
        return prev
      },
      { replace: true },
    )
    // Đổi tab chỉ đổi query string nên AppLayout không đưa nội dung về đầu — mà bốn
    // tab dài ngắn khác nhau, đang cuộn giữa danh sách Ngày rồi bấm sang Lịch là mở
    // ra giữa tháng.
    scrollContentToTop()
  }

  // Kỳ đang xem là state DÙNG CHUNG cả app (src/hooks/useMonthKey) chứ không còn của
  // riêng trang: bộ đổi tháng của bản 1a nằm trên top bar, tức ngoài trang.
  const { activeMonthKey, setMonthKey, stepMonth } = useMonthKey()
  const [editing, setEditing] = useState<TransactionRow | null>(null)

  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const { data: transactions = [], isLoading } = useMonthTransactions(activeMonthKey)
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: tags = [] } = useTags()
  const { data: tagLinks = [] } = useTransactionTags()
  const { base, rates } = useRates()
  const axis = useAxisProgress(activeMonthKey)

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
      if (e.key === 'ArrowLeft') stepMonth(-step)
      if (e.key === 'ArrowRight') stepMonth(step)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [yearNav, stepMonth])

  const accountOf = (id: string | null) => accounts.find((a) => a.id === id)
  const currencyOf = (id: string): CurrencyCode => accountOf(id)?.currency ?? base
  const categoryOf = (id: string | null) => categories.find((c) => c.id === id)

  // --- Lọc tại chỗ (§4.2 mục 2) ---------------------------------------------------
  // Lọc trên danh sách ĐÃ TẢI của tháng, không gọi thêm mạng: đây là "thu hẹp cái đang
  // nhìn", khác hẳn trang Tìm kiếm (đi tìm trong nhiều tháng, có query riêng).
  const [filter, setFilter] = useState<LedgerFilter>(EMPTY_LEDGER_FILTER)
  const shown = useMemo(() => applyLedgerFilter(transactions, filter), [transactions, filter])
  const uncategorized = useMemo(
    () => uncategorizedSummary(transactions, currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, accounts, base, rates],
  )

  // --- Cột phụ (10a) ---------------------------------------------------------------
  //
  // Cả hai đều tính trên `transactions` (CẢ kỳ), KHÔNG trên `shown` (đã lọc): lưới nhiệt
  // và top danh mục trả lời "kỳ này thế nào", còn bộ lọc là "đang thu hẹp cái đang nhìn".
  // Cho chúng theo bộ lọc thì bấm chip "Chi" là cả tháng đổi hình — và người dùng đọc ra
  // thành "tháng này chỉ có mấy ngày đó tiêu tiền".
  const heat = useMemo(
    () =>
      monthHeatmap({
        txs: transactions,
        monthKey: activeMonthKey,
        monthStartDay,
        todayISO: toISODate(new Date()),
        toBase: (amount, accountId) => convertToBase(amount, currencyOf(accountId), base, rates ?? {}),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, activeMonthKey, monthStartDay, accounts, base, rates],
  )
  const expenseBreakdown = useMemo(
    () => categoryBreakdown(transactions, 'expense', currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, accounts, base, rates],
  )
  const topCategories = useMemo(() => expenseBreakdown.slices.slice(0, 3), [expenseBreakdown])
  // Bỏ lọc khi đổi kỳ: giữ lại thì mở tháng mới ra thấy danh sách rỗng mà không hiểu
  // vì sao — cùng lý do với việc thoát chế độ chọn ở dưới.
  useEffect(() => {
    setFilter(EMPTY_LEDGER_FILTER)
  }, [activeMonthKey.year, activeMonthKey.month])

  // --- Số dư chạy theo ngày (§4.2 mục 1) --------------------------------------------
  // Tính trên TOÀN BỘ giao dịch của tháng, không phải danh sách đã lọc: số dư chạy là
  // sự thật của kỳ, lọc bớt cái đang nhìn không làm tiền trong ví đổi.
  const balanceOfDay = useMemo(
    () =>
      balanceByDay(
        cumulativeDailyBalance(
          transactions,
          monthRange.start,
          addDaysISO(monthRange.end, -1),
          currencyOf,
          base,
          rates ?? {},
        ).points,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, monthRange.start, monthRange.end, accounts, base, rates],
  )

  // Chọn nhiều để xóa / sửa hàng loạt — chỉ ở tab "Ngày" (danh sách phẳng).
  const selection = useTxSelection()
  const bulkDelete = useDeleteTransactions()
  const [bulkEditing, setBulkEditing] = useState(false)
  const canSelect = view === 'daily'
  // "Tất cả" nghĩa là tất cả cái ĐANG HIỆN, không phải tất cả của tháng: đang lọc mà
  // bấm chọn-tất-cả rồi Xóa thì xóa cả những khoản bộ lọc đang giấu đi.
  const allSelected = shown.length > 0 && shown.every((t) => selection.isSelected(t.id))

  // Thoát chế độ chọn khi đổi TAB hoặc đổi KỲ.
  //
  // Đổi kỳ mới là cái quan trọng: tập đã chọn giữ theo id, mà đổi tháng thì danh
  // sách đổi hết trong khi thanh dưới vẫn "Đã chọn 2" và nút Xóa vẫn bấm được —
  // bấm là xóa thật hai giao dịch của tháng cũ, đang không có trên màn hình, và
  // hộp thoại cũng chỉ nói "Xóa 2 giao dịch?". Không có cách nào cứu ngoài việc
  // đừng để tập chọn sống qua kỳ.
  useEffect(() => {
    selection.exit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeMonthKey.year, activeMonthKey.month])

  // Nhân bản sang hôm nay (§4.2 mục 5). Ghi thẳng, không mở form: cả điểm của cử chỉ
  // này là "cái hôm qua, lặp lại hôm nay" — bắt xác nhận thì nó chậm hơn bấm "+" và
  // gõ lại. An toàn nằm ở Hoàn tác, cùng mức với xoá hàng loạt.
  async function handleDuplicate(tx: TransactionRow) {
    const today = toISODate(new Date())
    const tagIds = (tagsOfTx.get(tx.id) ?? []).map((g) => g.id)
    const row = await repo.createTransaction({
      ...toNewTransaction(tx, tagIds),
      occurred_on: today,
    })
    qc.invalidateQueries({ queryKey: ['transactions'] })
    qc.invalidateQueries({ queryKey: ['balances'] })
    showUndoToast('Đã nhân bản sang hôm nay', async () => {
      await repo.deleteTransaction(row.id)
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['balances'] })
    })
  }

  async function handleBulkDelete() {
    const ids = selection.selectedIds
    if (ids.length === 0) return
    if (
      !(await confirmDialog({
        title: `Xóa ${ids.length} giao dịch?`,
        message: 'Xóa xong còn 5 giây để bấm Hoàn tác.',
        danger: true,
        confirmLabel: 'Xóa',
      }))
    )
      return
    // Chụp lại TRƯỚC khi xóa để dựng lại được. Xóa lẻ trong sheet Sửa giao dịch đã
    // có Hoàn tác từ lâu, còn xóa hàng loạt thì không — mà nó mới là cái xóa nhiều
    // và khó gõ lại nhất. Cùng một trang thì phải cùng một mức an toàn.
    const snapshot = transactions.filter((t) => ids.includes(t.id))
    const tagsOf = new Map(snapshot.map((t) => [t.id, (tagsOfTx.get(t.id) ?? []).map((g) => g.id)]))
    await bulkDelete.mutateAsync(ids)
    selection.exit()
    showUndoToast(`Đã xóa ${ids.length} giao dịch`, async () => {
      // Tuần tự: repo demo ghi thẳng vào localStorage nên chạy song song dễ ghi đè nhau.
      for (const t of snapshot) {
        await repo.createTransaction(toNewTransaction(t, tagsOf.get(t.id)))
      }
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['balances'] })
      qc.invalidateQueries({ queryKey: ['search'] })
    })
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

  // HAI CỘT từ lg (bản vẽ 10a; cột phụ 420px theo §1.4).
  //
  // Trước đây cả trang bó trong `max-w-2xl` (672px) với lý do "danh sách kéo ngang cả
  // màn thì mắt phải rà rất xa mới nối được ngày với số tiền ở đầu kia dòng". Lý do đó
  // VẪN ĐÚNG — và đó chính là lý do chia cột thay vì nới cột: danh sách giữ bề rộng đọc
  // được (`max-w-3xl`, khớp ~720px của mock ở khung 1280), còn phần màn còn lại thôi bỏ
  // trống. Trên màn 1679px, bản cũ để trống khoảng 1000px cạnh một danh sách đang cuộn.
  //
  // `items-start` để cột phụ không bị kéo cao bằng danh sách; `min-w-0` ở cột trái để
  // dòng dài co lại bằng ellipsis thay vì đẩy ngang cả trang.
  return (
    <div className="w-full p-3 lg:flex lg:items-start lg:gap-2.5 lg:p-4">
      {/* Tiêu đề tài liệu. sr-only vì tên màn đã hiện ở top bar (desktop) — nhưng top
          bar là <p>, nên không có dòng này thì trang KHÔNG có <h1> nào. Trước bản 1a,
          h1 của trang là nhãn kỳ; nhãn kỳ là "đang xem kỳ nào", không phải tên màn. */}
      {/* Cột trái NỞ HẾT phần còn lại, không chặn bề rộng.
          Đã thử chặn `max-w-3xl` (768px, khớp cột trái của mock ở khung 1280) và nó chỉ
          đổi hai dải trống thành MỘT dải trống 440px ở mép phải — asymmetric, và vẫn
          đúng cái phải sửa. Cái giá của việc nở: ở 1679px dòng giao dịch rộng ~1180px
          nên mắt phải rà xa hơn để nối tên với số tiền ở đầu kia. Chấp nhận, vì dòng đã
          có `justify-between` + truncate nên không vỡ, và một trạm điều khiển có dải
          trống 440px thì sai nặng hơn. */}
      <div className="min-w-0 flex-1">
      <h1 className="sr-only">Sổ</h1>
      <NotificationBoundary>
        <RemindersBanner />
      </NotificationBoundary>

      {/* Chuyển kỳ + tìm kiếm.
          CHIA HAI NHÓM rồi cho wrap, chứ không để bảy control trong một hàng phẳng: đo ở
          375px thì hàng cũ cần 382px trong khung 351px. Hai hệ quả, cái thứ hai tệ hơn:
          nút chuông bị cắt 19px, VÀ <main> kéo ngang được 19px nên vuốt dọc bị lệch ngang.
          Ở 360px chuông mất 77%, ở 320px mất hẳn và "Định kỳ" cũng bị cắt.
          Không co được bằng flex: sáu IconButton đều min-w-11 (giữ vùng chạm 44px) và h1 đã
          nằm ở đúng bề rộng chữ (86px) rồi. Nên cho xuống hàng: hẹp thì bộ chuyển kỳ chiếm
          hàng trên (nhãn tháng canh giữa cả bề rộng, gọn hơn hàng cũ), bốn nút hành động
          xuống hàng dưới canh phải; từ ~768px trở lên vẫn đủ chỗ cho một hàng.
          Guard: src/features/transactions/ledgerHeaderFit.test.ts */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* Bộ chuyển kỳ chỉ còn ở mobile: từ bản 1a desktop đổi tháng bằng bộ ‹ › trên
            top bar. Bốn nút hành động bên phải thì Ở LẠI cả hai cỡ — top bar chỉ mang
            ô tìm kiếm, còn Sắp chi / Định kỳ / chuông là đường đi riêng của màn này.
            Ở tab Tháng nút này bước 12 (năm) chứ không 1 — top bar luôn bước 1, nên
            hai bộ KHÔNG trùng chức năng hoàn toàn; đó là lý do nó ở lại mobile nguyên
            vẹn thay vì bị xoá. */}
        <div className="flex flex-1 items-center gap-2 lg:hidden">
          <IconButton
            onClick={() => stepMonth(-step)}
            aria-label={yearNav ? 'Năm trước' : 'Tháng trước'}
          >
            <ChevronLeft className="h-5 w-5" />
          </IconButton>
          <p aria-live="polite" className="flex-1 text-center text-lg font-bold text-fg-primary">
            {label}
          </p>
          <IconButton
            onClick={() => stepMonth(step)}
            aria-label={yearNav ? 'Năm sau' : 'Tháng sau'}
          >
            <ChevronRight className="h-5 w-5" />
          </IconButton>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Link to="/search" className={iconButtonClass()} aria-label="Tìm kiếm giao dịch">
            <Search className="h-5 w-5" />
          </Link>
          {/* Định kỳ dời từ Cài đặt về đây (nó là giao dịch tương lai, không phải cấu hình).
              Đặt ở header chứ KHÔNG thành tab con thứ 5: 5 mục segmented control quá chật
              trên mobile, và đây là danh sách quy tắc chứ không phải một cách xem cùng dữ
              liệu như 4 tab kia. Xem docs/information-architecture.md §2.1. */}
          <Link to="/planned" className={iconButtonClass()} aria-label="Khoản sắp chi">
            <CalendarClock className="h-5 w-5" />
          </Link>
          <Link to="/recurring" className={iconButtonClass()} aria-label="Giao dịch định kỳ">
            <Repeat className="h-5 w-5" />
          </Link>
          <NotificationBoundary>
            <NotificationBell className="lg:hidden" />
          </NotificationBoundary>
        </div>
      </div>

      {/* Tab đổi cách xem */}
      <SegmentedControl
        items={VIEWS.map((v) => ({ value: v.key, label: v.label }))}
        value={view}
        onChange={setView}
        label="Cách xem sổ giao dịch"
        className="mb-4"
      />

      {/* Cơ cấu chi so với mốc — chỉ ở tab Ngày. Tab Tháng đang điều hướng theo NĂM
          nên "tháng này chi thế nào" vô nghĩa ở đó; Lịch và Tổng hợp đã kín màn. */}
      {view === 'daily' && axis && (
        <AxisStrip data={axis} monthKey={activeMonthKey} base={base} />
      )}

      {view === 'daily' && (
        <DailyView
          transactions={shown}
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
          // Nút "Chọn" do DailyView vẽ, ngay trên danh sách nó điều khiển
          onToggleSelecting={() => (selection.selecting ? selection.exit() : selection.enter())}
          tagsOfTx={tagsOfTx}
          balanceOfDay={balanceOfDay}
          onDuplicate={handleDuplicate}
          // Bộ lọc chỉ ở đây DƯỚI lg — từ lg nó sống trong cột phụ (10a). Cùng một
          // <LedgerFilterBar>, cùng một state, chỉ khác chỗ đứng.
          aboveList={
            <div className="lg:hidden">
              <LedgerFilterBar
                value={filter}
                onChange={setFilter}
                uncategorized={uncategorized}
                base={base}
                shownCount={shown.length}
                totalCount={transactions.length}
              />
            </div>
          }
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
      </div>

      {/* Cột phụ 420px — chỉ ở tab Ngày. Ba tab kia đã là một hình phủ kín (lịch, cột
          tháng, bảng tổng hợp), nên đặt thêm một lưới nhiệt cạnh chúng là hai cái lịch
          cạnh nhau nói cùng một chuyện. Bộ lọc cũng vậy: nó lọc DANH SÁCH, mà ba tab kia
          không có danh sách. */}
      {view === 'daily' && (
        <LedgerAside
          monthKey={activeMonthKey}
          heat={heat}
          topCategories={topCategories}
          nameOf={(id) => categoryOf(id)?.name ?? 'Chưa rõ'}
          expenseTotal={expenseBreakdown.total}
          base={base}
          filterBar={
            <LedgerFilterBar
              value={filter}
              onChange={setFilter}
              uncategorized={uncategorized}
              base={base}
              shownCount={shown.length}
              totalCount={transactions.length}
            />
          }
        />
      )}

      {editing && <EditTransactionSheet tx={editing} onClose={() => setEditing(null)} />}

      {canSelect && selection.selecting && (
        <SelectionActionBar
          count={selection.count}
          allSelected={allSelected}
          onToggleAll={() =>
            allSelected ? selection.clear() : selection.selectAll(shown.map((t) => t.id))
          }
          onDelete={handleBulkDelete}
          onEdit={() => setBulkEditing(true)}
        />
      )}

      {bulkEditing && (
        <BulkEditSheet
          ids={selection.selectedIds}
          categories={categories}
          tags={tags}
          onClose={() => setBulkEditing(false)}
          onDone={() => selection.exit()}
        />
      )}
    </div>
  )
}
