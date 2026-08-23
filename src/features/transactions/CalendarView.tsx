// Tab Lịch của màn Sổ — bản vẽ 1a "Nhịp tháng".
//
// Bản trước trả lời được đúng một câu: "ngày nào tiêu bao nhiêu". Trên màn 1680px nó để
// trống ~420px bên phải (cột phụ chỉ được render ở tab Ngày), còn nửa sau tháng thì rỗng
// hoàn toàn — đúng nửa mà người ta mở lịch ra để xem "còn phải trả gì".
//
// Bốn thứ thêm vào, và mỗi thứ trả lời một câu lưới cũ không nói được:
//   vạch nhiệt      — ngày nào NẶNG (mắt so hai vạch, không so hai con số ở hai đầu lưới)
//   chip cam kết    — ngày chưa tới còn phải trả gì
//   cột Tuần        — tuần này so tuần trước
//   bốn khối bên    — còn được tiêu bao nhiêu, ngày này có gì, trần nhãn nào đang căng
//
// KHUNG HAI CỘT NẰM Ở ĐÂY, không ở `LedgerPage` như ba khối kia của bản 1a. Lý do là DỮ
// LIỆU: cột phụ của tab Lịch cần ngân sách tháng, cam kết chưa ra, trần nhãn và kỳ thẻ —
// bốn nguồn mà ba tab kia không dùng. Đặt cột phụ ở `LedgerPage` thì hoặc gọi hook vô điều
// kiện (tab Ngày phải trả giá bằng bốn lượt tải nó không cần), hoặc mount hai lần một bản
// mobile và một bản desktop rồi tính mọi thứ hai lượt. Ở đây thì mỗi khối mount MỘT lần và
// đổi dáng bằng class `lg:`; hai cột đổi chỗ bằng `display:contents` + `order` (cùng mẹo
// `BudgetView` đang dùng), nên thứ tự đọc trên mobile khác desktop mà DOM chỉ có một bản.
import { useMemo, useState } from 'react'
import { Tag } from 'lucide-react'
import { Card, deltaTone, Money, Num, signedPct } from '../../components/ui'
import { STATUS_CHIP, STATUS_FILL } from '../../components/ui/statusColors'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { usePrivacyMode } from '../../lib/privacy'
import { convertToBase, type Rates } from '../../lib/rates'
import { formatMonthLabel, toISODate, type MonthKey } from '../../lib/dates'
import type {
  AccountRow,
  CategoryRow,
  TagRow,
  TransactionRow,
  TransactionTagRow,
} from '../../types/database.types'
import { useBudgetReport } from '../../hooks/queries'
import { spendableRemaining } from '../budgets/commitments'
import { dailyAllowance, spendableSegments } from '../budgets/dailyAllowance'
import { tagBreakdown } from '../tags/aggregate'
import { useTagBudgets } from '../tags/useTagBudgets'
import { TAG_HEX, tagColor, type TagColorKey } from '../tags/colors'
import { useMonthPace } from '../reports/monthPace'
import {
  buildCalendarMonth,
  recentPace,
  type CalendarCell,
  type CalendarWeek,
} from './calendarMonth'
import {
  SelectedDayBlock,
  SpendableBlock,
  TagSpendBlock,
  UpcomingBlock,
  type SpendableInfo,
} from './CalendarPanels'
import type { Heatmap } from './ledgerHeat'
import { formatDayHeader, sumInBase, WEEKDAYS_SHORT, type CurrencyOf } from './ledgerShared'
import { useCalendarMarks } from './useCalendarMarks'

interface Props {
  transactions: TransactionRow[]
  monthKey: MonthKey
  /** Ngày bắt đầu "tháng" tùy chỉnh (profiles.month_start_day) — lưới phải khớp kỳ dữ liệu */
  monthStartDay: number
  /** Chi/thu theo ngày của kỳ — `LedgerPage` đã tính cho cột phụ tab Ngày, dùng lại. */
  heat: Heatmap
  accountOf: (id: string | null) => AccountRow | undefined
  categoryOf: (id: string | null) => CategoryRow | undefined
  currencyOf: CurrencyOf
  base: CurrencyCode
  rates: Rates | undefined
  onEdit: (tx: TransactionRow) => void
  /** Nhãn theo id giao dịch (xem `tagsByTransaction`) — chip nhãn trên dòng, chấm trong ô. */
  tagsOfTx?: Map<string, TagRow[]>
  tags: TagRow[]
  tagLinks: TransactionTagRow[]
  /** Danh mục chuyển tài sản — không vào tổng chi theo nhãn. */
  transferIds: ReadonlySet<string>
}

