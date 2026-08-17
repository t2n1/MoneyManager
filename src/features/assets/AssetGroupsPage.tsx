import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Guide } from '../../components/Guide'
import { Check, ChevronDown, ChevronRight, GripVertical, Plus } from 'lucide-react'
import { AccountTypeIcon } from '../../components/icons'
import { BackLink } from '../../components/BackLink'
import { DragList, type DragHandleProps } from '../../components/DragList'
import { useEscClose } from '../../hooks/useEscClose'
import {
  useAccountBalances,
  useAccounts,
  useAssetGroupSettings,
  useAssignAccountsToGroup,
  useDeleteAssetGroup,
  useRenameAssetGroup,
  useReorderAccounts,
  useReorderAssetGroups,
  useRates,
  useUpsertAssetGroupSetting,
} from '../../hooks/queries'
import { formatMoney } from '../../lib/money'
import { confirmDialog, promptDialog, showToast } from '../../lib/dialog'
import {
  assetBreakdown,
  UNGROUPED_LABEL,
  type AssetAccount,
  type AssetGroup,
  type AssetGroupSetting,
} from './aggregate'

const NEW_GROUP = '__new__'

/** Công tắc bật/tắt nhỏ gọn. */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    // Vùng chạm 44×44 ở NÚT, đường ray 20×36 ở <span> bên trong — đo được 36×20 khi ray
    // nằm thẳng trên nút. Đây là đúng khuôn ba công tắc kia đã dùng (AccountsPage,
    // YearTableView, NotificationSettingsPage), không phải cách mới.
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center"
    >
      <span
        className={`relative block h-5 w-9 rounded-full transition ${
          checked ? 'bg-accent' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
            checked ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  )
}

export function AssetGroupsPage() {
  const { data: balances = [], isLoading } = useAccountBalances()
  const { data: accounts = [] } = useAccounts()
  const { data: groupSettings = [] } = useAssetGroupSettings()
  const { base, rates } = useRates()

  const upsert = useUpsertAssetGroupSetting()
  const rename = useRenameAssetGroup()
  const remove = useDeleteAssetGroup()
  const reorder = useReorderAssetGroups()
  const reorderAccounts = useReorderAccounts()
  const assign = useAssignAccountsToGroup()

  // Mặc định mở sẵn tài khoản con của mọi nhóm; chỉ lưu nhóm bị THU GỌN.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleting, setDeleting] = useState<AssetGroup | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())

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
    () => assetBreakdown(balances, base, rates ?? {}, settings),
    [balances, base, rates, settings],
  )

  // Nhóm hiển thị = nhóm có tài khoản + nhóm chỉ có cấu hình (mới tạo, chưa gán tài khoản)
  const groups = useMemo(() => {
    const present = new Set(breakdown.groups.map((g) => g.name))
    const extras: AssetGroup[] = settings
      .filter((s) => s.name !== UNGROUPED_LABEL && !present.has(s.name))
      .map((s) => ({
        name: s.name,
        total: 0,
        share: 0,
        accounts: [],
        hasMissingRate: false,
        includeInTotals: s.includeInTotals,
        hidden: s.hidden,
      }))
    if (extras.length === 0) return breakdown.groups
    const orderOf = (name: string) =>
      settings.find((s) => s.name === name)?.sortOrder ?? Number.MAX_SAFE_INTEGER
    const named = [...breakdown.groups.filter((g) => g.name !== UNGROUPED_LABEL), ...extras]
    named.sort((a, b) => orderOf(a.name) - orderOf(b.name) || b.total - a.total)
    const ungrouped = breakdown.groups.find((g) => g.name === UNGROUPED_LABEL)
    return ungrouped ? [...named, ungrouped] : named
  }, [breakdown.groups, settings])

  const namedGroups = groups.filter((g) => g.name !== UNGROUPED_LABEL)

  // Danh sách nhóm đích khi chuyển tài khoản (kể cả nhóm cấu hình sẵn chưa có tài khoản)
  const allGroupNames = useMemo(() => {
    const names = new Set<string>()
    for (const g of namedGroups) names.add(g.name)
    for (const s of settings) if (s.name !== UNGROUPED_LABEL) names.add(s.name)
    return [...names].sort((a, b) => a.localeCompare(b, 'vi'))
  }, [namedGroups, settings])

  // Sắp lại tài khoản TRONG một nhóm: chỉ hoán vị các thành viên của nhóm giữa
  // những chỗ chúng đang chiếm trong thứ tự toàn cục (theo sort_order), giữ nguyên
  // vị trí mọi tài khoản khác (nhóm khác, thẻ). Lưu trữ luôn ở cuối.
  function reorderAccountsInGroup(newChildIds: string[]) {
    const activeSorted = accounts
      .filter((a) => !a.is_archived)
      .sort((a, b) => a.sort_order - b.sort_order)
    const archivedIds = accounts.filter((a) => a.is_archived).map((a) => a.id)
    const member = new Set(newChildIds)
    const queue = [...newChildIds]
    const globalIds = activeSorted.map((a) => (member.has(a.id) ? queue.shift()! : a.id))
    reorderAccounts.mutate([...globalIds, ...archivedIds])
  }

  // Chuyển một tài khoản SANG nhóm khác tại vị trí `index`: đổi asset_group và
  // chèn id vào thứ tự toàn cục ngay cạnh thành viên đích, giữ nguyên mọi TK khác.
  function moveAccountToGroupAt(id: string, dst: string, index: number) {
    const activeSorted = accounts
      .filter((a) => !a.is_archived)
      .sort((a, b) => a.sort_order - b.sort_order)
    const archivedIds = accounts.filter((a) => a.is_archived).map((a) => a.id)
    const base = activeSorted.map((a) => a.id).filter((x) => x !== id)
    const targetChildren = (groups.find((g) => g.name === dst)?.accounts ?? [])
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

  // --- Kéo–thả tài khoản: trong nhóm & xuyên nhóm ---
  // Bắt pointer trên phần tử gốc (ổn định) để hàng kéo có thể "nhảy" giữa các nhóm
  // mà không mất capture. `dropAt` là vị trí xem trước; commit khi thả.
  const rootRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef(new Map<string, HTMLElement>())
  const zoneRefs = useRef(new Map<string, HTMLElement>())
  const dragPointer = useRef<number | null>(null)
  const [dragAcc, setDragAcc] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<{ group: string; index: number } | null>(null)

  const accountById = useMemo(() => {
    const m = new Map<string, AssetAccount>()
    for (const g of groups) for (const a of g.accounts) m.set(a.id, a)
    return m
  }, [groups])

  function setRow(id: string, el: HTMLElement | null) {
    if (el) rowRefs.current.set(id, el)
    else rowRefs.current.delete(id)
  }
  function setZone(name: string, el: HTMLElement | null) {
    if (el) zoneRefs.current.set(name, el)
    else zoneRefs.current.delete(name)
  }

  function groupOf(id: string) {
    for (const g of groups) if (g.accounts.some((a) => a.id === id)) return g.name
    return UNGROUPED_LABEL
  }

  // Thứ tự id hiển thị của một nhóm, đã áp xem trước khi đang kéo.
  function displayIdsOf(name: string): string[] {
    const base = (groups.find((g) => g.name === name)?.accounts ?? []).map((a) => a.id)
    if (dragAcc == null) return base
    const without = base.filter((id) => id !== dragAcc)
    if (dropAt && dropAt.group === name) {
      const i = Math.min(dropAt.index, without.length)
      return [...without.slice(0, i), dragAcc, ...without.slice(i)]
    }
    return without
  }

  function onAccPointerDown(id: string, e: ReactPointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    rootRef.current?.setPointerCapture(e.pointerId)
    dragPointer.current = e.pointerId
    const gname = groupOf(id)
    const idx = (groups.find((g) => g.name === gname)?.accounts ?? []).findIndex((a) => a.id === id)
    setDragAcc(id)
    setDropAt({ group: gname, index: Math.max(0, idx) })
  }

  function onAccPointerMove(e: ReactPointerEvent) {
    if (dragAcc == null || e.pointerId !== dragPointer.current) return
    const x = e.clientX
    const y = e.clientY
    let targetGroup: string | null = null
    for (const [name, el] of zoneRefs.current) {
      const r = el.getBoundingClientRect()
      if (y >= r.top && y <= r.bottom && x >= r.left && x <= r.right) {
        targetGroup = name
        break
      }
    }
    if (targetGroup == null) return // ngoài mọi nhóm → giữ xem trước cũ
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
      const cur = (groups.find((g) => g.name === src)?.accounts ?? []).map((a) => a.id)
      const without = cur.filter((x) => x !== id)
      const j = Math.min(at.index, without.length)
      const next = [...without.slice(0, j), id, ...without.slice(j)]
      if (next.some((x, k) => x !== cur[k])) reorderAccountsInGroup(next)
    } else {
      moveAccountToGroupAt(id, at.group, at.index)
    }
  }

  async function submitRename(oldName: string) {
    const newName = renameValue.trim()
    setRenaming(null)
    if (!newName || newName === oldName) return
    const merging = allGroupNames.includes(newName)
    if (
      merging &&
      !(await confirmDialog({
        title: 'Gộp nhóm?',
        message: `Nhóm "${newName}" đã tồn tại. Gộp "${oldName}" vào nhóm này?`,
        confirmLabel: 'Gộp',
      }))
    )
      return
    rename.mutate({ oldName, newName })
  }

  function submitNewGroup() {
    const name = newName.trim()
    if (!name) return
    if (name === UNGROUPED_LABEL || allGroupNames.includes(name)) {
      showToast(`Nhóm "${name}" đã tồn tại.`, 'error')
      return
    }
    const nextSort = settings.reduce((m, s) => Math.max(m, s.sortOrder + 1), namedGroups.length)
    upsert.mutate({
      name,
      patch: { sort_order: nextSort, include_in_totals: true, is_hidden: false },
    })
    setAdding(false)
    setNewName('')
  }

  // Tài khoản đang thuộc nhóm khác (kể cả Chưa phân nhóm) — nguồn để kéo vào nhóm này
  function accountsOutside(groupName: string) {
    return groups.flatMap((gr) => (gr.name === groupName ? [] : gr.accounts))
  }

  function togglePicked(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openAddAccounts(groupName: string) {
    setAddingTo(groupName)
    setPicked(new Set())
  }

  function submitAddAccounts(groupName: string) {
    if (picked.size === 0) {
      setAddingTo(null)
      return
    }
    assign.mutate({ accountIds: [...picked], group: groupName })
    setAddingTo(null)
    setPicked(new Set())
  }

  async function moveAccount(accountId: string, target: string) {
    if (target === NEW_GROUP) {
      const name = (await promptDialog({ title: 'Tên nhóm mới', placeholder: 'Tên nhóm', confirmLabel: 'Tạo' }))?.trim()
      if (!name) return
      assign.mutate({ accountIds: [accountId], group: name })
      return
    }
    assign.mutate({
      accountIds: [accountId],
      group: target === UNGROUPED_LABEL ? null : target,
    })
  }

  // Vẽ một nhóm (dùng cho cả nhóm kéo–thả lẫn "Chưa phân nhóm" cố định cuối).
  // `handle` có = nhóm sắp thứ tự được (hiện tay nắm); không có = cố định.
  function renderGroup(g: AssetGroup, handle?: DragHandleProps, dragging = false): ReactNode {
    const isUngrouped = g.name === UNGROUPED_LABEL
    const isOpen = !collapsed.has(g.name)
    return (
      <section
        ref={(el) => setZone(g.name, el)}
        className={`overflow-hidden rounded-xl bg-surface ${
          dragging ? 'shadow-lg ring-2 ring-green-500/40' : 'shadow-sm'
        } ${dragAcc != null && dropAt?.group === g.name ? 'ring-2 ring-green-500/60' : ''}`}
      >
        <div className="flex items-center gap-2 px-3 py-2.5">
          {/* Tay nắm kéo–thả (không áp dụng cho Chưa phân nhóm) */}
          {handle ? (
            <button
              type="button"
              {...handle}
              className="inline-flex min-h-11 min-w-11 shrink-0 cursor-grab touch-none items-center justify-center text-fg-muted active:cursor-grabbing"
              aria-label={`Kéo để sắp thứ tự nhóm ${g.name}`}
            >
              <GripVertical className="h-5 w-5" />
            </button>
          ) : (
            <div className="w-11" />
          )}

          <div className="min-w-0 flex-1">
            {renaming === g.name ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitRename(g.name)
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                  className="w-full rounded-lg border border-border-strong px-2 py-1 text-sm outline-green-500"
                />
                <button
                  type="button"
                  onClick={() => submitRename(g.name)}
                  className="rounded-lg bg-accent text-fg-on-accent px-2 py-1 text-xs font-semibold"
                >
                  Lưu
                </button>
                <button
                  type="button"
                  onClick={() => setRenaming(null)}
                  className="min-h-11 rounded-lg px-2 py-1 text-xs text-fg-muted"
                >
                  Hủy
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev)
                    if (next.has(g.name)) next.delete(g.name)
                    else next.add(g.name)
                    return next
                  })
                }
                // flex-col, KHÔNG items-center: bên trong là hai dòng xếp dọc (tên nhóm +
                // "N tài khoản · tổng"). min-h-11 để vùng chạm đủ 44px (đo được 172×36).
                className="flex min-h-11 w-full flex-col justify-center text-left"
              >
                <span className="flex items-center gap-1 text-sm font-semibold text-fg-primary">
                  <span className="min-w-0 truncate">{g.name}</span>
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  )}
                </span>
                <span className="block text-xs text-fg-muted">
                  {g.accounts.length} tài khoản · {g.hasMissingRate ? '≈ ' : ''}
                  {formatMoney(g.total, base)}
                </span>
              </button>
            )}
          </div>

          {!isUngrouped && renaming !== g.name && (
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => {
                  setRenaming(g.name)
                  setRenameValue(g.name)
                }}
                className="min-h-11 rounded-lg px-2 py-1 text-xs text-fg-muted hover:bg-surface-sunken"
              >
                Đổi tên
              </button>
              <button
                type="button"
                onClick={() => setDeleting(g)}
                className="rounded-lg px-2 py-1 text-xs text-money-out hover:bg-state-bad-bg"
              >
                Xóa
              </button>
            </div>
          )}
        </div>

        {/* Công tắc tính vào tổng / ẩn */}
        <div className="flex items-center gap-4 border-t border-border-subtle px-3 py-2">
          <label className="flex items-center gap-2 text-xs text-fg-secondary">
            <Toggle
              label="Tính vào tổng"
              checked={g.includeInTotals}
              onChange={(v) => upsert.mutate({ name: g.name, patch: { include_in_totals: v } })}
            />
            Tính vào tổng
          </label>
          <label className="flex items-center gap-2 text-xs text-fg-secondary">
            <Toggle
              label="Ẩn nhóm"
              checked={g.hidden}
              onChange={(v) => upsert.mutate({ name: g.name, patch: { is_hidden: v } })}
            />
            Ẩn
          </label>
        </div>

        {/* Danh sách tài khoản (kéo–thả để sắp trong nhóm hoặc chuyển nhóm) */}
        {isOpen && (
          <div className="border-t border-border-subtle">
            <div className="divide-y divide-border-subtle">
              {displayIdsOf(g.name).map((id) => {
                const a = accountById.get(id)
                if (!a) return null
                const isDragging = id === dragAcc
                return (
                  <div
                    key={id}
                    ref={(el) => setRow(id, el)}
                    className={`flex items-center gap-1 px-3 py-2 ${
                      isDragging ? 'bg-accent-muted-bg shadow-md' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onPointerDown={(e) => onAccPointerDown(id, e)}
                      style={{ touchAction: 'none' }}
                      className="inline-flex min-h-11 min-w-9 shrink-0 cursor-grab touch-none items-center justify-center text-gray-300 active:cursor-grabbing dark:text-gray-600"
                      aria-label={`Kéo để sắp thứ tự hoặc chuyển nhóm ${a.name}`}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <span className="flex min-w-0 flex-1 items-center gap-1 text-sm text-fg-secondary">
                      <AccountTypeIcon type={a.type} className="h-4 w-4 shrink-0" />
                      <span className="truncate">{a.name}</span>
                      <span className="text-xs text-fg-muted">
                        {formatMoney(a.balance, a.currency)}
                      </span>
                    </span>
                    <select
                      value={g.name}
                      onChange={(e) => moveAccount(a.id, e.target.value)}
                      className="shrink-0 rounded-lg border border-border-strong bg-surface px-2 py-1 text-xs"
                      aria-label={`Chuyển ${a.name} sang nhóm khác`}
                    >
                      {allGroupNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                      <option value={UNGROUPED_LABEL}>{UNGROUPED_LABEL}</option>
                      <option value={NEW_GROUP}>+ Nhóm mới…</option>
                    </select>
                  </div>
                )
              })}
            </div>
            {displayIdsOf(g.name).length === 0 && (
              <p className="px-3 py-3 text-center text-xs text-fg-muted">
                {dragAcc != null ? 'Thả vào đây để chuyển nhóm' : 'Không có tài khoản'}
              </p>
            )}

            {/* Thêm tài khoản từ nhóm khác vào nhóm này */}
            {!isUngrouped &&
              (addingTo === g.name ? (
                <AddAccountsPanel
                  candidates={accountsOutside(g.name)}
                  picked={picked}
                  onToggle={togglePicked}
                  onCancel={() => setAddingTo(null)}
                  onConfirm={() => submitAddAccounts(g.name)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => openAddAccounts(g.name)}
                  className="flex w-full items-center justify-center gap-1 border-t border-border-subtle px-3 py-2.5 text-xs font-semibold text-state-good-fg hover:bg-green-50 dark:hover:bg-green-900/20"
                >
                  <Plus className="h-4 w-4" /> Thêm tài khoản vào nhóm
                </button>
              ))}
          </div>
        )}
      </section>
    )
  }

  const ungroupedGroup = groups.find((g) => g.name === UNGROUPED_LABEL)

  return (
    <div
      ref={rootRef}
      className="p-3 lg:p-6"
      onPointerMove={onAccPointerMove}
      onPointerUp={onAccPointerEnd}
      onPointerCancel={onAccPointerEnd}
    >
      <div className="mb-3 flex items-center gap-2">
        <BackLink to="/assets" aria-label="Quay lại" />
        <h1 className="flex-1 text-lg font-bold text-fg-primary">Nhóm tài sản</h1>
        <button
          type="button"
          onClick={() => {
            setAdding(true)
            setNewName('')
          }}
          className="flex items-center gap-1 rounded-lg bg-accent text-fg-on-accent px-3 py-1.5 text-sm font-semibold shadow-sm active:scale-95"
        >
          <Plus className="h-4 w-4" /> Thêm nhóm
        </button>
      </div>

      <Guide className="mb-3 rounded-xl bg-surface-sunken p-3 text-xs text-fg-secondary">
        Bật/tắt <b>Tính vào tổng</b> để một nhóm có được cộng vào Tổng tài sản hay không.
        Bật <b>Ẩn</b> để giấu nhóm khỏi trang Tài sản (vẫn quản lý được ở đây). Nhấn giữ
        biểu tượng <b>⁚⁚</b> rồi kéo–thả để sắp thứ tự nhóm, sắp tài khoản trong nhóm,
        hoặc kéo tài khoản thả sang nhóm khác.
      </Guide>

      {adding && (
        <div className="mb-2 flex items-center gap-1 rounded-xl bg-surface px-3 py-2.5 shadow-sm">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNewGroup()
              if (e.key === 'Escape') setAdding(false)
            }}
            placeholder="Tên nhóm mới…"
            className="w-full rounded-lg border border-border-strong px-2 py-1 text-sm outline-green-500"
          />
          <button
            type="button"
            onClick={submitNewGroup}
            className="rounded-lg bg-accent text-fg-on-accent px-2 py-1 text-xs font-semibold"
          >
            Lưu
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="min-h-11 rounded-lg px-2 py-1 text-xs text-fg-muted"
          >
            Hủy
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="py-10 text-center text-fg-muted">Đang tải…</p>
      ) : groups.length === 0 ? (
        <p className="py-10 text-center text-fg-muted">
          Chưa có nhóm nào. Bấm "Thêm nhóm" để tạo, hoặc thêm tài khoản rồi gán nhóm.
        </p>
      ) : (
        <>
          <DragList
            className="space-y-2"
            ids={namedGroups.map((g) => g.name)}
            onReorder={(names) => reorder.mutate(names)}
            render={(name, handle, dragging) => {
              const g = namedGroups.find((x) => x.name === name)
              return g ? renderGroup(g, handle, dragging) : null
            }}
          />
          {ungroupedGroup && <div className="mt-2">{renderGroup(ungroupedGroup)}</div>}
        </>
      )}

      {deleting && (
        <DeleteGroupSheet
          group={deleting}
          otherGroups={allGroupNames.filter((n) => n !== deleting.name)}
          onClose={() => setDeleting(null)}
          onConfirm={(reassignTo) => {
            remove.mutate({ name: deleting.name, reassignTo })
            setDeleting(null)
          }}
        />
      )}
    </div>
  )
}

