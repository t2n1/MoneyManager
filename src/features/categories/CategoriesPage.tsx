import { useState } from 'react'
import { Link } from 'react-router-dom'
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

export function CategoriesPage() {
  const { data: categories = [] } = useCategories()
  const reorder = useReorderCategories()
  const update = useUpdateCategory()
  const [tab, setTab] = useState<CategoryType>('expense')
  const [editing, setEditing] = useState<CategoryRow | 'new' | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const ofType = categories
    .filter((c) => c.type === tab)
    .sort((a, b) => a.sort_order - b.sort_order)
  const active = ofType.filter((c) => !c.is_archived)
  const archived = ofType.filter((c) => c.is_archived)

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= active.length) return
    const ids = active.map((c) => c.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorder.mutate([...ids, ...archived.map((c) => c.id)])
  }

  return (
    <div className="p-3 lg:p-6">
      <div className="mb-3 flex items-center gap-2">
        <Link
          to="/settings"
          className="rounded-lg bg-white px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Quay lại"
        >
          ←
        </Link>
        <h1 className="flex-1 text-lg font-bold text-gray-800">Danh mục</h1>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
        >
          + Thêm
        </button>
      </div>

      {/* Chi / Thu */}
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-gray-200 p-1">
        {(['expense', 'income'] as CategoryType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg py-1.5 text-sm font-medium transition ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            {t === 'expense' ? 'Chi' : 'Thu'}
          </button>
        ))}
      </div>

      <div className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-sm">
        {active.map((c, i) => (
          <div key={c.id} className="flex items-center gap-2 px-3 py-2.5">
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className="text-xs text-gray-400 disabled:opacity-20"
                aria-label="Lên"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === active.length - 1}
                className="text-xs text-gray-400 disabled:opacity-20"
                aria-label="Xuống"
              >
                ▼
              </button>
            </div>
            <span className="text-xl">{c.icon}</span>
            <button type="button" onClick={() => setEditing(c)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium text-gray-800">{c.name}</span>
            </button>
            <button
              type="button"
              onClick={() => update.mutate({ id: c.id, patch: { is_archived: true } })}
              className="rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-gray-100"
            >
              Lưu trữ
            </button>
          </div>
        ))}
        {active.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-gray-400">Chưa có danh mục</p>
        )}
      </div>

      {archived.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="mb-2 text-xs font-medium text-gray-500"
          >
            {showArchived ? 'Ẩn đã lưu trữ ▲' : `Đã lưu trữ (${archived.length}) ▼`}
          </button>
          {showArchived && (
            <div className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-sm">
              {archived.map((c) => (
                <div key={c.id} className="flex items-center gap-2 px-3 py-2.5 opacity-60">
                  <span className="text-xl">{c.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{c.name}</span>
                  <button
                    type="button"
                    onClick={() => update.mutate({ id: c.id, patch: { is_archived: false } })}
                    className="rounded-lg px-2 py-1 text-xs text-green-700 hover:bg-green-50"
                  >
                    Khôi phục
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editing && (
        <CategoryForm
          category={editing === 'new' ? null : editing}
          defaultType={tab}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

interface FormProps {
  category: CategoryRow | null
  defaultType: CategoryType
  onClose: () => void
}

function CategoryForm({ category, defaultType, onClose }: FormProps) {
  const create = useCreateCategory()
  const update = useUpdateCategory()

  const [name, setName] = useState(category?.name ?? '')
  const [type, setType] = useState<CategoryType>(category?.type ?? defaultType)
  const [icon, setIcon] = useState(category?.icon ?? '📦')
  const [saving, setSaving] = useState(false)

  const canSave = name.trim().length > 0 && !saving

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      const input: NewCategory = { name: name.trim(), type, icon }
      if (category) await update.mutateAsync({ id: category.id, patch: input })
      else await create.mutateAsync(input)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-4 lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-bold text-gray-800">
          {category ? 'Sửa danh mục' : 'Thêm danh mục'}
        </h2>

        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-2xl">
            {icon}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên danh mục"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-green-500"
          />
        </div>

        <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-gray-200 p-1">
          {(['expense', 'income'] as CategoryType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-lg py-1.5 text-sm font-medium transition ${
                type === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {t === 'expense' ? 'Chi' : 'Thu'}
            </button>
          ))}
        </div>

        <p className="mb-1.5 text-xs font-medium text-gray-500">Biểu tượng</p>
        <div className="mb-3 grid grid-cols-8 gap-1">
          {EMOJI_CHOICES.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setIcon(e)}
              className={`flex aspect-square items-center justify-center rounded-lg text-xl ${
                icon === e ? 'bg-green-100 ring-2 ring-green-500' : 'hover:bg-gray-100'
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
            className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100"
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
