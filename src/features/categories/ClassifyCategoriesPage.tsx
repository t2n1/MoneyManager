import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Guide } from '../../components/Guide'
import { useCategories, useUpdateCategory } from '../../hooks/queries'
import { showToast } from '../../lib/dialog'
import type { CategoryRow, CostType, NeedLevel } from '../../types/database.types'
import { ClassificationToggle, COST_OPTIONS, NEED_OPTIONS } from './ClassificationToggle'
import { classifiableExpenses, classifyGroups } from './leaf'
import { Card, EmptyState, PageHeader } from '../../components/ui'

type Axis = 'need_level' | 'cost_type'
/** Giá trị người dùng vừa chọn, chờ máy chủ xác nhận (để toggle ăn ngay). */
type PendingRow = { need_level?: NeedLevel | null; cost_type?: CostType | null }

const isTodo = (c: CategoryRow) => c.need_level == null || c.cost_type == null

export function ClassifyCategoriesPage() {
  const { data: categories = [] } = useCategories()
  const update = useUpdateCategory()
  const [params, setParams] = useSearchParams()
  const [pending, setPending] = useState<Record<string, PendingRow>>({})

  // `?todo=1` và `?ids=` là trạng thái của ĐỊA CHỈ, không phải của component: nút
  // "Phân loại N danh mục này" ở mặt lập kế hoạch gửi sang đúng N id, và trước bản này
  // trang bỏ qua cả hai tham số — nút nói 3, trang mở ra hiện "(0)" và không có dòng
  // nào bấm được. Đọc từ URL nên bấm Quay lại / mở lại link đều ra đúng cảnh cũ.
  const onlyTodo = params.get('todo') === '1'
  const pickedIds = useMemo(() => {
    const raw = params.get('ids')
    return raw ? new Set(raw.split(',').filter(Boolean)) : null
  }, [params])

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const all = classifiableExpenses(categories)
  const rows = all.filter(
    (c) => (!pickedIds || pickedIds.has(c.id)) && (!onlyTodo || isTodo(c)),
  )
  const todoCount = all.filter(isTodo).length
  // Gom theo cha để dễ đọc — lọc trước khi gom nên nhóm rỗng (mọi dòng bị lọc hết)
  // sẽ tự biến mất, không hiện tiêu đề trơ trọi.
  const groups = classifyGroups(rows, categories)
  const childCount = (parentId: string) =>
    categories.filter((c) => c.parent_id === parentId && !c.is_archived).length

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

  /** Một dòng phân loại. `groupOf` != null = danh mục cha, nhãn nói rõ nó phủ cả nhóm. */
  const row = (c: CategoryRow, groupOf: number | null) => (
    <div key={c.id} className="rounded-xl bg-surface p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-lg">{c.icon}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg-primary">
          {c.name}
        </span>
        {groupOf !== null && (
          <span className="shrink-0 rounded-md bg-surface-sunken px-1.5 py-0.5 text-2xs text-fg-muted">
            cả nhóm · {groupOf} mục con
          </span>
        )}
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
  )

  return (
    <div className="p-3 lg:p-6">
      <PageHeader title="Phân loại chi tiêu" back="/settings/categories" />

      <Guide className="mb-3 rounded-xl bg-surface-sunken p-3 text-sm text-fg-secondary">
        Gán mỗi danh mục Chi vào <b>Thiết yếu/Linh hoạt</b> và <b>Cố định/Biến đổi</b> để xem cơ cấu
        chi tiêu ở Báo cáo. Danh mục <b>cha</b> cũng cần gán: trần nhóm và giao dịch ghi thẳng vào
        cha đều lấy nhãn của chính nó, không suy từ các mục con. Thay đổi được lưu ngay.
      </Guide>

      {pickedIds && (
        <p className="mb-3 text-sm font-medium text-fg-muted">
          Đang xem {pickedIds.size} danh mục từ Ngân sách ·{' '}
          <Link to="/settings/categories/classify" className="text-fg-accent underline">
            Xem tất cả
          </Link>
        </p>
      )}

      <label className="mb-3 min-h-11 flex items-center gap-2 text-sm font-medium text-fg-secondary">
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={onlyTodo}
          onChange={(e) => setParam('todo', e.target.checked ? '1' : null)}
        />
        Chỉ hiện chưa phân loại ({todoCount})
      </label>

      <div className="flex flex-col gap-3">
        {groups.map((g) => {
          // Cha có dòng riêng thì KHÔNG in thêm tiêu đề xám cùng tên ngay trên nó —
          // chính dòng đó đã mang tên và biểu tượng của nhóm.
          const parentRow = g.parent && g.rows[0]?.id === g.parent.id ? g.rows[0] : null
          return (
            <div
              key={g.parent ? g.parent.id : `leaf:${g.rows[0].id}`}
              className="flex flex-col gap-2"
            >
              {g.parent && !parentRow && (
                <div className="flex items-center gap-1.5 px-1 text-sm font-semibold text-fg-muted">
                  <span className="text-sm">{g.parent.icon}</span>
                  <span className="truncate">{g.parent.name}</span>
                </div>
              )}
              {g.rows.map((c) =>
                row(c, parentRow && c.id === parentRow.id ? childCount(c.id) : null),
              )}
            </div>
          )
        })}
        {rows.length === 0 && (
          <Card padding="none">
            <EmptyState compact>{onlyTodo ? 'Đã phân loại hết 🎉' : 'Chưa có danh mục Chi'}</EmptyState>
          </Card>
        )}
      </div>
    </div>
  )
}
