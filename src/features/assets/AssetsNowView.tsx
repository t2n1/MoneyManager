// Chế độ "Hôm nay" của trang Tài sản — trả lời đúng một câu: "giờ tôi có bao nhiêu".
// Bản vẽ 2a. Bốn khối, đúng thứ tự này:
//
//   1. Dải KPI    — Ròng · Tổng · Phải trả (hạn chót) · Cho vay còn lại
//   2. Thẻ + Cơ cấu — hai panel cạnh nhau trên PC, xếp dọc dưới lg
//   3. Bảng tài khoản — nhóm & tài khoản, cắt lát theo mục đích/loại/tiền tệ
//   4. Dòng tỷ giá
//
// ---- Bản này đổi gì so với bản trước, và vì sao ------------------------------------
//
// Ba chỗ nói hai lần cùng một con số đã bị gộp; đó là toàn bộ nội dung của bản vẽ 2a:
//
//   · Thẻ gradient xanh "Tổng tài sản" và thẻ "Tài sản ròng" thành MỘT dải bốn ô. Thẻ
//     Ròng cũ phải in lại dòng "Tổng tài sản" bên trong để làm chiết tính — nay hai con
//     số đứng cạnh nhau nên không cần bản thứ hai. Xem KpiStrip.tsx.
//   · Biểu đồ tròn thành một VẠCH XẾP. Sổ này có lát 0,05%: trên vòng tròn nó là một sợi
//     mảnh hơn nét viền, tức hai trong bốn lát không có hình. Xem StructureBar.tsx.
//   · Khối thẻ tín dụng bỏ nút thu gọn và bỏ ba bản nhân đôi của "Kỳ này". Xem
//     CardsSection.tsx.
//
// Và một chỗ thêm vào, đúng nghĩa "không còn lỗ đen": bảng tài khoản nay có cột TỶ TRỌNG
// vẽ thành thanh thật cạnh con số %, thay vì một chữ "83%" trơ mà mắt không so được với
// "16%" ở dòng dưới.
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Guide } from '../../components/Guide'
import { Link } from 'react-router-dom'
import { ArrowUpDown, ChevronRight, GripVertical } from 'lucide-react'
import { AccountTypeIcon } from '../../components/icons'
import {
  ActionButton,
  actionButtonClass,
  Card,
  Money,
  SegmentedControl,
  Sparkline,
} from '../../components/ui'
import {
  useAccounts,
  useAssignAccountsToGroup,
  useCategories,
  useNetWorthSnapshots,
  useRangeTransactions,
  useReorderAccounts,
} from '../../hooks/queries'
import { addDaysISO, dayMonthLabel } from '../../lib/dates'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { lastReconciledMap } from '../notifications/reconciledAt'
import { accountRowStats, DELTA_DAYS } from './accountRowStats'
import { ACCOUNT_TYPE_LABELS, UNGROUPED_LABEL, type AssetAccount } from './aggregate'
import { AssetsKpi } from './AssetsKpi'
import { CardsSection } from './CardsSection'
import { groupDeltas, investmentScope } from './groupInsight'
import { makeMoneyView } from './moneyView'
import { StructureBar } from './StructureBar'
import { useAssetsData } from './useAssetsData'
import { useCardsPanel } from './useCardsPanel'
import { accountRowPnl, useInvestPnlByAccount } from './useInvestPnl'

// Bảng màu cho lát vạch cơ cấu (lặp lại nếu > 12 nhóm) — đồng bộ với ReportsPage
const PALETTE = [
  '#16a34a', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7',
]

/**
 * Bề rộng các cột của bảng tài khoản, khai MỘT lần ở đây.
 *
 * Bảng này không dùng `grid-template-columns` mà dùng flex + bề rộng cố định trên từng
 * ô. Lý do là hình dạng của dòng: cả dòng là một <Link>, nhưng ô "Đối chiếu" bên trong
 * lại chứa một <Link> khác — thẻ <a> lồng <a> là HTML không hợp lệ, trình duyệt tự tháo
 * ra và cả hai đích đều hỏng. Nên ô đó phải đứng NGOÀI <Link> của dòng, tức dòng có hai
 * cấp phần tử; một `grid` khai ở dòng thì các ô nằm trong <Link> không còn là con trực
 * tiếp của grid nên không nhận cột nào.
 *
 * rem chứ không px: Cài đặt → Cỡ chữ chỉ co giãn được cái tính theo rem, và một cột px
 * đứng yên khi chữ phóng lên là cột bị chữ tràn ra (tests/designSystem.test.ts canh).
 */
const COL = {
  drag: 'w-9',
  share: 'w-[6.5rem]',
  delta: 'w-[7.375rem]',
  spark: 'w-[3.875rem]',
  balance: 'w-[9.75rem]',
  reconcile: 'w-[6.75rem]',
} as const

/** Cách cắt lát cơ cấu tài sản: mục đích · loại tài khoản · đồng tiền. */
type GroupMode = 'purpose' | 'type' | 'currency'

const GROUP_MODES: readonly (readonly [GroupMode, string])[] = [
  ['purpose', 'Mục đích'],
  ['type', 'Loại'],
  ['currency', 'Tiền tệ'],
] as const

interface Props {
  /** Đồng tiền đang xem thử — state sống ở AssetsPage (nút ¥/₫/$ nằm ở header trang). */
  viewCur: CurrencyCode | null
}

