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

/**
 * Danh mục Chi "lá": type = 'expense', chưa lưu trữ, và không còn con đang hoạt động.
 * Chỉ danh mục như vậy mới gắn được nhãn phân loại chi tiêu.
 */
export function isExpenseLeaf(cat: CategoryRow, categories: CategoryRow[]): boolean {
  return cat.type === 'expense' && !cat.is_archived && !hasActiveChildren(cat.id, categories)
}

/** Mọi danh mục Chi lá, sắp theo sort_order tăng dần. */
export function expenseLeaves(categories: CategoryRow[]): CategoryRow[] {
  const parents = activeParentIds(categories)
  return categories
    .filter((c) => c.type === 'expense' && !c.is_archived && !parents.has(c.id))
    .sort((a, b) => a.sort_order - b.sort_order)
}
