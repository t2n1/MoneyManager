import { useState } from 'react'
import { Guide } from '../../components/Guide'
import { useDensity } from '../../hooks/useDensity'
import { ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react'
import {
  useBudgetReport,
  useBudgets,
  useCategories,
  useCopyBudgetsFromPreviousMonth,
  useRates,
} from '../../hooks/queries'
import { dayMonthLabel, daysBetween, monthKeyString, toISODate, type MonthKey } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { showToast } from '../../lib/dialog'
import { Card } from '../../components/ui/Card'
import { ActionButton, EmptyState, Money, SectionTitle } from '../../components/ui'
import { BudgetEditSheet } from './BudgetEditSheet'
import { buildBudgetDisplay, type BudgetChildRow } from './budgetDisplay'
import { budgetHint } from './budgetHint'
import { capMismatchNotice } from './capOverflow'
import { SplitGroupSheet } from './SplitGroupSheet'
import { useSyncedBudget } from './useSyncedBudget'
import { pickAttention, sortBudgetItems, type BudgetSortMode } from './budgetSort'
import { classifyCommitments, coverageGaps, spendableRemaining } from './commitments'
import { dailyAllowance } from './dailyAllowance'
import { useCommitments } from './useCommitments'
import { SUGGEST_MONTHS, useSuggestions } from './useSuggestions'
import { ClassificationToggle } from '../categories/ClassificationToggle'
import type { BudgetStatus } from './progress'
import {
  BudgetVerdictLine,
  CumulativeCashflowCard,
  SpendPaceSection,
  useMonthPace,
} from '../reports/monthPace'
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

/**
 * Mặc định 'manual': danh sách đứng yên cả tháng để nhớ được chỗ. Đổi kiểu sắp là ý thích
 * cá nhân nên giữ ở máy (localStorage), không nhét vào hồ sơ người dùng.
 *
 * ĐÍNH CHÍNH (B38.3) — lý lẽ cũ ghi ở đây là "việc gấp thì đã có khối «Cần để ý» ghim trên
 * đầu lo", nhưng khối đó đã bị B8 xoá, và lý lẽ của B8 lại giả định danh sách sắp theo
 * "vượt trước" — thứ mà mặc định 'manual' không dùng. Hai quyết định trong cùng file tự đá
 * nhau, hệ quả là `pickAttention()` được đếm ra chữ "3 / 5 mục cần để ý" ở tiêu đề rồi ba
 * mục đó nằm rải rác không có gì đánh dấu.
 *
 * Cách chữa KHÔNG phải đổi mặc định (mất cái đang có lý) cũng không phải dựng lại khối
 * (quay về chỗ B8 đã sửa đúng): đánh dấu TẠI DÒNG, và cho con số ở tiêu đề nhảy tới dòng
 * đầu tiên. Xem `attentionIds` dưới.
 */
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

/**
 * Câu "còn / vượt bao nhiêu" của một mốc — MỘT chỗ quyết định, vì cả dòng cha lẫn dòng
 * con đều nói nó và hai bản chép tay sẽ lệch nhau sau vài lượt sửa.
 *
 * Ca ĐÚNG BẰNG TRẦN (rest = 0) không đi qua "còn"/"vượt": chi đúng bằng hạn mức thì
 * "vượt ¥0" là một câu tự phủ định (vượt bao nhiêu? không đồng nào), còn "còn ¥0" thì
 * đọc như vẫn tiêu được. Cả hai đều sai ở đúng cái điểm người dùng cần biết mình đang
 * đứng ở đâu — nên nó có câu riêng: "vừa hết hạn mức".
 */
function restLabel(rest: number, fmt: (v: number) => string): string {
  if (rest === 0) return 'vừa hết hạn mức'
  return `${rest < 0 ? 'vượt ' : 'còn '}${fmt(Math.abs(rest))}`
}

/**
 * Vạch đánh dấu ở ĐẦU dòng cho mục cần để ý (B38.1).
 *
 * Hai lý do của `pickAttention` được hai màu khác nhau: đã vượt trần là chuyện đã rồi
 * (`money-out`), còn đang tiêu nhanh hơn nhịp thì vẫn phanh được (`state-warn`). Viền luôn
 * chiếm chỗ — trong suốt khi không cần — để dòng không nhích ngang giữa hai trạng thái.
 */
function markClass(reason: 'over' | 'fast' | undefined): string {
  const base = 'border-l-2 pl-2'
  if (reason === 'over') return `${base} border-l-money-out`
  if (reason === 'fast') return `${base} border-l-state-warn-border`
  return `${base} border-l-transparent`
}

/**
 * Chip "chưa đặt hạn mức" — kèm luôn CON SỐ gợi ý (B39.2).
 *
 * Bản trước hiện 20+ danh mục dưới dạng `📦 Tên +`, không một con số nào, trong khi mặt lập
 * kế hoạch cho cùng việc đó thì có `TB 6 tháng` và số điền sẵn. Chip nào không có lịch sử
 * thì giữ nguyên như cũ — không bịa số 0 ("chưa biết ≠ 0", §G).
 */
function UnbudgetedChip({
  cat,
  base,
  suggestions,
  onClick,
}: {
  cat: { id: string; icon: string; name: string }
  base: Parameters<typeof Money>[0]['currency']
  suggestions: Map<string, { average: number }>
  onClick: (id: string) => void
}) {
  const avg = suggestions.get(cat.id)?.average ?? 0
  return (
    <button
      type="button"
      onClick={() => onClick(cat.id)}
      className="min-h-11 rounded-full border border-dashed border-border-strong px-3 text-sm text-fg-secondary hover:bg-surface-sunken"
    >
      {cat.icon} {cat.name}
      {avg > 0 && (
        <>
          {' · '}
          <Money amount={avg} currency={base} className="!text-fg-secondary" />
        </>
      )}{' '}
      +
    </button>
  )
}

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
  // --- Cam kết chưa ra + gợi ý hạn mức: hai đường DÙNG CHUNG với mặt lập kế hoạch ---
  // Mặt này tới nay không gọi `collectCommitments` một lần nào (B36) và không truyền
  // `suggestion` vào sheet đặt hạn mức (B39), dù cả hai hàm đã có sẵn và đã chạy đúng ở
  // mặt bên kia của CHÍNH trang này.
  const commitments = useCommitments(monthKey)
  const { suggestions } = useSuggestions()
  // Nút "Chia … cho N mục con" của câu nhắc lệch — xem `useSyncedBudget`.
  const { syncAfterWrite, openSplit, splitSheetProps } = useSyncedBudget(monthKeyStr)

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
  // Dùng chung với tab Lập kế hoạch (budgetHint.ts): sheet mở được từ hai chỗ, mà câu
  // này là thứ duy nhất nói ra "đây chỉ là MỐC bên trong trần cha".
  const hintFor = (categoryId: string) =>
    budgetHint(categoryId, categories, (id) => budgets.some((b) => b.category_id === id))

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
    return <EmptyState>Đang tải…</EmptyState>
  }

  const totalPct = report.totalBudgeted > 0 ? (report.totalSpent / report.totalBudgeted) * 100 : 0
  const totalRemaining = restOf(report.totalBudgeted, report.totalSpent)

  // B36 · "Tiêu ¥X/ngày" KHÔNG được chia cả tiền đã hứa cho người khác.
  //
  // `totalRemaining` gồm cả hạn mức của những khoản chắc chắn phải trả mà chưa tới ngày —
  // tiền điện ngày 25, khoản định kỳ chưa sinh giao dịch, khoản sắp chi đã có ngày. Con số
  // "mỗi ngày còn tiêu được ¥3,000" vì thế cao hơn sự thật ĐÚNG BẰNG số cam kết chưa ra, mà
  // nó là con số hành động nhiều nhất của cả trang.
  //
  // Chỉ trừ ở THÁNG ĐANG CHẠY: tháng đã đóng thì không còn ngày nào để chia, và mức mỗi
  // ngày đã tự ẩn từ trước.
  const committedRemaining = pace.isCurrentMonth ? commitments.total : 0
  const spendable = spendableRemaining(totalRemaining, committedRemaining)
  const totalAllowance = pace.isCurrentMonth
    ? dailyAllowance(spendable, pace.paceDaysElapsed, pace.paceDaysInMonth)
    : null
  // B36.2 · Ca "còn tiền trong trần nhưng đã hứa hết" KHÔNG phải ca `null` của
  // `dailyAllowance`. Hàm đó trả `null` khi số chia ≤ 0 và dòng biến mất — đúng cho "đã
  // vượt trần", SAI cho ca này: còn ¥12,000 trong trần mà ¥18,600 đã hứa nghĩa là thiếu
  // ¥6,600, và đó là tin quan trọng nhất trong tháng.
  const thieuTruocCuoiThang =
    pace.isCurrentMonth && totalRemaining > 0 && committedRemaining > 0 && spendable <= 0

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
  // B38.1 · Dấu ở ĐẦU dòng cho mục thuộc `attention`, ở MỌI chế độ sắp xếp. Không thêm huy
  // hiệu chữ: dòng đã có %, "còn/vượt" và "đã chi / trần" — chữ thứ tư là quá tải.
  const attentionTone = new Map(attention.map((a) => [a.item.cat.id, a.reason]))
  // B38.2 · Con số ở tiêu đề nhảy tới dòng ĐẦU TIÊN trong `attention`. Đếm mà không đi tới
  // được thì con số chỉ là một lời phàn nàn.
  const firstAttentionId = attention[0]?.item.cat.id ?? null

  // B37 · Cam kết chưa ra, chia theo chỗ đứng so với HÔM NAY.
  const todayISO = toISODate(new Date())
  const schedule = classifyCommitments(commitments.items, todayISO)
  // B37.2 · Ở mặt theo dõi, cam kết phải so với hạn mức CÒN LẠI, không phải hạn mức. Giữa
  // tháng, "trần ¥5,900 không phủ ¥8,300 cam kết" đã cũ — câu đúng là "đã chi ¥3,000, còn
  // ¥2,900 trong trần, mà còn ¥8,300 phải trả".
  const parentOfCat = (id: string) => catOf(id)?.parent_id ?? null
  const remainingByCat = new Map(
    report.lines
      .filter((l) => !l.isMarker)
      .map((l) => [l.categoryId, Math.max(0, restOf(l.budgeted, l.spent))]),
  )
  // Chỉ báo cho trần ĐANG CÓ THẬT. Danh mục chưa đặt trần nào thì "hạn mức không phủ nổi
  // cam kết" là một câu không nói được điều gì làm được giữa tháng — đặt trần là việc của
  // mặt lập kế hoạch, và ở đó nó ĐÃ có dòng riêng ("Tạo trần ¥20,000", B31.2). Không lọc
  // thì mọi khoản định kỳ trong danh mục không đặt trần đều réo mỗi tháng, tức đúng cái
  // bệnh `coverageGaps` được viết ra để tránh: một cảnh báo lúc nào cũng kêu thì mất luôn
  // cả lần nó đúng.
  const liveGaps = pace.isCurrentMonth
    ? coverageGaps(commitments.byCategory, remainingByCat, parentOfCat).filter((g) =>
        remainingByCat.has(g.categoryId),
      )
    : []
  const lineOfCat = new Map(report.lines.map((l) => [l.categoryId, l]))

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
              {restLabel(rest, (v) => formatMoney(v, base))}
            </span>
          )}
          {/* % nằm trong ô cố định, canh phải — cột thẳng nhờ bề rộng ô, nên không
              cần tabular-nums viết tay (guardrail đếm idiom đó, dùng <Money> thay).
              <Money> lại không diễn được màu theo trạng thái ngân sách: nó không có
              tone 'warn' cũng không có tone chữ mờ. */}
          <span className={`w-10 text-right text-sm font-medium ${TEXT_COLOR[m.status]}`}>
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
                {/* CÙNG ngữ pháp với dòng cha: "đã chi / trần". Bản cũ in "đã chi · còn"
                    với lý lẽ là trần vẫn suy ra được (đã chi + còn) — nhưng đo trên ca
                    thật tháng 8/2026 thì lý lẽ đó sai: nhóm trần ¥1.800, Cắt tóc mốc
                    ¥2.400 đã chi ¥1.800, ra ba số 1.800 trên màn mang hai nghĩa khác
                    nhau, còn 2.400 thì chỉ hiện trong câu cảnh báo. Người dùng đọc số
                    của dòng con là mốc mình đặt và kết luận app tự bịa số.
                    Hai cụm chứ không ba, nên không hẹp hơn bản cũ: "¥1,800 / ¥2,400"
                    ngắn hơn "¥1,800 · còn ¥600". */}
                <span className="text-fg-on-track">
                  <span className={TEXT_COLOR[m.status]}>{formatMoney(m.spent, base)}</span>
                  {' / '}
                  {formatMoney(m.budgeted, base)}
                  {m.carried > 0 ? (
                    <span className="ml-1 text-money-in">(dồn +{formatMoney(m.carried, base)})</span>
                  ) : null}
                </span>
                <span className={`w-10 text-right text-sm font-medium ${TEXT_COLOR[m.status]}`}>
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
        <div className="rounded-lg bg-state-warn-bg text-state-warn-fg p-2 text-sm">
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
          <SectionTitle>Tổng ngân sách</SectionTitle>
          <span className="flex gap-2 text-sm font-medium">
            {report.warnCount > 0 && (
              <span className="text-fg-warn">{report.warnCount} sắp vượt</span>
            )}
            {report.overCount > 0 && (
              <span className="text-money-out">{report.overCount} danh mục vượt</span>
            )}
          </span>
        </div>
        {/* THỨ BẬC: số CÒN LẠI là con số lớn nhất của màn, số ĐÃ CHI xuống dòng phụ.
            Trước đây ngược lại — đã chi ở text-lg/700 (18px) còn "Còn ¥…" ở text-sm/600
            (12px), tức con số nhỏ nhất màn hình lại là câu trả lời duy nhất người ta mở
            màn Ngân sách để hỏi, còn số to nhất chỉ kể chuyện đã rồi. Đo trên demo:
            18px/700 so với 12px/600.
            Khi CHƯA đặt hạn mức (totalBudgeted = 0) thì không có "còn lại" nào để nói,
            lúc đó số đã chi mới là số chính — giữ nguyên như cũ. */}
        {report.totalBudgeted > 0 ? (
          <>
            <div className="flex items-baseline gap-2">
              <span
                className={`font-mono text-hero font-medium tracking-number tabular-nums ${
                  totalRemaining < 0 ? 'text-money-out' : TEXT_COLOR[report.totalStatus]
                }`}
              >
                {formatMoney(Math.abs(totalRemaining), base)}
              </span>
              <span className="text-sm text-fg-secondary">
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
              <p className="mt-1.5 text-sm text-fg-secondary">
                {visual
                  ? `${formatMoney(totalAllowance.perDay, base)}/ngày × ${totalAllowance.daysLeft} ngày`
                  : `Cho ${totalAllowance.daysLeft} ngày nữa — tiêu ${formatMoney(totalAllowance.perDay, base)}/ngày thì vừa đủ.`}
                {/* B36.1 · Phải NÓI RA phần đã trừ, không âm thầm hạ số: người dùng thấy
                    con số tụt so với hôm qua và tưởng app tính sai. Ở cả hai chế độ mật độ
                    vì nó là số liệu, không phải lời giải thích. */}
                {committedRemaining > 0 && (
                  <span className="ml-1.5 text-fg-warn">
                    — đã trừ {formatMoney(committedRemaining, base)} cam kết chưa ra
                  </span>
                )}
                {/* "ngày 15/31" của 11a. Số ngày CÒN LẠI một mình không nói được mình
                    đang ở đâu trong tháng, mà đó là mẫu số của mọi câu "nhanh/chậm hơn
                    nhịp" phía dưới. */}
                <span className="ml-1.5 tabular-nums text-fg-muted">
                  · ngày {pace.paceDaysElapsed}/{pace.paceDaysInMonth}
                </span>
              </p>
            )}
            {/* B36.2 · Câu RIÊNG, không phải dòng biến mất. */}
            {thieuTruocCuoiThang && (
              <p className="mt-1.5 text-sm font-medium text-money-out">
                Còn {formatMoney(totalRemaining, base)} nhưng{' '}
                {formatMoney(committedRemaining, base)} đã cam kết — thiếu{' '}
                {formatMoney(-spendable, base)} trước cuối tháng.
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
          className="mt-3 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-fg-secondary hover:bg-surface-sunken"
        >
          Chép hạn mức tháng trước
        </button>
      </Card>

      {/* KHÔNG có khối "Cần để ý" riêng nữa (B8 của gói 1a).
          Nó ghim ba dòng đang vượt/đi nhanh lên đầu, rồi khối ngay dưới — danh sách hạn
          mức — nói đủ hơn về đúng ba dòng đó (có % và cả "đã chi / trần"), nên bản bị bỏ
          là bản trên. Đo trên demo: "Đi lại vượt ¥18,750" đọc hai lần, cách nhau chưa tới
          một màn.
          ĐÍNH CHÍNH (B38.3) — lý lẽ cũ ghi ở đây là "khối dưới mở đầu bằng ĐÚNG ba dòng
          đó, vì nó sắp theo «vượt trước»". Câu đó giả định một thứ tự mà mặc định
          (`readSortMode` → 'manual') không dùng. Ba dòng ấy giờ được đánh dấu TẠI DÒNG
          bằng viền trái, ở mọi chế độ sắp xếp — xem `attentionTone`. Con số "3 / 5 mục"
          vẫn ở tiêu đề khối dưới và giờ bấm được để nhảy tới dòng đầu tiên. */}

      {/* CÒN PHẢI TRẢ (B37) — khối mà mặt này thiếu.
          Ngày cuối tháng 8, mặt lập kế hoạch của tháng 9 bày "Đã cam kết ¥141,060" với 5
          dòng có tên. Sáng ngày 1 tháng 9, `isPlanningMonth` trả false, trang đổi mặt, và
          CẢ KHỐI ĐÓ BIẾN MẤT — dù chưa một đồng nào trong ¥141,060 đã ra. Cùng một trang,
          cùng một tháng, cách nhau một ngày.
          Chỉ ở THÁNG ĐANG CHẠY: tháng đã đóng thì mọi kỳ chưa sinh giao dịch đều "quá hạn",
          và một khối đỏ về chuyện của sáu tháng trước không còn việc gì để làm với nó. */}
      {pace.isCurrentMonth && commitments.items.length > 0 && (
        <Card as="section">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <SectionTitle>Còn phải trả</SectionTitle>
            <Money
              amount={commitments.total}
              currency={base}
              className="text-sm font-semibold"
              approx={commitments.hasMissingRate}
            />
          </div>
          <Guide className="mb-2 text-sm text-fg-muted">
            Cam kết chưa sinh giao dịch trong tháng này. Đã ra rồi thì không hiện — nó nằm
            trong số đã chi ở trên.
          </Guide>

          <ul className="divide-y divide-border-subtle">
            {/* QUÁ HẠN CHƯA GHI lên trước: nhóm này là thứ mặt lập kế hoạch không thể có
                (tháng chưa xảy ra) và mặt theo dõi tới nay không có chỗ nào nói. Một khoản
                tới hạn ngày 10 mà hôm nay 18 vẫn chưa ghi thì hoặc bạn quên ghi, hoặc bạn
                quên trả — cả hai đều cần biết. */}
            {[...schedule.overdue, ...schedule.upcoming].map((it) => {
              const c = it.categoryId ? catOf(it.categoryId) : null
              const quaHan = it.dueISO < todayISO
              const soNgay = quaHan ? daysBetween(it.dueISO, todayISO) : 0
              return (
                <li key={it.key} className="py-1.5">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {quaHan && (
                        <TriangleAlert
                          className="h-3.5 w-3.5 shrink-0 text-fg-warn"
                          aria-label="quá hạn chưa ghi"
                        />
                      )}
                      <span className="min-w-0 truncate text-fg-primary">{it.title}</span>
                    </span>
                    <span className="shrink-0 text-fg-primary">
                      {it.unknownAmount ? (
                        <span className="text-sm text-fg-muted">chưa biết</span>
                      ) : (
                        <Money amount={it.amount} currency={base} />
                      )}
                    </span>
                  </div>
                  <p className={`text-2xs ${quaHan ? 'text-fg-warn' : 'text-fg-muted'}`}>
                    {it.kind === 'recurring' ? 'định kỳ' : 'sắp chi'}
                    {it.times > 1 && ` ×${it.times}`}
                    {' · '}
                    {quaHan
                      ? `tới hạn ${dayMonthLabel(it.dueISO)} — quá hạn ${soNgay} ngày, chưa ghi`
                      : dayMonthLabel(it.dueISO)}
                    {c ? ` → ${c.name}` : ' · chưa gắn danh mục'}
                  </p>
                </li>
              )
            })}
          </ul>

          {liveGaps.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {liveGaps.map((g) => {
                const line = lineOfCat.get(g.categoryId)
                const daChi = line?.spent ?? 0
                return (
                  <li key={g.categoryId}>
                    <button
                      type="button"
                      onClick={() => openEdit(g.categoryId)}
                      className="flex min-h-11 w-full items-center gap-2 rounded-md border border-state-warn-border bg-state-warn-bg px-2 py-1.5 text-left text-sm text-state-warn-fg"
                    >
                      <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1">
                        {catOf(g.categoryId)?.name ?? 'Danh mục'}: đã chi{' '}
                        {formatMoney(daChi, base)}, còn {formatMoney(g.budgeted, base)} trong
                        trần — mà còn {formatMoney(g.committed, base)} phải trả.{' '}
                        <span className="underline">
                          Nâng thêm {formatMoney(g.short, base)}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      )}

      {/* Danh mục / nhóm có hạn mức */}
      {items.length > 0 && (
        <Card as="section">
          {/* MẪU SỐ là của 11a: "3 / 5 mục có hạn mức" — trước ở tiêu đề khối "Cần để ý",
              nay gộp vào đây (B8). Riêng "3 mục cần để ý" không nói được 3 trên bao nhiêu,
              mà đó mới là thứ quyết định con số ấy đáng lo cỡ nào: 3/5 là hơn nửa ngân
              sách đang chệch, 3/20 thì không. Danh sách dưới đã sắp "vượt trước" nên ba
              mục ấy nằm ngay dòng đầu — không cần chỉ thêm chúng ở đâu. */}
          <SectionTitle className="mb-1">
            Hạn mức từng mục
            {attention.length > 0 && (
              <>
                {' · '}
                {/* B38.2 · Đếm mà không đi tới được thì con số chỉ là một lời phàn nàn.
                    Neo trong trang chứ không sắp lại danh sách: sắp lại là lấy mất cái
                    mặc định 'manual' đang có lý (xem chú thích ở `readSortMode`). */}
                <a
                  href={firstAttentionId ? `#hanmuc-${firstAttentionId}` : undefined}
                  className="font-normal tabular-nums underline"
                >
                  {attention.length} / {items.length} mục cần để ý
                </a>
              </>
            )}
          </SectionTitle>
          {attention.length > 0 && (
            <Guide className="mb-2 text-sm text-fg-muted">
              "Cần để ý" = đã quá trần, hoặc đang tiêu nhanh hơn nhịp tháng — có vạch màu ở
              đầu dòng. Khoản cố định đã trả xong (tiền nhà, bảo hiểm…) không tính, vì không
              còn gì để phanh.
            </Guide>
          )}
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
              // B38.1 · Vạch trái 2px cho dòng cần để ý, ở MỌI chế độ sắp xếp. Viền luôn có
              // mặt (trong suốt khi không cần) để dòng không nhích ngang giữa hai trạng thái
              // — nhích thì cả cột số lệch đi 10px mỗi lần một mục vượt trần.
              const mark = markClass(attentionTone.get(item.cat.id))
              const anchor = item.cat.id === firstAttentionId ? `hanmuc-${item.cat.id}` : undefined

              if (item.kind === 'leaf') {
                return (
                  <li key={item.cat.id} id={anchor} className={`py-2 first:pt-0 last:pb-0 ${mark}`}>
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
              const mismatch = capMismatchNotice(
                {
                  capped: item.capped,
                  cap: item.budgeted,
                  markerTotal: item.markerTotal,
                  named: item.children
                    .filter((k) => k.marker !== null)
                    .map((k) => ({ name: k.cat.name, marker: k.marker!.budgeted })),
                  childCount: item.children.length,
                },
                (v) => formatMoney(v, base),
              )
              return (
                <li key={item.cat.id} id={anchor} className={`py-2 first:pt-0 last:pb-0 ${mark}`}>
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
                      className="flex w-9 shrink-0 items-center justify-center rounded-md text-fg-muted hover:text-fg-primary"
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
                  {/* Mốc con chỉ chia nhỏ bên trong trần cha; cộng lại vượt trần thì nhắc.
                      Câu do capOverflow.ts dựng: nó GỌI TÊN mục con mang số đó, vì nhóm
                      có nhiều con thì một con số trơ trọi không chỉ được đứa nào. */}
                  {mismatch && (
                    <div className="ml-7 mt-1 flex flex-wrap items-center gap-2">
                      <p
                        className={`text-sm ${mismatch.kind === 'over' ? 'text-fg-warn' : 'text-fg-muted'}`}
                      >
                        {mismatch.text}
                      </p>
                      {mismatch.childCount > 0 && (
                        <ActionButton onClick={() => openSplit(item.cat.id)}>
                          Chia cho {mismatch.childCount} mục con
                        </ActionButton>
                      )}
                    </div>
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
          hằng tháng; nhãn là trần cắt ngang, dùng cho dịp/dự án. */}
      <TagBudgetsCard data={tagBudgets} base={base} />

      {/* ĐÃ XOÁ "Lịch chi tiêu" (heatmap ô vuông): cùng bộ số với thẻ "Chi từng ngày"
          nay ở trang Bản tin, và đường đọc ra đỉnh còn lịch chỉ đọc ra đậm/nhạt.
          Cột trái vì thế lại ngắn hơn cột phải — chỗ đó là chỗ trống, không phải chỗ để
          nhét lại một thẻ mô tả. */}

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
          <SectionTitle className="mb-1">
            Chưa đặt hạn mức{' '}
            <span className="font-normal tabular-nums">· {unbudgeted.length} danh mục</span>
          </SectionTitle>
          <Guide className="mb-2 text-sm text-fg-muted">
            Bấm tên nhóm để đặt trần chung, hoặc xổ ra (▸) để đặt riêng cho từng mục con — khi đó
            trần nhóm là tổng các con. Con số trên chip là trung bình {SUGGEST_MONTHS} tháng
            đã ghi.
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
                        className="-my-2 flex min-h-11 min-w-9 shrink-0 items-center justify-center rounded-md text-fg-muted hover:text-fg-primary"
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    <UnbudgetedChip cat={c} base={base} suggestions={suggestions} onClick={openEdit} />
                  </div>
                  {isOpen && children.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-2 border-l border-border-subtle pl-3">
                      {children.map((k) => (
                        <li key={k.id}>
                          <UnbudgetedChip
                            cat={k}
                            base={base}
                            suggestions={suggestions}
                            onClick={openEdit}
                          />
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

      {/* Dòng tiền tích lũy — khối khám phá, để cuối. Lịch chi tiêu đã sang cột trái
          (B10); hai thẻ này trước đây là một component chung. */}
      <CumulativeCashflowCard pace={pace} />
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
          /* B39.1 · Sheet vốn NHẬN prop này, mặt lập kế hoạch vốn truyền — chỉ mặt này là
             không, nên sửa hạn mức giữa tháng là gõ số từ trí nhớ. Đúng cái việc suggest.ts
             được viết ra để bỏ. */
          suggestion={suggestions.get(editing.categoryId) ?? null}
          onAfterWrite={syncAfterWrite}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Màn chia trần nhóm — mở từ nút "Chia cho N mục con", hoặc tự bật sau khi đặt
          hạn mức cho một danh mục có con. Trạng thái nằm ở `useSyncedBudget` của MÀN
          NÀY, không phải của sheet đặt hạn mức: sheet đó đóng ngay sau khi lưu. */}
      {splitSheetProps && <SplitGroupSheet {...splitSheetProps} />}
    </div>
  )
}
