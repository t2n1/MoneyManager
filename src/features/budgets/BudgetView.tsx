import { useState } from 'react'
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
import { MonthPaceCharts, SpendPaceSection, useMonthPace } from '../reports/monthPace'
import { AxisTargetsCard } from './AxisTargetsCard'
import { useAxisProgress } from './useAxisProgress'
import { TagBudgetsCard } from '../tags/TagBudgetsCard'
import { useTagBudgets } from '../tags/useTagBudgets'

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
  ok: 'bg-green-500',
  warn: 'bg-amber-500',
  over: 'bg-red-500',
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
    const n = await copy.mutateAsync(monthKeyStr)
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
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 p-2 text-xs text-amber-700 dark:text-amber-300">
          Một phần chi ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên có thể thiếu.
        </div>
      )}

      {/* PC chia 2 cột (cùng lối ReportsPage/AssetsNowView): trái = điều khiển (trục,
          tổng, hạn mức), phải = biểu đồ mô tả. Trên mobile hai wrapper là
          display:contents nên các khối vẫn là con trực tiếp của flex-col ngoài —
          thứ tự đọc giữ bằng order-*: nhịp chi (order-3) vẫn nằm ngay dưới dòng
          tổng (order-2) như chú thích ở SpendPaceSection yêu cầu. */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
      <div className="contents lg:flex lg:flex-col lg:gap-3">
      {/* Cơ cấu chi theo trục — trả lời "chi thế này có lành mạnh không",
          khác với dòng tổng bên dưới trả lời "có vượt hạn mức không" */}
      {axis && (
        <div className="order-1">
          <AxisTargetsCard data={axis} base={base} />
        </div>
      )}

      {/* Dòng tổng */}
      <section className="order-2 rounded-xl bg-surface p-3 shadow-sm">
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
        <div className="flex items-baseline justify-between">
          <span className={`text-lg font-bold ${TEXT_COLOR[report.totalStatus]}`}>
            {formatMoney(report.totalSpent, base)}
          </span>
          <span className="text-sm text-fg-muted">
            / {formatMoney(report.totalBudgeted, base)}
          </span>
        </div>
        <ProgressBar ratio={totalPct / 100} status={report.totalStatus} className="mt-1" />
        {/* Câu trả lời cho "giờ còn tiêu được bao nhiêu" — số đã chi ở trên chỉ nói
            chuyện đã rồi. Chia thêm cho số ngày còn lại vì đó mới là thứ dùng được
            hôm nay; tháng đã qua thì không chia (chẳng còn ngày nào để tiêu). */}
        {report.totalBudgeted > 0 &&
          (totalRemaining > 0 ? (
            <p className="mt-1.5 text-xs text-fg-secondary">
              Còn <b className="font-semibold text-fg-primary">{formatMoney(totalRemaining, base)}</b>
              {totalAllowance
                ? ` cho ${totalAllowance.daysLeft} ngày nữa — tiêu ${formatMoney(totalAllowance.perDay, base)}/ngày thì vừa đủ.`
                : ' trong tổng hạn mức.'}
            </p>
          ) : totalRemaining === 0 ? (
            <p className="mt-1.5 text-xs text-fg-warn">Vừa chạm đúng tổng hạn mức.</p>
          ) : (
            <p className="mt-1.5 text-xs text-money-out">
              Đã vượt tổng hạn mức {formatMoney(-totalRemaining, base)}.
            </p>
          ))}
        <button
          type="button"
          onClick={handleCopy}
          className="mt-3 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-fg-secondary hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Chép hạn mức tháng trước
        </button>
      </section>

      {/* Cần để ý — ghim ngay dưới dòng tổng (cùng order-2 nên xếp sau nó theo thứ tự
          DOM, trước khối nhịp chi order-3). Đây là phần trả lời "hôm nay phải làm gì",
          khác với danh sách bên dưới trả lời "toàn cảnh tháng này ra sao". */}
      {attention.length > 0 && (
        <Card as="section" className="order-2">
          <h2 className="text-sm font-semibold text-fg-muted">
            Cần để ý ({attention.length})
          </h2>
          <p className="mb-2 text-xs text-fg-muted">
            Đã quá trần, hoặc đang tiêu nhanh hơn nhịp tháng. Khoản cố định đã trả xong
            (tiền nhà, bảo hiểm…) không tính — không còn gì để phanh.
          </p>
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
        <section className="order-4 rounded-xl bg-surface p-3 shadow-sm">
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
              <p className="mt-1 text-2xs text-fg-muted">{SORT_HINT[sortMode]}</p>
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
                    {/* Nút xổ/thu con — kéo cao hết dòng cho dễ bấm, rộng 24px */}
                    <button
                      type="button"
                      onClick={() => toggle(item.cat.id)}
                      aria-label={isOpen ? 'Thu gọn' : 'Xem các mục con'}
                      aria-expanded={isOpen}
                      className="flex w-6 shrink-0 items-center justify-center rounded text-fg-muted hover:text-gray-600 dark:hover:text-gray-200"
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
                      className="min-w-0 flex-1 text-left"
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
        </section>
      )}

      {/* Ngân sách theo nhãn — SAU danh sách danh mục vì danh mục mới là công cụ
          chính hằng tháng; nhãn là trần cắt ngang, dùng cho dịp/dự án. Cùng order-4
          nên nó xếp ngay sau danh sách đó theo thứ tự DOM. */}
      <div className="order-4">
        <TagBudgetsCard data={tagBudgets} base={base} />
      </div>

      {/* Nhóm / lá chưa đặt hạn mức */}
      {unbudgeted.length > 0 && (
        <section className="order-5 rounded-xl bg-surface p-3 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-fg-muted">
            Chưa đặt hạn mức
          </h2>
          <p className="mb-2 text-xs text-fg-muted">
            Bấm tên nhóm để đặt trần chung, hoặc xổ ra (▸) để đặt riêng cho từng mục con — khi đó
            trần nhóm là tổng các con.
          </p>
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
                        className="shrink-0 rounded p-0.5 text-fg-muted hover:text-gray-600 dark:hover:text-gray-200"
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
                      className="rounded-full border border-dashed border-border-strong px-3 py-1.5 text-xs text-fg-secondary hover:bg-gray-50 dark:hover:bg-gray-800"
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
                            className="rounded-full border border-dashed border-border-strong px-3 py-1.5 text-xs text-fg-secondary hover:bg-gray-50 dark:hover:bg-gray-800"
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
        </section>
      )}

      </div>

      {/* Cột phải (PC): biểu đồ. Wrapper gate theo đúng điều kiện các component con
          tự ẩn — không thì div rỗng vẫn chiếm một suất gap trên mobile. */}
      <div className="contents lg:flex lg:flex-col lg:gap-3">
      {/* Đang đi nhanh hay chậm so với hạn mức — trên mobile ngay dưới dòng tổng */}
      {pace.hasSpend && (
        <div className="order-3">
          <SpendPaceSection pace={pace} />
        </div>
      )}

      {/* Biểu đồ mô tả — dưới danh sách hạn mức (mobile) vì không bấm được */}
      {(pace.hasCashflow || pace.hasSpend) && (
        <div className="order-6 flex flex-col gap-3">
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
