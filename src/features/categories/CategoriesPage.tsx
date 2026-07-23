import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronUp, Plus } from 'lucide-react'
import type { NewCategory } from '../../data'
import {
  useCategories,
  useCreateCategory,
  useReorderCategories,
  useUpdateCategory,
} from '../../hooks/queries'
import type { CategoryRow, CategoryType } from '../../types/database.types'

// Bảng emoji gợi ý khi thêm/sửa danh mục
const EMOJI_CHOICES = [
  '🍜', '🍔', '☕', '🛒', '🚌', '🚕', '⛽', '🛍️', '👕', '🧾', '💡', '🏠',
  '💊', '🏥', '🎮', '🎬', '📚', '✈️', '🎁', '💰', '🎉', '🧧', '📈', '💵',
  '🐶', '🎵', '💇', '🏋️', '📱', '💳', '🍰', '🍺', '⚽', '🌸', '🧸', '📦',
]

/** Trạng thái mở form: thêm mới (có thể kèm cha) hoặc sửa một danh mục. */
type FormState =
  | { category: null; parent: CategoryRow | null }
  | { category: CategoryRow; parent: CategoryRow | null }

export function CategoriesPage() {
  const { data: categories = [] } = useCategories()
  const reorder = useReorderCategories()
  const update = useUpdateCategory()

  const [tab, setTab] = useState<CategoryType>('expense')
  const [form, setForm] = useState<FormState | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const ofType = categories
    .filter((c) => c.type === tab)
    .sort((a, b) => a.sort_order - b.sort_order)
  const activeCats = ofType.filter((c) => !c.is_archived)
  const archivedCats = ofType.filter((c) => c.is_archived)

  const parents = activeCats.filter((c) => !c.parent_id)
  const parentIds = new Set(parents.map((p) => p.id))
  const childrenOf = (id: string) => activeCats.filter((c) => c.parent_id === id)
  // Con đang hoạt động nhưng cha không còn hiển thị (bảo hiểm cho dữ liệu cũ)
  const orphans = activeCats.filter((c) => c.parent_id && !parentIds.has(c.parent_id))

  const parentOptions = activeCats.filter((c) => !c.parent_id)
  const parentById = (id: string | null | undefined) =>
    id ? ofType.find((c) => c.id === id) ?? null : null

  /** Gán lại thứ tự cho toàn bộ danh mục của loại đang xem theo cây đã sắp. */
  function commitOrder(orderedParents: CategoryRow[], childrenFor: (id: string) => CategoryRow[]) {
    const ids: string[] = []
    for (const p of orderedParents) {
      ids.push(p.id)
      for (const ch of childrenFor(p.id)) ids.push(ch.id)
    }
    reorder.mutate([...ids, ...orphans.map((o) => o.id), ...archivedCats.map((a) => a.id)])
  }

  function moveParent(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= parents.length) return
    const next = [...parents]
    ;[next[index], next[target]] = [next[target], next[index]]
    commitOrder(next, childrenOf)
  }

  function moveChild(parentId: string, index: number, delta: number) {
    const sibs = childrenOf(parentId)
    const target = index + delta
    if (target < 0 || target >= sibs.length) return
    const nextSibs = [...sibs]
    ;[nextSibs[index], nextSibs[target]] = [nextSibs[target], nextSibs[index]]
    commitOrder(parents, (id) => (id === parentId ? nextSibs : childrenOf(id)))
  }

  /** Lưu trữ: cha kéo theo tất cả con đang hoạt động (ẩn cả nhóm). */
  function archive(c: CategoryRow) {
    const targets = c.parent_id ? [c] : [c, ...childrenOf(c.id)]
    Promise.all(targets.map((t) => update.mutateAsync({ id: t.id, patch: { is_archived: true } })))
  }

  /** Khôi phục: cha kéo theo con; con kéo theo cha (nếu cha đang bị ẩn). */
  function restore(c: CategoryRow) {
    const targets: CategoryRow[] = [c]
    if (!c.parent_id) {
      targets.push(...archivedCats.filter((x) => x.parent_id === c.id))
    } else {
      const parent = parentById(c.parent_id)
      if (parent?.is_archived) targets.push(parent)
    }
    Promise.all(targets.map((t) => update.mutateAsync({ id: t.id, patch: { is_archived: false } })))
  }

  return (
    <div className="p-3 lg:p-6">
      <div className="mb-3 flex items-center gap-2">
        <Link
          to="/settings"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Quay lại"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-lg font-bold text-gray-800 dark:text-gray-100">Danh mục</h1>
        <button
          type="button"
          onClick={() => setForm({ category: null, parent: null })}
          className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
        >
          + Thêm
        </button>
      </div>

      {/* Chi / Thu */}
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-gray-200 dark:bg-gray-800 p-1">
        {(['expense', 'income'] as CategoryType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg py-1.5 text-sm font-medium transition ${
              tab === t ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {t === 'expense' ? 'Chi' : 'Thu'}
          </button>
        ))}
      </div>

      {/* Cây danh mục: cha → con */}
      <div className="flex flex-col gap-2">
        {parents.map((p, i) => {
          const kids = childrenOf(p.id)
          return (
            <div key={p.id} className="overflow-hidden rounded-xl bg-white dark:bg-gray-900 shadow-sm">
              {/* Danh mục cha */}
              <div className="flex items-center gap-2 px-3 py-2.5">
                <ReorderArrows index={i} count={parents.length} onMove={(d) => moveParent(i, d)} />
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-xl">
                  {p.icon}
                </span>
                <button
                  type="button"
                  onClick={() => setForm({ category: p, parent: null })}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{p.name}</span>
                  {kids.length > 0 && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">{kids.length} danh mục con</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ category: null, parent: p })}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-green-50 dark:bg-green-900/30 px-2 py-1 text-green-700 dark:text-green-400 active:scale-95"
                  aria-label={`Thêm danh mục con cho ${p.name}`}
                >
                  <Plus className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => archive(p)}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Lưu trữ
                </button>
              </div>

              {/* Danh mục con */}
              {kids.length > 0 && (
                <div className="ml-6 border-l-2 border-gray-100 dark:border-gray-800">
                  {kids.map((ch, j) => (
                    <div key={ch.id} className="flex items-center gap-2 py-2 pr-3 pl-2">
                      <ReorderArrows
                        index={j}
                        count={kids.length}
                        onMove={(d) => moveChild(p.id, j, d)}
                      />
                      <span className="text-lg">{ch.icon}</span>
                      <button
                        type="button"
                        onClick={() => setForm({ category: ch, parent: p })}
                        className="min-w-0 flex-1 truncate text-left text-sm text-gray-700 dark:text-gray-300"
                      >
                        {ch.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => archive(ch)}
                        className="inline-flex min-h-11 items-center justify-center rounded-lg px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        Lưu trữ
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {/* Con mồ côi (dữ liệu cũ) — hiển thị như danh mục thường để không mất */}
        {orphans.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-xl bg-white dark:bg-gray-900 px-3 py-2.5 shadow-sm">
            <span className="text-xl">{c.icon}</span>
            <button
              type="button"
              onClick={() => setForm({ category: c, parent: parentById(c.parent_id) })}
              className="min-w-0 flex-1 truncate text-left text-sm text-gray-700 dark:text-gray-300"
            >
              {c.name}
            </button>
            <button
              type="button"
              onClick={() => archive(c)}
              className="inline-flex min-h-11 items-center justify-center rounded-lg px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Lưu trữ
            </button>
          </div>
        ))}

        {parents.length === 0 && orphans.length === 0 && (
          <p className="rounded-xl bg-white dark:bg-gray-900 px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400 shadow-sm">
            Chưa có danh mục
          </p>
        )}
      </div>

      {archivedCats.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="mb-2 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            {showArchived ? (
              <>
                Ẩn đã lưu trữ <ChevronUp className="h-4 w-4" />
              </>
            ) : (
              <>
                Đã lưu trữ ({archivedCats.length}) <ChevronDown className="h-4 w-4" />
              </>
            )}
          </button>
          {showArchived && (
            <div className="divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden rounded-xl bg-white dark:bg-gray-900 shadow-sm">
              {archivedCats.map((c) => (
                <div key={c.id} className="flex items-center gap-2 px-3 py-2.5 opacity-60">
                  {c.parent_id && <span className="text-gray-300 dark:text-gray-600">↳</span>}
                  <span className="text-xl">{c.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-300">{c.name}</span>
                  <button
                    type="button"
                    onClick={() => restore(c)}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg px-2 py-1 text-xs text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30"
                  >
                    Khôi phục
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {form && (
        <CategoryForm
          category={form.category}
          parentContext={form.parent}
          defaultType={tab}
          parentOptions={parentOptions}
          hasChildren={form.category ? childrenOf(form.category.id).length > 0 : false}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  )
}

function ReorderArrows({
  index,
  count,
  onMove,
}: {
  index: number
  count: number
  onMove: (delta: number) => void
}) {
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={index === 0}
        className="inline-flex min-w-11 items-center justify-center py-0.5 text-gray-500 dark:text-gray-400 disabled:opacity-20"
        aria-label="Lên"
      >
        <ChevronUp className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={index === count - 1}
        className="inline-flex min-w-11 items-center justify-center py-0.5 text-gray-500 dark:text-gray-400 disabled:opacity-20"
        aria-label="Xuống"
      >
        <ChevronDown className="h-5 w-5" />
      </button>
    </div>
  )
}

interface FormProps {
  category: CategoryRow | null
  /** Cha ngữ cảnh: khi thêm con thì là cha được chọn; khi sửa là cha hiện tại. */
  parentContext: CategoryRow | null
  defaultType: CategoryType
  /** Danh mục cha có thể chọn (danh mục chính đang hoạt động, cả 2 loại). */
  parentOptions: CategoryRow[]
  /** Danh mục đang sửa có con hay không → nếu có thì không thể biến thành con. */
  hasChildren: boolean
  onClose: () => void
}

function CategoryForm({
  category,
  parentContext,
  defaultType,
  parentOptions,
  hasChildren,
  onClose,
}: FormProps) {
  const create = useCreateCategory()
  const update = useUpdateCategory()

  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? '📦')
  const [parentId, setParentId] = useState<string | null>(
    category?.parent_id ?? parentContext?.id ?? null,
  )
  // Loại khi là danh mục chính (con thì thừa kế loại của cha)
  const [topType, setTopType] = useState<CategoryType>(
    category?.type ?? parentContext?.type ?? defaultType,
  )
  const [saving, setSaving] = useState(false)

  const selectedParent = parentId ? parentOptions.find((p) => p.id === parentId) ?? null : null
  // Cha đang có con: khóa loại — đổi Chi/Thu sẽ làm con lệch loại với cha
  const typeLocked = hasChildren && !!category
  const effectiveType: CategoryType = typeLocked
    ? category.type
    : selectedParent
      ? selectedParent.type
      : topType
  const listType = effectiveType
  const availableParents = parentOptions.filter(
    (p) => p.type === listType && p.id !== category?.id,
  )

  const canSave = name.trim().length > 0 && !saving

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      const input: NewCategory = {
        name: name.trim(),
        type: effectiveType,
        icon,
        parent_id: hasChildren ? null : parentId,
      }
      if (category) await update.mutateAsync({ id: category.id, patch: input })
      else await create.mutateAsync(input)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const title = category ? 'Sửa danh mục' : parentContext ? 'Thêm danh mục con' : 'Thêm danh mục'

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white dark:bg-gray-900 p-4 lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-bold text-gray-800 dark:text-gray-100">{title}</h2>

        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-2xl">
            {icon}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên danh mục"
            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm outline-green-500"
          />
        </div>

        {/* Danh mục cha */}
        {hasChildren ? (
          <p className="mb-3 rounded-lg bg-gray-50 dark:bg-gray-950 px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
            Danh mục này có danh mục con nên là danh mục chính.
          </p>
        ) : (
          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Danh mục cha</span>
            <select
              value={parentId ?? ''}
              onChange={(e) => setParentId(e.target.value || null)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 outline-green-500"
            >
              <option value="">— Danh mục chính —</option>
              {availableParents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon} {p.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Chi / Thu: chỉ khi là danh mục chính (con thừa kế loại của cha) */}
        {typeLocked ? (
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Nhóm {effectiveType === 'expense' ? 'Chi' : 'Thu'} — không đổi được khi còn danh mục
            con.
          </p>
        ) : selectedParent ? (
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            Thuộc nhóm {selectedParent.type === 'expense' ? 'Chi' : 'Thu'} theo danh mục cha.
          </p>
        ) : (
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-gray-200 dark:bg-gray-800 p-1">
            {(['expense', 'income'] as CategoryType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTopType(t)}
                className={`rounded-lg py-1.5 text-sm font-medium transition ${
                  topType === t ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {t === 'expense' ? 'Chi' : 'Thu'}
              </button>
            ))}
          </div>
        )}

        <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">Biểu tượng</p>
        <div className="mb-3 grid grid-cols-8 gap-1">
          {EMOJI_CHOICES.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setIcon(e)}
              className={`flex aspect-square items-center justify-center rounded-lg text-xl ${
                icon === e ? 'bg-green-100 dark:bg-green-900/40 ring-2 ring-green-500' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {e}
            </button>
          ))}
        </div>

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
            onClick={handleSubmit}
            disabled={!canSave}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}
