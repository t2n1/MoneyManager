import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, CreditCard, GripVertical, Settings2 } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { AccountTypeIcon } from '../../components/icons'
import { PrivacyToggle } from '../../components/PrivacyToggle'
import { SegmentedControl } from '../../components/ui'
import { LifetimeSection } from '../lifetime/LifetimeSection'
import { InvestmentPerformanceSection } from './InvestmentPerformanceSection'
import { NetWorthHistorySection } from './NetWorthHistorySection'
import { SavingsGoalsSection } from './SavingsGoalsSection'
import {
  useAccountBalances,
  useAccounts,
  useAssetGroupSettings,
  useAssignAccountsToGroup,
  useDebtPayments,
  useDebts,
  useRates,
  useReorderAccounts,
} from '../../hooks/queries'
import { CURRENCIES, formatMoney } from '../../lib/money'
import { daysBetween, nextCardDueDate, toISODate } from '../../lib/dates'
import { debtSummary } from '../debts/aggregate'
import {
  assetBreakdown,
  assetCurrencyGroups,
  assetTypeGroups,
  cardFunding,
  UNGROUPED_LABEL,
  type AssetAccount,
  type AssetGroupSetting,
} from './aggregate'

// Bảng màu cho lát bánh (lặp lại nếu > 12 nhóm) — đồng bộ với ReportsPage
const PALETTE = [
  '#16a34a', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7',
]

// Nhãn thứ trong tuần cho ngày đến hạn (đã dời cuối tuần nên chỉ rơi T2–T6)
const WEEKDAY_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

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

/** "T2, 27/7" cho ngày đến hạn ISO. */
function dueDateLabel(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  const dow = new Date(iso + 'T00:00:00Z').getUTCDay()
  return `${WEEKDAY_VI[dow]}, ${d}/${m}`
}

/** "hôm nay" · "ngày mai" · "còn N ngày" từ hôm nay đến hạn. */
function dueRelativeLabel(todayISO: string, dueISO: string): string {
  const n = daysBetween(todayISO, dueISO)
  if (n <= 0) return 'hôm nay'
  if (n === 1) return 'ngày mai'
  return `còn ${n} ngày`
}

