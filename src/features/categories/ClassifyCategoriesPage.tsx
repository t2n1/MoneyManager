import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useCategories, useUpdateCategory } from '../../hooks/queries'
import { showToast } from '../../lib/dialog'
import type { CostType, NeedLevel } from '../../types/database.types'
import { ClassificationToggle, COST_OPTIONS, NEED_OPTIONS } from './ClassificationToggle'
import { expenseLeaves } from './leaf'

type Axis = 'need_level' | 'cost_type'
/** Giá trị người dùng vừa chọn, chờ máy chủ xác nhận (để toggle ăn ngay). */
type PendingRow = { need_level?: NeedLevel | null; cost_type?: CostType | null }

export function ClassifyCategoriesPage() {
  const { data: categories = [] } = useCategories()
  const update = useUpdateCategory()
  const [onlyTodo, setOnlyTodo] = useState(false)
  const [pending, setPending] = useState<Record<string, PendingRow>>({})

  const leaves = expenseLeaves(categories)
  const rows = onlyTodo
    ? leaves.filter((c) => c.need_level == null || c.cost_type == null)
    : leaves
  const todoCount = leaves.filter((c) => c.need_level == null || c.cost_type == null).length

  /** Giá trị đang hiển thị: ưu tiên lựa chọn đang chờ lưu (kể cả khi là null = "Chưa"). */
  const shown = <T extends NeedLevel | CostType | null>(id: string, axis: Axis, saved: T): T => {
    const row = pending[id]
    return row && axis in row ? ((row[axis] ?? null) as T) : saved
  }

  /** Lưu một trục: hiện ngay (optimistic), xoá trạng thái chờ khi xong, báo lỗi nếu hỏng. */
  function save(id: string, axis: Axis, value: NeedLevel | CostType | null) {
    setPending((p) => ({ ...p, [id]: { ...p[id], [axis]: value } }))
    const clear = () =>
      setPending((p) => {
        const row = p[id]
        // Đã có thao tác mới hơn trên cùng trục → để lần đó tự dọn.
        if (!row || !(axis in row) || row[axis] !== value) return p
        const rest: PendingRow = { ...row }
        delete rest[axis]
        const next = { ...p }
        if (Object.keys(rest).length > 0) next[id] = rest
        else delete next[id]
        return next
      })
    const patch =
      axis === 'need_level'
        ? { need_level: value as NeedLevel | null }
        : { cost_type: value as CostType | null }
    update.mutate(
      { id, patch },
      {
        onError: (e) =>
          showToast(e instanceof Error ? e.message : 'Không lưu được phân loại', 'error'),
        onSettled: clear,
      },
    )
  }

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

      <label className="mb-3 min-h-11 flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
        <input type="checkbox" className="h-5 w-5" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} />
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
                groupLabel={`Tính chất — ${c.name}`}
                options={NEED_OPTIONS}
                value={shown(c.id, 'need_level', c.need_level)}
                onChange={(v) => save(c.id, 'need_level', v)}
              />
              <ClassificationToggle
                groupLabel={`Loại chi — ${c.name}`}
                options={COST_OPTIONS}
                value={shown(c.id, 'cost_type', c.cost_type)}
                onChange={(v) => save(c.id, 'cost_type', v)}
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