export function AssetsNowView({ viewCur }: Props) {
  const {
    todayISO,
    isLoading,
    base,
    rates,
    balances,
    breakdown,
    debtsSummary,
    purposeGroups,
    typeGroups,
    currencyGroups,
    investmentAccounts,
  } = useAssetsData()

  // Chế độ xem cơ cấu: mục đích (asset_group) · loại tài khoản · đồng tiền
  const [groupMode, setGroupMode] = useState<GroupMode>('purpose')

  // Đồng tiền đang xem (null = theo tiền gốc, vì base tải async từ profile).
  const displayCur = viewCur ?? base
  // Bộ quy đổi dùng chung cho MỌI con số trên tab: tổng, nhóm, dòng tài khoản, thẻ.
  const mv = useMemo(
    () => makeMoneyView(base, displayCur, rates ?? {}),
    [base, displayCur, rates],
  )

  // Xu hướng tài sản ròng cho đường tí hon cạnh con số lớn. Lấy 12 mốc gần nhất — ảnh
  // chụp ghi mỗi lần mở app nên số mốc KHÔNG bằng số tháng.
  const { data: snapshots = [] } = useNetWorthSnapshots()
  const trend = useMemo(() => {
    const last = snapshots.slice(-12)
    if (last.length < 2) return null
    return last.map((s) => s.net_worth)
  }, [snapshots])

  const displayGroups =
    groupMode === 'purpose' ? purposeGroups : groupMode === 'type' ? typeGroups : currencyGroups
  // Nhãn của lát đang cắt, in trên thẻ Cơ cấu.
  const modeLabel = (GROUP_MODES.find(([m]) => m === groupMode)?.[1] ?? '').toLowerCase()
  // Kéo–thả sắp thứ tự tài khoản bật ở mọi chế độ NHÓM. Nhưng chỉ "Mục đích" cho kéo
  // XUYÊN nhóm (đổi asset_group); ở "Loại"/"Tiền tệ", kéo sang nhóm khác nghĩa là
  // đổi loại/đồng tiền tài khoản (làm trong form), nên chỉ cho sắp TRONG một nhóm.
  const dragEnabled = displayGroups.length > 0
  const allowCross = groupMode === 'purpose'

  /**
   * CHẾ ĐỘ SẮP XẾP — chỉ tồn tại dưới `lg` (§6 / bản vẽ 17a).
   *
   * 17a nói thẳng: *"Tay kéo sắp xếp tài khoản rút vào chế độ Sắp xếp riêng — 36px mỗi
   * dòng là quá đắt ở 390px."* Cổng đặt bằng CSS (`hidden lg:inline-flex`), KHÔNG bằng
   * một điểm ngắt đọc trong JS: bộ máy kéo–thả vẫn gắn ref như cũ ở mọi bề rộng, chỉ
   * cái tay cầm là biến mất. Nhờ vậy không có state nào phụ thuộc bề rộng cửa sổ.
   */
  const [sortMode, setSortMode] = useState(false)
  // Đổi chế độ nhóm thì thoát Sắp xếp: thứ tự vừa kéo thuộc lát cũ.
  useEffect(() => setSortMode(false), [groupMode])

  /**
   * Δ 30 ngày · đường tí hon · ngày đối chiếu (§4.4). Phép tính ở accountRowStats.ts.
   *
   * Một truy vấn 30 ngày, dùng chung cho MỌI dòng — không phải mỗi dòng một truy vấn.
   */
  const deltaRange = useMemo(
    () => ({ start: addDaysISO(todayISO, -DELTA_DAYS), end: addDaysISO(todayISO, 1) }),
    [todayISO],
  )
  const { data: deltaTxs = [] } = useRangeTransactions(deltaRange)
  const { data: categories = [] } = useCategories()
  const rowStats = useMemo(
    () =>
      accountRowStats({
        balanceById: new Map(balances.map((b) => [b.id, b.balance])),
        txs: deltaTxs,
        // Cột `last_reconciled_at` + giao dịch bù, lấy cái muộn hơn — cùng một hàm với
        // chuông nhắc và khối Độ tin cậy.
        lastReconciledById: lastReconciledMap(balances, deltaTxs, categories),
        todayISO,
        windowStartISO: deltaRange.start,
      }),
    [balances, deltaTxs, categories, todayISO, deltaRange.start],
  )

  // --- Kéo–thả tài khoản ngay trên trang Tài sản (trong nhóm & xuyên nhóm) ---
  const { data: allAccounts = [] } = useAccounts()
  const reorderAccounts = useReorderAccounts()
  const assign = useAssignAccountsToGroup()

  const rootRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef(new Map<string, HTMLElement>())
  const zoneRefs = useRef(new Map<string, HTMLElement>())
  const dragPointer = useRef<number | null>(null)
  const [dragAcc, setDragAcc] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<{ group: string; index: number } | null>(null)

  const accountById = useMemo(() => {
    const m = new Map<string, AssetAccount>()
    for (const g of displayGroups) for (const a of g.accounts) m.set(a.id, a)
    return m
  }, [displayGroups])

  function setRow(id: string, el: HTMLElement | null) {
    if (el) rowRefs.current.set(id, el)
    else rowRefs.current.delete(id)
  }
  function setZone(name: string, el: HTMLElement | null) {
    if (el) zoneRefs.current.set(name, el)
    else zoneRefs.current.delete(name)
  }

  function groupOf(id: string) {
    for (const g of displayGroups) if (g.accounts.some((a) => a.id === id)) return g.name
    return UNGROUPED_LABEL
  }

  // Thứ tự id hiển thị của một nhóm, đã áp xem trước khi đang kéo.
  function displayIdsOf(name: string): string[] {
    const base = (displayGroups.find((g) => g.name === name)?.accounts ?? []).map((a) => a.id)
    if (dragAcc == null) return base
    const without = base.filter((id) => id !== dragAcc)
    if (dropAt && dropAt.group === name) {
      const i = Math.min(dropAt.index, without.length)
      return [...without.slice(0, i), dragAcc, ...without.slice(i)]
    }
    return without
  }

  // Sắp lại tài khoản TRONG một nhóm: hoán vị thành viên nhóm giữa các chỗ chúng
  // đang chiếm trong thứ tự toàn cục (sort_order), giữ nguyên mọi tài khoản khác.
  function reorderAccountsInGroup(newChildIds: string[]) {
    const activeSorted = allAccounts
      .filter((a) => !a.is_archived)
      .sort((a, b) => a.sort_order - b.sort_order)
    const archivedIds = allAccounts.filter((a) => a.is_archived).map((a) => a.id)
    const member = new Set(newChildIds)
    const queue = [...newChildIds]
    const globalIds = activeSorted.map((a) => (member.has(a.id) ? queue.shift()! : a.id))
    reorderAccounts.mutate([...globalIds, ...archivedIds])
  }

  // Chuyển một tài khoản SANG nhóm khác tại vị trí `index`: đổi asset_group và chèn
  // id vào thứ tự toàn cục ngay cạnh thành viên đích, giữ nguyên mọi tài khoản khác.
  function moveAccountToGroupAt(id: string, dst: string, index: number) {
    const activeSorted = allAccounts
      .filter((a) => !a.is_archived)
      .sort((a, b) => a.sort_order - b.sort_order)
    const archivedIds = allAccounts.filter((a) => a.is_archived).map((a) => a.id)
    const base = activeSorted.map((a) => a.id).filter((x) => x !== id)
    const targetChildren = (displayGroups.find((g) => g.name === dst)?.accounts ?? [])
      .map((a) => a.id)
      .filter((x) => x !== id)
    let insertAt: number
    if (index < targetChildren.length) insertAt = base.indexOf(targetChildren[index])
    else if (targetChildren.length > 0)
      insertAt = base.indexOf(targetChildren[targetChildren.length - 1]) + 1
    else insertAt = base.length
    if (insertAt < 0) insertAt = base.length
    const globalIds = [...base]
    globalIds.splice(insertAt, 0, id)
    assign.mutate({ accountIds: [id], group: dst === UNGROUPED_LABEL ? null : dst })
    reorderAccounts.mutate([...globalIds, ...archivedIds])
  }

  function onAccPointerDown(id: string, e: ReactPointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    rootRef.current?.setPointerCapture(e.pointerId)
    dragPointer.current = e.pointerId
    const gname = groupOf(id)
    const idx = (displayGroups.find((g) => g.name === gname)?.accounts ?? []).findIndex(
      (a) => a.id === id,
    )
    setDragAcc(id)
    setDropAt({ group: gname, index: Math.max(0, idx) })
  }

  function onAccPointerMove(e: ReactPointerEvent) {
    if (dragAcc == null || e.pointerId !== dragPointer.current) return
    const x = e.clientX
    const y = e.clientY
    // Ở chế độ "Loại", không cho kéo xuyên nhóm → chỉ nhận vùng của nhóm nguồn.
    const srcGroup = groupOf(dragAcc)
    let targetGroup: string | null = null
    for (const [name, el] of zoneRefs.current) {
      if (!allowCross && name !== srcGroup) continue
      const r = el.getBoundingClientRect()
      if (y >= r.top && y <= r.bottom && x >= r.left && x <= r.right) {
        targetGroup = name
        break
      }
    }
    if (targetGroup == null) return
    const rowIds = displayIdsOf(targetGroup).filter((id) => id !== dragAcc)
    let index = rowIds.length
    for (let i = 0; i < rowIds.length; i++) {
      const el = rowRefs.current.get(rowIds[i])
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (y < r.top + r.height / 2) {
        index = i
        break
      }
    }
    setDropAt((prev) =>
      prev && prev.group === targetGroup && prev.index === index
        ? prev
        : { group: targetGroup, index },
    )
  }

  function onAccPointerEnd(e: ReactPointerEvent) {
    if (dragAcc == null) return
    if (dragPointer.current != null && e.pointerId !== dragPointer.current) return
    const id = dragAcc
    const at = dropAt
    setDragAcc(null)
    setDropAt(null)
    dragPointer.current = null
    if (!at) return
    const src = groupOf(id)
    if (at.group === src) {
      const cur = (displayGroups.find((g) => g.name === src)?.accounts ?? []).map((a) => a.id)
      const without = cur.filter((x) => x !== id)
      const j = Math.min(at.index, without.length)
      const next = [...without.slice(0, j), id, ...without.slice(j)]
      if (next.some((x, k) => x !== cur[k])) reorderAccountsInGroup(next)
    } else if (allowCross) {
      moveAccountToGroupAt(id, at.group, at.index)
    }
  }

  // Màu lát: gán theo thứ tự nhóm ĐANG HIỆN, để chấm màu ở bảng khớp lát trên vạch.
  const colorByName = useMemo(() => {
    const m = new Map<string, string>()
    let i = 0
    for (const g of displayGroups) {
      if (!g.includeInTotals || g.total <= 0) continue
      m.set(g.name, PALETTE[i % PALETTE.length])
      i++
    }
    return m
  }, [displayGroups])
  const colorOf = (name: string) => colorByName.get(name) ?? '#cbd5e1'

  // Lời/lỗ CHƯA BÁN theo từng tài khoản đầu tư — con số nhỏ cạnh tên tài khoản. Khác
  // con số "lãi đầu tư" của dải KPI (toàn đời, gồm đã bán) một cách CỐ Ý: ô KPI có chỗ
  // ghi nhãn "gồm đã bán", dòng tài khoản thì không. Xem useInvestPnl.ts.
  const danhMucTheoTk = useInvestPnlByAccount()

  // Thẻ tín dụng: công nợ, hiển thị riêng và trừ vào Tài sản ròng
  const visibleCards = breakdown.cards.filter((c) => !c.hidden)
  const cardsPanel = useCardsPanel({
    cards: visibleCards,
    balances,
    base,
    rates: rates ?? {},
    todayISO,
  })

  // Δ theo NHÓM — cột Δ ở dòng đầu mỗi nhóm. Cộng từ Δ từng tài khoản, quy đổi trước
  // khi cộng (nhóm Đầu tư của sổ này có một tài khoản VND và một tài khoản JPY).
  const nhomDelta = useMemo(
    () =>
      groupDeltas({
        groups: displayGroups,
        deltaById: new Map([...rowStats].map(([id, s]) => [id, s.delta])),
        base,
        rates: rates ?? {},
      }),
    [displayGroups, rowStats, base, rates],
  )

  // Tài khoản LOẠI đầu tư đang nằm ngoài nhóm giữ phần lớn tiền đầu tư → huy hiệu
  // "loại: đầu tư" ở dòng đó. Đây là chỗ khiến ô Hiệu quả đầu tư (cắt theo LOẠI) lệch
  // với dòng nhóm Đầu tư (cắt theo MỤC ĐÍCH); nói tại dòng thì độ lệch có chỗ giải thích.
  const scope = useMemo(
    () => investmentScope({ investmentAccounts, purposeGroups }),
    [investmentAccounts, purposeGroups],
  )
  const outsiderIds = useMemo(() => {
    if (groupMode !== 'purpose' || scope == null) return new Set<string>()
    // Bỏ huy hiệu khi TÊN NHÓM đã nói đúng cái mà huy hiệu định nói: một tài khoản loại
    // đầu tư nằm trong nhóm tên "Đầu tư" mà vẫn gắn thẻ "loại: đầu tư" là một dòng nói
    // hai lần cùng một chữ. Nó vẫn tính vào độ lệch ở ô Hiệu quả đầu tư (câu ở đó nêu
    // đủ tên và số tiền) — chỉ cái huy hiệu ở dòng là thừa.
    const tenLoai = ACCOUNT_TYPE_LABELS.investment.toLowerCase()
    return new Set(
      scope.outsiders.filter((o) => o.groupName.toLowerCase() !== tenLoai).map((o) => o.id),
    )
  }, [groupMode, scope])

  // Tài khoản là NGUỒN TRẢ của ≥2 thẻ → huy hiệu ở dòng đó. Cùng phép phân bổ với bảng
  // thẻ ngay trên (useCardsPanel), nên hai chỗ không thể nói hai con số khác nhau.
  const nguonTraTheo = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of cardsPanel.funding.groups) {
      if (g.cardCount >= 2) m.set(g.sourceId, g.cardCount)
    }
    return m
  }, [cardsPanel.funding.groups])

  // Danh sách CHỖ đang thiếu tỷ giá, dựng trước rồi mới quyết định có vẽ dòng cảnh báo
  // hay không. Cố ý không ghép chuỗi bên trong một biểu thức điều kiện: hai điều kiện
  // rời nhau thì có đúng một cách để câu ra rỗng, và cách đó chỉ lộ ra khi một nhánh
  // bật mà nhánh kia tắt.
  const thieuTyGia = [
    breakdown.hasMissingRate && 'tài sản',
    (debtsSummary.hasMissingRate || breakdown.cardHasMissingRate) && 'công nợ',
  ].filter((s): s is string => typeof s === 'string')

  return (
    <div
      ref={rootRef}
      className="flex flex-col gap-3"
      onPointerMove={onAccPointerMove}
      onPointerUp={onAccPointerEnd}
      onPointerCancel={onAccPointerEnd}
    >
      {/* MỘT dòng cảnh báo thiếu tỷ giá cho cả tab. Trước đây câu này in HAI lần, gần
          như y hệt, ở hai độ cao khác nhau — người đọc lần thứ hai không biết nó có
          phải chuyện mới không. Gộp lên đầu và nói RÕ chỗ nào đang thiếu. */}
      {thieuTyGia.length > 0 && (
        <p className="rounded-md border border-state-warn-border bg-state-warn-bg px-3 py-2 text-[0.8125rem] text-state-warn-fg">
          Chưa quy đổi được tỷ giá cho một phần {thieuTyGia.join(' và ')} — mọi tổng trên tab
          này đang thiếu phần đó.
        </p>
      )}

      <AssetsKpi
        viewCur={viewCur}
        tail="loans"
        netWorthFoot={
          trend && (
            <span className="flex items-center gap-2">
              <Sparkline values={trend} label="Tài sản ròng gần đây" />
              <span>{trend.length} mốc gần nhất</span>
            </span>
          )
        }
      />

      {/* Thẻ tín dụng và Cơ cấu đứng CẠNH nhau trên PC: cả hai đều là khối "chỉ để đọc"
          và cả hai đều ngắn, nên xếp dọc là chừa hai dải trắng bằng nửa bề ngang màn.
          Danh sách tài khoản phía dưới thì cố ý đứng một mình — phép tính vị trí thả khi
          kéo–thả giả định các dòng xếp dọc (commit 148de4f).

          KHÔNG dùng order-*: thứ tự DOM đã là thứ tự nhìn thấy, và cùng thứ tự đó phẳng
          ra thành mạch cuộn trên mobile. Muốn đổi thì CHUYỂN KHỐI — `order` đổi cái nhìn
          thấy mà không đổi thứ tự tiêu điểm (WCAG 2.4.3). */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
        <CardsSection cards={visibleCards} panel={cardsPanel} view={mv} />
        <div className="flex lg:w-[27rem] lg:shrink-0">
          <StructureBar
            groups={displayGroups}
            colorOf={colorOf}
            modeLabel={modeLabel}
            view={mv}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Bảng nhóm & tài khoản. Nút cắt lát đứng TRONG header của bảng nó dựng lại
          (Mục đích ra 5 nhóm, Loại ra 3) — bản trước nút ở thẻ Cơ cấu, tức trên PC 1280
          bấm một chỗ thì đổi một chỗ khác cách 258px. */}
      <Card
        as="section"
        elevation="panel"
        padding="none"
        className="flex flex-col overflow-hidden"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-panel px-4 py-2">
          <h2 className="text-2xs uppercase tracking-[.1em] text-fg-muted">
            Danh sách tài khoản
          </h2>
          <span className="text-2xs text-fg-muted">cắt lát theo</span>
          <SegmentedControl
            items={GROUP_MODES.map(([mode, label]) => ({ value: mode, label }))}
            value={groupMode}
            onChange={setGroupMode}
            label="Chế độ xem cơ cấu"
            size="sm"
            stretch={false}
          />
          {/* Câu hướng dẫn chỉ có nghĩa khi tay kéo đang hiện: dưới lg mà chưa bật Sắp
              xếp thì nó chỉ tới một biểu tượng không có trên màn. */}
          {dragEnabled && (
            <Guide
              as="span"
              className={`ml-auto text-2xs text-fg-muted ${sortMode ? '' : 'hidden lg:inline'}`}
            >
              Nhấn giữ <GripVertical className="inline h-3.5 w-3.5 align-text-bottom" /> để sắp
              thứ tự{allowCross ? ' hoặc kéo sang nhóm khác' : ' trong cùng một loại'}
            </Guide>
          )}
          {/* Nút vào/ra chế độ Sắp xếp — CHỈ dưới lg. Từ lg tay kéo luôn hiện nên một
              cái nút bật thứ đã bật sẵn là một nút không làm gì. */}
          {dragEnabled && (
            <ActionButton
              onClick={() => setSortMode((v) => !v)}
              aria-pressed={sortMode}
              className={`ml-auto lg:hidden ${sortMode ? 'border-accent text-fg-accent' : ''}`}
            >
              <ArrowUpDown className="h-4 w-4" strokeWidth={2} />
              {sortMode ? 'Xong' : 'Sắp xếp'}
            </ActionButton>
          )}
        </div>

        {/* Hàng tên cột — chỉ từ lg. Dưới lg dòng là hai tầng nên không có cột để đặt tên. */}
        <div className="hidden items-center border-b border-border-panel px-4 py-1.5 text-3xs font-semibold uppercase tracking-wide text-fg-muted lg:flex">
          {dragEnabled && <span className={`${COL.drag} shrink-0`} aria-hidden />}
          <span className="min-w-0 flex-1">Nhóm · tài khoản</span>
          <span className={`${COL.share} shrink-0 text-right`}>Tỷ trọng</span>
          <span className={`${COL.delta} shrink-0 text-right`}>Δ {DELTA_DAYS} ngày</span>
          <span className={`${COL.spark} shrink-0`} aria-hidden />
          <span className={`${COL.balance} shrink-0 text-right`}>Số dư</span>
          <span className={`${COL.reconcile} shrink-0 text-right`}>Đối chiếu</span>
          <span className="w-4 shrink-0" aria-hidden />
        </div>

        {displayGroups.map((g) => {
          const rowIds = dragEnabled ? displayIdsOf(g.name) : g.accounts.map((a) => a.id)
          const isDropTarget = dragEnabled && dragAcc != null && dropAt?.group === g.name
          // "Ngoài tổng" gồm CẢ hai lối vào trạng thái đó: cờ của nhóm, và ca nhóm còn
          // bật cờ nhưng mọi tài khoản bên trong đều tự tắt (total = 0 mà vẫn có tiền).
          const outsideTotals = !g.includeInTotals || (g.total === 0 && g.rawTotal !== 0)
          const gd = nhomDelta.get(g.name)
          return (
            <div
              key={g.name}
              ref={dragEnabled ? (el) => setZone(g.name, el) : undefined}
              className={isDropTarget ? 'ring-2 ring-inset ring-accent/60' : ''}
            >
              {/* Dòng đầu nhóm. Nền surface-chrome — cùng bề mặt với header nhóm trong
                  mọi bảng khác của app (§index.css). */}
              <div className="flex items-center border-b border-border-subtle bg-surface-chrome px-4 py-1.5">
                {dragEnabled && <span className={`${COL.drag} shrink-0`} aria-hidden />}
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-sm"
                    style={{ backgroundColor: colorOf(g.name) }}
                    aria-hidden
                  />
                  <span
                    className={`truncate text-sm font-semibold ${
                      outsideTotals ? 'text-fg-secondary' : 'text-fg-primary'
                    }`}
                  >
                    {g.name}
                  </span>
                  <span className="shrink-0 text-2xs text-fg-muted">
                    {g.accounts.length} tài khoản
                    {/* Dưới lg cột Tỷ trọng không có chỗ, nên tỷ trọng đi kèm số đếm.
                        Từ lg nó là một thanh thật ở cột riêng. */}
                    {!outsideTotals && g.share > 0 && (
                      <span className="lg:hidden"> · {phanTram(g.share)}</span>
                    )}
                    {outsideTotals && <span className="lg:hidden"> · ngoài tổng</span>}
                  </span>
                </span>
                <span className={`${COL.share} hidden shrink-0 items-center justify-end gap-1.5 lg:flex`}>
                  {outsideTotals ? (
                    <span className="text-2xs text-fg-muted">ngoài tổng</span>
                  ) : (
                    <>
                      <span className="block h-1 w-14 rounded-full bg-surface-sunken">
                        <span
                          className="block h-1 rounded-full"
                          style={{
                            // Sàn 2px: nhóm 0,05% mà vẽ đúng tỷ lệ thì thanh biến mất,
                            // và một nhóm CÓ tiền trông như một nhóm rỗng.
                            width: `max(2px, ${g.share * 100}%)`,
                            backgroundColor: colorOf(g.name),
                          }}
                        />
                      </span>
                      <span className="font-mono text-2xs text-fg-muted">
                        {phanTram(g.share)}
                      </span>
                    </>
                  )}
                </span>
                <span className={`${COL.delta} hidden shrink-0 justify-end text-right lg:flex`}>
                  {gd?.delta == null || gd.delta === 0 ? (
                    <span className="text-2xs text-fg-muted">—</span>
                  ) : (
                    <Money
                      amount={mv.view(Math.abs(gd.delta)).amount}
                      currency={mv.cur}
                      tone={gd.delta > 0 ? 'in' : 'out'}
                      showSign
                      approx={gd.hasMissingRate || mv.converted}
                      className="text-2xs"
                    />
                  )}
                </span>
                <span className={`${COL.spark} hidden shrink-0 lg:block`} aria-hidden />
                <span className={`${COL.balance} shrink-0 text-right`}>
                  {/* Nhóm ĐỨNG NGOÀI TỔNG in TIỀN GỐC, không in bản quy đổi. `rawTotal`
                      coi tài khoản thiếu tỷ giá là 0, nên một nhóm VND sẽ in "¥0" ngay
                      cạnh những dòng đang nói ₫199.554.545 — và cái sai là con số quy
                      đổi, không phải cái delta. */}
                  {!outsideTotals ? (
                    <Money
                      {...mv.view(g.total)}
                      approx={mv.view(g.total).approx || g.hasMissingRate}
                      className="text-sm font-bold"
                    />
                  ) : (
                    <span className="font-mono text-sm font-medium text-fg-muted">
                      {tienGocNhom(g.nativeTotals, () =>
                        mv.fmt(g.rawTotal, undefined, g.rawHasMissingRate),
                      )}
                    </span>
                  )}
                </span>
                <span className={`${COL.reconcile} hidden shrink-0 lg:block`} aria-hidden />
                <span className="w-4 shrink-0" aria-hidden />
              </div>

              {rowIds.map((id) => {
                const a = accountById.get(id) ?? g.accounts.find((x) => x.id === id)
                if (!a) return null
                const isDragging = dragEnabled && id === dragAcc
                const rowPnl = accountRowPnl(a, danhMucTheoTk.get(a.id))
                const stat = rowStats.get(a.id)
                const theCount = nguonTraTheo.get(a.id)
                // Đối chiếu — dựng MỘT lần, dùng ở cả hai tầng (tầng một từ lg, tầng hai
                // dưới lg). Hai bản chép tay của cùng cái nút là cách chắc chắn nhất để
                // desktop và mobile lệch nhãn sau vài lượt sửa.
                const reconcileBtn = stat?.stale ? (
                  // <Link> chứ không <button> vì nó điều hướng — giữ được mở-tab-mới và
                  // chuột giữa. actionButtonClass() chứ không viết tay: <Link> là thẻ <a>
                  // nên không dùng được <ActionButton>.
                  //
                  // Nhãn NGẮN, lý do để ở aria-label: nút chỉ hiện khi quá hạn nên "quá 30
                  // ngày" là thừa với người nhìn thấy nó — mà ở ca xấu nhất (người dùng
                  // mới) thì MỌI dòng đều có nút, và sáu lần một câu dài là sáu lần nhắc
                  // cùng một điều. Trình đọc màn hình vẫn nghe đủ.
                  <Link
                    to={`/assets/account/${a.id}?doi-chieu=1`}
                    className={actionButtonClass(
                      'outline',
                      'min-h-8 border-state-warn-border text-state-warn-fg',
                    )}
                    aria-label={`Đối chiếu ${a.name} — quá ${DELTA_DAYS} ngày chưa đối chiếu`}
                  >
                    Đối chiếu
                  </Link>
                ) : stat?.lastReconciledISO ? (
                  <span className="font-mono text-3xs text-fg-muted">
                    {dayMonthLabel(stat.lastReconciledISO)}
                  </span>
                ) : null
                return (
                  <div
                    key={id}
                    ref={dragEnabled ? (el) => setRow(id, el) : undefined}
                    // flex-col: dòng có HAI TẦNG dưới lg (17a). Tầng dưới mang Δ và tình
                    // trạng đối chiếu; từ lg cả hai đã có cột riêng nên tầng hai tắt.
                    //
                    // `lg:pl-4` — lề trái của DÒNG, không phải của <Link> bên trong. Đo
                    // được trên 1440: không có nó thì tay kéo dính mép panel và mọi cột
                    // của dòng tài khoản lệch 16px so với hàng tên cột (hàng đó và dòng
                    // đầu nhóm đều `px-4`). Dưới lg lề vẫn do <Link> gánh như cũ, vì ở đó
                    // <Link> là phần tử đầu tiên của dòng khi chưa bật Sắp xếp.
                    className={`flex flex-col border-b border-border-subtle lg:pl-4 ${
                      isDragging ? 'bg-accent-muted-bg' : ''
                    }`}
                  >
                    <div className="flex items-center">
                      {dragEnabled && (
                        <button
                          type="button"
                          onPointerDown={(e) => onAccPointerDown(id, e)}
                          style={{ touchAction: 'none' }}
                          // Dưới lg: chỉ hiện trong chế độ Sắp xếp (17a — xem `sortMode`).
                          // Từ lg: luôn hiện, 36px trên màn 1440 không đáng kể.
                          className={`${
                            sortMode ? 'inline-flex' : 'hidden lg:inline-flex'
                          } ${COL.drag} min-h-11 shrink-0 cursor-grab touch-none items-center justify-center text-fg-disabled active:cursor-grabbing`}
                          aria-label={`Kéo để sắp thứ tự hoặc chuyển nhóm ${a.name}`}
                        >
                          <GripVertical className="h-4 w-4" />
                        </button>
                      )}
                      <Link
                        to={`/assets/account/${a.id}`}
                        // Lề trái phải đi CÙNG cái tay kéo: tay kéo ẩn mà vẫn chừa lề thì
                        // dòng thụt vào không vì cái gì. pr-0: lề phải do ChevronRight bên
                        // ngoài gánh (nó là phần tử cuối kể từ khi ô Đối chiếu chen vào).
                        // `lg:gap-0` — KHÔNG phải chuyện thẩm mỹ. Bốn ô bên phải (tỷ
                        // trọng · Δ · đường tí hon · số dư) là bề rộng CỐ ĐỊNH neo phải,
                        // còn hàng tên cột không có gap nào; mỗi khoảng 8px giữa các con
                        // của <Link> đẩy cả bốn ô đó lệch trái so với tên cột (đo được
                        // 24px ở ô tỷ trọng). Dưới lg giữ `gap-2` vì ở đó dòng chỉ có
                        // biểu tượng · tên · số dư, không có cột nào để canh.
                        className={`flex min-w-0 flex-1 items-center gap-2 py-2 transition hover:bg-surface-sunken lg:gap-0 ${
                          dragEnabled ? (sortMode ? 'pl-0' : 'pl-4 lg:pl-0') : 'pl-4'
                        }`}
                      >
                        <AccountTypeIcon type={a.type} className="h-4 w-4 shrink-0 lg:mr-2" />
                        <span className="min-w-0 flex-1 truncate text-sm text-fg-secondary">
                          {a.name}
                          <span className="ml-1 text-2xs text-fg-muted">{a.currency}</span>
                          {!a.includeInTotals && (
                            <span className="ml-1 text-3xs text-fg-muted">(ngoài tổng)</span>
                          )}
                          {rowPnl !== null && (
                            <span
                              className={`ml-1 font-mono text-3xs ${
                                rowPnl > 0 ? 'text-money-in' : 'text-money-out'
                              }`}
                            >
                              {rowPnl > 0 ? '▲' : '▼'}
                              {mv.fmt(Math.abs(rowPnl), a.currency)}
                            </span>
                          )}
                          {/* Hai huy hiệu giải thích, cả hai đều do SỐ quyết định:
                              · "nguồn trả N thẻ" — tài khoản này là nơi tiền thẻ rời đi,
                                nên số dư của nó không tự do như con số đang hiện;
                              · "loại: đầu tư" — tài khoản loại đầu tư nằm ngoài nhóm giữ
                                phần lớn tiền đầu tư, tức đây là chỗ ô Hiệu quả đầu tư
                                (cắt theo LOẠI) lệch với dòng nhóm (cắt theo MỤC ĐÍCH). */}
                          {theCount != null && (
                            <span className="ml-1.5 whitespace-nowrap rounded-full border border-state-warn-border px-1.5 text-3xs text-state-warn-fg">
                              nguồn trả {theCount} thẻ
                            </span>
                          )}
                          {outsiderIds.has(a.id) && (
                            <span className="ml-1.5 whitespace-nowrap rounded-full border border-border-strong px-1.5 text-3xs text-fg-muted">
                              loại: {ACCOUNT_TYPE_LABELS[a.type].toLowerCase()}
                            </span>
                          )}
                        </span>
                        {/* Cột Tỷ trọng trống ở dòng tài khoản: tỷ trọng là chuyện của
                            NHÓM. In tỷ trọng từng tài khoản trong tổng là thêm chín con
                            số mà không ai so chúng với nhau. */}
                        <span className={`${COL.share} hidden shrink-0 lg:block`} aria-hidden />
                        {stat && (
                          <span
                            className={`${COL.delta} hidden shrink-0 justify-end text-right sm:flex`}
                          >
                            {stat.delta === 0 ? (
                              <span className="text-2xs text-fg-muted">—</span>
                            ) : (
                              <Money
                                {...mv.view(Math.abs(stat.delta), a.currency)}
                                tone={stat.delta > 0 ? 'in' : 'out'}
                                showSign
                                className="text-2xs"
                              />
                            )}
                          </span>
                        )}
                        {stat && (
                          <span
                            className={`${COL.spark} hidden shrink-0 items-center justify-center sm:flex`}
                          >
                            <Sparkline
                              values={stat.spark}
                              label={`Số dư ${a.name} 30 ngày qua`}
                            />
                          </span>
                        )}
                        {/* Dưới lg cột số dư co theo nội dung (dòng chỉ có tên + số dư);
                            từ lg nó nhận đúng bề rộng cột của bảng. Viết THẲNG cả hai
                            lớp chứ không ghép chuỗi từ COL: Tailwind quét class tĩnh
                            trong nguồn, một tên lớp dựng bằng template literal sẽ không
                            được sinh ra CSS. */}
                        <span className="shrink-0 text-right lg:w-[9.75rem]">
                          <Money
                            {...mv.view(a.value, a.currency)}
                            tone={a.value < 0 ? 'out' : 'neutral'}
                            className="text-sm font-medium"
                          />
                        </span>
                      </Link>
                      {/* Ô ĐỐI CHIẾU của tầng một — CHỈ từ lg. Dưới lg nó ở tầng hai cùng
                          Δ; từ lg tầng hai biến mất nên phải có chỗ này, nếu không nút
                          "Đối chiếu" mất hẳn trên desktop.

                          Đứng NGOÀI <Link> vì nó chứa một <Link> khác — thẻ <a> lồng <a>
                          là HTML không hợp lệ, trình duyệt tự tháo ra và cả hai đích đều
                          hỏng. Cùng lý do đó ChevronRight cũng ra ngoài: nó phải đứng
                          cuối cùng bên phải, mà chèn ô này vào giữa thì thứ tự đọc thành
                          "số dư → chevron → nút", tức mũi chevron trỏ vào một cái nút
                          không phải đích của nó. */}
                      <span
                        className={`${COL.reconcile} hidden shrink-0 items-center justify-end lg:flex`}
                      >
                        {reconcileBtn}
                      </span>
                      {/* `mr-4` = đúng cái `pr-4` mà <Link> nhả ra: lề phải của dòng
                          không đổi, chỉ đổi phần tử nào gánh nó. */}
                      <ChevronRight className="mr-4 h-4 w-4 shrink-0 text-fg-disabled" />
                    </div>

                    {/* TẦNG HAI. Chỉ dựng khi có gì để nói — một dòng rỗng dưới mỗi tài
                        khoản là 20px × N tiêu cho không khí. */}
                    {stat && (stat.stale || stat.delta !== 0) && (
                      <div
                        // `lg:hidden`: từ lg mọi thứ ở đây đã có cột riêng ở tầng một.
                        // Giữ tầng hai ở desktop là dòng tài khoản cao ~100px, tức 8 tài
                        // khoản dài gấp đôi mức 12b chốt: một dòng một tài khoản.
                        className={`flex items-center gap-2 pb-2 text-3xs text-fg-muted lg:hidden ${
                          dragEnabled ? (sortMode ? 'pl-9 pr-4' : 'px-4') : 'px-4'
                        }`}
                      >
                        {/* Δ chỉ ở mobile: từ sm nó đã đứng thành cột riêng ở tầng trên,
                            in lại là nói hai lần cùng một con số trên cùng một dòng. */}
                        {stat.delta !== 0 && (
                          <span className="sm:hidden">
                            <Money
                              {...mv.view(Math.abs(stat.delta), a.currency)}
                              tone={stat.delta > 0 ? 'in' : 'out'}
                              showSign
                              className="text-3xs"
                            />{' '}
                            / {DELTA_DAYS} ngày
                          </span>
                        )}
                        {reconcileBtn && (
                          <span className="ml-auto flex items-center gap-1">
                            {!stat.stale && 'đối chiếu '}
                            {reconcileBtn}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {dragEnabled && allowCross && rowIds.length === 0 && dragAcc != null && (
                <p className="border-b border-border-subtle px-4 py-3 text-center text-xs text-fg-muted">
                  Thả vào đây để chuyển sang nhóm này
                </p>
              )}
            </div>
          )
        })}
      </Card>

      {(breakdown.hasForeign || mv.converted) && rates && (
        <p className="text-center text-2xs text-fg-muted">
          Tỷ giá ¥1 ≈ {rates.VND?.toFixed(2)} ₫ · $1 ≈ ¥
          {rates.USD ? (1 / rates.USD).toFixed(1) : '?'}{' '}
          <Guide as="span">(open.er-api.com, cache 12h)</Guide>
        </p>
      )}
    </div>
  )
}

/** 83% · 1,9% · 0,05% — giữ chữ số có nghĩa đầu tiên thay vì làm tròn một nhóm về 0. */
function phanTram(share: number): string {
  const pct = share * 100
  if (pct >= 10) return `${Math.round(pct)}%`
  if (pct >= 1) return `${pct.toFixed(1).replace('.', ',')}%`
  return `${pct.toFixed(2).replace('.', ',')}%`
}

/**
 * Tiền gốc của nhóm ngoài tổng. Nhóm nhiều loại tiền thì in từng loại: cộng chúng lại
 * cần tỷ giá, mà nếu có tỷ giá thì nhóm này đã không đứng ngoài tổng.
 */
function tienGocNhom(
  nativeTotals: { currency: CurrencyCode; amount: number }[],
  fallback: () => string,
): string {
  if (nativeTotals.length === 0) return fallback()
  const head = nativeTotals
    .slice(0, 2)
    .map((n) => formatMoney(n.amount, n.currency))
    .join(' · ')
  return nativeTotals.length > 2 ? `${head} +${nativeTotals.length - 2} loại tiền` : head
}
