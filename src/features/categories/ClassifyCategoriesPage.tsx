// Phân loại chi tiêu — gán hai trục (Thiết yếu/Linh hoạt · Cố định/Biến đổi) cho mọi
// danh mục Chi.
//
// ---- Vì sao ép gọn (redesign 2026-08-30) -------------------------------------------
//
// Đo bản trước trên sổ thật ở 1440×900: 61 danh mục, mỗi cái là một THẺ có tên ở hàng
// trên và hai ô gạt ở hàng dưới → 122 ô gạt, 366 nút, trang cao 7.618px = **chín màn
// hình**. Việc phải làm ở đây là một việc lặp 61 lần, mà mỗi lần chiếm 118px.
//
// Bản này xếp tên và hai ô gạt CHUNG một hàng từ `lg` (dưới `lg` vẫn xuống dòng — hai ô
// gạt cạnh nhau ở 375px thì chữ "Thiết yếu" gãy làm đôi). Vùng chạm giữ nguyên 44px, đó
// là sàn của bộ design, nên chiều cao một hàng không xuống dưới ~52px được.
//
// Thứ rút ngắn được nữa không phải pixel mà là SỐ CÚ BẤM: nút "Áp cho cả nhóm" gán một
// tổ hợp cho cha + mọi mục con cùng lúc. Nhóm Nhà ở có 8 mục con → 1 cú bấm thay cho 16.
// Nó GHI ĐÈ mục đã phân loại nên phải hỏi lại, và câu hỏi nói rõ đè lên mấy mục.
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Guide } from '../../components/Guide'
import { useCategories, useUpdateCategory } from '../../hooks/queries'
import { confirmDialog, showToast } from '../../lib/dialog'
import type { CategoryRow, CostType, NeedLevel } from '../../types/database.types'
import { ClassificationToggle, COST_OPTIONS, NEED_OPTIONS } from './ClassificationToggle'
import { classifiableExpenses, classifyGroups } from './leaf'
import {
  ActionButton,
  Card,
  EmptyState,
  FilterChip,
  Num,
  PageHeader,
  SectionTitle,
} from '../../components/ui'

type Axis = 'need_level' | 'cost_type'
/** Giá trị người dùng vừa chọn, chờ máy chủ xác nhận (để toggle ăn ngay). */
type PendingRow = { need_level?: NeedLevel | null; cost_type?: CostType | null }

const isTodo = (c: CategoryRow) => c.need_level == null || c.cost_type == null

/**
 * `NEED_OPTIONS`/`COST_OPTIONS` mỗi cái đều gồm cả mục "Chưa" (giá trị `null`) — hợp lý cho
 * ô gạt từng dòng, nhưng bảng "Áp cho cả nhóm" áp một giá trị THẬT cho cả nhóm nên bỏ "Chưa"
 * ra khỏi danh sách nút. Ép kiểu tường minh vì phần tử của hai hằng trên là union các tuple
 * literal (do `as const satisfies`) — type predicate không tự thu hẹp được từ đó.
 */
const BULK_NEED_CHOICES = (
  NEED_OPTIONS as readonly (readonly [NeedLevel | null, string])[]
).filter((o): o is readonly [NeedLevel, string] => o[0] !== null)
const BULK_COST_CHOICES = (
  COST_OPTIONS as readonly (readonly [CostType | null, string])[]
).filter((o): o is readonly [CostType, string] => o[0] !== null)

// Điện thoại một cột (tên trên, hai ô gạt dưới); từ `lg` ba cột chung một hàng.
//
// `grid` KHÔNG nằm trong hằng số: `hidden` và `grid` đều là tiện ích display, cái nào
// thắng do THỨ TỰ TRONG CSS chứ không do thứ tự trong chuỗi — hàng tiêu đề phải viết
// `hidden … lg:grid`.
//
// 13rem chứ px: ô gạt chứa CHỮ ("Thiết yếu"), ở cỡ chữ "Rất lớn" cột px cứng đứng yên
// trong khi chữ to ra thì nhãn gãy giữa từ (§13).
const GRID = 'lg:grid-cols-[minmax(0,1fr)_13rem_13rem] lg:items-center lg:gap-x-3'