/** Số chấm nhãn tối đa trong một ô. Chấm thứ ba bị ẩn ở mobile (ô còn ~48px). */
const MAX_TAG_DOTS = 3

export function CalendarView({
  transactions,
  monthKey,
  monthStartDay,
  heat,
  accountOf,
  categoryOf,
  currencyOf,
  base,
  rates,
  onEdit,
  tagsOfTx,
  tags,
  tagLinks,
  transferIds,
}: Props) {
  const todayISO = toISODate(new Date())
  const monthLabel = formatMonthLabel(monthKey)

  const [selected, setSelected] = useState<string | null>(() =>
    heat.cells.some((c) => c.iso === todayISO) ? todayISO : (heat.cells[0]?.iso ?? null),
  )
  // State CỤC BỘ của view, KHÔNG đi vào `LedgerFilter` của tab Ngày: bộ lọc này thu hẹp
  // "cái đang nhìn" trên lưới, còn cột bên phải vẫn phải trả lời "kỳ này thế nào". Cùng
  // lý do `LedgerPage` không cho lưới nhiệt đi theo bộ lọc.
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  const privacy = usePrivacyMode()
  // Thiếu tỷ giá thì BỎ vạch nhiệt thay vì vẽ một vạch sai: `convertToBase` trả null nên
  // khoản đó không có mặt trong tổng ngày, mà độ dài vạch là một phép so — so với một mẫu
  // số đang thiếu thì mọi vạch đều sai một lượng không nói ra được.
  const hasMissingRate = useMemo(
    () =>
      transactions.some(
        (t) => convertToBase(t.amount, currencyOf(t.account_id), base, rates ?? {}) === null,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, base, rates],
  )
  const showBars = !privacy && !hasMissingRate

  // --- Nhãn: chấm trong ô · tổng theo nhãn cho dải lọc · ngày nào có nhãn đang lọc ------
  //
  // Chỉ tính trên khoản CHI: chấm màu trả lời "tiền ra ngày đó thuộc nhóm nào", còn một
  // ngày lương mang nhãn "Cố định" thì chấm đó nói sai.
  const { tagColorsByDay, daysOfTag } = useMemo(() => {
    const colors = new Map<string, TagColorKey[]>()
    const days = new Map<string, Set<string>>()
    for (const t of transactions) {
      if (t.type !== 'expense' || t.is_debt_flow || t.exclude_from_stats) continue
      for (const g of tagsOfTx?.get(t.id) ?? []) {
        const list = colors.get(t.occurred_on) ?? []
        const key = tagColor(g.color)
        if (!list.includes(key)) list.push(key)
        colors.set(t.occurred_on, list)

        const set = days.get(g.id) ?? new Set<string>()
        set.add(t.occurred_on)
        days.set(g.id, set)
      }
    }
    return { tagColorsByDay: colors, daysOfTag: days }
  }, [transactions, tagsOfTx])

  const tagTotals = useMemo(
    () => tagBreakdown(transactions, tagLinks, tags, currencyOf, base, rates ?? {}, transferIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, tagLinks, tags, base, rates, transferIds],
  )

  // --- Dấu trong ô: cam kết chưa ra · kỳ thẻ tới hạn · ngày lương -----------------------
  const { marks, schedule, cardDues } = useCalendarMarks({
    monthKey,
    monthStartDay,
    transactions,
    currencyOf,
    base,
    rates,
  })

  const month = useMemo(
    () =>
      buildCalendarMonth({
        heat,
        monthStartDay,
        marks,
        tagColorsByDay,
        filterDays: tagFilter ? (daysOfTag.get(tagFilter) ?? new Set<string>()) : null,
        maxTagDots: MAX_TAG_DOTS,
        todayISO,
      }),
    [heat, monthStartDay, marks, tagColorsByDay, tagFilter, daysOfTag, todayISO],
  )

  // --- "Còn được tiêu" — CÙNG phép tính với tab Ngân sách (B36) -------------------------
  //
  // Không tính lại ở đây: `useBudgetReport` cho trần và đã chi, `useMonthPace` cho số ngày,
  // `useCalendarMarks` cho cam kết chưa ra, `dailyAllowance` chia. Hai màn in hai con số
  // "mỗi ngày còn tiêu được" khác nhau là lỗi tệ nhất khối này có thể mắc.
  const pace = useMonthPace(monthKey)
  const { report } = useBudgetReport(monthKey)
  const spendable = useMemo((): SpendableInfo => {
    const budgeted = report?.totalBudgeted ?? 0
    const spent = report?.totalSpent ?? 0
    const totalRemaining = Math.round(budgeted - spent)
    const committed = pace.isCurrentMonth ? schedule.overdueTotal + schedule.upcomingTotal : 0
    const free = spendableRemaining(totalRemaining, committed)
    return {
      budgeted,
      spent,
      committed,
      segments: spendableSegments(budgeted, spent, committed),
      allowance: pace.isCurrentMonth
        ? dailyAllowance(free, pace.paceDaysElapsed, pace.paceDaysInMonth)
        : null,
      // `budgetDaily` khi có hạn mức: cùng phạm vi với `spent`/`budgeted` ở trên, nên
      // "nhịp 7 ngày qua" đặt cạnh "còn tiêu được mỗi ngày" là so được. `monthDaily` chỉ
      // là đường lùi khi chưa đặt hạn mức nào (lúc đó khối này cũng không in mức cho phép).
      pace: pace.isCurrentMonth
        ? recentPace((pace.budgetDaily ?? pace.monthDaily).points, todayISO)
        : null,
      short:
        pace.isCurrentMonth && totalRemaining > 0 && committed > 0 && free <= 0 ? -free : null,
      hasMissingRate,
    }
  }, [report, pace, schedule, todayISO, hasMissingRate])

  const tagBudgets = useTagBudgets(monthKey)

  // --- Ngày đang chọn ------------------------------------------------------------------
  const selectedTxs = useMemo(
    () => (selected ? transactions.filter((t) => t.occurred_on === selected) : []),
    [transactions, selected],
  )
  const selIncome = sumInBase(selectedTxs, 'income', currencyOf, base, rates)
  const selExpense = sumInBase(selectedTxs, 'expense', currencyOf, base, rates)

  return (
    // `contents` ở hai lớp bọc: dưới lg chúng biến mất khỏi bố cục nên bảy khối thành con
    // trực tiếp của flex column này và `order-*` xếp lại được thứ tự đọc của mobile (còn
    // tiêu được bao nhiêu → tháng trông thế nào → ngày này có gì → còn phải trả gì). Từ
    // lg chúng trở lại thành hai cột thật và `lg:order-none` trả mọi thứ về thứ tự DOM.
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-2.5">
      <div className="contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-3">
        {/* --- Dải lọc theo nhãn --------------------------------------------------- */}
        {tagTotals.slices.length > 0 && (
          <div className="order-2 flex items-center gap-2 lg:order-none lg:px-0.5">
            <span className="hidden shrink-0 items-center gap-1.5 text-2xs uppercase tracking-[.1em] text-fg-muted lg:flex">
              <Tag className="h-3 w-3" aria-hidden />
              Nhãn
            </span>
            {/* Cuộn ngang ở mobile (402px không chứa nổi 5 chip có số tiền), xuống hàng
                từ lg. Cùng dải, hai cách nhường chỗ. */}
            <div className="-mx-3 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
              <TagChip active={tagFilter === null} onClick={() => setTagFilter(null)}>
                Tất cả
              </TagChip>
              {tagTotals.slices.map((s) => (
                <TagChip
                  key={s.tagId}
                  active={tagFilter === s.tagId}
                  onClick={() => setTagFilter(tagFilter === s.tagId ? null : s.tagId)}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: TAG_HEX[tagColor(s.color)] }}
                    aria-hidden
                  />
                  {s.name}
                  {/* Số tiền chỉ ở desktop: ở 402px nó đẩy chip thứ hai ra khỏi màn. */}
                  <Num tone="muted" className="hidden text-2xs lg:inline">
                    {formatMoney(s.amount, base)}
                  </Num>
                </TagChip>
              ))}
            </div>
            <span className="ml-auto hidden shrink-0 text-2xs text-fg-muted xl:block">
              chọn một nhãn để chỉ hiện những ngày có nhãn đó
            </span>
          </div>
        )}

        {/* --- Thẻ lịch: lưới + cột Tuần ------------------------------------------- */}
        <Card padding="none" className="order-3 flex gap-1.5 p-1.5 lg:order-none lg:p-2.5">
          <div className="min-w-0 flex-1">
            {/* Chủ nhật đỏ là quy ước LỊCH, không phải "tiền ra" — nhưng mượn --money-out
                vì đó là sắc đỏ DUY NHẤT của app đạt AA ở cả hai chế độ. Thêm token đỏ thứ
                hai cho một quy ước lịch là phát minh scale mới cho đúng một chỗ. */}
            <div className="grid grid-cols-7 text-center text-2xs font-medium text-fg-muted">
              {WEEKDAYS_SHORT.map((w, i) => (
                <div key={w} className={`py-1 ${i === 0 ? 'text-money-out' : ''}`}>
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5 [grid-auto-rows:3.375rem] lg:gap-[3px] lg:[grid-auto-rows:4.75rem]">
              {Array.from({ length: month.leadingBlanks }, (_, i) => (
                <div key={`blank-${i}`} aria-hidden />
              ))}
              {month.cells.map((c) => (
                <DayCell
                  key={c.iso}
                  cell={c}
                  base={base}
                  isToday={c.iso === todayISO}
                  isSelected={selected === c.iso}
                  dimmed={!c.inFilter}
                  showBar={showBars}
                  onSelect={() => setSelected(c.iso)}
                />
              ))}
            </div>
          </div>

          {/* Cột Tuần — chỉ desktop. Ở mobile nó thành dải pill cuộn ngang bên dưới:
              7rem cạnh một ô 48px là ăn mất một phần tư bề ngang của lưới. */}
          <div className="hidden w-28 shrink-0 border-l border-border-panel pl-1.5 lg:block">
            <div className="py-1 text-right text-2xs font-medium text-fg-muted">Tuần</div>
            <div className="grid gap-[3px] [grid-auto-rows:4.75rem]">
              {month.weeks.map((w) => (
                <WeekCell key={w.startISO} week={w} base={base} />
              ))}
            </div>
          </div>
        </Card>

        {/* --- Dải Tuần cuộn ngang — chỉ mobile ------------------------------------ */}
        <div className="order-4 -mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] lg:hidden">
          {month.weeks.map((w, i) => (
            <span
              key={w.startISO}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-border-panel bg-surface px-2.5 py-1 text-3xs text-fg-muted"
            >
              T{i + 1}
              {/* "—" chứ không "¥0", cùng chữ với cột Tuần ở desktop: một tuần chưa tới
                  KHÔNG phải một tuần tiêu 0 đồng. */}
              {w.expense > 0 ? (
                <Money amount={w.expense} currency={base} className="text-2xs" />
              ) : (
                <span className="text-2xs text-fg-muted">—</span>
              )}
              <WeekDelta week={w} base={base} compact />
            </span>
          ))}
        </div>

        {/* --- Chú giải — chỉ desktop. Ở mobile ô nhỏ hơn nên chip thành chấm, mà một
                chú giải của những cái chấm thì dài hơn cả cái lưới nó giải thích. --- */}
        <div className="order-5 hidden flex-wrap items-center gap-x-4 gap-y-1 px-1 text-2xs text-fg-muted lg:order-none lg:flex">
          <span className="flex items-center gap-1.5">
            <span className="h-[3px] w-6 rounded-full bg-money-out" aria-hidden /> vạch dài = ngày
            chi nặng
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm border border-state-good-border bg-state-good-bg"
              aria-hidden
            />{' '}
            thu &gt; chi
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm border border-dashed border-border-strong"
              aria-hidden
            />{' '}
            chưa tới
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`rounded px-1 text-3xs ${STATUS_CHIP.warn}`} aria-hidden>
              Điện
            </span>{' '}
            khoản đã lên lịch
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`rounded px-1 text-3xs ${STATUS_CHIP.bad}`} aria-hidden>
              Thẻ
            </span>{' '}
            thẻ tới hạn
          </span>
          <span className="flex items-center gap-1.5">
            <span className="flex gap-px" aria-hidden>
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: TAG_HEX.green }}
              />
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: TAG_HEX.indigo }}
              />
            </span>{' '}
            nhãn của khoản chi trong ngày
          </span>
        </div>
      </div>

      <div className="contents lg:flex lg:w-[26.25rem] lg:shrink-0 lg:flex-col lg:gap-2.5">
        <SpendableBlock info={spendable} base={base} className="order-1 lg:order-none" />

        {selected && (
          <SelectedDayBlock
            className="order-6 lg:order-none"
            dateISO={selected}
            isToday={selected === todayISO}
            txs={selectedTxs}
            income={selIncome?.value ?? null}
            expense={selExpense?.value ?? null}
            base={base}
            categoryOf={categoryOf}
            accountOf={accountOf}
            tagsOfTx={tagsOfTx}
            onEdit={onEdit}
          />
        )}

        <TagSpendBlock
          report={tagBudgets}
          base={base}
          monthLabel={monthLabel}
          className="order-8 lg:order-none"
        />

        <UpcomingBlock
          schedule={schedule}
          cardDues={cardDues}
          base={base}
          className="order-7 lg:order-none"
        />
      </div>
    </div>
  )
}

function TagChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition lg:py-0.5 ${
        active
          ? 'border-border-strong bg-surface-sunken font-medium text-fg-primary'
          : 'border-border-strong text-fg-secondary hover:bg-surface-sunken'
      }`}
    >
      {children}
    </button>
  )
}

/** Nền ô theo trạng thái ngày. Thứ tự ưu tiên là thứ tự của bản vẽ 1a. */
function cellSurface(c: CalendarCell, isSelected: boolean, muted: boolean): string {
  // Ngày đang chọn giữ nguyên dáng dù đang bị lọc ra: người dùng CHỈ ĐỊNH nó, và khối
  // "Ngày đang chọn" bên cạnh vẫn đang nói về nó.
  if (isSelected) return 'bg-state-good-bg ring-1 ring-money-in'
  // Ngày ngoài nhãn đang lọc: rỗng ô đi, giữ nét đứt nếu là ngày chưa tới.
  if (muted) return c.future ? 'border border-dashed border-border-panel' : ''
  if (c.netIn) return 'bg-state-good-bg'
  // Ô chưa tới KHÔNG có nền: nó không phải "ngày không chi", nó là "chưa tới" — và nét
  // đứt nói điều đó bằng hình, không cần một sắc xám thứ hai.
  if (c.future) return 'border border-dashed border-border-strong'
  return 'bg-surface-sunken'
}

function DayCell({
  cell: c,
  base,
  isToday,
  isSelected,
  dimmed,
  showBar,
  onSelect,
}: {
  cell: CalendarCell
  base: CurrencyCode
  isToday: boolean
  isSelected: boolean
  dimmed: boolean
  showBar: boolean
  onSelect: () => void
}) {
  // Lọc nhãn thì ô RỖNG đi thay vì mờ đi (`opacity-45` của bản vẽ).
  //
  // Hai lý do, và cái thứ hai là lý do bắt buộc:
  //   1. Mờ 45% kéo số ngày `--fg-muted` xuống quãng 2,4:1 — dưới AA cho chữ 10px, mà
  //      chính bản vẽ nói "giữ số ngày". Rỗng ô thì số ngày ở nguyên độ tương phản.
  //   2. `opacity-*` KHÔNG ăn trên chính phần tử <button>: preflight của Tailwind v4 đặt
  //      `opacity: 1` cho `button, input, select, textarea` ở layer `base`, và đo trên app
  //      đang chạy thì rule đó thắng `.opacity-45` ở layer `utilities`. Ô ngày là <button>,
  //      nên cách của bản vẽ ở đây lặng lẽ không có tác dụng gì.
  const muted = dimmed && !isSelected
  const label = muted
    ? `${formatDayHeader(c.iso)} · không có nhãn đang lọc`
    : [
        formatDayHeader(c.iso),
        c.future && !c.mark ? 'chưa tới' : null,
        c.income > 0 ? `thu ${formatMoney(c.income, base)}` : null,
        c.expense !== 0 ? `chi ${formatMoney(c.expense, base)}` : null,
        c.mark
          ? `${c.mark.title}${c.mark.amount > 0 ? ` ${formatMoney(c.mark.amount, base)}` : ''}${
              c.markCount > 1 ? ` và ${c.markCount - 1} khoản nữa` : ''
            }`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      // title + aria-label vì mức đậm/độ dài vạch KHÔNG được là kênh duy nhất — cùng
      // luật với lưới nhiệt ở `LedgerAside`.
      title={label}
      aria-label={label}
      className={`flex flex-col overflow-hidden rounded-md px-1.5 py-1 text-left transition ${cellSurface(
        c,
        isSelected,
        muted,
      )} ${!isSelected && !c.netIn ? 'hover:bg-surface-sunken' : ''}`}
    >
      <span className="flex items-start justify-between gap-1">
        <span
          className={`shrink-0 text-3xs leading-none lg:text-2xs ${
            isToday
              ? 'flex h-4 w-4 items-center justify-center rounded-full bg-accent font-bold text-fg-on-accent lg:h-[1.125rem] lg:w-[1.125rem]'
              : c.iso.length > 0 && new Date(`${c.iso}T00:00:00Z`).getUTCDay() === 0
                ? 'text-money-out'
                : 'text-fg-muted'
          }`}
        >
          {c.label}
        </span>

        {/* Desktop: hai dòng số đầy đủ. Mobile (ô ~48px): MỘT số rút gọn hệ 万 — ô đó
            không in nổi "¥124,696", và cắt bớt chữ số thì đọc ra sai mười lần. */}
        <span className="hidden flex-col items-end gap-px whitespace-nowrap text-2xs leading-tight lg:flex">
          {!muted && c.income > 0 && (
            <Money amount={c.income} currency={base} tone="in" showSign />
          )}
          {!muted && c.expense !== 0 && (
            <Money
              amount={Math.abs(c.expense)}
              currency={base}
              tone={c.expense > 0 ? 'out' : 'in'}
            />
          )}
        </span>
        {/* Mobile: chấm thay cho chip cam kết — chữ "Thẻ Rakuten 42,300" không vừa. */}
        {!muted && c.mark && (
          <span
            className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full lg:hidden ${MARK_DOT[c.mark.kind]}`}
            aria-hidden
          />
        )}
      </span>

      {/* Mobile: một số rút gọn, dưới số ngày. */}
      <span className="whitespace-nowrap text-right text-3xs leading-tight lg:hidden">
        {muted ? null : c.expense !== 0 ? (
          <Money
            amount={Math.abs(c.expense)}
            currency={base}
            tone={c.expense > 0 ? 'out' : 'in'}
            compact
          />
        ) : c.income > 0 ? (
          <Money amount={c.income} currency={base} tone="in" showSign compact />
        ) : null}
      </span>

      {/* Desktop: chip cam kết / ngày lương. */}
      {!muted && c.mark && (
        <span
          className={`mt-0.5 hidden max-w-full self-start truncate rounded px-1.5 text-3xs leading-[1.5] lg:block ${
            MARK_CHIP[c.mark.kind]
          }`}
        >
          {c.mark.title}
          {c.mark.amount > 0 && ` ${formatMoney(c.mark.amount, base)}`}
        </span>
      )}

      {/* Hàng dưới biến mất khi ngày bị lọc ra: giữ lại thì track của vạch nhiệt vẫn
          vẽ một gạch xám, mà ô đang phải đọc ra là "không thuộc nhãn này". */}
      <span className={`mt-auto flex items-center gap-1 lg:gap-1.5 ${muted ? 'hidden' : ''}`}>
        {c.tagColors.length > 0 && (
          <span className="flex shrink-0 gap-px" aria-hidden>
            {c.tagColors.map((k, i) => (
              <span
                key={`${k}-${i}`}
                className={`h-1.5 w-1.5 rounded-full ${i === MAX_TAG_DOTS - 1 ? 'hidden lg:block' : ''}`}
                style={{ background: TAG_HEX[k] }}
              />
            ))}
          </span>
        )}
        {/* Vạch nhiệt. Độ dài LÀ số tiền, nên nó tắt cùng lúc với chế độ riêng tư — che
            chữ mà giữ vạch thì người bên cạnh vẫn đọc được ngày nào tiêu nhiều. */}
        <span className="h-0.5 flex-1 overflow-hidden rounded-full bg-surface-sunken lg:h-[3px]">
          {showBar && c.heat > 0 && (
            <span
              className={`block h-full rounded-full ${c.heatFromMark ? STATUS_FILL.warn : 'bg-money-out'}`}
              style={{ width: `${c.heat * 100}%` }}
            />
          )}
        </span>
      </span>
    </button>
  )
}

