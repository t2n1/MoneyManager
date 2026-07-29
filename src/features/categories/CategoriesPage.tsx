import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronUp, GripVertical, Plus } from 'lucide-react'
import type { NewCategory } from '../../data'
import { DragList, type DragHandleProps } from '../../components/DragList'
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useReorderCategories,
  useUpdateCategory,
} from '../../hooks/queries'
import { confirmDialog, showToast } from '../../lib/dialog'
import type { CategoryRow, CategoryType, CostType, NeedLevel } from '../../types/database.types'
import { ClassificationToggle, COST_OPTIONS, NEED_OPTIONS } from './ClassificationToggle'
import { hasActiveChildren } from './leaf'
import {
  hasTaxCategories,
  TAX_CHILDREN,
  TAX_PARENT_ICON,
  TAX_PARENT_NAME,
} from '../tax/categories'

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
  const [creatingTax, setCreatingTax] = useState(false)
  const createCategory = useCreateCategory()

  /**
   * Tạo nhóm Thuế & An sinh (Nhật) trong một lần bấm. Con phải tạo SAU cha để
   * lấy được parent_id; mọi khoản này đều là chi thiết yếu & cố định nên gán nhãn
   * luôn, người dùng không phải vào màn Phân loại nữa.
   */
  async function createTaxCategories() {
    if (creatingTax) return
    setCreatingTax(true)
    try {
      const parent = await createCategory.mutateAsync({
        name: TAX_PARENT_NAME,
        type: 'expense',
        icon: TAX_PARENT_ICON,
      })
      for (const child of TAX_CHILDREN) {
        await createCategory.mutateAsync({
          name: child.name,
          type: 'expense',
          icon: child.icon,
          parent_id: parent.id,
          need_level: 'essential',
          cost_type: 'fixed',
        })
      }
    } finally {
      setCreatingTax(false)
    }
  }

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

  // Tra nhanh id → CategoryRow (chỉ danh mục đang hoạt động) để dựng lại cây khi kéo–thả.
  const catById = new Map(activeCats.map((c) => [c.id, c]))
  const rowsFromIds = (ids: string[]) =>
    ids.map((id) => catById.get(id)).filter((c): c is CategoryRow => !!c)

  // Sắp lại thứ tự các danh mục CHA (kéo–thả), giữ nguyên con của mỗi cha.
  function reorderParents(newParentIds: string[]) {
    const ordered = rowsFromIds(newParentIds)
    if (ordered.length === parents.length) commitOrder(ordered, childrenOf)
  }

  // --- Kéo–thả danh mục con: trong cùng cha & xuyên cha ---
  // Bắt pointer trên phần tử gốc (ổn định) để hàng đang kéo "nhảy" giữa các cha mà
  // không mất capture. `childDropAt` là vị trí xem trước; commit khi thả.
  const rootRef = useRef<HTMLDivElement>(null)
  const childRowRefs = useRef(new Map<string, HTMLElement>())
  const zoneRefs = useRef(new Map<string, HTMLElement>())
  const dragPointer = useRef<number | null>(null)
  const [dragChild, setDragChild] = useState<string | null>(null)
  const [childDropAt, setChildDropAt] = useState<{ parent: string; index: number } | null>(null)

  function setChildRow(id: string, el: HTMLElement | null) {
    if (el) childRowRefs.current.set(id, el)
    else childRowRefs.current.delete(id)
  }
  function setZone(id: string, el: HTMLElement | null) {
    if (el) zoneRefs.current.set(id, el)
    else zoneRefs.current.delete(id)
  }

  const parentOfChild = (id: string) => activeCats.find((c) => c.id === id)?.parent_id ?? null

  // Thứ tự id con hiển thị của một cha, đã áp xem trước khi đang kéo.
  function displayChildIds(parentId: string): string[] {
    const base = childrenOf(parentId).map((c) => c.id)
    if (dragChild == null) return base
    const without = base.filter((id) => id !== dragChild)
    if (childDropAt && childDropAt.parent === parentId) {
      const i = Math.min(childDropAt.index, without.length)
      return [...without.slice(0, i), dragChild, ...without.slice(i)]
    }
    return without
  }

  function onChildPointerDown(id: string, e: ReactPointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    const pid = parentOfChild(id)
    if (!pid) return
    rootRef.current?.setPointerCapture(e.pointerId)
    dragPointer.current = e.pointerId
    const idx = childrenOf(pid).findIndex((c) => c.id === id)
    setDragChild(id)
    setChildDropAt({ parent: pid, index: Math.max(0, idx) })
  }

  function onChildPointerMove(e: ReactPointerEvent) {
    if (dragChild == null || e.pointerId !== dragPointer.current) return
    const x = e.clientX
    const y = e.clientY
    let target: string | null = null
    for (const [pid, el] of zoneRefs.current) {
      const r = el.getBoundingClientRect()
      if (y >= r.top && y <= r.bottom && x >= r.left && x <= r.right) {
        target = pid
        break
      }
    }
    if (target == null) return // ngoài mọi cha → giữ xem trước cũ
    const rowIds = displayChildIds(target).filter((id) => id !== dragChild)
    let index = rowIds.length
    for (let i = 0; i < rowIds.length; i++) {
      const el = childRowRefs.current.get(rowIds[i])
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (y < r.top + r.height / 2) {
        index = i
        break
      }
    }
    setChildDropAt((prev) =>
      prev && prev.parent === target && prev.index === index ? prev : { parent: target, index },
    )
  }

  function onChildPointerEnd(e: ReactPointerEvent) {
    if (dragChild == null) return
    if (dragPointer.current != null && e.pointerId !== dragPointer.current) return
    const id = dragChild
    const at = childDropAt
    setDragChild(null)
    setChildDropAt(null)
    dragPointer.current = null
    if (!at) return
    const src = parentOfChild(id)
    if (!src) return

    if (at.parent === src) {
      // Sắp lại trong cùng một cha.
      const cur = childrenOf(src).map((c) => c.id)
      const without = cur.filter((x) => x !== id)
      const j = Math.min(at.index, without.length)
      const next = [...without.slice(0, j), id, ...without.slice(j)]
      if (next.some((x, k) => x !== cur[k])) {
        commitOrder(parents, (pid) => (pid === src ? rowsFromIds(next) : childrenOf(pid)))
      }
    } else {
      // Chuyển sang cha khác: đổi parent_id và chèn vào đúng vị trí ở cha đích.
      const dstIds = childrenOf(at.parent)
        .map((c) => c.id)
        .filter((x) => x !== id)
      const j = Math.min(at.index, dstIds.length)
      const nextDst = [...dstIds.slice(0, j), id, ...dstIds.slice(j)]
      update.mutate({ id, patch: { parent_id: at.parent } })
      commitOrder(parents, (pid) => {
        if (pid === src) return childrenOf(src).filter((c) => c.id !== id)
        if (pid === at.parent) return rowsFromIds(nextDst)
        return childrenOf(pid)
      })
    }
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

  // Vẽ một danh mục cha (thẻ). `handle` = tay nắm kéo để sắp thứ tự cha. Cả thẻ là
  // vùng thả cho danh mục con (kéo con sang cha khác).
  function renderParent(p: CategoryRow, handle: DragHandleProps, dragging: boolean): ReactNode {
    const kids = childrenOf(p.id)
    const childIds = displayChildIds(p.id)
    const isDropTarget = dragChild != null && childDropAt?.parent === p.id
    return (
      <div
        ref={(el) => setZone(p.id, el)}
        className={`overflow-hidden rounded-xl bg-white dark:bg-gray-900 ${
          dragging ? 'shadow-lg ring-2 ring-green-500/40' : 'shadow-sm'
        } ${isDropTarget ? 'ring-2 ring-green-500/60' : ''}`}
      >
        {/* Danh mục cha */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button
            type="button"
            {...handle}
            className="inline-flex min-h-11 min-w-9 shrink-0 cursor-grab touch-none items-center justify-center text-gray-500 dark:text-gray-400 active:cursor-grabbing"
            aria-label={`Kéo để sắp thứ tự ${p.name}`}
          >
            <GripVertical className="h-5 w-5" />
          </button>
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

        {/* Danh mục con (kéo–thả để sắp trong cha hoặc chuyển sang cha khác) */}
        {(childIds.length > 0 || dragChild != null) && (
          <div className="ml-6 border-l-2 border-gray-100 dark:border-gray-800">
            {childIds.map((cid) => {
              const ch = catById.get(cid)
              if (!ch) return null
              const isDragging = cid === dragChild
              return (
                <div
                  key={cid}
                  ref={(el) => setChildRow(cid, el)}
                  className={`flex items-center gap-2 py-2 pr-3 pl-2 ${
                    isDragging ? 'bg-green-50 shadow-md dark:bg-green-900/20' : ''
                  }`}
                >
                  <button
                    type="button"
                    onPointerDown={(e) => onChildPointerDown(cid, e)}
                    style={{ touchAction: 'none' }}
                    className="inline-flex min-h-11 min-w-9 shrink-0 cursor-grab touch-none items-center justify-center text-gray-300 active:cursor-grabbing dark:text-gray-600"
                    aria-label={`Kéo để sắp thứ tự hoặc chuyển nhóm ${ch.name}`}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
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
              )
            })}
            {childIds.length === 0 && dragChild != null && (
              <p className="px-3 py-3 text-center text-xs text-gray-500 dark:text-gray-400">
                Thả vào đây để chuyển sang nhóm này
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className="p-3 lg:p-6"
      onPointerMove={onChildPointerMove}
      onPointerUp={onChildPointerEnd}
      onPointerCancel={onChildPointerEnd}
    >
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

      <p className="mb-3 rounded-xl bg-blue-50 dark:bg-blue-900/30 p-3 text-xs text-blue-800 dark:text-blue-300">
        Nhấn giữ biểu tượng <b>⁚⁚</b> rồi kéo–thả để sắp thứ tự danh mục cha, sắp danh mục
        con trong một cha, hoặc kéo danh mục con thả sang cha khác.
      </p>

      {/* Tạo nhanh bộ danh mục Thuế & An sinh (Nhật) — mở khóa chỉ số gánh nặng thuế */}
      {tab === 'expense' && !hasTaxCategories(categories) && (
        <div className="mb-3 rounded-xl bg-white p-3 shadow-sm dark:bg-gray-900">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Muốn biết mỗi năm mất bao nhiêu phần thu nhập cho 所得税・住民税・社会保険料? Tạo sẵn
            nhóm <b>{TAX_PARENT_NAME}</b> với {TAX_CHILDREN.length} danh mục con theo phiếu lương
            Nhật, rồi nhập lương <b>gộp</b> là khoản Thu và các khoản khấu trừ là khoản Chi.
          </p>
          <button
            type="button"
            onClick={createTaxCategories}
            disabled={creatingTax}
            className="mt-2 min-h-9 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white active:scale-95 disabled:opacity-40"
          >
            {creatingTax ? 'Đang tạo…' : 'Tạo bộ danh mục Thuế & An sinh'}
          </button>
        </div>
      )}

      {/* Cây danh mục: cha → con */}
      <div className="flex flex-col gap-2">
        {parents.length > 0 && (
          <DragList
            className="flex flex-col gap-2"
            ids={parents.map((p) => p.id)}
            onReorder={reorderParents}
            render={(id, handle, dragging) => {
              const p = parents.find((x) => x.id === id)
              return p ? renderParent(p, handle, dragging) : null
            }}
          />
        )}

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
          hasChildren={form.category ? hasActiveChildren(form.category.id, categories) : false}
          onClose={() => setForm(null)}
        />
      )}
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
  const del = useDeleteCategory()

  async function handleDelete() {
    if (!category) return
    const ok = await confirmDialog({
      title: `Xóa danh mục «${category.name}»?`,
      message: hasChildren
        ? 'Không thể hoàn tác. Xóa cả các danh mục con bên trong (nếu tất cả đều trống).'
        : 'Không thể hoàn tác. Chỉ xóa được khi không còn giao dịch nào dùng nó.',
      confirmLabel: 'Xóa',
      danger: true,
    })
    if (!ok) return
    try {
      await del.mutateAsync(category.id)
      showToast('Đã xóa danh mục', 'success')
      onClose()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Không xóa được', 'error')
    }
  }

  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? '📦')
  const [parentId, setParentId] = useState<string | null>(
    category?.parent_id ?? parentContext?.id ?? null,
  )
  // Loại khi là danh mục chính (con thì thừa kế loại của cha)
  const [topType, setTopType] = useState<CategoryType>(
    category?.type ?? parentContext?.type ?? defaultType,
  )
  const [needLevel, setNeedLevel] = useState<NeedLevel | null>(category?.need_level ?? null)
  const [costType, setCostType] = useState<CostType | null>(category?.cost_type ?? null)
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
  // Form cho phép gắn nhãn phân loại khi: đang là (hoặc sẽ là) danh mục Chi và
  // không còn con đang hoạt động. Khác với `isExpenseLeaf`-style helper trong ./leaf
  // (dùng cho Chi lá đã lưu, không tính danh mục lưu trữ): ở đây `category` có thể
  // là null (đang tạo mới — chưa có is_archived), và khi sửa một danh mục Chi đã lưu
  // trữ, form vẫn cho sửa nhãn để không mất dữ liệu — is_archived cố tình KHÔNG xét.
  const canClassify = effectiveType === 'expense' && !hasChildren
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
        need_level: canClassify ? needLevel : null,
        cost_type: canClassify ? costType : null,
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
        className="w-full max-w-md rounded-t-2xl bg-white dark:bg-gray-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
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

        {canClassify && (
          <div className="mb-3 space-y-2">
            <ClassificationToggle
              label="Tính chất"
              options={NEED_OPTIONS}
              value={needLevel}
              onChange={setNeedLevel}
            />
            <ClassificationToggle
              label="Loại chi"
              options={COST_OPTIONS}
              value={costType}
              onChange={setCostType}
            />
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

        <div className="flex items-center gap-2">
          {category && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={del.isPending}
              className="rounded-lg px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30 disabled:opacity-50"
            >
              Xóa
            </button>
          )}
          <div className="ml-auto flex gap-2">
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
    </div>
  )
}
