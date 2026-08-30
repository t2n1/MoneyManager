// Nhóm tài sản — mặt CẤU HÌNH của cách cắt lát Tổng tài sản.
//
// ---- Vì sao là một BẢNG (redesign 2026-08-30) --------------------------------------
//
// Bản trước là năm thẻ xếp dọc, mỗi thẻ mở sẵn danh sách tài khoản, mỗi dòng tài khoản
// mang một <select> liệt kê đủ SÁU nhóm. Đo trên sổ demo: 6 ô select giống hệt nhau
// trên một màn, và hai công tắc "Tính vào tổng" / "Ẩn" mỗi nhóm chiếm trọn một hàng
// riêng. Câu hỏi người ta mở trang này để hỏi — "nhóm nào KHÔNG được tính vào tổng" —
// phải cuộn hết năm thẻ mới trả lời được, vì hai công tắc nằm rải ở năm độ cao khác nhau.
//
// Bảng đặt chúng thành hai CỘT thẳng hàng, nên câu đó trả lời được trong một cái liếc.
// Đổi lại, tài khoản phải bấm mở mới thấy — chấp nhận được: trang này là chỗ SẮP XẾP,
// không phải chỗ đọc số (số đã có ở tab Tài sản).
//
// Vạch xếp chồng ở đầu trang dùng CHUNG bảng màu với tab Tài sản (groupColors.ts), và
// mỗi dòng mang một chấm màu khớp lát của nó — hai thứ đọc cùng chiều thì mắt không
// phải bắc cầu. Đây cũng là lý do bảng màu được tách ra khỏi AssetsNowView.
//
// ---- Số ở dòng tài khoản là `value`, không phải `balance` ---------------------------
//
// Bản trước in `a.balance` (số dư SỔ; với đầu tư = vốn gốc ròng) trong khi tổng của
// nhóm cộng `baseValue` (= giá trị HIỆN HÀNH). Trên sổ demo, nhóm "Tài sản Nhật" ghi
// tổng ¥80.757 mà dòng con duy nhất của nó ghi ¥630.000 — một nhóm tự mâu thuẫn với
// chính mình. `a.value` là con số tổng đang cộng, nên nó là con số phải in.
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Guide } from '../../components/Guide'
import { Check, ChevronDown, ChevronRight, GripVertical, Plus } from 'lucide-react'
import { AccountTypeIcon } from '../../components/icons'
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
import { confirmDialog, promptDialog, showToast } from '../../lib/dialog'
import {
  assetBreakdown,
  formatShare,
  UNGROUPED_LABEL,
  type AssetAccount,
  type AssetGroup,
  type AssetGroupSetting,
} from './aggregate'
import { GROUP_COLOR_NONE, groupColorMap } from './groupColors'
import {
  ActionButton,
  Card,
  EmptyState,
  Money,
  Num,
  PageHeader,
  SectionTitle,
  Select,
} from '../../components/ui'

const NEW_GROUP = '__new__'

/** Lát nhỏ nhất vẫn phải thấy được — cùng sàn với vạch cơ cấu ở tab Tài sản. */
const SAN_LAT_PX = 2