export function AssetsPage() {
  const todayISO = toISODate(new Date())
  const { data: balances = [], isLoading } = useAccountBalances()
  const { data: groupSettings = [] } = useAssetGroupSettings()
  const { data: debts = [] } = useDebts()
  const { data: debtPayments = [] } = useDebtPayments()
  const { base, rates } = useRates()

  // Tài sản ròng = tổng tài sản gộp + (cho vay còn lại − mình nợ còn lại), quy đổi base
  const debts_ = useMemo(
    () => debtSummary(debts, debtPayments, base, rates ?? {}),
    [debts, debtPayments, base, rates],
  )

  const settings: AssetGroupSetting[] = useMemo(
    () =>
      groupSettings.map((s) => ({
        name: s.name,
        sortOrder: s.sort_order,
        includeInTotals: s.include_in_totals,
        hidden: s.is_hidden,
      })),
    [groupSettings],
  )

  const breakdown = useMemo(
    () => assetBreakdown(balances, base, rates ?? {}, settings, todayISO),
    [balances, base, rates, settings, todayISO],
  )

  // Chế độ xem cơ cấu: mục đích (asset_group) · loại tài khoản · đồng tiền
  const [groupMode, setGroupMode] = useState<GroupMode>('purpose')

  // Nhóm theo mục đích: bỏ nhóm ẩn / tài khoản ẩn, và nhóm rỗng
  const purposeGroups = useMemo(
    () =>
      breakdown.groups
        .filter((g) => !g.hidden)
        .map((g) => ({ ...g, accounts: g.accounts.filter((a) => !a.hidden) }))
        .filter((g) => g.accounts.length > 0),
    [breakdown.groups],
  )

  // Nhóm theo loại tài khoản (Tiền mặt / Ngân hàng…) — cùng tập tài sản tính vào tổng
  const typeGroups = useMemo(() => assetTypeGroups(breakdown), [breakdown])
  // Nhóm theo đồng tiền (JPY / VND / USD) — đo mức phơi nhiễm tỷ giá
  const currencyGroups = useMemo(() => assetCurrencyGroups(breakdown), [breakdown])

  // Tài khoản đầu tư đang tính vào tổng — đầu vào cho khu Hiệu quả đầu tư
  const investmentAccounts = useMemo(
    () =>
      breakdown.groups
        .filter((g) => g.includeInTotals && !g.hidden)
        .flatMap((g) => g.accounts)
        .filter((a) => a.type === 'investment' && !a.hidden && a.includeInTotals),
    [breakdown.groups],
  )

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

  const approx = breakdown.hasForeign ? '≈ ' : ''
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
  const showNetWorth = debts_.hasOpen || visibleCards.length > 0
  // Đối chiếu tiền trả thẻ: phân bổ số dư nguồn cho các thẻ dùng chung → badge nhất quán
  const cardSources = new Map(
    balances.map((b) => [b.id, { id: b.id, name: b.name, currency: b.currency, balance: b.balance }]),
  )
  const funding = cardFunding(visibleCards, cardSources)
  // Chỉ tổng gộp khi ≥2 thẻ chung nguồn và đang thực nợ (dòng "cần nạp thêm")
  const sharedSources = funding.groups.filter((g) => g.cardCount >= 2 && g.totalOwed > 0)
  const netApprox =
    breakdown.hasForeign || debts_.hasMissingRate || breakdown.cardHasMissingRate ? '≈ ' : ''
  // Tài sản ròng để ghi lịch sử (mục AF): chỉ ghi khi số liệu tin cậy (không thiếu tỷ giá)
  const netWorth = breakdown.total + debts_.net + breakdown.cardDebt
  const netWorthReliable =
    !isLoading &&
    !breakdown.hasMissingRate &&
    !debts_.hasMissingRate &&
    !breakdown.cardHasMissingRate

  return (
    <div
      ref={rootRef}
      className="flex flex-col gap-4 p-3 lg:p-6"
      onPointerMove={onAccPointerMove}
      onPointerUp={onAccPointerEnd}
      onPointerCancel={onAccPointerEnd}
    >
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-lg font-bold text-fg-primary">Tài sản</h1>
        <PrivacyToggle />
        <Link
          to="/settings/asset-groups"
          className="inline-flex items-center gap-1 rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-medium text-fg-secondary shadow-sm active:scale-95"
        >
          <Settings2 className="h-4 w-4" /> Quản lý nhóm
        </Link>
      </div>

      {/* Tổng tài sản */}
      <section className="rounded-2xl bg-gradient-to-br from-green-700 to-emerald-800 p-5 text-white shadow-md">
        <p className="text-sm font-medium text-green-50/90">
          Tổng tài sản · {CURRENCIES[base].label}
        </p>
        <p className="mt-1.5 text-[2rem] font-bold leading-none tracking-tight tabular-nums">
          {isLoading ? '…' : `${approx}${formatMoney(breakdown.total, base)}`}
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
              {breakdown.pnlHasMissingRate ? '≈ ' : ''}
              {formatMoney(Math.abs(pnl), base)}
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
        <section className="rounded-2xl bg-white dark:bg-gray-900 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Tài sản ròng</span>
            <Link to="/settings/debts" className="inline-flex items-center gap-0.5 text-xs font-medium text-green-700 dark:text-green-400">
              Nợ / cho vay <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
            {netApprox}
            {formatMoney(breakdown.total + debts_.net + breakdown.cardDebt, base)}
          </p>
          <div className="mt-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between text-fg-muted">
              <span>Tổng tài sản</span>
              <span className="tabular-nums">{formatMoney(breakdown.total, base)}</span>
            </div>
            {debts_.owedToMe > 0 && (
              <div className="flex items-center justify-between text-money-in">
                <span>+ Cho vay còn lại</span>
                <span className="tabular-nums">{formatMoney(debts_.owedToMe, base)}</span>
              </div>
            )}
            {debts_.iOwe > 0 && (
              <div className="flex items-center justify-between text-money-out">
                <span>− Nợ phải trả</span>
                <span className="tabular-nums">{formatMoney(debts_.iOwe, base)}</span>
              </div>
            )}
            {cardOwed > 0 && (
              <div className="flex items-center justify-between text-money-out">
                <span>− Nợ thẻ tín dụng</span>
                <span className="tabular-nums">{formatMoney(cardOwed, base)}</span>
              </div>
            )}
          </div>
          {(debts_.hasMissingRate || breakdown.cardHasMissingRate) && (
            <p className="mt-2 text-xs text-fg-muted">
              Một phần công nợ ngoại tệ chưa quy đổi được nên số ròng có thể thiếu.
            </p>
          )}
        </section>
      )}

      {/* Lịch sử tài sản ròng (mục AF) — đặt ngay dưới con số ròng: số hiện tại và
          đường đi của chính nó phải liền nhau thì mới so được. */}
      <NetWorthHistorySection base={base} currentNetWorth={netWorthReliable ? netWorth : null} />

      {/* Lifetime (mục Lifetime): chiếu tài sản ròng cả đời — phần kéo dài của con số
          tài sản ròng ngay trên, nên đứng liền sau nó. */}
      <LifetimeSection />

      {/* Thẻ tín dụng — khối DUY NHẤT trên trang có hạn chót ("còn N ngày", "cần
          nạp thêm"), nên đứng trên mọi khối chỉ để đọc. */}
      {visibleCards.length > 0 && (
        <section className="rounded-2xl bg-white dark:bg-gray-900 p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
            <CreditCard className="h-3.5 w-3.5" /> Thẻ tín dụng
          </h2>

          {/* Tổng theo ngân hàng nguồn — con số cần khi chuyển tiền vào để thanh toán */}
          {sharedSources.length > 0 && (
            <div className="mb-3 space-y-2">
              {sharedSources.map((g) => (
                <div
                  key={g.sourceId}
                  className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Trả {g.cardCount} thẻ từ {g.sourceName}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${
                        g.enough
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                      }`}
                    >
                      {g.enough ? 'đủ trả' : `cần nạp thêm ${formatMoney(g.shortfall, g.currency)}`}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-fg-muted">
                    <span>Tổng nợ {g.cardCount} thẻ</span>
                    <span className="tabular-nums font-medium text-money-out">
                      − {formatMoney(g.totalOwed, g.currency)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-fg-muted">
                    <span>Số dư {g.sourceName}</span>
                    <span className="tabular-nums">{formatMoney(g.sourceBalance, g.currency)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <ul className="space-y-3">
            {visibleCards.map((c) => {
              const owed = c.balance < 0 ? -c.balance : 0 // đang nợ (currency gốc)
              const available = c.creditLimit != null ? c.creditLimit - owed : null
              // Đối chiếu nguồn trả thẻ (đã phân bổ nếu dùng chung nguồn)
              const f = funding.byCard.get(c.id)
              // Ngày đến hạn trả kế tiếp (đã dời T7/CN sang T2)
              const dueISO = c.paymentDueDay != null ? nextCardDueDate(c.paymentDueDay, todayISO) : null
              return (
                <li key={c.id}>
                  <Link
                    to={`/assets/${c.id}`}
                    className="block rounded-xl px-2 py-2 transition hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    {/* Tên thẻ + trạng thái đủ/thiếu tiền trả */}
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 shrink-0 text-fg-muted" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700 dark:text-gray-300">
                        {c.name}
                        {!c.includeInTotals && (
                          <span className="ml-1 text-3xs font-normal text-fg-muted">
                            (ngoài tổng)
                          </span>
                        )}
                      </span>
                      {owed > 0 && f && (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold ${
                            f.enough
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          }`}
                        >
                          {f.enough ? 'đủ trả' : `thiếu ${formatMoney(f.shortfall, c.currency)}`}
                        </span>
                      )}
                    </div>

                    {/* Số cần trả (nổi bật) + ngày đến hạn */}
                    <div className="mt-1.5 ml-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      {owed > 0 ? (
                        <>
                          <span className="text-xs text-fg-muted">Cần trả</span>
                          <span className="text-xl font-bold tabular-nums text-money-out">
                            {formatMoney(owed, c.currency)}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm font-medium text-fg-muted">
                          Chưa phát sinh nợ
                        </span>
                      )}
                      {owed > 0 && dueISO && (
                        <span className="ml-auto text-xs text-fg-muted">
                          Đến hạn{' '}
                          <span className="font-semibold text-gray-700 dark:text-gray-200">
                            {dueDateLabel(dueISO)}
                          </span>
                          <span className="text-fg-muted">
                            {' '}· {dueRelativeLabel(todayISO, dueISO)}
                          </span>
                        </span>
                      )}
                    </div>

                    {/* Nguồn trả + hạn mức còn lại */}
                    {(f || available != null) && (
                      <p className="mt-1 ml-6 text-xs text-fg-muted">
                        {f && (
                          <>
                            Trả từ {f.sourceName}
                            {!f.shared && (
                              <>
                                {' '}· số dư{' '}
                                <span className="tabular-nums">
                                  {formatMoney(f.sourceBalance, c.currency)}
                                </span>
                              </>
                            )}
                          </>
                        )}
                        {f && available != null && ' · '}
                        {available != null && (
                          <>
                            còn dùng được{' '}
                            <span className="tabular-nums">{formatMoney(available, c.currency)}</span>
                          </>
                        )}
                      </p>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Hiệu quả đầu tư: đóng góp vs tăng trưởng + XIRR sau thuế/lạm phát */}
      <InvestmentPerformanceSection accounts={investmentAccounts} base={base} />

      {/* Mục tiêu tiết kiệm (mục AD) */}
      <SavingsGoalsSection />

      {/* Biểu đồ tròn + danh sách nhóm */}
      <section className="rounded-2xl bg-white dark:bg-gray-900 p-4 shadow-sm">
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
                    formatter={(v) => formatMoney(Number(v), base)}
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
            className={`overflow-hidden rounded-2xl bg-white dark:bg-gray-900 shadow-sm ${
              isDropTarget ? 'ring-2 ring-green-500/60' : ''
            }`}
            style={{ borderLeft: `4px solid ${colorOf(g.name)}` }}
          >
            <div className="flex items-center justify-between px-4 py-3">
              <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-fg-primary">
                <span className="truncate">{g.name}</span>
                <span className="shrink-0 rounded-full bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-3xs font-medium text-fg-on-track">
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
                {g.hasMissingRate ? '≈ ' : ''}
                {formatMoney(g.total, base)}
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
                      to={`/assets/${a.id}`}
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
                            {formatMoney(Math.abs(a.marketValue - a.balance), a.currency)}
                          </span>
                        )}
                      </span>
                      <span
                        className={`shrink-0 text-sm font-medium tabular-nums ${a.value < 0 ? 'text-money-out' : 'text-fg-primary'}`}
                      >
                        {formatMoney(a.value, a.currency)}
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

      {breakdown.hasForeign && rates && (
        <p className="text-center text-xs text-fg-muted">
          Tỷ giá: ¥1 ≈ {rates.VND?.toFixed(2)} ₫ · $1 ≈ ¥
          {rates.USD ? (1 / rates.USD).toFixed(1) : '?'} (open.er-api.com, cache 12h)
        </p>
      )}
    </div>
  )
}