export function ClassifyCategoriesPage() {
  const { data: categories = [] } = useCategories()
  const update = useUpdateCategory()
  const [params, setParams] = useSearchParams()
  const [pending, setPending] = useState<Record<string, PendingRow>>({})
  /** Nhóm đang mở bảng "Áp cho cả nhóm" — mỗi lúc nhiều nhất một. */
  const [bulkFor, setBulkFor] = useState<string | null>(null)
  /** Bước 1 của bảng (chọn nhãn nhu cầu) đã chọn gì — null = chưa chọn, còn ở bước 1. */
  const [bulkNeed, setBulkNeed] = useState<NeedLevel | null>(null)

  /** Đóng bảng "Áp cho cả nhóm", luôn kèm reset bước 1 — mở lại (kể cả cho nhóm khác) mà
   *  còn giữ bước đã chọn của lần trước là lẫn ngữ cảnh. */
  const closeBulk = () => {
    setBulkFor(null)
    setBulkNeed(null)
  }

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
  const doneCount = all.length - todoCount
  // Gom theo cha để dễ đọc — lọc trước khi gom nên nhóm rỗng (mọi dòng bị lọc hết)
  // sẽ tự biến mất, không hiện tiêu đề trơ trọi.
  const groups = classifyGroups(rows, categories)
  const childCount = (parentId: string) =>
    categories.filter((c) => c.parent_id === parentId && !c.is_archived).length

  /** Mọi danh mục phân loại được của một nhóm — cha + con, KHÔNG theo bộ lọc đang bật. */
  const membersOf = (parentId: string) =>
    all.filter((c) => c.id === parentId || c.parent_id === parentId)

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

  /**
   * Gán một tổ hợp cho CẢ nhóm (cha + mọi con), kể cả mục đang bị bộ lọc giấu đi.
   *
   * Cố ý không giới hạn theo bộ lọc: nhãn nút nói "cả nhóm", mà "cả nhóm trừ những cái
   * đang bị ẩn" là một lời hứa khác. Bù lại, câu xác nhận đếm đúng số mục ĐÃ phân loại
   * sắp bị ghi đè — đó là thứ duy nhất không hoàn tác được bằng mắt.
   */
  async function applyToGroup(parent: CategoryRow, need: NeedLevel, cost: CostType, label: string) {
    const members = membersOf(parent.id)
    const overwrite = members.filter((c) => !isTodo(c)).length
    const ok = await confirmDialog({
      title: `Gán “${label}” cho nhóm ${parent.name}?`,
      message:
        `${members.length} danh mục (cả nhóm cha).` +
        (overwrite > 0 ? ` ${overwrite} mục đã có phân loại sẽ bị ghi đè.` : ''),
      confirmLabel: 'Gán',
    })
    if (!ok) return
    closeBulk()
    setPending((p) => {
      const next = { ...p }
      for (const c of members) next[c.id] = { need_level: need, cost_type: cost }
      return next
    })
    try {
      await Promise.all(
        members.map((c) =>
          update.mutateAsync({ id: c.id, patch: { need_level: need, cost_type: cost } }),
        ),
      )
      showToast(`Đã gán “${label}” cho ${members.length} danh mục`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Không lưu được phân loại', 'error')
    } finally {
      // Dọn TOÀN BỘ trạng thái chờ của nhóm một lượt: từng mục tự dọn như hàm `save`
      // thì phải so lại từng trục, mà ở đây cả nhóm đi cùng một giá trị.
      setPending((p) => {
        const next = { ...p }
        for (const c of members) delete next[c.id]
        return next
      })
    }
  }

  /** Một dòng phân loại. `groupOf` != null = danh mục cha, nhãn nói rõ nó phủ cả nhóm. */
  const row = (c: CategoryRow, groupOf: number | null) => (
    <div
      key={c.id}
      // `lg:py-0` chứ py-2: ô gạt đã tự mang 4px đệm trong track, nên thêm 16px của hàng
      // là 61 lần cộng 16px = gần một màn hình rưỡi chỉ để đệm. Dưới `lg` thì py-2 ở lại —
      // ở đó tên nằm TRÊN hai ô gạt, không có đệm là hai dòng dính nhau.
      className={`grid ${GRID} gap-y-1.5 border-b border-border-subtle px-3 py-2 last:border-b-0 lg:py-0`}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span aria-hidden>{c.icon}</span>
        <span className="min-w-0 truncate text-sm text-fg-primary">{c.name}</span>
        {groupOf !== null && (
          <span className="shrink-0 text-2xs text-fg-muted">
            · cả nhóm, <Num tone="muted">{groupOf}</Num> mục con
          </span>
        )}
        {isTodo(c) && (
          <span className="shrink-0 text-2xs text-fg-warn lg:hidden">· chưa xong</span>
        )}
      </span>
      {/* Dưới `lg` hai ô gạt nằm cạnh nhau trong một lưới hai cột; từ `lg` chúng là hai
          cột của chính hàng này nên khối bọc phải tan ra — `display: contents`. */}
      <div className="grid grid-cols-2 gap-2 lg:contents">
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
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      <PageHeader title="Phân loại chi tiêu" back="/settings/categories">
        <span className="text-2xs text-fg-muted">
          <Num tone="muted">{doneCount}</Num>/<Num tone="muted">{all.length}</Num> xong
        </span>
        <FilterChip on={onlyTodo} onClick={() => setParam('todo', onlyTodo ? null : '1')}>
          Chưa phân loại · <Num tone={onlyTodo ? 'neutral' : 'muted'}>{todoCount}</Num>
        </FilterChip>
      </PageHeader>

      <Guide className="rounded-lg bg-surface-sunken p-3 text-sm text-fg-secondary">
        Gán mỗi danh mục Chi vào <b>Thiết yếu/Linh hoạt</b> và <b>Cố định/Biến đổi</b> để xem cơ cấu
        chi tiêu ở Báo cáo. Danh mục <b>cha</b> cũng cần gán: trần nhóm và giao dịch ghi thẳng vào
        cha đều lấy nhãn của chính nó, không suy từ các mục con. Thay đổi được lưu ngay.
      </Guide>

      {pickedIds && (
        <p className="text-sm font-medium text-fg-muted">
          Đang xem {pickedIds.size} danh mục từ Ngân sách ·{' '}
          <Link to="/settings/categories/classify" className="text-fg-accent underline">
            Xem tất cả
          </Link>
        </p>
      )}

      {rows.length === 0 ? (
        <Card padding="none">
          <EmptyState compact>{onlyTodo ? 'Đã phân loại hết 🎉' : 'Chưa có danh mục Chi'}</EmptyState>
        </Card>
      ) : (
        <Card as="section" elevation="panel" padding="none" className="overflow-hidden">
          {/* Hàng tiêu đề chỉ từ `lg`: dưới đó hai ô gạt đã nằm dưới tên nên không có
              cột nào để đặt tên cột. */}
          <div
            className={`hidden ${GRID} border-b border-border-panel bg-surface-chrome px-3 py-2.5 text-2xs uppercase tracking-label text-fg-muted lg:grid`}
          >
            <span>Danh mục</span>
            <span className="text-center">Tính chất</span>
            <span className="text-center">Loại chi</span>
          </div>

          {groups.map((g) => {
            // Cha có dòng riêng thì KHÔNG in thêm tiêu đề xám cùng tên ngay trên nó —
            // chính dòng đó đã mang tên và biểu tượng của nhóm.
            const parentRow = g.parent && g.rows[0]?.id === g.parent.id ? g.rows[0] : null
            const parent = g.parent
            const members = parent ? membersOf(parent.id) : []
            const todoInGroup = members.filter(isTodo).length
            return (
              <div key={parent ? parent.id : `leaf:${g.rows[0].id}`}>
                {parent && (
                  <div className="border-b border-border-panel bg-surface-chrome px-3 py-1.5 lg:py-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <SectionTitle role="micro" className="min-w-0 flex-1 truncate">
                        <span aria-hidden>{parent.icon}</span> {parent.name}
                      </SectionTitle>
                      <span className="shrink-0 text-2xs text-fg-muted">
                        <Num tone="muted">{childCount(parent.id)}</Num> mục con
                        {todoInGroup > 0 && (
                          <>
                            {' · '}
                            <Num tone="warn">{todoInGroup}</Num> chưa xong
                          </>
                        )}
                      </span>
                      <ActionButton
                        className="shrink-0"
                        onClick={() => {
                          if (bulkFor === parent.id) {
                            closeBulk()
                          } else {
                            setBulkFor(parent.id)
                            setBulkNeed(null)
                          }
                        }}
                        aria-expanded={bulkFor === parent.id}
                      >
                        Áp cho cả nhóm
                      </ActionButton>
                    </div>
                    {/* Mở ra NGAY TẠI CHỖ chứ không trong một menu thả xuống: repo chưa có
                        primitive menu nào, mà dựng riêng một cái thì vừa là control mới
                        vừa là một bẫy trợ năng mới.
                        5 nhãn × 2 loại = 10 tổ hợp — liệt kê phẳng không ai đọc nổi. Chia
                        hai bước, mỗi bước tối đa 5 nút: bước 1 chọn nhãn nhu cầu, bước 2
                        chọn cố định/biến đổi rồi áp luôn. */}
                    {bulkFor === parent.id &&
                      (bulkNeed === null ? (
                        <div className="mt-1.5 grid grid-cols-2 gap-1.5 lg:grid-cols-3">
                          {BULK_NEED_CHOICES.map(([need, label]) => (
                            <ActionButton key={need} onClick={() => setBulkNeed(need)}>
                              {label}…
                            </ActionButton>
                          ))}
                          <ActionButton onClick={closeBulk}>Hủy</ActionButton>
                        </div>
                      ) : (
                        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                          {BULK_COST_CHOICES.map(([cost, label]) => (
                            <ActionButton
                              key={cost}
                              onClick={() =>
                                applyToGroup(
                                  parent,
                                  bulkNeed,
                                  cost,
                                  `${NEED_OPTIONS.find(([n]) => n === bulkNeed)![1]} · ${label}`,
                                )
                              }
                            >
                              {label}
                            </ActionButton>
                          ))}
                          <ActionButton onClick={() => setBulkNeed(null)}>‹ Đổi nhãn</ActionButton>
                          <ActionButton onClick={closeBulk}>Hủy</ActionButton>
                        </div>
                      ))}
                  </div>
                )}
                {g.rows.map((c) =>
                  row(c, parentRow && c.id === parentRow.id ? childCount(c.id) : null),
                )}
              </div>
            )
          })}
        </Card>
      )}
    </div>
  )
}
