// Bộ danh mục chuẩn cho Thuế & An sinh xã hội ở Nhật (khối 7).
// Ý tưởng: người dùng ghi LƯƠNG GỘP là khoản Thu, rồi ghi từng khoản khấu trừ
// trên 給与明細 là khoản Chi thuộc nhóm này. Khi đó app tự tính được
// "thực nộp / thu nhập gộp" mà không cần bảng dữ liệu riêng nào.
import type { CategoryRow } from '../../types/database.types'

/** Tên danh mục CHA gom mọi khoản thuế & bảo hiểm bắt buộc. */
export const TAX_PARENT_NAME = 'Thuế & An sinh'
export const TAX_PARENT_ICON = '🏛️'

/** Danh mục con chuẩn — tất cả đều là chi thiết yếu & cố định. */
export const TAX_CHILDREN: { name: string; icon: string }[] = [
  { name: 'Thuế thu nhập (所得税)', icon: '🧾' },
  { name: 'Thuế cư trú (住民税)', icon: '🏙️' },
  { name: 'Bảo hiểm y tế (健康保険)', icon: '🏥' },
  { name: 'Hưu trí (年金)', icon: '👴' },
  { name: 'Bảo hiểm việc làm (雇用保険)', icon: '💼' },
  { name: 'Bảo hiểm điều dưỡng (介護保険)', icon: '🩺' },
]

/**
 * Id của mọi danh mục thuộc nhóm Thuế & An sinh: chính danh mục cha, mọi con của
 * nó, và cả danh mục lẻ trùng tên chuẩn (trường hợp người dùng tạo tay không đặt cha).
 */
export function taxCategoryIds(categories: CategoryRow[]): Set<string> {
  const parentIds = new Set(
    categories.filter((c) => c.type === 'expense' && c.name === TAX_PARENT_NAME).map((c) => c.id),
  )
  const standardNames = new Set(TAX_CHILDREN.map((c) => c.name))
  const ids = new Set(parentIds)
  for (const c of categories) {
    if (c.type !== 'expense') continue
    if (c.parent_id && parentIds.has(c.parent_id)) ids.add(c.id)
    else if (standardNames.has(c.name)) ids.add(c.id)
  }
  return ids
}

/** true = người dùng đã có bộ danh mục này (để ẩn nút tạo nhanh). */
export function hasTaxCategories(categories: CategoryRow[]): boolean {
  return categories.some((c) => c.type === 'expense' && c.name === TAX_PARENT_NAME)
}
