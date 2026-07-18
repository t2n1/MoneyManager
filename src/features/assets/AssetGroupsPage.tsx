import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Plus } from 'lucide-react'
import { AccountTypeIcon } from '../../components/icons'
import {
  useAccountBalances,
  useAssetGroupSettings,
  useAssignAccountsToGroup,
  useDeleteAssetGroup,
  useRenameAssetGroup,
  useReorderAssetGroups,
  useRates,
  useUpsertAssetGroupSetting,
} from '../../hooks/queries'
import { formatMoney } from '../../lib/money'
import { assetBreakdown, UNGROUPED_LABEL, type AssetGroup, type AssetGroupSetting } from './aggregate'

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
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${
        checked ? 'bg-green-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
          checked ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}

export function AssetGroupsPage() {
  const { data: balances = [], isLoading } = useAccountBalances()
  const { data: groupSettings = [] } = useAssetGroupSettings()
  const { base, rates } = useRates()

  const upsert = useUpsertAssetGroupSetting()
  const rename = useRenameAssetGroup()
  const remove = useDeleteAssetGroup()
  const reorder = useReorderAssetGroups()
  const assign = useAssignAccountsToGroup()

  const [expanded, setExpanded] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleting, setDeleting] = useState<AssetGroup | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

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

  function moveGroup(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= namedGroups.length) return
    const names = namedGroups.map((g) => g.name)
    ;[names[index], names[target]] = [names[target], names[index]]
    reorder.mutate(names)
  }

  function submitRename(oldName: string) {
    const newName = renameValue.trim()
    setRenaming(null)
    if (!newName || newName === oldName) return
    const merging = allGroupNames.includes(newName)
    if (merging && !window.confirm(`Nhóm "${newName}" đã tồn tại. Gộp "${oldName}" vào nhóm này?`))
      return
    rename.mutate({ oldName, newName })
  }

  function submitNewGroup() {
    const name = newName.trim()
    if (!name) return
    if (name === UNGROUPED_LABEL || allGroupNames.includes(name)) {
      window.alert(`Nhóm "${name}" đã tồn tại.`)
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

  function moveAccount(accountId: string, target: string) {
    if (target === NEW_GROUP) {
      const name = window.prompt('Tên nhóm mới:')?.trim()
      if (!name) return
      assign.mutate({ accountIds: [accountId], group: name })
      return
    }
    assign.mutate({
      accountIds: [accountId],
      group: target === UNGROUPED_LABEL ? null : target,
    })
  }

  return (
    <div className="p-3 lg:p-6">
      <div className="mb-3 flex items-center gap-2">
        <Link
          to="/assets"
          className="rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Quay lại"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-lg font-bold text-gray-800 dark:text-gray-100">Nhóm tài sản</h1>
        <button
          type="button"
          onClick={() => {
            setAdding(true)
            setNewName('')
          }}
          className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm active:scale-95"
        >
          <Plus className="h-4 w-4" /> Thêm nhóm
        </button>
      </div>

      <p className="mb-3 rounded-xl bg-blue-50 dark:bg-blue-900/30 p-3 text-xs text-blue-800 dark:text-blue-300">
        Bật/tắt <b>Tính vào tổng</b> để một nhóm có được cộng vào Tổng tài sản hay không.
        Bật <b>Ẩn</b> để giấu nhóm khỏi trang Tài sản (vẫn quản lý được ở đây). Kéo thứ tự
        bằng nút ▲▼.
      </p>

      {adding && (
        <div className="mb-2 flex items-center gap-1 rounded-xl bg-white dark:bg-gray-900 px-3 py-2.5 shadow-sm">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNewGroup()
              if (e.key === 'Escape') setAdding(false)
            }}
            placeholder="Tên nhóm mới…"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-2 py-1 text-sm outline-green-500"
          />
          <button
            type="button"
            onClick={submitNewGroup}
            className="rounded-lg bg-green-600 px-2 py-1 text-xs font-semibold text-white"
          >
            Lưu
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="rounded-lg px-2 py-1 text-xs text-gray-500 dark:text-gray-400"
          >
            Hủy
          </button>
        </div>
      )}

      {isLoading ? (
        <p className="py-10 text-center text-gray-400 dark:text-gray-500">Đang tải…</p>
      ) : groups.length === 0 ? (
        <p className="py-10 text-center text-gray-400 dark:text-gray-500">
          Chưa có nhóm nào. Bấm "Thêm nhóm" để tạo, hoặc thêm tài khoản rồi gán nhóm.
        </p>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => {
            const isUngrouped = g.name === UNGROUPED_LABEL
            const namedIndex = namedGroups.findIndex((x) => x.name === g.name)
            const isOpen = expanded === g.name
            return (
              <section key={g.name} className="overflow-hidden rounded-xl bg-white dark:bg-gray-900 shadow-sm">
                <div className="flex items-center gap-2 px-3 py-2.5">
                  {/* Nút sắp thứ tự (không áp dụng cho Chưa phân nhóm) */}
                  {!isUngrouped ? (
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => moveGroup(namedIndex, -1)}
                        disabled={namedIndex === 0}
                        className="text-xs text-gray-400 dark:text-gray-500 disabled:opacity-20"
                        aria-label="Lên"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveGroup(namedIndex, 1)}
                        disabled={namedIndex === namedGroups.length - 1}
                        className="text-xs text-gray-400 dark:text-gray-500 disabled:opacity-20"
                        aria-label="Xuống"
                      >
                        ▼
                      </button>
                    </div>
                  ) : (
                    <div className="w-3" />
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
                          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-2 py-1 text-sm outline-green-500"
                        />
                        <button
                          type="button"
                          onClick={() => submitRename(g.name)}
                          className="rounded-lg bg-green-600 px-2 py-1 text-xs font-semibold text-white"
                        >
                          Lưu
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenaming(null)}
                          className="rounded-lg px-2 py-1 text-xs text-gray-500 dark:text-gray-400"
                        >
                          Hủy
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : g.name)}
                        className="block w-full text-left"
                      >
                        <span className="block truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                          {g.name} {isOpen ? '▾' : '▸'}
                        </span>
                        <span className="block text-xs text-gray-400 dark:text-gray-500">
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
                        className="rounded-lg px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        Đổi tên
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(g)}
                        className="rounded-lg px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                      >
                        Xóa
                      </button>
                    </div>
                  )}
                </div>

                {/* Công tắc tính vào tổng / ẩn */}
                <div className="flex items-center gap-4 border-t border-gray-100 dark:border-gray-800 px-3 py-2">
                  <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                    <Toggle
                      label="Tính vào tổng"
                      checked={g.includeInTotals}
                      onChange={(v) =>
                        upsert.mutate({ name: g.name, patch: { include_in_totals: v } })
                      }
                    />
                    Tính vào tổng
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                    <Toggle
                      label="Ẩn nhóm"
                      checked={g.hidden}
                      onChange={(v) => upsert.mutate({ name: g.name, patch: { is_hidden: v } })}
                    />
                    Ẩn
                  </label>
                </div>

                {/* Danh sách tài khoản + chuyển nhóm */}
                {isOpen && (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800 border-t border-gray-100 dark:border-gray-800">
                    {g.accounts.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 px-3 py-2">
                        <span className="flex min-w-0 flex-1 items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
                          <AccountTypeIcon type={a.type} className="h-4 w-4 shrink-0" />
                          <span className="truncate">{a.name}</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {formatMoney(a.balance, a.currency)}
                          </span>
                        </span>
                        <select
                          value={g.name}
                          onChange={(e) => moveAccount(a.id, e.target.value)}
                          className="shrink-0 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs"
                          aria-label={`Chuyển ${a.name} sang nhóm khác`}
                        >
                          {allGroupNames.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                          <option value={UNGROUPED_LABEL}>{UNGROUPED_LABEL}</option>
                          <option value={NEW_GROUP}>＋ Nhóm mới…</option>
                        </select>
                      </div>
                    ))}
                    {g.accounts.length === 0 && (
                      <p className="px-3 py-3 text-center text-xs text-gray-400 dark:text-gray-500">
                        Không có tài khoản
                      </p>
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>
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
  // '' = Chưa phân nhóm (null); tên khác = gộp vào nhóm đó
  const [target, setTarget] = useState('')

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white dark:bg-gray-900 p-4 lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-base font-bold text-gray-800 dark:text-gray-100">Xóa nhóm "{group.name}"</h2>
        <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
          {group.accounts.length} tài khoản trong nhóm sẽ được chuyển sang:
        </p>

        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="mb-4 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
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
            className="rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => onConfirm(target || null)}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white active:scale-95"
          >
            Xóa nhóm
          </button>
        </div>
      </div>
    </div>
  )
}