// Bề rộng cột. Điện thoại ba cột (tay nắm · tên · tổng), từ `lg` bảy cột.
//
// `grid` KHÔNG nằm trong hằng số này, và đó là chuyện đã cắn một lần ở repo: `hidden`
// với `grid` đều là tiện ích display, class nào thắng là do THỨ TỰ TRONG CSS chứ không
// do thứ tự trong chuỗi — nên hàng tiêu đề phải viết `hidden … lg:grid` với `grid` ở
// biến thể `lg:`, không phải `hidden` cạnh một `grid` trần.
//
// rem chứ px: Cài đặt → Cỡ chữ phóng chữ trong cột mà cột px thì đứng yên (§13).
const GRID =
  'grid-cols-[1.25rem_minmax(0,1fr)_minmax(5.5rem,auto)] items-center gap-x-2 ' +
  'lg:grid-cols-[1.25rem_minmax(0,1fr)_2.5rem_minmax(7rem,auto)_3rem_4.75rem_3.25rem]'

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
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center"
    >
      <span
        className={`relative block h-5 w-9 rounded-full transition ${
          checked ? 'bg-accent' : 'bg-border-strong'
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

  // Mặc định THU GỌN mọi nhóm; chỉ lưu nhóm đang mở. Ngược với bản thẻ cũ (mở sẵn tất)
  // — đó chính là điều làm bảng thành bảng: quét trước, mở sau.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
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
        // Nhóm rỗng (mới tạo, chưa gán tài khoản): không có tài khoản nào thì cũng
        // không có tổng thô lẫn số gốc nào.
        rawTotal: 0,
        nativeTotal: null,
        nativeCurrency: null,
        nativeTotals: [],
        rawHasMissingRate: false,
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

  // Màu lát — cùng hàm với tab Tài sản, nên chấm màu ở đây khớp lát ở đó.
  const colorByName = useMemo(() => groupColorMap(groups), [groups])
  const colorOf = (name: string) => colorByName.get(name) ?? GROUP_COLOR_NONE

  // Mẫu số của vạch = tổng các nhóm ĐƯỢC tính vào tổng, đúng như tab Tài sản.
  const counted = useMemo(
    () =>
      groups
        .filter((g) => g.includeInTotals && g.total > 0)
        .slice()
        .sort((a, b) => b.total - a.total),
    [groups],
  )
  const tongTinh = counted.reduce((s, g) => s + g.total, 0)
  const thieuTyGia = groups.some((g) => g.hasMissingRate)
  const soTaiKhoan = groups.reduce((n, g) => n + g.accounts.length, 0)
  const ngoaiTong = namedGroups.filter((g) => !g.includeInTotals)
  const soAn = namedGroups.filter((g) => g.hidden).length

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
    // Kéo tới một nhóm đang thu gọn thì MỞ nó ra: không mở thì hàng đang kéo biến mất
    // khỏi màn (nó đã rời nhóm cũ, mà nhóm mới thì đang đóng) và người kéo mất dấu.
    if (!expanded.has(targetGroup)) {
      const nhom = targetGroup
      setExpanded((prev) => (prev.has(nhom) ? prev : new Set(prev).add(nhom)))
    }
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

  function toggleExpanded(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
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

  /**
   * Con số ở cột "Tổng".
   *
   * Nhóm ĐỨNG NGOÀI tổng có `total = 0` theo định nghĩa, nên in `total` cho nó là ghi
   * "¥0" cạnh một nhóm đang giữ hàng trăm triệu. Nhóm một loại tiền thì in tiền GỐC;
   * nhóm nhiều loại tiền không cộng được nếu không quy đổi nên đành in `rawTotal`.
   */
  function tongCua(g: AssetGroup): ReactNode {
    if (g.includeInTotals)
      return <Money amount={g.total} currency={base} approx={g.hasMissingRate} />
    if (g.nativeTotals.length === 1)
      return <Money amount={g.nativeTotals[0].amount} currency={g.nativeTotals[0].currency} />
    return <Money amount={g.rawTotal} currency={base} approx={g.rawHasMissingRate} />
  }

  // Vẽ một nhóm (dùng cho cả nhóm kéo–thả lẫn "Chưa phân nhóm" cố định cuối).
  // `handle` có = nhóm sắp thứ tự được (hiện tay nắm); không có = cố định.
  function renderGroup(g: AssetGroup, handle?: DragHandleProps, dragging = false): ReactNode {
    const isUngrouped = g.name === UNGROUPED_LABEL
    const isOpen = expanded.has(g.name)
    const laDich = dragAcc != null && dropAt?.group === g.name
    return (
      <div
        ref={(el) => setZone(g.name, el)}
        className={`border-b border-border-subtle last:border-b-0 ${
          isUngrouped ? 'bg-surface-chrome' : ''
        } ${dragging ? 'bg-surface-sunken' : ''} ${laDich ? 'ring-1 ring-inset ring-accent' : ''}`}
      >
        <div className={`grid ${GRID} min-h-12 px-3 py-1.5`}>
          {handle ? (
            <button
              type="button"
              {...handle}
              className="-ml-1 inline-flex h-11 w-5 cursor-grab touch-none items-center justify-center text-fg-muted active:cursor-grabbing"
              aria-label={`Kéo để sắp thứ tự nhóm ${g.name}`}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          ) : (
            <span />
          )}

          {renaming === g.name ? (
            <div className="col-span-2 flex items-center gap-1.5 lg:col-span-6">
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitRename(g.name)
                  if (e.key === 'Escape') setRenaming(null)
                }}
                aria-label={`Tên mới cho nhóm ${g.name}`}
                className="min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm"
              />
              <ActionButton variant="primary" onClick={() => submitRename(g.name)}>
                Lưu
              </ActionButton>
              <ActionButton onClick={() => setRenaming(null)}>Hủy</ActionButton>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => toggleExpanded(g.name)}
                aria-expanded={isOpen}
                className="flex min-w-0 flex-col justify-center py-1 text-left"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-sm"
                    style={{ backgroundColor: colorOf(g.name) }}
                    aria-hidden
                  />
                  <span
                    className={`min-w-0 truncate text-sm ${
                      isUngrouped ? 'text-fg-secondary' : 'text-fg-primary'
                    }`}
                  >
                    {g.name}
                  </span>
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-fg-muted" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" />
                  )}
                  {g.hidden && (
                    <span className="shrink-0 text-2xs text-fg-muted">· đang ẩn</span>
                  )}
                </span>
                {/* Dòng phụ chỉ có ở điện thoại — từ `lg` hai con số này đã là hai cột. */}
                <span className="text-2xs text-fg-muted lg:hidden">
                  <Num tone="muted">{g.accounts.length}</Num> tài khoản ·{' '}
                  <Num tone="muted">{formatShare(g.share)}</Num>
                  {!g.includeInTotals && ' · ngoài tổng'}
                </span>
              </button>

              <span className="hidden justify-self-end text-sm lg:block">
                <Num tone="muted">{g.accounts.length}</Num>
              </span>

              <span className="justify-self-end text-sm">{tongCua(g)}</span>

              <span className="hidden justify-self-end text-sm lg:block">
                <Num tone="muted">{formatShare(g.share)}</Num>
              </span>

              {isUngrouped ? (
                <>
                  <span className="hidden lg:block" />
                  <span className="hidden lg:block" />
                </>
              ) : (
                <>
                  <span className="hidden justify-self-center lg:block">
                    <Toggle
                      label={`Tính nhóm ${g.name} vào tổng`}
                      checked={g.includeInTotals}
                      onChange={(v) =>
                        upsert.mutate({ name: g.name, patch: { include_in_totals: v } })
                      }
                    />
                  </span>
                  <span className="hidden justify-self-center lg:block">
                    <Toggle
                      label={`Ẩn nhóm ${g.name} khỏi trang Tài sản`}
                      checked={g.hidden}
                      onChange={(v) => upsert.mutate({ name: g.name, patch: { is_hidden: v } })}
                    />
                  </span>
                </>
              )}
            </>
          )}
        </div>

        {/* Hai công tắc ở điện thoại: xuống hàng riêng, vì bảy cột không vừa 375px. */}
        {!isUngrouped && renaming !== g.name && (
          <div className="flex items-center gap-4 px-3 pb-1.5 lg:hidden">
            <label className="flex items-center gap-1 text-2xs text-fg-secondary">
              <Toggle
                label={`Tính nhóm ${g.name} vào tổng`}
                checked={g.includeInTotals}
                onChange={(v) => upsert.mutate({ name: g.name, patch: { include_in_totals: v } })}
              />
              Tính vào tổng
            </label>
            <label className="flex items-center gap-1 text-2xs text-fg-secondary">
              <Toggle
                label={`Ẩn nhóm ${g.name} khỏi trang Tài sản`}
                checked={g.hidden}
                onChange={(v) => upsert.mutate({ name: g.name, patch: { is_hidden: v } })}
              />
              Ẩn
            </label>
          </div>
        )}

        {/* Vùng mở KHÔNG dùng `bg-surface-sunken`, dù "lún vào trong" là đúng nghĩa:
            §Màu ghi rõ chữ mờ trên nền lún phải là `fg-on-track`, mà số dư ở đây đi qua
            <Money tone="muted"> — `fg-muted` trên `surface-sunken` chỉ 4,39:1 ở chế độ
            Sáng, tức trượt AA. Thụt lề + một vạch dọc nói "con của dòng trên" cũng rõ
            như đổi nền, mà không kéo theo một cặp màu hỏng. */}
        {isOpen && (
          <div className="border-t border-border-subtle">
           <div className="ml-6 border-l border-border-subtle">
            {displayIdsOf(g.name).map((id) => {
              const a = accountById.get(id)
              if (!a) return null
              return (
                <div
                  key={id}
                  ref={(el) => setRow(id, el)}
                  className={`flex items-center gap-1.5 px-2 py-1 ${
                    id === dragAcc ? 'bg-surface-sunken' : ''
                  }`}
                >
                  <button
                    type="button"
                    onPointerDown={(e) => onAccPointerDown(id, e)}
                    style={{ touchAction: 'none' }}
                    className="inline-flex h-11 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-fg-muted active:cursor-grabbing"
                    aria-label={`Kéo để sắp thứ tự hoặc chuyển nhóm ${a.name}`}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                  <AccountTypeIcon type={a.type} className="h-4 w-4 shrink-0 text-fg-muted" />
                  <span className="min-w-0 flex-1 truncate text-sm text-fg-secondary">
                    {a.name}
                  </span>
                  {/* `value` chứ `balance`: xem chú thích đầu file. */}
                  <Money amount={a.value} currency={a.currency} tone="muted" className="shrink-0" />
                  <Select
                    value={g.name}
                    onChange={(e) => moveAccount(a.id, e.target.value)}
                    aria-label={`Chuyển ${a.name} sang nhóm khác`}
                    wrapClassName="shrink-0"
                  >
                    {allGroupNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                    <option value={UNGROUPED_LABEL}>{UNGROUPED_LABEL}</option>
                    <option value={NEW_GROUP}>+ Nhóm mới…</option>
                  </Select>
                </div>
              )
            })}

            {displayIdsOf(g.name).length === 0 && (
              <p className="px-2 py-2.5 text-sm text-fg-muted">
                {dragAcc != null ? 'Thả vào đây để chuyển nhóm' : 'Không có tài khoản'}
              </p>
            )}

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
                // Ba việc hiếm của một nhóm nằm ở ĐÂY chứ không ở hàng nhóm: hàng nhóm
                // xuất hiện 6 lần trên màn, ba nút nữa mỗi hàng là 18 nút cho những việc
                // làm vài tháng một lần. Mở nhóm ra là đã nói "tôi đang sửa nhóm này".
                <div className="flex flex-wrap gap-1.5 border-t border-border-subtle px-2 py-2">
                  <ActionButton onClick={() => openAddAccounts(g.name)}>
                    <Plus className="h-4 w-4" /> Thêm tài khoản
                  </ActionButton>
                  <ActionButton
                    onClick={() => {
                      setRenaming(g.name)
                      setRenameValue(g.name)
                    }}
                  >
                    Đổi tên
                  </ActionButton>
                  <ActionButton variant="danger" onClick={() => setDeleting(g)}>
                    Xóa nhóm
                  </ActionButton>
                </div>
              ))}
           </div>
          </div>
        )}
      </div>
    )
  }

  const ungroupedGroup = groups.find((g) => g.name === UNGROUPED_LABEL)

  return (
    <div
      ref={rootRef}
      className="flex flex-col gap-3 p-3 lg:p-6"
      onPointerMove={onAccPointerMove}
      onPointerUp={onAccPointerEnd}
      onPointerCancel={onAccPointerEnd}
    >
      <PageHeader title="Nhóm tài sản" back="/settings">
        <ActionButton
          variant="primary"
          onClick={() => {
            setAdding(true)
            setNewName('')
          }}
        >
          <Plus className="h-4 w-4" /> Thêm nhóm
        </ActionButton>
      </PageHeader>

      {adding && (
        <Card as="section" elevation="panel" padding="sm" className="flex items-center gap-1.5">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNewGroup()
              if (e.key === 'Escape') setAdding(false)
            }}
            placeholder="Tên nhóm mới…"
            aria-label="Tên nhóm mới"
            className="min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm"
          />
          <ActionButton variant="primary" onClick={submitNewGroup}>
            Lưu
          </ActionButton>
          <ActionButton onClick={() => setAdding(false)}>Hủy</ActionButton>
        </Card>
      )}

      {isLoading ? (
        <EmptyState>Đang tải…</EmptyState>
      ) : groups.length === 0 ? (
        <EmptyState>
          Chưa có nhóm nào. Bấm "Thêm nhóm" để tạo, hoặc thêm tài khoản rồi gán nhóm.
        </EmptyState>
      ) : (
        <>
          {/* Đầu trang trả lời "cái tổng kia gồm những gì" — đúng câu mà hai công tắc
              bên dưới đang điều khiển. Không có nó thì bật/tắt "Tính vào tổng" là đổi
              một con số nằm ở màn khác. */}
          <Card as="section" elevation="panel" padding="panel">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <SectionTitle role="micro">Tổng tính vào tài sản</SectionTitle>
              <span className="text-2xs text-fg-muted">
                <Num tone="muted">{namedGroups.length}</Num> nhóm ·{' '}
                <Num tone="muted">{soTaiKhoan}</Num> tài khoản
                {ngoaiTong.length > 0 && (
                  <>
                    {' · '}
                    <Num tone="muted">{ngoaiTong.length}</Num> ngoài tổng
                  </>
                )}
                {soAn > 0 && (
                  <>
                    {' · '}
                    <Num tone="muted">{soAn}</Num> đang ẩn
                  </>
                )}
              </span>
            </div>
            <p className="mt-1">
              <Money
                amount={tongTinh}
                currency={base}
                approx={thieuTyGia}
                className="text-kpi font-medium tracking-number"
              />
            </p>
            {counted.length > 0 && (
              <div className="mt-2.5 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-surface-sunken">
                {counted.map((g) => (
                  <div
                    key={g.name}
                    className="h-full"
                    style={{
                      width: `${(g.total / tongTinh) * 100}%`,
                      minWidth: SAN_LAT_PX,
                      backgroundColor: colorOf(g.name),
                    }}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card as="section" elevation="panel" padding="none" className="overflow-hidden">
            {/* Hàng tiêu đề chỉ có từ `lg`: ở điện thoại bảng chỉ còn ba cột và mỗi
                dòng đã tự nói ra nhãn của nó ở dòng phụ. */}
            <div
              className={`hidden ${GRID} border-b border-border-panel bg-surface-chrome px-3 py-2.5 text-2xs uppercase tracking-label text-fg-muted lg:grid`}
            >
              <span />
              <span>Nhóm</span>
              <span className="justify-self-end">TK</span>
              <span className="justify-self-end">Tổng</span>
              <span className="justify-self-end">Phần</span>
              <span className="justify-self-center">Vào tổng</span>
              <span className="justify-self-center">Ẩn</span>
            </div>

            <DragList
              ids={namedGroups.map((g) => g.name)}
              onReorder={(names) => reorder.mutate(names)}
              render={(name, handle, dragging) => {
                const g = namedGroups.find((x) => x.name === name)
                return g ? renderGroup(g, handle, dragging) : null
              }}
            />
            {ungroupedGroup && renderGroup(ungroupedGroup)}
          </Card>

          <Guide className="text-2xs leading-snug text-fg-muted">
            <b>Tính vào tổng</b> quyết định nhóm có được cộng vào Tổng tài sản hay không.{' '}
            <b>Ẩn</b> giấu nhóm khỏi trang Tài sản mà vẫn quản lý được ở đây. Nhấn giữ{' '}
            <b>⁚⁚</b> rồi kéo để sắp thứ tự nhóm, sắp tài khoản trong nhóm, hoặc kéo tài
            khoản thả sang nhóm khác.
          </Guide>
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
    <div className="border-t border-border-subtle px-2 py-2">
      {candidates.length === 0 ? (
        <p className="py-2 text-sm text-fg-muted">
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
                aria-pressed={checked}
                className="flex min-h-11 w-full items-center gap-2 rounded-md px-1 text-left hover:bg-surface-sunken"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    checked
                      ? 'border-accent bg-accent text-fg-on-accent'
                      : 'border-border-strong'
                  }`}
                  aria-hidden
                >
                  {checked && <Check className="h-3.5 w-3.5" />}
                </span>
                <AccountTypeIcon type={a.type} className="h-4 w-4 shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1 truncate text-sm text-fg-secondary">
                  {a.name}
                </span>
                <Money amount={a.value} currency={a.currency} tone="muted" className="shrink-0" />
              </button>
            )
          })}
        </div>
      )}

      <div className="mt-2 flex justify-end gap-1.5 border-t border-border-subtle pt-2">
        <ActionButton onClick={onCancel}>Hủy</ActionButton>
        <ActionButton variant="primary" disabled={picked.size === 0} onClick={onConfirm}>
          Thêm{picked.size > 0 ? ` (${picked.size})` : ''}
        </ActionButton>
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
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <SectionTitle role="block" className="mb-1">Xóa nhóm "{group.name}"</SectionTitle>
        <p className="mb-3 text-sm text-fg-muted">
          {group.accounts.length} tài khoản trong nhóm sẽ được chuyển sang:
        </p>

        <Select
          value={target}
          onChange={(e) => setTarget(e.target.value)} wrapClassName="mb-4 w-full">
          <option value="">{UNGROUPED_LABEL}</option>
          {otherGroups.map((name) => (
            <option key={name} value={name}>
              Gộp vào: {name}
            </option>
          ))}
        </Select>

        <div className="flex justify-end gap-2">
          <ActionButton onClick={onClose}>Hủy</ActionButton>
          <ActionButton variant="danger" onClick={() => onConfirm(target || null)}>
            Xóa nhóm
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
