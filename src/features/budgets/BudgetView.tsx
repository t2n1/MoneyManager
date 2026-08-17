import { useState } from 'react'
import { Guide } from '../../components/Guide'
import { useDensity } from '../../hooks/useDensity'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  useBudgetReport,
  useBudgets,
  useCategories,
  useCopyBudgetsFromPreviousMonth,
  useRates,
} from '../../hooks/queries'
import { monthKeyString, type MonthKey } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { showToast } from '../../lib/dialog'
import { Card } from '../../components/ui/Card'
import { BudgetEditSheet } from './BudgetEditSheet'
import { buildBudgetDisplay, type BudgetChildRow } from './budgetDisplay'
import { pickAttention, sortBudgetItems, type BudgetSortMode } from './budgetSort'
import { dailyAllowance } from './dailyAllowance'
import { ClassificationToggle } from '../categories/ClassificationToggle'
import type { BudgetStatus } from './progress'
import { BudgetVerdictLine, MonthPaceCharts, SpendPaceSection, useMonthPace } from '../reports/monthPace'
import { AxisStrip } from './AxisStrip'
import { AxisTargetsCard } from './AxisTargetsCard'
import { useAxisProgress } from './useAxisProgress'
import { TagBudgetsCard } from '../tags/TagBudgetsCard'
import { useTagBudgets } from '../tags/useTagBudgets'
import { STATUS_FILL } from '../../components/ui/statusColors'

const SORT_KEY = 'budget.sort'
const SORT_OPTIONS = [
  ['pace', 'Nhịp'],
  ['money', 'Tiền'],
  ['manual', 'Cài đặt'],
] as const satisfies readonly (readonly [BudgetSortMode, string])[]
const SORT_HINT: Record<BudgetSortMode, string> = {
  pace: 'Mục tiêu nhanh hơn nhịp tháng lên đầu (tháng đã qua thì bằng % đã dùng).',
  money: 'Vượt nhiều tiền nhất lên đầu, rồi tới mục còn ít tiền để tiêu nhất.',
  manual: 'Đúng thứ tự danh mục trong Cài đặt — đứng yên cả tháng cho dễ nhớ chỗ.',
}

/** Mặc định 'manual': danh sách đứng yên để nhớ được chỗ, còn việc gấp thì đã có
 *  khối "Cần để ý" ghim trên đầu lo. Đổi kiểu sắp là ý thích cá nhân nên giữ ở
 *  máy (localStorage), không nhét vào hồ sơ người dùng. */
function readSortMode(): BudgetSortMode {
  try {
    const v = localStorage.getItem(SORT_KEY)
    return SORT_OPTIONS.some(([m]) => m === v) ? (v as BudgetSortMode) : 'manual'
  } catch {
    return 'manual'
  }
}

const BAR_COLOR: Record<BudgetStatus, string> = {
  ok: STATUS_FILL.good,
  warn: STATUS_FILL.warn,
  over: STATUS_FILL.bad,
}
const TEXT_COLOR: Record<BudgetStatus, string> = {
  ok: 'text-fg-primary',
  warn: 'text-fg-warn',
  over: 'text-money-out',
}

/** Tiền còn được tiêu; âm = đã vượt đúng chừng đó. Làm tròn trước khi so 0: chi
 *  ngoại tệ quy đổi ra số lẻ, để nguyên thì "vừa đủ" hiện thành "vượt ¥0". */
const restOf = (budgeted: number, spent: number) => Math.round(budgeted - spent)

/** Thanh tiến độ + % dùng chung. `className` để gọi chỗ nào tự đặt lề / flex-1. */
function ProgressBar({
  ratio,
  status,
  className = '',
}: {
  ratio: number
  status: BudgetStatus
  className?: string
}) {
  const pct = Math.round(ratio * 100)
  return (
    <div
      className={`h-2 overflow-hidden rounded-full bg-surface-sunken ${className}`.trim()}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div
        className={`h-full rounded-full ${BAR_COLOR[status]}`}
        style={{ width: `${Math.min(ratio * 100, 100)}%` }}
      />
    </div>
  )
}

