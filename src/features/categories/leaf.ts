// Định nghĩa "danh mục lá" dùng chung — trước đây mỗi màn tự tính một kiểu.
import type { CategoryRow } from '../../types/database.types'

/**
 * Tập id các danh mục đang là CHA của ít nhất một danh mục CHƯA lưu trữ.
 * Con đã lưu trữ không tính: lưu trữ hết con thì cha trở lại thành lá (quy ước
 * giống BudgetView — lọc `!is_archived` trước khi dựng cây).
 */
function activeParentIds(categories: CategoryRow[]): Set<string> {
  const s = new Set<string>()
  for (const c of categories) if (c.parent_id && !c.is_archived) s.add(c.parent_id)
  return s
}

/** Danh mục còn danh mục con đang hoạt động (con đã lưu trữ KHÔNG tính) không? */
export function hasActiveChildren(categoryId: string, categories: CategoryRow[]): boolean {
  return activeParentIds(categories).has(categoryId)
}

/** Mọi danh mục Chi lá, sắp theo sort_order tăng dần. */
export function expenseLeaves(categories: CategoryRow[]): CategoryRow[] {
  const parents = activeParentIds(categories)
  return categories
    .filter((c) => c.type === 'expense' && !c.is_archived && !parents.has(c.id))
    .sort((a, b) => a.sort_order - b.sort_order)
}

/**
 * Một khối lá gom theo cha để hiển thị có tiêu đề nhóm (màn Phân loại nhanh).
 * `parent: null` = lá không có cha (danh mục chính không có con, ví dụ "Khác",
 * "Tài chính") — đứng riêng, không dồn vào một nhóm gộp chung, để khỏi
 * lẫn với chính danh mục lá tên "Khác" và để giữ đúng vị trí theo sort_order.
 */
export interface LeafGroup {
  parent: CategoryRow | null
  leaves: CategoryRow[]
}

/**
 * Gom `leaves` (thường là kết quả `expenseLeaves`, có thể đã lọc thêm) theo danh
 * mục cha, tra cứu cha trong `categories` (danh sách đầy đủ, kể cả đã lưu trữ —
 * cha lưu trữ hiếm khi còn con đang hoạt động, nhưng nếu có thì vẫn hiện đúng tên
 * cha thay vì coi lá đó là không cha). Cha không còn tồn tại trong `categories`
 * (dữ liệu mồ côi) cũng coi như lá không cha.
 *
 * Thứ tự nhóm giữ theo sort_order: nhóm có cha dùng sort_order của cha, lá không
 * cha dùng sort_order của chính nó — trộn chung một trục sắp xếp. Thứ tự lá bên
 * trong một nhóm giữ nguyên thứ tự đã xuất hiện trong `leaves` (gọi bên ngoài lo
 * sắp theo sort_order trước khi lọc/truyền vào).
 */
export function groupLeavesByParent(
  leaves: CategoryRow[],
  categories: CategoryRow[],
): LeafGroup[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const groups = new Map<string, LeafGroup>()
  const order: string[] = []

  for (const leaf of leaves) {
    const parent = leaf.parent_id ? (byId.get(leaf.parent_id) ?? null) : null
    const key = parent ? parent.id : `leaf:${leaf.id}`
    let group = groups.get(key)
    if (!group) {
      group = { parent, leaves: [] }
      groups.set(key, group)
      order.push(key)
    }
    group.leaves.push(leaf)
  }

  return order
    .map((key) => groups.get(key)!)
    .sort((a, b) => groupSortOrder(a) - groupSortOrder(b))
}

function groupSortOrder(group: LeafGroup): number {
  return group.parent ? group.parent.sort_order : group.leaves[0].sort_order
}

/**
 * Mọi danh mục Chi PHÂN LOẠI ĐƯỢC — lá VÀ cha.
 *
 * Khác `expenseLeaves` ở đúng một điểm: danh mục CHA cũng vào. Vì sao cần: tiền rơi
 * vào cha theo hai đường — trần nhóm đặt ở cha (`groupCap` của mặt lập kế hoạch), và
 * giao dịch ghi thẳng vào cha. Khi cha không có `need_level`, số tiền đó không vào
 * trục nào: nó biến mất khỏi cả Thiết yếu lẫn Linh hoạt mà không ai báo.
 *
 * Ca thật tháng 9/2026: ¥192.760 = 67% kế hoạch nằm ngoài mọi trục vì trần đặt ở
 * Nhà ở / Ăn uống / Đi lại, khiến dòng Thiết yếu hiện 3% trong khi tiền nhà một mình
 * đã là 46% thu nhập. Trước bản này không có đường nào sửa: màn Phân loại nhanh chỉ
 * hỏi lá, nên nút "Phân loại 3 danh mục này" mở ra một trang báo "(0)".
 *
 * Không lọc `kind`: danh mục 'transfer' vẫn hiện, đúng như trước — chúng không đặt
 * được hạn mức nhưng vẫn nhận được giao dịch.
 */
export function classifiableExpenses(categories: CategoryRow[]): CategoryRow[] {
  return categories
    .filter((c) => c.type === 'expense' && !c.is_archived)
    .sort((a, b) => a.sort_order - b.sort_order)
}

/** Một khối của màn Phân loại nhanh: cha (nếu phân loại được) rồi tới các con. */
export interface ClassifyGroup {
  /** Cha của nhóm — dùng làm tiêu đề; null = danh mục chính không có con. */
  parent: CategoryRow | null
  /**
   * Dòng phân loại được của nhóm. Cha đứng ĐẦU khi chính nó nằm trong `rows`
   * (`sort_order` của cha không đảm bảo nhỏ hơn con nên phải xếp tường minh).
   */
  rows: CategoryRow[]
}

/**
 * Gom `rows` (đã lọc) thành khối để hiển thị — như `groupLeavesByParent` nhưng nhận
 * cả danh mục CHA trong `rows` và xếp cha vào đúng khối của nó thay vì thành một
 * khối riêng tên trùng.
 *
 * Nhóm còn hiện khi MỌI con bị lọc hết mà cha thì không (ca `?ids=` từ mặt lập kế
 * hoạch: chỉ ba cái cha được truyền sang). Cha đã lưu trữ vẫn làm tiêu đề đúng tên,
 * cùng quy ước với `groupLeavesByParent`.
 */
export function classifyGroups(
  rows: CategoryRow[],
  categories: CategoryRow[],
): ClassifyGroup[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const parents = activeParentIds(categories)
  const groups = new Map<string, ClassifyGroup>()
  const order: string[] = []

  for (const c of rows) {
    // Cha tự làm khoá của chính mình → nằm cùng khối với các con của nó.
    const key = c.parent_id ?? (parents.has(c.id) ? c.id : `leaf:${c.id}`)
    let group = groups.get(key)
    if (!group) {
      group = { parent: key.startsWith('leaf:') ? null : (byId.get(key) ?? null), rows: [] }
      groups.set(key, group)
      order.push(key)
    }
    if (group.parent && c.id === group.parent.id) group.rows.unshift(c)
    else group.rows.push(c)
  }

  return order
    .map((key) => groups.get(key)!)
    .sort((a, b) => classifySortOrder(a) - classifySortOrder(b))
}

function classifySortOrder(group: ClassifyGroup): number {
  return group.parent ? group.parent.sort_order : group.rows[0].sort_order
}
