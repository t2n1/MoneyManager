// Danh mục nào là CHUYỂN TÀI SẢN, không phải chi tiêu.
//
// Một chỗ duy nhất suy ra tập id đó, vì mọi hàm tổng hợp đều cần đúng tập này. Nếu hai
// màn dựng hai tập khác nhau thì chi tháng 8 sẽ ra hai con số, và đó chính là lỗi cột
// `kind` được thêm vào để chấm dứt.
//
// KHÁC `isFlowCategory` (flowCategories.ts): cái đó suy theo TÊN và chỉ để ẩn danh mục
// khỏi ô chọn tay. Cái này đọc CỘT `kind` và đổi phép tính.

import type { CategoryRow } from '../../types/database.types'

/** Tập rỗng dùng chung — đừng tạo `new Set()` mới mỗi render, useMemo sẽ vô nghĩa. */
export const NO_TRANSFER_CATEGORIES: ReadonlySet<string> = new Set<string>()

/**
 * Id của mọi danh mục `kind = 'transfer'`.
 *
 * Nhận `Pick` chứ không nhận `CategoryRow[]` để test dựng dữ liệu gọn, và để hàm này
 * thuần — không kéo theo React, không đọc localStorage (ràng buộc của purity.test.ts).
 */
export function transferCategoryIds(
  categories: readonly Pick<CategoryRow, 'id' | 'kind'>[],
): ReadonlySet<string> {
  const out = new Set<string>()
  for (const c of categories) if (c.kind === 'transfer') out.add(c.id)
  return out.size === 0 ? NO_TRANSFER_CATEGORIES : out
}

/** Danh mục đặt được hạn mức: chỉ `kind = 'expense'`. */
export function isBudgetableCategory(c: Pick<CategoryRow, 'kind'>): boolean {
  return c.kind !== 'transfer'
}
