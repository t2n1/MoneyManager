import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useCategories, useUpdateCategory } from '../../hooks/queries'
import type { CategoryRow } from '../../types/database.types'
import { ClassificationToggle, COST_OPTIONS, NEED_OPTIONS } from './ClassificationToggle'

export function ClassifyCategoriesPage() {
  const { data: categories = [] } = useCategories()
  const update = useUpdateCategory()
  const [onlyTodo, setOnlyTodo] = useState(false)

  const parentIds = new Set(categories.filter((c) => c.parent_id).map((c) => c.parent_id))
  const isLeaf = (c: CategoryRow) => !parentIds.has(c.id)
  const leaves = categories
    .filter((c) => c.type === 'expense' && !c.is_archived && isLeaf(c))
    .sort((a, b) => a.sort_order - b.sort_order)
  const rows = onlyTodo
    ? leaves.filter((c) => c.need_level == null || c.cost_type == null)
    : leaves
  const todoCount = leaves.filter((c) => c.need_level == null || c.cost_type == null).length

  return (
    <div className="p-3 lg:p-6">
      <div className="mb-3 flex items-center gap-2">
        <Link
          to="/settings/categories"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white px-3 py-1.5 text-lg shadow-sm active:scale-95 dark:bg-gray-900"
          aria-label="Quay lại"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-lg font-bold text-gray-800 dark:text-gray-100">Phân loại chi tiêu</h1>
      </div>

      <p className="mb-3 rounded-xl bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
        Gán mỗi danh mục Chi vào <b>Thiết yếu/Linh hoạt</b> và <b>Cố định/Biến đổi</b> để xem cơ cấu
        chi tiêu ở Báo cáo. Thay đổi được lưu ngay.
      </p>

      <label className="mb-3 flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
        <input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} />
        Chỉ hiện chưa phân loại ({todoCount})
      </label>

      <div className="flex flex-col gap-2">
        {rows.map((c) => (
          <div key={c.id} className="rounded-xl bg-white p-3 shadow-sm dark:bg-gray-900">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-lg">{c.icon}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                {c.name}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ClassificationToggle
                options={NEED_OPTIONS}
                value={c.need_level}
                onChange={(v) => update.mutate({ id: c.id, patch: { need_level: v } })}
              />
              <ClassificationToggle
                options={COST_OPTIONS}
                value={c.cost_type}
                onChange={(v) => update.mutate({ id: c.id, patch: { cost_type: v } })}
              />
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="rounded-xl bg-white px-3 py-6 text-center text-sm text-gray-500 shadow-sm dark:bg-gray-900 dark:text-gray-400">
            {onlyTodo ? 'Đã phân loại hết 🎉' : 'Chưa có danh mục Chi'}
          </p>
        )}
      </div>
    </div>
  )
}
