// Tab con "Hiện tại" của Tài sản — trả lời đúng một câu: "giờ tôi có bao nhiêu".
// Tổng tài sản · Tài sản ròng · Thẻ tín dụng đến hạn · Cơ cấu · danh sách nhóm/tài khoản.
//
// Trước đây file này là cả trang Tài sản 780 dòng, gánh thêm hai câu hỏi khác ("tôi đang
// tiến bộ không" và "sau này thế nào") trong cùng một mạch cuộn. Hai câu đó nay là
// AssetsTrendView và LifetimeView. Xem docs/information-architecture.md §2.3.
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, GripVertical } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { AccountTypeIcon } from '../../components/icons'
import { SegmentedControl, Sparkline } from '../../components/ui'
import {
  useAccounts,
  useAssignAccountsToGroup,
  useNetWorthSnapshots,
  useReorderAccounts,
} from '../../hooks/queries'
import { CURRENCIES, type CurrencyCode } from '../../lib/money'
import { UNGROUPED_LABEL, type AssetAccount } from './aggregate'
import { CardsSection } from './CardsSection'
import { makeMoneyView } from './moneyView'
import { useAssetsData } from './useAssetsData'

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

export function AssetsNowView() {
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

  // Xem thử CẢ TRANG bằng đồng tiền khác — chỉ để ước chừng theo tỷ giá cache, nên
  // không lưu: mở lại trang là về tiền gốc.
  // null = theo tiền gốc (không giữ mã cứng, vì base tải async từ profile).
  const [viewCur, setViewCur] = useState<CurrencyCode | null>(null)
  const displayCur = viewCur ?? base
  // Đồng tiền bấm được: tiền gốc luôn được; tiền khác cần tỷ giá dùng được.
  const canView = (c: CurrencyCode) => {
    if (c === base) return true
    const r = rates?.[c]
    return r != null && Number.isFinite(r) && r > 0
  }
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
  // Kéo–thả sắp thứ tự tài khoản bật ở mọi chế độ. Nhưng chỉ "Mục đích" cho kéo
  // XUYÊN nhóm (đổi asset_group); ở "Loại"/"Tiền tệ", kéo sang nhóm khác nghĩa là
  // đổi loại/đồng tiền tài khoản (làm trong form), nên chỉ cho sắp TRONG một nhóm.
  const dragEnabled = displayGroups.length > 0
  const allowCross = groupMode === 'purpose'

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
  // Đầu tư: có snapshot giá trị thị trường nào không → hiện dòng lãi/lỗ chưa thực hiện
  const hasValuation = breakdown.groups.some((g) =>
    g.accounts.some((a) => a.marketValue != null),
  )
  const pnl = breakdown.unrealizedPnl

  // Thẻ tín dụng: công nợ, hiển thị riêng và trừ vào Tài sản ròng
  const visibleCards = breakdown.cards.filter((c) => !c.hidden)
  const cardOwed = -breakdown.cardDebt // số dương = đang nợ thẻ (quy đổi base)
  const showNetWorth = debtsSummary.hasOpen || visibleCards.length > 0
  // Cờ ước chừng sẵn có của số ròng (chưa tính chuyện xem thử bằng tiền khác —
  // mv.fmt tự cộng thêm ≈ khi có quy đổi)
  const netApprox =
    breakdown.hasForeign || debtsSummary.hasMissingRate || breakdown.cardHasMissingRate

  return (
    <div
      ref={rootRef}
      className="flex flex-col gap-4"
      onPointerMove={onAccPointerMove}
      onPointerUp={onAccPointerEnd}
      onPointerCancel={onAccPointerEnd}
    >
      {/* Lưới hai cột trên PC cho các khối CHỈ ĐỂ ĐỌC ở đầu trang. Danh sách nhóm tài
          khoản phía dưới cố ý ĐỨNG NGOÀI lưới: nó kéo–thả để sắp thứ tự, mà phép tính
          vị trí thả giả định các dòng xếp dọc — chia hai cột là thả sai chỗ.
          `lg:items-start` để thẻ ngắn không bị kéo cao bằng thẻ dài bên cạnh. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3">
        {/* Tổng tài sản */}
        <section className="rounded-2xl bg-gradient-to-br from-green-700 to-emerald-800 p-5 text-white shadow-md">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-green-50/90">
              Tổng tài sản · {CURRENCIES[displayCur].label}
            </p>
            {/* Xem thử bằng tiền khác — đổi cả Tổng tài sản lẫn Tài sản ròng bên cạnh.
                Không phải đổi base thật: chỉ ước chừng theo tỷ giá cache, có ≈ đi kèm. */}
            <div
              role="group"
              aria-label="Xem thử bằng tiền khác"
              className="flex shrink-0 rounded-lg bg-black/20 p-0.5"
            >
              {(Object.keys(CURRENCIES) as CurrencyCode[]).map((c) => {
                const active = displayCur === c
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={active}
                    disabled={!canView(c)}
                    onClick={() => setViewCur(c === base ? null : c)}
                    className={`min-h-8 min-w-9 rounded-md px-2 text-xs font-semibold transition disabled:opacity-40 ${
                      active
                        ? 'bg-white text-green-800 shadow-sm'
                        : 'text-green-50/90 hover:text-white'
                    }`}
                  >
                    {CURRENCIES[c].symbol}
                  </button>
                )
              })}
            </div>
          </div>
          <p className="mt-1.5 text-[2rem] font-bold leading-none tracking-tight tabular-nums">
            {isLoading ? '…' : mv.fmt(breakdown.total, base, breakdown.hasForeign)}
          </p>
          {!isLoading && (
            <p className="mt-2.5 text-xs text-green-50/80">
              {accountCount} tài khoản · {purposeGroups.length} nhóm
            </p>
          )}
          {!isLoading && hasValuation && (
            <p className="mt-2 text-xs text-green-50/90">
              Lãi/lỗ đầu tư (chưa thực hiện):{' '}
              <span className="font-semibold tabular-nums text-white">
                {pnl >= 0 ? '+' : '−'}
                {mv.fmt(Math.abs(pnl), base, breakdown.pnlHasMissingRate)}
              </span>
            </p>
          )}
          {breakdown.hasMissingRate && (
            <p className="mt-2 text-xs text-green-100">
              Một phần tài sản ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên tổng có thể thiếu.
            </p>
          )}
        </section>
  
        {/* Tài sản ròng (hiện khi có khoản nợ mở hoặc có thẻ tín dụng) */}
        {showNetWorth && (
          <section className="rounded-2xl bg-surface p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Tài sản ròng</span>
              <Link to="/debts" className="inline-flex items-center gap-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                Nợ / cho vay <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            {/* Số lớn + đường xu hướng tí hon ngay cạnh, theo cách permtrack nhét đồ thị
                nhỏ vào cùng dòng với con số: nhìn một cái là biết đang lên hay xuống mà
                không phải mở tab "Diễn biến". */}
            <div className="mt-1 flex items-end justify-between gap-3">
              <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
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
            {(debtsSummary.hasMissingRate || breakdown.cardHasMissingRate) && (
              <p className="mt-2 text-xs text-fg-muted">
                Một phần công nợ ngoại tệ chưa quy đổi được nên số ròng có thể thiếu.
              </p>
            )}
          </section>
        )}
  
        {/* Thẻ tín dụng — khối DUY NHẤT trên trang có hạn chót ("còn N ngày", "cần
            nạp thêm"), nên đứng trên mọi khối chỉ để đọc. Thu gọn mặc định, xem
            CardsSection. */}
        <CardsSection
          cards={visibleCards}
          balances={balances}
          base={base}
          rates={rates ?? {}}
          todayISO={todayISO}
          view={mv}
        />
  
        {/* Biểu đồ tròn + danh sách nhóm */}
        <section className="rounded-2xl bg-surface p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Cơ cấu tài sản
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
                      innerRadius={54}
                      outerRadius={82}
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
                    <span className="font-medium text-gray-700 dark:text-gray-300">{g.name}</span>
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

      {/* Chi tiết từng nhóm và tài khoản bên trong */}
      {dragEnabled && (
        <p className="-mb-1 px-1 text-xs text-fg-muted">
          Nhấn giữ <GripVertical className="inline h-3.5 w-3.5 align-text-bottom" /> rồi kéo để
          sắp thứ tự tài khoản{allowCross ? ', hoặc kéo thả sang nhóm khác' : ' trong cùng một loại'}.
        </p>
      )}
      {displayGroups.map((g) => {
        const rowIds = dragEnabled ? displayIdsOf(g.name) : g.accounts.map((a) => a.id)
        const isDropTarget = dragEnabled && dragAcc != null && dropAt?.group === g.name
        return (
          <section
            key={g.name}
            ref={dragEnabled ? (el) => setZone(g.name, el) : undefined}
            className={`overflow-hidden rounded-2xl bg-surface shadow-sm ${
              isDropTarget ? 'ring-2 ring-green-500/60' : ''
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
              <span className="shrink-0 pl-2 text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {mv.fmt(g.total, base, g.hasMissingRate)}
              </span>
            </div>
            <div className="divide-y divide-gray-50 border-t border-border-subtle dark:divide-gray-800">
              {rowIds.map((id) => {
                const a = accountById.get(id) ?? g.accounts.find((x) => x.id === id)
                if (!a) return null
                const isDragging = dragEnabled && id === dragAcc
                return (
                  <div
                    key={id}
                    ref={dragEnabled ? (el) => setRow(id, el) : undefined}
                    className={`flex items-center ${
                      isDragging ? 'bg-green-50 shadow-md dark:bg-green-900/20' : ''
                    }`}
                  >
                    {dragEnabled && (
                      <button
                        type="button"
                        onPointerDown={(e) => onAccPointerDown(id, e)}
                        style={{ touchAction: 'none' }}
                        className="inline-flex min-h-11 min-w-9 shrink-0 cursor-grab touch-none items-center justify-center text-gray-300 active:cursor-grabbing dark:text-gray-600"
                        aria-label={`Kéo để sắp thứ tự hoặc chuyển nhóm ${a.name}`}
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                    )}
                    <Link
                      to={`/assets/account/${a.id}`}
                      className={`flex min-w-0 flex-1 items-center gap-2 py-2.5 transition hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 ${
                        dragEnabled ? 'pr-4 pl-1' : 'px-4'
                      }`}
                    >
                      <AccountTypeIcon type={a.type} className="h-4 w-4" />
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-300">
                        {a.name}
                        <span className="ml-1 text-xs text-fg-muted">{a.currency}</span>
                        {!a.includeInTotals && (
                          <span className="ml-1 text-3xs text-fg-muted">(ngoài tổng)</span>
                        )}
                        {a.marketValue != null && a.marketValue !== a.balance && (
                          <span
                            className={`ml-1 text-3xs tabular-nums ${
                              a.marketValue > a.balance
                                ? 'text-money-in'
                                : 'text-money-out'
                            }`}
                          >
                            {a.marketValue > a.balance ? '▲' : '▼'}
                            {mv.fmt(Math.abs(a.marketValue - a.balance), a.currency)}
                          </span>
                        )}
                      </span>
                      <span
                        className={`shrink-0 text-sm font-medium tabular-nums ${a.value < 0 ? 'text-money-out' : 'text-fg-primary'}`}
                      >
                        {mv.fmt(a.value, a.currency)}
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
                    </Link>
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
          {rates.USD ? (1 / rates.USD).toFixed(1) : '?'} (open.er-api.com, cache 12h)
        </p>
      )}
    </div>
  )
}
