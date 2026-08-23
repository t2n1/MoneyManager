// Tab con "Hiện tại" của Tài sản — trả lời đúng một câu: "giờ tôi có bao nhiêu".
// Tổng tài sản · Thẻ tín dụng đến hạn · Tài sản ròng · Cơ cấu · danh sách nhóm/tài khoản.
// Thẻ đứng thứ hai vì đó là khối duy nhất có hạn chót; xem tests/assetsLayout.test.ts.
//
// Trước đây file này là cả trang Tài sản 780 dòng, gánh thêm hai câu hỏi khác ("tôi đang
// tiến bộ không" và "sau này thế nào") trong cùng một mạch cuộn. Hai câu đó nay là
// AssetsTrendView và LifetimeView. Xem docs/information-architecture.md §2.3.
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Guide } from '../../components/Guide'
import { Link } from 'react-router-dom'
import { ArrowUpDown, ChevronRight, GripVertical } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { AccountTypeIcon } from '../../components/icons'
import { ActionButton, actionButtonClass, SegmentedControl, Sparkline } from '../../components/ui'
import {
  useAccounts,
  useAssignAccountsToGroup,
  useCategories,
  useNetWorthSnapshots,
  useRangeTransactions,
  useReorderAccounts,
} from '../../hooks/queries'
import { addDaysISO, dayMonthLabel } from '../../lib/dates'
import { CURRENCIES, formatMoney, type CurrencyCode } from '../../lib/money'
import { lastReconciledMap } from '../notifications/reconciledAt'
import { accountRowStats, DELTA_DAYS } from './accountRowStats'
import { UNGROUPED_LABEL, type AssetAccount } from './aggregate'
import { CardsSection } from './CardsSection'
import { CurrencyViewToggle } from './CurrencyViewToggle'
import { makeMoneyView } from './moneyView'
import { useAssetsData } from './useAssetsData'
import { accountRowPnl, useInvestPnlByAccount } from './useInvestPnl'

// Bảng màu cho lát bánh (lặp lại nếu > 12 nhóm) — đồng bộ với ReportsPage
const PALETTE = [
  '#16a34a', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7',
]

/** Cách cắt lát cơ cấu tài sản: mục đích · loại tài khoản · đồng tiền. */
type GroupMode = 'purpose' | 'type' | 'currency'

const GROUP_MODES: readonly (readonly [GroupMode, string])[] = [
  ['purpose', 'Mục đích'],
  ['type', 'Loại'],
  ['currency', 'Tiền tệ'],
] as const

const GROUP_NOUN: Record<GroupMode, string> = {
  purpose: 'nhóm',
  type: 'loại',
  currency: 'loại tiền',
}

interface Props {
  /** "Xem thử bằng tiền khác" — state sống ở AssetsPage, dùng chung với tab Diễn biến. */
  viewCur: CurrencyCode | null
  onViewCurChange: (c: CurrencyCode | null) => void
}