/** Màu chấm/chip theo nguồn của dấu — cùng bảng cho hai cỡ màn. */
const MARK_CHIP: Record<string, string> = {
  recurring: STATUS_CHIP.warn,
  planned: STATUS_CHIP.warn,
  card: STATUS_CHIP.bad,
  payday: STATUS_CHIP.good,
}
const MARK_DOT: Record<string, string> = {
  recurring: STATUS_FILL.warn,
  planned: STATUS_FILL.warn,
  card: STATUS_FILL.bad,
  payday: STATUS_FILL.good,
}

function WeekCell({ week, base }: { week: CalendarWeek; base: CurrencyCode }) {
  return (
    <div className="flex flex-col items-end justify-center gap-0.5 rounded-md bg-surface-sunken px-2 py-1.5 text-right">
      {week.expense > 0 ? (
        <Money
          amount={week.expense}
          currency={base}
          className="text-[0.8125rem] font-semibold"
        />
      ) : (
        <span className="text-[0.8125rem] font-semibold text-fg-muted">—</span>
      )}
      <WeekDelta week={week} base={base} />
    </div>
  )
}

/**
 * Dòng phụ của một tuần: "+ ¥62.590 lịch" khi tuần còn cam kết, ngược lại "▼60% so tuần
 * trước". Cam kết đứng TRƯỚC vì nó nói về tiền chưa ra — % lệch của một tuần chưa xong
 * thì `weekDelta` đã trả null rồi.
 *
 * Bản vẽ để dòng này ở 9px; ở đây là `text-3xs` (10px) vì 9px dưới sàn đọc được của §C.2
 * (--app-font-scale nhỏ nhất là 0,9 → 8,1px), và chính bảng token của gói bàn giao cũng
 * ghi 10px là sàn không ngoại lệ.
 */
function WeekDelta({
  week,
  base,
  compact = false,
}: {
  week: CalendarWeek
  base: CurrencyCode
  compact?: boolean
}) {
  if (week.marked > 0) {
    return (
      <span className="whitespace-nowrap text-3xs text-fg-warn">
        {compact ? '+lịch ' : '+ '}
        {formatMoney(week.marked, base)}
        {!compact && ' lịch'}
      </span>
    )
  }
  if (week.deltaPct === null) return null
  // `signedPct` + `deltaTone` thay cho ▲/▼ của bản vẽ: dấu +/− và màu đã là hai kênh,
  // còn mũi tên là quy ước dấu THỨ HAI trong một app mà ba bảng khác đang dùng đúng
  // hàm này (xem `Num.tsx`). Tăng CHI là tông chi, giảm chi là tông thu.
  return (
    <Num tone={deltaTone(week.deltaPct)} className="whitespace-nowrap text-3xs">
      {signedPct(week.deltaPct)}
      {!compact && <span className="font-sans text-fg-muted"> so tuần trước</span>}
    </Num>
  )
}
