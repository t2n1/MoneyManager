// Chi CÙNG THÁNG NĂM NGOÁI theo danh mục — số tham chiếu trong sheet đặt hạn mức.
//
// Vì sao thêm mốc này cạnh "6 tháng gần đây" (suggest.ts): trung bình các tháng gần
// đây mù mùa vụ — hạn mức Điện đặt tháng 12 mà gợi ý từ trung bình ba tháng thu là
// thấp một cách hệ thống, trong khi tháng 12 năm ngoái nói thẳng mùa đông tốn bao
// nhiêu. Hai mốc đứng cạnh nhau, người đặt tự chọn tin bên nào.

import type { CategorySlice } from '../reports/aggregate'
import { rollUpParents } from './suggest'

/**
 * Map danh mục → tổng chi (base minor) của một tháng, ĐÃ gộp con lên cha — cùng lý do
 * với useSuggestions: danh mục đặt trần nhóm không có giao dịch ghi thẳng vào nó,
 * không gộp thì trần nhóm không có số năm ngoái nào để hiện.
 */
export function lastYearAmounts(
  slices: CategorySlice[],
  parentOf: (categoryId: string) => string | null,
): Map<string, number> {
  const rolled = rollUpParents([{ monthKey: '', slices }], parentOf)[0].slices
  return new Map(rolled.map((s) => [s.categoryId, s.amount]))
}
