import { useState } from 'react'
import { Guide } from '../../components/Guide'
import { BackLink } from '../../components/BackLink'
import { useCategories, useUpdateCategory } from '../../hooks/queries'
import { showToast } from '../../lib/dialog'
import type { CostType, NeedLevel } from '../../types/database.types'
import { ClassificationToggle, COST_OPTIONS, NEED_OPTIONS } from './ClassificationToggle'
import { expenseLeaves, groupLeavesByParent } from './leaf'

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
  // Nhóm theo cha để dễ đọc — lọc trước khi gom nên nhóm rỗng (mọi con bị lọc hết)
  // sẽ tự biến mất, không hiện tiêu đề trơ trọi.
  const groups = groupLeavesByParent(rows, categories)

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
        <BackLink to="/settings/categories" aria-label="Quay lại" />
        <h1 className="flex-1 text-lg font-bold text-fg-primary">Phân loại chi tiêu</h1>
      </div>

      <Guide className="mb-3 rounded-xl bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
        Gán mỗi danh mục Chi vào <b>Thiết yếu/Linh hoạt</b> và <b>Cố định/Biến đổi</b> để xem cơ cấu
        chi tiêu ở Báo cáo. Thay đổi được lưu ngay.
      </Guide>

      <label className="mb-3 min-h-11 flex items-center gap-2 text-xs font-medium text-fg-secondary">
        <input type="checkbox" className="h-5 w-5" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} />
        Chỉ hiện chưa phân loại ({todoCount})
      </label>

      <div className="flex flex-col gap-3">
        {groups.map((g) => (
          <div key={g.parent ? g.parent.id : `leaf:${g.leaves[0].id}`} className="flex flex-col gap-2">
            {/* Tiêu đề nhóm: nhãn đọc, không phải hàng bấm được (đối tượng bấm là 2 toggle bên dưới) */}
            {g.parent && (
              <div className="flex items-center gap-1.5 px-1 text-xs font-semibold text-fg-muted">
                <span className="text-sm">{g.parent.icon}</span>
                <span className="truncate">{g.parent.name}</span>
              </div>
            )}
            {g.leaves.map((c) => (
              <div key={c.id} className="rounded-xl bg-surface p-3 shadow-sm ">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-lg">{c.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg-primary">
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
          </div>
        ))}
        {rows.length === 0 && (
          <p className="rounded-xl bg-surface px-3 py-6 text-center text-sm text-fg-muted shadow-sm">
            {onlyTodo ? 'Đã phân loại hết 🎉' : 'Chưa có danh mục Chi'}
          </p>
        )}
      </div>
    </div>
  )
}