/** Bảng chọn nhiều tài khoản (từ nhóm khác) để kéo vào nhóm hiện tại. */
function AddAccountsPanel({
  candidates,
  picked,
  onToggle,
  onCancel,
  onConfirm,
}: {
  candidates: AssetAccount[]
  picked: Set<string>
  onToggle: (id: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="bg-surface-sunken px-3 py-2">
      {candidates.length === 0 ? (
        <p className="py-2 text-center text-xs text-fg-muted">
          Không còn tài khoản nào ở nhóm khác để thêm.
        </p>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          {candidates.map((a) => {
            const checked = picked.has(a.id)
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onToggle(a.id)}
                className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-white dark:hover:bg-gray-900"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    checked
                      ? 'border-accent bg-accent text-fg-on-accent'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                  aria-hidden
                >
                  {checked && <Check className="h-3.5 w-3.5" />}
                </span>
                <AccountTypeIcon type={a.type} className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm text-fg-secondary">
                  {a.name}
                </span>
                <span className="shrink-0 text-xs text-fg-muted">
                  {formatMoney(a.balance, a.currency)}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className="mt-2 flex justify-end gap-1 border-t border-border-panel pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-lg px-3 py-1.5 text-xs text-fg-muted"
        >
          Hủy
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={picked.size === 0}
          className="rounded-lg bg-accent text-fg-on-accent px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
        >
          Thêm{picked.size > 0 ? ` (${picked.size})` : ''}
        </button>
      </div>
    </div>
  )
}

function DeleteGroupSheet({
  group,
  otherGroups,
  onClose,
  onConfirm,
}: {
  group: AssetGroup
  otherGroups: string[]
  onClose: () => void
  onConfirm: (reassignTo: string | null) => void
}) {
  useEscClose(onClose)
  // '' = Chưa phân nhóm (null); tên khác = gộp vào nhóm đó
  const [target, setTarget] = useState('')

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-base font-bold text-fg-primary">Xóa nhóm "{group.name}"</h2>
        <p className="mb-3 text-sm text-fg-muted">
          {group.accounts.length} tài khoản trong nhóm sẽ được chuyển sang:
        </p>

        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="mb-4 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm"
        >
          <option value="">{UNGROUPED_LABEL}</option>
          {otherGroups.map((name) => (
            <option key={name} value={name}>
              Gộp vào: {name}
            </option>
          ))}
        </select>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg px-3 py-2 text-sm text-fg-muted hover:bg-surface-sunken"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => onConfirm(target || null)}
            className="min-h-11 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white active:scale-95"
          >
            Xóa nhóm
          </button>
        </div>
      </div>
    </div>
  )
}