export function AssetsNowView({ viewCur, onViewCurChange }: Props) {
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
    netWorth,
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
  // chụp ghi mỗi lần mở app nên số mốc KHÔNG bằng số tháng; vì vậy nhãn ghi "12 mốc",
  // không ghi "12 tháng".
  const { data: snapshots = [] } = useNetWorthSnapshots()
  const trend = useMemo(() => {
    const last = snapshots.slice(-12)
    if (last.length < 2) return null
    const values = last.map((s) => s.net_worth)
    const first = values[0]
    // Mốc đầu bằng 0 (hoặc âm) thì phần trăm vô nghĩa — bỏ hẳn con số delta, đường vẫn vẽ.
    if (first <= 0) return { values, deltaPct: 0, hasDelta: false }
    const deltaPct = Math.round(((values[values.length - 1] - first) / first) * 100)
    return { values, deltaPct, hasDelta: true }
  }, [snapshots])

  const displayGroups =
    groupMode === 'purpose' ? purposeGroups : groupMode === 'type' ? typeGroups : currencyGroups
  // Nhãn của lát đang cắt, in trên thẻ Cơ cấu vì nút chọn lát nay nằm dưới danh sách.
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
   * dòng là quá đắt ở 390px."* Đo lại đúng như vậy: sáu dòng, mỗi dòng một tay kéo rộng
   * đúng 36px, tức 9% bề ngang màn tiêu vĩnh viễn cho một thao tác hiếm — trong khi cột
   * số tiền bên phải mới là thứ người ta mở màn này để đọc.
   *
   * Cổng đặt bằng CSS (`hidden lg:inline-flex`), KHÔNG bằng một điểm ngắt đọc trong JS:
   * bộ máy kéo–thả vẫn gắn ref như cũ ở mọi bề rộng, chỉ cái tay cầm là biến mất. Nhờ
   * vậy không có state nào phụ thuộc bề rộng cửa sổ, không phải nghe `resize`, và không
   * có nhịp render đầu tiên đoán sai bề rộng rồi nhảy layout.
   */
  const [sortMode, setSortMode] = useState(false)
  // Đổi chế độ nhóm thì thoát Sắp xếp: thứ tự vừa kéo thuộc lát cũ, giữ nguyên trạng
  // thái là mời người dùng kéo tiếp trên một danh sách đã khác.
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
        // chuông nhắc và khối Độ tin cậy, để nút ở dòng không nói ngược với hai chỗ kia.
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

  // Biểu đồ tròn = cơ cấu của Tổng tài sản → chỉ nhóm được tính vào tổng
  const pieData = displayGroups
    .filter((g) => g.includeInTotals && g.total > 0)
    .map((g, i) => ({
      name: g.name,
      value: g.total,
      color: PALETTE[i % PALETTE.length],
    }))

  // Màu theo tên nhóm để chấm tròn trong danh sách khớp với lát bánh
  const colorOf = (name: string) =>
    pieData.find((d) => d.name === name)?.color ?? '#cbd5e1'

  // Đếm tài khoản / nhóm ở khối Tổng tài sản luôn theo mục đích (mô tả toàn cảnh, không đổi theo chart)
  const accountCount = purposeGroups.reduce((n, g) => n + g.accounts.length, 0)
  // Đầu tư: có snapshot giá trị thị trường nào không → hiện dòng lãi/lỗ (gồm đã bán)
  const hasValuation = breakdown.groups.some((g) =>
    g.accounts.some((a) => a.marketValue != null),
  )
  const pnl = breakdown.totalPnl
  // Lời/lỗ CHƯA BÁN theo từng tài khoản đầu tư — con số nhỏ cạnh tên tài khoản. Khác
  // `pnl` ngay trên (toàn đời, gồm đã bán) một cách CỐ Ý: khối xanh có chỗ để ghi nhãn
  // "gồm đã bán", dòng tài khoản thì không, nên dòng phải in đúng con số mà trang chi
  // tiết của chính tài khoản đó in. Xem useInvestPnl.ts.
  const danhMucTheoTk = useInvestPnlByAccount()

  // Thẻ tín dụng: công nợ, hiển thị riêng và trừ vào Tài sản ròng
  const visibleCards = breakdown.cards.filter((c) => !c.hidden)
  const cardOwed = -breakdown.cardDebt // số dương = đang nợ thẻ (quy đổi base)
  const showNetWorth = debtsSummary.hasOpen || visibleCards.length > 0
  // Cờ ước chừng sẵn có của số ròng (chưa tính chuyện xem thử bằng tiền khác —
  // mv.fmt tự cộng thêm ≈ khi có quy đổi)
  const netApprox =
    breakdown.hasForeign || debtsSummary.hasMissingRate || breakdown.cardHasMissingRate

  // Danh sách CHỖ đang thiếu tỷ giá, dựng trước rồi mới quyết định có vẽ dòng cảnh báo
  // hay không. Cố ý không viết `A || B && (…)` rồi ghép chuỗi bên trong: hai điều kiện
  // rời nhau thì có đúng một cách để câu ra rỗng ("…cho một phần  — mọi tổng…"), và
  // cách đó chỉ lộ ra khi một nhánh bật mà nhánh kia tắt.
  const thieuTyGia = [
    breakdown.hasMissingRate && 'tài sản',
    (debtsSummary.hasMissingRate || breakdown.cardHasMissingRate) && 'công nợ',
  ].filter((s): s is string => typeof s === 'string')

  return (
    <div
      ref={rootRef}
      className="flex flex-col gap-4"
      onPointerMove={onAccPointerMove}
      onPointerUp={onAccPointerEnd}
      onPointerCancel={onAccPointerEnd}
    >
      {/* MỘT dòng cảnh báo thiếu tỷ giá cho cả tab (12a của bản 1a: "giữ nguyên khung số
          hiện tại, chỉ gộp cảnh báo").
          Trước đây câu này in HAI lần, gần như y hệt nhau, ở hai độ cao khác nhau: một
          trong thẻ Tổng tài sản (nền gradient) và một trong thẻ Tài sản ròng cách đó cả
          màn hình. Người dùng đọc lần thứ hai không biết nó có phải chuyện mới không.
          Gộp lên đầu và nói RÕ chỗ nào đang thiếu, thay vì lặp lại chữ "có thể thiếu".

          Vì sao KHÔNG làm 12b ("Tiêu được ngay") ở PR này: §4.4 đặt điều kiện phải có cờ
          *tài khoản dùng hằng ngày* và nợ phải có ngày đến hạn. App chỉ có `asset_group`
          — một chuỗi TÊN NHÓM người dùng tự gõ — và `debts.due_on` thì nullable. Suy
          "tài khoản dùng hằng ngày" từ một cái tên nhóm chính là "đoán" mà R1 cấm, và
          đoán hụt một khoản đã có chủ là app khuyến khích tiêu quá tay. */}
      {thieuTyGia.length > 0 && (
        <p className="rounded-md border border-state-warn-border bg-state-warn-bg px-3 py-2 text-[0.8125rem] text-state-warn-fg">
          Chưa quy đổi được tỷ giá cho một phần {thieuTyGia.join(' và ')} — mọi tổng trên tab
          này đang thiếu phần đó.
        </p>
      )}

      {/* Lưới hai cột trên PC cho các khối CHỈ ĐỂ ĐỌC ở đầu trang. Danh sách nhóm tài
          khoản phía dưới cố ý ĐỨNG NGOÀI lưới: nó kéo–thả để sắp thứ tự, mà phép tính
          vị trí thả giả định các dòng xếp dọc — chia hai cột là thả sai chỗ.
          `lg:items-start` để thẻ ngắn không bị kéo cao bằng thẻ dài bên cạnh.

          KHÔNG dùng order-*: lưới xếp theo HÀNG nên thứ tự DOM đã là thứ tự nhìn thấy,
          và cùng một thứ tự đó phẳng ra thành mạch cuộn trên mobile. Muốn đổi thì
          CHUYỂN KHỐI — `order` đổi cái nhìn thấy mà không đổi thứ tự tiêu điểm
          (WCAG 2.4.3). Thứ tự ở đây làm ra cặp `Tổng | Thẻ` rồi `Ròng | Cơ cấu`;
          tests/assetsLayout.test.ts canh cả thứ tự lẫn lý do. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3">
        {/* Tổng tài sản.
            Chữ phụ trên thẻ này dùng text-green-50 TRƠN, không alpha: nền là gradient
            green-700→emerald-800 nên chặng sáng nhất (green-700) mới là chặng phải đo.
            green-50 trên đó = 4,72:1; từng là /90 (4,14:1) và /80 (3,58:1) — cả hai trượt
            AA. Muốn nhạt hơn thì đổi sắc độ chứ đừng hạ độ mờ. */}
        <section className="rounded-2xl bg-gradient-to-br from-green-700 to-emerald-800 p-5 text-white shadow-md">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-green-50">
              Tổng tài sản · {CURRENCIES[displayCur].label}
            </p>
            {/* Xem thử bằng tiền khác — đổi mọi con số của tab này VÀ tab Diễn biến.
                Không phải đổi base thật: chỉ ước chừng theo tỷ giá cache, có ≈ đi kèm. */}
            <CurrencyViewToggle
              base={base}
              rates={rates}
              value={displayCur}
              onChange={onViewCurChange}
              variant="onGreen"
            />
          </div>
          <p className="mt-1.5 text-[2rem] font-bold leading-none tracking-tight tabular-nums">
            {isLoading ? '…' : mv.fmt(breakdown.total, base, breakdown.hasForeign)}
          </p>
          {!isLoading && (
            <p className="mt-2.5 text-xs text-green-50">
              {accountCount} tài khoản · {purposeGroups.length} nhóm
            </p>
          )}
          {!isLoading && hasValuation && (
            <p className="mt-2 text-xs text-green-50">
              Lãi/lỗ đầu tư (gồm đã bán):{' '}
              <span className="font-semibold tabular-nums text-white">
                {pnl >= 0 ? '+' : '−'}
                {mv.fmt(Math.abs(pnl), base, breakdown.pnlHasMissingRate)}
              </span>
            </p>
          )}
        </section>
  
        {/* Thẻ tín dụng — khối DUY NHẤT trên trang có hạn chót ("còn N ngày", "cần
            nạp thêm"), nên đứng ngay dưới con số tổng, trên mọi khối chỉ để đọc.
            Trước đây nó đứng thứ 4, sau cặp "Tài sản ròng" + "Tài sản ròng theo thời
            gian" mà commit 9276051 cố ý đặt liền nhau. Cặp đó tan khi aa74931 chuyển
            NetWorthHistorySection sang tab Diễn biến, nhưng thứ tự thì ở lại.
            Thu gọn mặc định, xem CardsSection. */}
        <CardsSection
          cards={visibleCards}
          balances={balances}
          base={base}
          rates={rates ?? {}}
          todayISO={todayISO}
          view={mv}
        />

        {/* Tài sản ròng (hiện khi có khoản nợ mở hoặc có thẻ tín dụng) */}
        {showNetWorth && (
          <section className="rounded-2xl bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-fg-secondary">Tài sản ròng</span>
              <Link to="/debts" className="-my-2 inline-flex items-center gap-0.5 py-2 text-xs font-medium text-fg-accent">
                Nợ / cho vay <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            {/* Số lớn + đường xu hướng tí hon ngay cạnh, theo cách permtrack nhét đồ thị
                nhỏ vào cùng dòng với con số: nhìn một cái là biết đang lên hay xuống mà
                không phải mở tab "Diễn biến". */}
            <div className="mt-1 flex items-end justify-between gap-3">
              <p className="text-2xl font-bold tabular-nums text-fg-primary">
                {mv.fmt(netWorth, base, netApprox)}
              </p>
              {trend && (
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <Sparkline values={trend.values} label="Tài sản ròng gần đây" />
                  {/* Không tabular-nums: đây là một nhãn ngắn đứng một mình, không phải
                      cột số cần thẳng hàng giữa các dòng. */}
                  <span className="text-2xs text-fg-muted">
                    {trend.hasDelta && `${trend.deltaPct > 0 ? '+' : ''}${trend.deltaPct}% · `}
                    {trend.values.length} mốc gần nhất
                  </span>
                </div>
              )}
            </div>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex items-center justify-between text-fg-muted">
                <span>Tổng tài sản</span>
                <span className="tabular-nums">{mv.fmt(breakdown.total)}</span>
              </div>
              {debtsSummary.owedToMe > 0 && (
                <div className="flex items-center justify-between text-money-in">
                  <span>+ Cho vay còn lại</span>
                  <span className="tabular-nums">{mv.fmt(debtsSummary.owedToMe)}</span>
                </div>
              )}
              {debtsSummary.iOwe > 0 && (
                <div className="flex items-center justify-between text-money-out">
                  <span>− Nợ phải trả</span>
                  <span className="tabular-nums">{mv.fmt(debtsSummary.iOwe)}</span>
                </div>
              )}
              {cardOwed > 0 && (
                <div className="flex items-center justify-between text-money-out">
                  <span>− Nợ thẻ tín dụng</span>
                  <span className="tabular-nums">{mv.fmt(cardOwed)}</span>
                </div>
              )}
            </div>
          </section>
        )}
  
        {/* Biểu đồ tròn + danh sách nhóm */}
        <section className="rounded-2xl bg-surface p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Cơ cấu tài sản
            </h2>
            {/* Nút cắt lát xuống dưới, cạnh danh sách nó dựng lại; ở đây chỉ ghi lát
                đang cắt, để cái bánh không đổi số phần mà không nói vì sao. */}
            <span className="shrink-0 text-xs text-fg-muted">theo {modeLabel}</span>
          </div>
  
          {pieData.length === 0 ? (
            <p className="py-10 text-center text-sm text-fg-muted">
              {isLoading ? 'Đang tải…' : 'Chưa có tài sản để hiển thị'}
            </p>
          ) : (
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
              <div className="relative h-44 w-44 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      /* Bán kính theo PHẦN TRĂM chứ không px cứng: khung `h-44 w-44`
                         là 11rem, mà 1rem = 16px × --app-font-scale (Cài đặt → Cỡ chữ).
                         Ở cỡ "Nhỏ" (0,9) khung chỉ còn 158px trong khi bán kính cứng 82
                         vẽ ra đường tròn 164px — <svg> có overflow:hidden nên nó cắt phẳng
                         bốn cạnh vòng tròn. Phần trăm tính theo cạnh ngắn của khung nên
                         vòng tròn luôn vừa khít ở mọi cỡ chữ. 66% giữ đúng độ dày cũ (54/82). */
                      innerRadius="66%"
                      outerRadius="100%"
                      paddingAngle={pieData.length > 1 ? 2 : 0}
                      strokeWidth={0}
                    >
                      {pieData.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => mv.fmt(Number(v))}
                      contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold leading-none text-fg-primary">
                    {pieData.length}
                  </span>
                  <span className="mt-0.5 text-2xs text-fg-muted">
                    {GROUP_NOUN[groupMode]}
                  </span>
                </div>
              </div>
  
              {/* Chú giải chỉ giữ chấm màu + tên, đủ để đọc được lát bánh. Tổng tiền
                  và tỷ trọng nằm ở danh sách chi tiết ngay bên dưới — in hai lần thì
                  người đọc phải rà cùng bốn con số hai lượt mà không thêm thông tin. */}
              <ul className="flex flex-1 flex-wrap justify-center gap-x-4 gap-y-2 self-center sm:justify-start">
                {displayGroups.map((g) => (
                  <li key={g.name} className="flex items-center gap-1.5 text-xs">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colorOf(g.name) }}
                    />
                    <span className="font-medium text-fg-secondary">{g.name}</span>
                    {!g.includeInTotals && (
                      <span className="text-3xs font-normal text-fg-muted">
                        (ngoài tổng)
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* Chi tiết từng nhóm và tài khoản bên trong.

          Nút cắt lát đứng ở ĐÂY chứ không trong thẻ "Cơ cấu tài sản", tuy nó đổi cả
          hai: nó dựng lại cả danh sách dưới này (Mục đích ra 5 khối, Loại ra 3), mà
          danh sách thì cố ý đứng NGOÀI lưới hai cột — phép tính vị trí thả khi kéo–thả
          giả định các dòng xếp dọc (commit 148de4f). Để nút trong thẻ Cơ cấu thì trên
          PC 1280 nó ở cột phải y=420 còn thứ nó dựng lại bắt đầu ở y=678 chiếm hết bề
          ngang: bấm một chỗ, đổi một chỗ khác cách 258px. Đặt xuống đây thì trên CẢ HAI
          khổ nó vừa dính đáy thẻ Cơ cấu vừa dính đầu danh sách. */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          Danh sách tài khoản
        </h2>
        <SegmentedControl
          items={GROUP_MODES.map(([mode, label]) => ({ value: mode, label }))}
          value={groupMode}
          onChange={setGroupMode}
          label="Chế độ xem cơ cấu"
          size="sm"
          stretch={false}
        />
      </div>
      {/* Nút vào/ra chế độ Sắp xếp — CHỈ dưới lg. Từ lg tay kéo luôn hiện nên một cái
          nút bật thứ đã bật sẵn là một nút không làm gì. */}
      {dragEnabled && (
        <div className="flex justify-end lg:hidden">
          <ActionButton
            onClick={() => setSortMode((v) => !v)}
            aria-pressed={sortMode}
            className={sortMode ? 'border-accent text-fg-accent' : ''}
          >
            <ArrowUpDown className="h-4 w-4" strokeWidth={2} />
            {sortMode ? 'Xong' : 'Sắp xếp'}
          </ActionButton>
        </div>
      )}
      {/* Câu hướng dẫn chỉ có nghĩa khi tay kéo đang hiện: dưới lg mà chưa bật Sắp xếp
          thì nó chỉ tới một biểu tượng không có trên màn. */}
      {dragEnabled && (
        <Guide className={`-mb-1 px-1 text-xs text-fg-muted ${sortMode ? '' : 'hidden lg:block'}`}>
          Nhấn giữ <GripVertical className="inline h-3.5 w-3.5 align-text-bottom" /> rồi kéo để
          sắp thứ tự tài khoản{allowCross ? ', hoặc kéo thả sang nhóm khác' : ' trong cùng một loại'}.
        </Guide>
      )}
      {displayGroups.map((g) => {
        const rowIds = dragEnabled ? displayIdsOf(g.name) : g.accounts.map((a) => a.id)
        const isDropTarget = dragEnabled && dragAcc != null && dropAt?.group === g.name
        // "Ngoài tổng" ở đây gồm CẢ hai lối vào trạng thái đó: cờ của nhóm, và ca nhóm
        // còn bật cờ nhưng mọi tài khoản bên trong đều tự tắt (total = 0 mà vẫn có tiền).
        // Ca thứ hai in ra y hệt ca thứ nhất nên phải xử y như nhau.
        const outsideTotals = !g.includeInTotals || (g.total === 0 && g.rawTotal !== 0)
        return (
          <section
            key={g.name}
            ref={dragEnabled ? (el) => setZone(g.name, el) : undefined}
            className={`overflow-hidden rounded-2xl bg-surface shadow-sm ${
              isDropTarget ? 'ring-2 ring-accent/60' : ''
            }`}
            style={{ borderLeft: `4px solid ${colorOf(g.name)}` }}
          >
            <div className="flex items-center justify-between px-4 py-3">
              <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-fg-primary">
                <span className="truncate">{g.name}</span>
                <span className="shrink-0 rounded-full bg-surface-sunken px-1.5 py-0.5 text-3xs font-medium text-fg-on-track">
                  {g.accounts.length}
                </span>
                {!g.includeInTotals && (
                  <span className="shrink-0 text-3xs font-normal text-fg-muted">(ngoài tổng)</span>
                )}
              </span>
              {/* Tỷ trọng trong Tổng tài sản — chuyển từ chú giải biểu đồ xuống đây,
                  dạng chữ thôi: vẽ lại tỷ lệ bằng thanh ngang là việc biểu đồ tròn
                  ngay trên đã làm. Nhóm ngoài tổng không có tỷ trọng vì mẫu số
                  không chứa nó. */}
              {g.includeInTotals && g.total > 0 && (
                <span className="shrink-0 pl-2 text-xs tabular-nums text-fg-muted">
                  {(g.share * 100).toFixed(0)}%
                </span>
              )}
              {/* Nhóm ĐỨNG NGOÀI TỔNG in số của chính nó, không in `total`.
                  `total` chỉ cộng tài khoản `include_in_totals`, nên với nhóm ngoài tổng
                  nó bằng 0 — và dòng đầu nhóm hiện "¥0" ngay trên những dòng đang nói
                  ₫199.554.545. Một khối không được vừa nói 0 vừa nói 199 triệu.
                  In màu MỜ (fg-muted) chứ không đậm như nhóm được tính: nó không góp vào
                  Tổng tài sản, nên nó cũng không được đọc ngang hàng với những nhóm góp.
                  Ưu tiên tiền GỐC (nativeTotal) — quy đổi chỉ ở ô Tài sản ròng (§A.9);
                  nhóm nhiều loại tiền thì không có số gốc nào nên đành lấy tổng quy đổi. */}
              <span
                className={`shrink-0 pl-2 text-sm tabular-nums ${
                  outsideTotals ? 'font-medium text-fg-muted' : 'font-bold text-fg-primary'
                }`}
              >
                {/* Nhóm ĐỨNG NGOÀI TỔNG in TIỀN GỐC, không in bản quy đổi.
                    Bản trước rơi về `mv.fmt(g.rawTotal, base)`, mà `rawTotal` coi tài khoản
                    thiếu tỷ giá là 0 — nên một nhóm VND in "¥0" ngay cạnh delta
                    "+199.554.545 ₫". Một dòng vừa nói 0 vừa nói +199 triệu là hai câu trái
                    nhau, và cái sai là con số quy đổi, không phải cái delta.
                    Nhóm nhiều loại tiền thì in từng loại: cộng chúng lại cần tỷ giá, mà nếu
                    có tỷ giá thì nhóm này đã không đứng ngoài tổng. */}
                {!outsideTotals
                  ? mv.fmt(g.total, base, g.hasMissingRate)
                  : g.nativeTotals.length > 0
                    ? g.nativeTotals
                        .slice(0, 2)
                        .map((n) => formatMoney(n.amount, n.currency))
                        .join(' · ') +
                      (g.nativeTotals.length > 2 ? ` +${g.nativeTotals.length - 2} loại tiền` : '')
                    : mv.fmt(g.rawTotal, base, g.rawHasMissingRate)}
              </span>
            </div>
            <div className="divide-y divide-gray-50 border-t border-border-subtle dark:divide-gray-800">
              {rowIds.map((id) => {
                const a = accountById.get(id) ?? g.accounts.find((x) => x.id === id)
                if (!a) return null
                const isDragging = dragEnabled && id === dragAcc
                const rowPnl = accountRowPnl(a, danhMucTheoTk.get(a.id))
                const stat = rowStats.get(a.id)
                // Đối chiếu — dựng MỘT lần, dùng ở cả hai tầng (tầng một từ lg, tầng hai
                // dưới lg). Hai bản chép tay của cùng cái nút là cách chắc chắn nhất để
                // desktop và mobile lệch nhãn sau vài lượt sửa.
                const reconcileBtn = stat?.stale ? (
                  // <Link> chứ không <button> vì nó điều hướng — giữ được mở-tab-mới và
                  // chuột giữa. actionButtonClass() chứ không viết tay: <Link> là thẻ <a>
                  // nên không dùng được <ActionButton>, và viết tay thì lặp lại min-h-11
                  // + rounded-md, làm vỡ trần trong designSystem.test.ts.
                  //
                  // Nhãn NGẮN, lý do để ở aria-label: nút chỉ hiện khi quá hạn nên "quá 30
                  // ngày" là thừa với người nhìn thấy nó — mà ở ca xấu nhất (người dùng
                  // mới, chưa đối chiếu bao giờ) thì MỌI dòng đều có nút, và sáu lần một
                  // câu dài là sáu lần nhắc cùng một điều. Trình đọc màn hình vẫn nghe đủ.
                  <Link
                    to={`/assets/account/${a.id}?doi-chieu=1`}
                    className={actionButtonClass(
                      'outline',
                      'border-state-warn-border text-state-warn-fg',
                    )}
                    aria-label={`Đối chiếu ${a.name} — quá ${DELTA_DAYS} ngày chưa đối chiếu`}
                  >
                    Đối chiếu
                  </Link>
                ) : stat?.lastReconciledISO ? (
                  <span className="tabular-nums">
                    đối chiếu {dayMonthLabel(stat.lastReconciledISO)}
                  </span>
                ) : null
                return (
                  <div
                    key={id}
                    ref={dragEnabled ? (el) => setRow(id, el) : undefined}
                    // flex-col: dòng giờ có HAI TẦNG (17a). Tầng trên là dòng cũ, tầng
                    // dưới mang Δ (chỉ mobile — từ sm nó đã có cột riêng ở tầng trên) và
                    // tình trạng đối chiếu.
                    className={`flex flex-col ${
                      isDragging ? 'bg-accent-muted-bg shadow-md' : ''
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
                        } min-h-11 min-w-9 shrink-0 cursor-grab touch-none items-center justify-center text-gray-300 active:cursor-grabbing dark:text-gray-600`}
                        aria-label={`Kéo để sắp thứ tự hoặc chuyển nhóm ${a.name}`}
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                    )}
                    <Link
                      to={`/assets/account/${a.id}`}
                      // Lề trái phải đi CÙNG cái tay kéo: tay kéo ẩn mà vẫn chừa pl-1 thì
                      // dòng thụt vào 4px không vì cái gì.
                      // pr-0: lề phải của dòng do ChevronRight bên ngoài gánh (nó là phần
                      // tử cuối cùng bên phải kể từ khi ô Đối chiếu chen vào giữa).
                      className={`flex min-w-0 flex-1 items-center gap-2 py-2.5 transition hover:bg-surface-sunken active:bg-gray-100 ${
 dragEnabled
 ? sortMode
 ? 'pl-1'
 : 'pl-4 lg:pl-1'
 : 'pl-4'
 }`}
                    >
                      <AccountTypeIcon type={a.type} className="h-4 w-4" />
                      <span className="min-w-0 flex-1 truncate text-sm text-fg-secondary">
                        {a.name}
                        <span className="ml-1 text-xs text-fg-muted">{a.currency}</span>
                        {!a.includeInTotals && (
                          <span className="ml-1 text-3xs text-fg-muted">(ngoài tổng)</span>
                        )}
                        {rowPnl !== null && (
                          <span
                            className={`ml-1 text-3xs tabular-nums ${
                              rowPnl > 0 ? 'text-money-in' : 'text-money-out'
                            }`}
                          >
                            {rowPnl > 0 ? '▲' : '▼'}
                            {mv.fmt(Math.abs(rowPnl), a.currency)}
                          </span>
                        )}
                      </span>
                      {/* Δ 30 ngày + đường tí hon (§4.4). DÒNG HAI TẦNG ở mobile, cột
                          riêng từ sm (17a: "bảng nhiều cột đổi thành dòng hai tầng —
                          số dư trên, Δ dưới — không phải thu nhỏ bản desktop").
                          Ở 390px, khối này xuống dưới số dư nhờ `hidden sm:flex` + bản
                          gọn nằm trong cột tên bên trái. */}
                      {stat && (
                        <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                          <Sparkline values={stat.spark} label={`Số dư ${a.name} 30 ngày qua`} />
                          <span
                            // min-w chứ không w: `w-16` cứng làm số dài xuống dòng, và
                            // chỗ xuống dòng rơi đúng sau dấu — cột hiện "+" trên một
                            // dòng, "¥1,446,190" ở dòng dưới, đọc như hai thứ khác nhau.
                            className={`min-w-16 whitespace-nowrap text-right text-2xs tabular-nums ${
                              stat.delta === 0
                                ? 'text-fg-muted'
                                : stat.delta > 0
                                  ? 'text-money-in'
                                  : 'text-money-out'
                            }`}
                          >
                            {stat.delta === 0
                              ? '—'
                              : `${stat.delta > 0 ? '+' : '−'}${mv.fmt(Math.abs(stat.delta), a.currency)}`}
                          </span>
                        </span>
                      )}
                      <span
                        className={`shrink-0 text-sm font-medium tabular-nums ${a.value < 0 ? 'text-money-out' : 'text-fg-primary'}`}
                      >
                        {mv.fmt(a.value, a.currency)}
                      </span>
                    </Link>
                    {/* Ô ĐỐI CHIẾU của tầng một — CHỈ từ lg (12b: một dòng một tài khoản).
                        Dưới lg nó ở tầng hai cùng Δ; từ lg tầng hai biến mất nên phải có
                        chỗ này, nếu không thì nút "Đối chiếu" mất hẳn trên desktop.

                        Đứng NGOÀI <Link> vì nó chứa một <Link> khác — thẻ <a> lồng <a> là
                        HTML không hợp lệ, trình duyệt tự tháo ra và cả hai đích đều hỏng.
                        Cùng lý do đó ChevronRight cũng ra khỏi <Link>: nó phải đứng cuối
                        cùng bên phải, mà chèn ô này vào giữa thì thứ tự đọc thành
                        "số dư → chevron → nút", tức mũi chevron trỏ vào một cái nút không
                        phải đích của nó. Chevron không mang nhãn nào nên đưa ra ngoài
                        không mất gì với trình đọc màn hình; vùng bấm hụt đúng 16px của
                        chính mũi tên, còn cả dòng vẫn là liên kết. */}
                    {reconcileBtn && (
                      <span className="hidden shrink-0 items-center pl-2 text-3xs text-fg-muted lg:flex">
                        {reconcileBtn}
                      </span>
                    )}
                    {/* `mr-4` = đúng cái `pr-4` mà <Link> nhả ra: lề phải của dòng không
                        đổi, chỉ đổi phần tử nào gánh nó. */}
                    <ChevronRight className="mr-4 h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
                    </div>

                    {/* TẦNG HAI (§4.4 + 17a). Chỉ dựng khi có gì để nói — một dòng rỗng
                        dưới mỗi tài khoản là 20px × N tiêu cho không khí. */}
                    {stat && (stat.stale || stat.delta !== 0) && (
                      <div
                        // `lg:hidden`: từ lg mọi thứ ở đây đã có chỗ ở tầng một — Δ thành
                        // cột riêng từ sm, còn đối chiếu vào ô mới bên cạnh chevron. Giữ
                        // tầng hai ở desktop là dòng tài khoản cao ~100px (đo được), tức
                        // 8 tài khoản dài gấp đôi mức 12b chốt: một dòng một tài khoản.
                        className={`flex items-center gap-2 pb-2 text-3xs text-fg-muted lg:hidden ${
                          dragEnabled ? (sortMode ? 'pl-10 pr-4' : 'px-4 lg:pl-10 lg:pr-4') : 'px-4'
                        }`}
                      >
                        {/* Δ chỉ ở mobile: từ sm nó đã đứng thành cột riêng ở tầng trên,
                            in lại là nói hai lần cùng một con số trên cùng một dòng. */}
                        {stat.delta !== 0 && (
                          <span
                            className={`tabular-nums sm:hidden ${
                              stat.delta > 0 ? 'text-money-in' : 'text-money-out'
                            }`}
                          >
                            {stat.delta > 0 ? '+' : '−'}
                            {mv.fmt(Math.abs(stat.delta), a.currency)} / {DELTA_DAYS} ngày
                          </span>
                        )}
                        {/* Quá hạn thì đưa luôn NÚT, không chỉ báo tin: §4.4 đòi "hiện
                            nút Đối chiếu tại dòng". Cùng phần tử với tầng một — xem
                            reconcileBtn ở trên. */}
                        {reconcileBtn && <span className="ml-auto">{reconcileBtn}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
              {dragEnabled && allowCross && rowIds.length === 0 && dragAcc != null && (
                <p className="px-4 py-3 text-center text-xs text-fg-muted">
                  Thả vào đây để chuyển sang nhóm này
                </p>
              )}
            </div>
          </section>
        )
      })}

      {(breakdown.hasForeign || mv.converted) && rates && (
        <p className="text-center text-xs text-fg-muted">
          Tỷ giá: ¥1 ≈ {rates.VND?.toFixed(2)} ₫ · $1 ≈ ¥
          {rates.USD ? (1 / rates.USD).toFixed(1) : '?'} <Guide as="span">(open.er-api.com, cache 12h)</Guide>
        </p>
      )}
    </div>
  )
}