export function BudgetView({ monthKey }: { monthKey: MonthKey }) {
  const { visual } = useDensity()
  const monthKeyStr = monthKeyString(monthKey)
  const { base } = useRates()
  const { report, isLoading } = useBudgetReport(monthKey)
  const { data: budgets = [] } = useBudgets(monthKeyStr)
  const { data: categories = [] } = useCategories()
  const copy = useCopyBudgetsFromPreviousMonth()
  // Gọi trước mọi early-return để giữ đúng thứ tự hook
  const pace = useMonthPace(monthKey)

  // --- Cơ cấu chi so với mốc (thiết yếu / linh hoạt / tiết kiệm) ---
  const axis = useAxisProgress(monthKey)
  // --- Trần theo nhãn (cắt ngang danh mục) ---
  const tagBudgets = useTagBudgets(monthKey)

  // Danh mục đang sửa hạn mức (null = đóng sheet)
  const [editing, setEditing] = useState<{
    categoryId: string
    current: number
    rollover?: boolean
    budgetId?: string
    hint?: string
  } | null>(null)
  // Các nhóm cha đang xổ (mở accordion). Mặc định thu gọn.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sortMode, setSortMode] = useState<BudgetSortMode>(readSortMode)

  function changeSort(m: BudgetSortMode) {
    setSortMode(m)
    try {
      localStorage.setItem(SORT_KEY, m)
    } catch {
      // Trình duyệt chặn lưu (chế độ riêng tư) — chỉ mất lựa chọn khi mở lại.
    }
  }

  const catOf = (id: string) => categories.find((c) => c.id === id)

  // Câu giải thích hạn mức đang đặt thuộc loại nào — tránh nhầm "con cộng thêm vào cha".
  function hintFor(categoryId: string): string | undefined {
    const c = catOf(categoryId)
    if (!c) return undefined
    if (c.parent_id) {
      const parent = catOf(c.parent_id)
      const parentCapped = budgets.some((b) => b.category_id === c.parent_id)
      return parentCapped
        ? `Chỉ là mốc theo dõi bên trong trần của ${parent?.name ?? 'nhóm cha'} — không cộng thêm vào trần đó, cũng không cộng vào tổng ngân sách.`
        : `${parent?.name ?? 'Nhóm cha'} chưa có trần chung, nên hạn mức này tính vào tổng ngân sách. Trần của nhóm = tổng hạn mức các mục con.`
    }
    const hasChildren = categories.some((k) => k.parent_id === categoryId && !k.is_archived)
    return hasChildren
      ? 'Trần chung cho cả nhóm: tính mọi khoản chi của các mục con và chi ghi thẳng vào nhóm.'
      : undefined
  }

  // Mở sheet đặt/sửa hạn mức cho một danh mục (dùng amount gốc, không gồm phần dồn).
  function openEdit(categoryId: string) {
    const b = budgets.find((x) => x.category_id === categoryId)
    setEditing({
      categoryId,
      current: b?.amount ?? 0,
      rollover: b?.rollover,
      budgetId: b?.id,
      hint: hintFor(categoryId),
    })
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCopy() {
    // try/catch: chép hỏng thì đừng hiện toast kết quả sai (toast lỗi toàn cục đã báo).
    let n: number
    try {
      n = await copy.mutateAsync(monthKeyStr)
    } catch {
      return
    }
    showToast(
      n > 0 ? `Đã chép ${n} hạn mức từ tháng trước` : 'Tháng trước không có hạn mức để chép',
      n > 0 ? 'success' : 'info',
    )
  }

  if (isLoading || !report) {
    return <p className="py-10 text-center text-sm text-fg-muted">Đang tải…</p>
  }

  const totalPct = report.totalBudgeted > 0 ? (report.totalSpent / report.totalBudgeted) * 100 : 0
  const totalRemaining = restOf(report.totalBudgeted, report.totalSpent)
  const totalAllowance = pace.isCurrentMonth
    ? dailyAllowance(totalRemaining, pace.paceDaysElapsed, pace.paceDaysInMonth)
    : null

  const expenseCats = categories
    .filter((c) => c.type === 'expense' && !c.is_archived)
    .sort((a, b) => a.sort_order - b.sort_order)
  const { items, unbudgeted } = buildBudgetDisplay(expenseCats, report)

  // Phần tháng đã trôi qua (0…1) — mốc để biết tiêu thế là nhanh hay chậm.
  // Tháng đã qua thì paceDaysElapsed = cả tháng → bằng 1, nhịp rơi về đúng % đã dùng.
  const monthProgress =
    pace.paceDaysInMonth > 0 ? pace.paceDaysElapsed / pace.paceDaysInMonth : 1
  const sortedItems = sortBudgetItems(items, sortMode, monthProgress)
  const attention = pickAttention(items, monthProgress)

  // Thân của một dòng cha / lá độc lập: tên + % ở dòng trên, thanh + "đã chi / trần"
  // ở dòng dưới. Hai dòng chứ không phải ba — nhóm xổ ra 8 con thì ba dòng mỗi mục
  // thành bức tường, không đọc được cái nào so với cái nào.
  const meterBody = (m: {
    label: string
    meta?: string
    spent: number
    budgeted: number
    carried?: number
    ratio: number
    status: BudgetStatus
  }) => {
    const rest = restOf(m.budgeted, m.spent)
    return (
    <>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-medium text-fg-primary">
          {m.label}
          {m.meta && <span className="ml-1 text-2xs font-normal text-fg-muted">{m.meta}</span>}
        </span>
        <span className="flex shrink-0 items-baseline gap-2">
          {/* "Còn bao nhiêu" ở chỗ thoáng nhất của dòng: khoảng trống giữa tên và %.
              Không thêm dòng thứ ba — nhóm xổ ra 8 con thì ba dòng mỗi mục thành
              bức tường (xem chú thích ngay trên). */}
          {m.budgeted > 0 && (
            <span className={`text-2xs ${rest < 0 ? 'text-money-out' : 'text-fg-muted'}`}>
              {rest < 0 ? 'vượt ' : 'còn '}
              {formatMoney(Math.abs(rest), base)}
            </span>
          )}
          {/* % nằm trong ô cố định, canh phải — cột thẳng nhờ bề rộng ô, nên không
              cần tabular-nums viết tay (guardrail đếm idiom đó, dùng <Money> thay).
              <Money> lại không diễn được màu theo trạng thái ngân sách: nó không có
              tone 'warn' cũng không có tone chữ mờ. */}
          <span className={`w-10 text-right text-xs font-medium ${TEXT_COLOR[m.status]}`}>
            {Math.round(m.ratio * 100)}%
          </span>
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <ProgressBar ratio={m.ratio} status={m.status} className="min-w-0 flex-1" />
        <span className="shrink-0 text-2xs text-fg-muted">
          <span className={TEXT_COLOR[m.status]}>{formatMoney(m.spent, base)}</span>
          {' / '}
          {formatMoney(m.budgeted, base)}
          {m.carried && m.carried > 0 ? (
            <span className="ml-1 text-money-in">(dồn +{formatMoney(m.carried, base)})</span>
          ) : null}
        </span>
      </div>
    </>
    )
  }

  // Một dòng con bên trong nhóm (khi xổ ra): GỌN MỘT DÒNG, không có thanh riêng.
  // Con không được to hơn cha — trước đây con còn thò rộng hơn cha 12px nên nhìn
  // vào không biết nhóm bắt đầu từ đâu. Cột % bên phải cố định bề rộng để 8 con
  // xếp thành một cột thẳng, quét mắt là thấy mục nào căng.
  // Chữ mờ ở đây dùng fg-on-track: khối con nằm trên nền lún, fg-muted trượt AA.
  const childRow = (child: BudgetChildRow) => {
    const m = child.marker
    return (
      <li key={child.cat.id}>
        <button
          type="button"
          onClick={() => openEdit(child.cat.id)}
          className="flex min-h-9 w-full items-center justify-between gap-2 text-left text-sm"
        >
          <span className="min-w-0 truncate text-fg-secondary">
            {child.cat.icon} {child.cat.name}
          </span>
          <span className="flex shrink-0 items-center gap-2 text-2xs">
            {m ? (
              <>
                {/* Con nói "đã chi · CÒN bao nhiêu", cha nói "đã chi / TRẦN": thêm cụm
                    thứ ba vào dòng con thì tên chỉ còn 81px ở máy 375px — đo được
                    "🧹 Đồ dùn…". Trần ở đây vẫn suy ra được (đã chi + còn), mà bấm vào
                    là thấy nguyên số; còn "còn bao nhiêu" thì không nhẩm ra được. */}
                <span className="text-fg-on-track">
                  <span className={TEXT_COLOR[m.status]}>{formatMoney(m.spent, base)}</span>
                  {' · '}
                  {restOf(m.budgeted, m.spent) < 0 ? 'vượt ' : 'còn '}
                  {formatMoney(Math.abs(restOf(m.budgeted, m.spent)), base)}
                </span>
                <span className={`w-10 text-right text-xs font-medium ${TEXT_COLOR[m.status]}`}>
                  {Math.round(m.ratio * 100)}%
                </span>
              </>
            ) : (
              <>
                <span className="text-fg-on-track">{formatMoney(child.spent, base)}</span>
                {/* fg-accent (green-700) trên nền lún chỉ 4,49:1 — thiếu 0,01 so với
                    AA, đúng cái bẫy đã ghi trong docs/design-system.md. Cả dòng là
                    nút rồi nên không cần màu để báo "bấm được". */}
                <span className="w-10 text-right text-fg-on-track">mốc +</span>
              </>
            )}
          </span>
        </button>
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {(report.hasMissingRate || pace.hasMissingRate) && (
        <div className="rounded-lg bg-state-warn-bg text-state-warn-fg p-2 text-xs">
          Một phần chi ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên có thể thiếu.
        </div>
      )}

      {/* PC chia 2 cột (cùng lối ReportsPage/AssetsNowView): trái = việc phải làm hôm nay
          (tổng + phán quyết, cần để ý, hạn mức, nhãn), phải = phần mô tả và phần dựng.
          Trước đây trái = "điều khiển", nhưng cơ cấu trục nằm đó chỉ vì nó vốn ở đó từ
          trước khi chia cột, không phải vì ai chọn nó quan trọng nhất.

          KHÔNG dùng order-*. Trên mobile hai wrapper là display:contents nên DOM phẳng ra
          đúng "cột trái rồi cột phải" — thứ tự đọc mobile CHÍNH LÀ thứ tự DOM, nên thị
          giác, tiêu điểm bàn phím và máy đọc màn hình không thể lệch nhau. Muốn đổi thứ tự
          thì CHUYỂN KHỐI, đừng thêm order-*: CSS order đổi cái nhìn thấy mà không đổi thứ
          tự tiêu điểm (WCAG 2.4.3) — thẻ cơ cấu trục giữ 3 phần tử bắt tiêu điểm nên hạ nó
          bằng order-* là tiêu điểm nhảy ngược. Ràng buộc kèm theo: "Chưa đặt hạn mức" phải
          ở cột PHẢI, không thì phép nối trái-rồi-phải không ra đúng thứ tự mobile.
          tests/budgetLayout.test.ts canh cả hai vế. */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
      <div className="contents lg:flex lg:flex-col lg:gap-3">
      {/* Dòng tổng — kèm luôn phán quyết cuối tháng, xem BudgetVerdictLine */}
      <Card as="section">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-fg-muted">Tổng ngân sách</h2>
          <span className="flex gap-2 text-xs font-medium">
            {report.warnCount > 0 && (
              <span className="text-fg-warn">{report.warnCount} sắp vượt</span>
            )}
            {report.overCount > 0 && (
              <span className="text-money-out">{report.overCount} danh mục vượt</span>
            )}
          </span>
        </div>
        {/* THỨ BẬC: số CÒN LẠI là con số lớn nhất của màn, số ĐÃ CHI xuống dòng phụ.
            Trước đây ngược lại — đã chi ở text-lg/700 (18px) còn "Còn ¥…" ở text-xs/600
            (12px), tức con số nhỏ nhất màn hình lại là câu trả lời duy nhất người ta mở
            màn Ngân sách để hỏi, còn số to nhất chỉ kể chuyện đã rồi. Đo trên demo:
            18px/700 so với 12px/600.
            Khi CHƯA đặt hạn mức (totalBudgeted = 0) thì không có "còn lại" nào để nói,
            lúc đó số đã chi mới là số chính — giữ nguyên như cũ. */}
        {report.totalBudgeted > 0 ? (
          <>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-3xl font-bold leading-none tracking-tight tabular-nums ${
                  totalRemaining < 0 ? 'text-money-out' : TEXT_COLOR[report.totalStatus]
                }`}
              >
                {formatMoney(Math.abs(totalRemaining), base)}
              </span>
              <span className="text-xs text-fg-secondary">
                {totalRemaining > 0 ? 'còn lại' : totalRemaining === 0 ? 'vừa đủ' : 'đã vượt'}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-fg-secondary">
              Đã chi <b className="font-semibold text-fg-primary">{formatMoney(report.totalSpent, base)}</b>{' '}
              / {formatMoney(report.totalBudgeted, base)}
            </p>
            <ProgressBar ratio={totalPct / 100} status={report.totalStatus} className="mt-1" />
            {/* Chia cho số ngày còn lại vì đó mới là thứ dùng được hôm nay; tháng đã qua
                thì không chia (chẳng còn ngày nào để tiêu). Không nhắc lại con số "còn
                lại" nữa — nó đã là số lớn nhất ngay trên đầu thẻ. */}
            {totalRemaining > 0 && totalAllowance && (
              <p className="mt-1.5 text-xs text-fg-secondary">
                {visual
                  ? `${formatMoney(totalAllowance.perDay, base)}/ngày × ${totalAllowance.daysLeft} ngày`
                  : `Cho ${totalAllowance.daysLeft} ngày nữa — tiêu ${formatMoney(totalAllowance.perDay, base)}/ngày thì vừa đủ.`}
                {/* "ngày 15/31" của 11a. Số ngày CÒN LẠI một mình không nói được mình
                    đang ở đâu trong tháng, mà đó là mẫu số của mọi câu "nhanh/chậm hơn
                    nhịp" phía dưới. Ở cả hai chế độ mật độ vì nó là số liệu, không phải
                    lời giải thích. */}
                <span className="ml-1.5 tabular-nums text-fg-muted">
                  · ngày {pace.paceDaysElapsed}/{pace.paceDaysInMonth}
                </span>
              </p>
            )}
          </>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className={`text-lg font-bold ${TEXT_COLOR[report.totalStatus]}`}>
                {formatMoney(report.totalSpent, base)}
              </span>
              <span className="text-sm text-fg-muted">
                / {formatMoney(report.totalBudgeted, base)}
              </span>
            </div>
            <ProgressBar ratio={totalPct / 100} status={report.totalStatus} className="mt-1" />
          </>
        )}
        {/* Phán quyết đứng ngay đây, không ở thẻ biểu đồ. Con số lớn nhất màn ("còn ¥…")
            chỉ kể chuyện đã ghi; câu này mới nói đà tháng về đâu. Để rời nhau thì trên
            mobile một vế ở y=347 còn một vế ở y=803, dưới mép gấp 732. */}
        <BudgetVerdictLine pace={pace} />
        {/* Dải trục NGAY DƯỚI câu kết luận (§4.3). Cùng component với dải ở tab Sổ, chỉ
            khác `linkToDetail={false}` — khối đầy đủ nằm cuối chính màn này, một liên
            kết trỏ về trang đang mở là cái bẫy.
            Vì sao vẫn giữ khối đầy đủ ở dưới: dải chỉ có ba con số, còn khối kia xổ ra
            DANH MỤC của từng trục và nói rõ phần chi chưa phân loại đang làm lệch mẫu
            số. Đây là "kết luận trước, bằng chứng sau" (§14), không phải hai bản của
            cùng một thứ. */}
        {axis && (
          <div className="mt-3">
            <AxisStrip data={axis} monthKey={monthKey} base={base} linkToDetail={false} />
          </div>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="mt-3 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-fg-secondary hover:bg-surface-sunken"
        >
          Chép hạn mức tháng trước
        </button>
      </Card>

      {/* Cần để ý — ghim ngay dưới dòng tổng. Đây là phần trả lời "hôm nay phải làm gì",
          khác với danh sách bên dưới trả lời "toàn cảnh tháng này ra sao". */}
      {attention.length > 0 && (
        <Card as="section">
          {/* MẪU SỐ là của 11a: "3 / 5 mục có hạn mức". Riêng "Cần để ý (3)" không nói
              được 3 trên bao nhiêu — mà đó mới là thứ quyết định con số ấy đáng lo cỡ
              nào: 3/5 là hơn nửa ngân sách đang chệch, 3/20 thì không. */}
          <h2 className="text-sm font-semibold text-fg-muted">
            Cần để ý{' '}
            <span className="font-normal tabular-nums">
              · {attention.length} / {items.length} mục có hạn mức
            </span>
          </h2>
          <Guide className="mb-2 text-xs text-fg-muted">
            Đã quá trần, hoặc đang tiêu nhanh hơn nhịp tháng. Khoản cố định đã trả xong
            (tiền nhà, bảo hiểm…) không tính — không còn gì để phanh.
          </Guide>
          <ul className="divide-y divide-border-subtle">
            {attention.map((a) => (
              <li key={a.item.cat.id}>
                <button
                  type="button"
                  onClick={() => openEdit(a.item.cat.id)}
                  className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm"
                >
                  <span className="min-w-0 truncate font-medium text-fg-primary">
                    {a.item.cat.icon} {a.item.cat.name}
                  </span>
                  <span
                    className={`shrink-0 text-xs font-medium ${
                      a.reason === 'over' ? 'text-money-out' : 'text-fg-warn'
                    }`}
                  >
                    {a.reason === 'over'
                      ? `vượt ${formatMoney(a.over, base)}`
                      : `nhanh gấp ${a.pace.toFixed(1).replace('.', ',')} lần`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Danh mục / nhóm có hạn mức */}
      {items.length > 0 && (
        <Card as="section">
          {/* Nút chọn kiểu sắp xếp: chỉ hiện khi có từ 2 mục trở lên — một mục thì
              sắp kiểu gì cũng thế, bày thêm nút chỉ tổ rối. */}
          {items.length > 1 && (
            <div className="mb-2">
              <ClassificationToggle
                groupLabel="Sắp xếp hạn mức"
                options={SORT_OPTIONS}
                value={sortMode}
                onChange={changeSort}
              />
              <Guide className="mt-1 text-2xs text-fg-muted">{SORT_HINT[sortMode]}</Guide>
            </div>
          )}
          <ul className="divide-y divide-border-subtle">
            {sortedItems.map((item) => {
              if (item.kind === 'leaf') {
                return (
                  <li key={item.cat.id} className="py-2 first:pt-0 last:pb-0">
                    <button
                      type="button"
                      onClick={() => openEdit(item.cat.id)}
                      className="w-full text-left"
                    >
                      {meterBody({
                        label: `${item.cat.icon} ${item.cat.name}`,
                        spent: item.line.spent,
                        budgeted: item.line.budgeted,
                        carried: item.line.carried,
                        ratio: item.line.ratio,
                        status: item.line.status,
                      })}
                    </button>
                  </li>
                )
              }

              const isOpen = expanded.has(item.cat.id)
              return (
                <li key={item.cat.id} className="py-2 first:pt-0 last:pb-0">
                  <div className="flex items-stretch gap-1">
                    {/* Nút xổ/thu con — kéo cao hết dòng cho dễ bấm. Rộng 36px (w-9) chứ
                        không 24px: đo được 24×40, hụt vùng chạm ở trục ngang. 36 là bề
                        rộng nút icon hẹp mà app đang dùng sẵn (min-w-9 ở các tay kéo sắp
                        thứ tự) — theo quy ước có rồi, không đặt cỡ mới. */}
                    <button
                      type="button"
                      onClick={() => toggle(item.cat.id)}
                      aria-label={isOpen ? 'Thu gọn' : 'Xem các mục con'}
                      aria-expanded={isOpen}
                      className="flex w-9 shrink-0 items-center justify-center rounded text-fg-muted hover:text-fg-primary"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    {/* Vùng chính: đặt/sửa trần nhóm */}
                    <button
                      type="button"
                      onClick={() => openEdit(item.cat.id)}
                      className="min-h-11 min-w-0 flex-1 text-left"
                    >
                      {meterBody({
                        label: `${item.cat.icon} ${item.cat.name}`,
                        meta: item.capped ? 'trần nhóm' : `${item.children.length} mục con`,
                        spent: item.spent,
                        budgeted: item.budgeted,
                        ratio: item.ratio,
                        status: item.status,
                      })}
                    </button>
                  </div>
                  {/* Mốc con chỉ chia nhỏ bên trong trần cha; cộng lại vượt trần thì nhắc. */}
                  {item.capped && item.markerTotal > item.budgeted && (
                    <p className="ml-7 mt-1 text-xs text-fg-warn">
                      Mốc các mục con cộng lại {formatMoney(item.markerTotal, base)}, vượt trần nhóm{' '}
                      {formatMoney(item.budgeted, base)}.
                    </p>
                  )}
                  {/* Khối con: thụt vào PHẢI của tên cha + nền lún, để thấy rõ nhóm
                      bắt đầu và kết thúc ở đâu. Vạch chia trong khối phải là
                      border-strong, không phải border-subtle như danh sách ngoài:
                      subtle = gray-100, đúng bằng màu nền lún ở light mode. */}
                  {isOpen && (
                    <ul className="ml-7 mt-2 divide-y divide-border-strong rounded-lg bg-surface-sunken px-3">
                      {item.children.map(childRow)}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {/* Ngân sách theo nhãn — SAU danh sách danh mục vì danh mục mới là công cụ chính
          hằng tháng; nhãn là trần cắt ngang, dùng cho dịp/dự án. Khối cuối của cột trái. */}
      <TagBudgetsCard data={tagBudgets} base={base} />

      </div>

      {/* Cột phải (PC): mô tả và dựng — không phải việc phải làm hôm nay. Trên mobile
          các khối này nối tiếp ngay sau cột trái. */}
      <div className="contents lg:flex lg:flex-col lg:gap-3">
      {/* Chi tích lũy vs ngân sách — BẰNG CHỨNG cho câu phán quyết đã nói ở thẻ tổng,
          nên đứng sau danh sách bấm được, đúng luật "biểu đồ xuống dưới phần bấm được" */}
      {pace.hasSpend && <SpendPaceSection pace={pace} />}

      {/* Cơ cấu chi theo trục — trả lời "chi thế này có lành mạnh không", câu hỏi nhịp
          tháng/quý. Khác dòng tổng ở cột trái trả lời "có vượt hạn mức không", câu hỏi
          nhịp ngày. Đo trên mobile 375×812: thẻ này cao 227px trong vùng nhìn thấy 660px
          (nav dưới fixed từ y=732), tức 34% màn đầu tiên — quá đắt cho một khối không có
          trạng thái khẩn nào (nó chỉ có đạt/chưa đạt, không có mức đỏ). */}
      {axis && <AxisTargetsCard data={axis} base={base} monthKey={monthKey} />}

      {/* Nhóm / lá chưa đặt hạn mức — việc DỰNG ngân sách, không phải việc theo dõi nó.
          Nằm ở cột phải còn vì lý do bố cục: nối trái-rồi-phải phải ra đúng thứ tự mobile
          thì mới bỏ được order-*. Xem chú thích ở đầu khối 2 cột. */}
      {unbudgeted.length > 0 && (
        <Card as="section">
          <h2 className="mb-1 text-sm font-semibold text-fg-muted">
            Chưa đặt hạn mức{' '}
            <span className="font-normal tabular-nums">· {unbudgeted.length} danh mục</span>
          </h2>
          <Guide className="mb-2 text-xs text-fg-muted">
            Bấm tên nhóm để đặt trần chung, hoặc xổ ra (▸) để đặt riêng cho từng mục con — khi đó
            trần nhóm là tổng các con.
          </Guide>
          <ul className="flex flex-col gap-2">
            {unbudgeted.map(({ cat: c, children }) => {
              const isOpen = expanded.has(c.id)
              return (
                <li key={c.id}>
                  <div className="flex items-center gap-1">
                    {children.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggle(c.id)}
                        aria-label={isOpen ? 'Thu gọn' : 'Xem các mục con'}
                        aria-expanded={isOpen}
                        // 20×20 là quá nhỏ để bấm; min-h-11 min-w-9 là cỡ nút icon hẹp
                        // app đang dùng sẵn. -my-2 để vùng chạm cao 44px không đẩy dòng
                        // giãn ra (cùng mẹo với nút "Chọn" ở LedgerPage).
                        className="-my-2 flex min-h-11 min-w-9 shrink-0 items-center justify-center rounded text-fg-muted hover:text-fg-primary"
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEdit(c.id)}
                      className="rounded-full border border-dashed border-border-strong px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface-sunken"
                    >
                      {c.icon} {c.name} +
                    </button>
                  </div>
                  {isOpen && children.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-2 border-l border-border-subtle pl-3">
                      {children.map((k) => (
                        <li key={k.id}>
                          <button
                            type="button"
                            onClick={() => openEdit(k.id)}
                            className="rounded-full border border-dashed border-border-strong px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface-sunken"
                          >
                            {k.icon} {k.name} +
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {/* Lịch chi tiêu (và dòng tiền) — khối khám phá, để cuối. Gate theo đúng điều kiện
          component con tự ẩn: không thì div rỗng vẫn chiếm một suất gap trên mobile. */}
      {(pace.hasCashflow || pace.hasSpend) && (
        <div className="flex flex-col gap-3">
          <MonthPaceCharts pace={pace} />
        </div>
      )}
      </div>
      </div>

      {editing && (
        <BudgetEditSheet
          key={editing.categoryId}
          monthKey={monthKeyStr}
          categoryId={editing.categoryId}
          categoryLabel={`${catOf(editing.categoryId)?.icon ?? '📦'} ${catOf(editing.categoryId)?.name ?? ''}`}
          current={editing.current}
          currentRollover={editing.rollover}
          budgetId={editing.budgetId}
          hint={editing.hint}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
