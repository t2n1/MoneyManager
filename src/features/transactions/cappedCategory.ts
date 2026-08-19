// Danh mục nào GIỮ TRẦN của khoản đang nhập — không phải luôn là ô người dùng bấm.
//
// Ba việc gộp về một chỗ vì cả ba đều trả lời cùng một câu hỏi, và tách ra thì câu trả
// lời lệch nhau:
//
// 1. `capBase: 'none'` → dạng này không có trần, khỏi tra.
// 2. `categoryPicker: 'auto'` → app tự gán lúc lưu, nên `selectedCat` (ô người dùng bấm)
//    KHÔNG phải danh mục sẽ nhận khoản này. Phải tra theo tên app sẽ gán.
// 3. `kind = 'transfer'` → danh mục chuyển tài sản KHÔNG đặt được trần và KHÔNG vào chi
//    đã tiêu (progress.ts, aggregate.ts). Cảnh báo trần cho nó là một câu về con số sẽ
//    không bao giờ xuất hiện.
//
// Điểm 3 là chỗ dễ sai nhất, nên nói rõ: nó phải chặn TRƯỚC bước rơi về danh mục cha.
// `Gửi tiền về VN` là con của `Tài chính`. Nếu chỉ dựa vào "không tìm thấy dòng ngân sách
// của chính nó" thì khi người dùng đặt trần ở `Tài chính`, cảnh báo sẽ rơi về trần của cha
// và báo "thêm ¥30,000 vào Tài chính" — trong khi progress.ts loại đúng khoản đó khỏi chi
// của cả nhóm. Con số trong câu cảnh báo sẽ không bao giờ tới.
//
// VÀ ĐÂY LÀ LỰA CHỌN CỦA NGƯỜI DÙNG, KHÔNG PHẢI CỦA APP (migration 0046): cột `kind` để
// NULL cho trigger điền, và một `expense` khai rõ thì không bị đổi lại. Ai coi tiền gửi về
// nhà là tiêu thật thì gạt nút ở tấm sửa danh mục, `kind` thành 'expense', và hàm này trả
// danh mục đó ra — cảnh báo trần chạy. Vì vậy `family` giữ `capBase: 'full'` trong bảng
// entryShape: quyết định "có chịu trần hay không" thuộc về cột `kind`, không thuộc về bảng.

import type { CategoryRow } from '../../types/database.types'
import { isBudgetableCategory } from '../categories/kind'
import type { EntryShape } from './entryShape'

/** Chỉ những cột thật sự cần — để test dựng dữ liệu gọn. */
export type CapCategory = Pick<CategoryRow, 'id' | 'name' | 'type' | 'kind' | 'parent_id'>

/**
 * @param shape       dòng bảng của dạng đang nhập
 * @param selectedCat ô danh mục người dùng đang bấm (null nếu chưa chọn / lưới ẩn)
 * @param categories  toàn bộ danh mục, để tra tên mà app sẽ tự gán
 * @param autoName    tên danh mục app gán cho dạng `auto` này (null nếu dạng này không có)
 */
export function cappedCategory(
  shape: Pick<EntryShape, 'capBase' | 'categoryPicker'>,
  selectedCat: CapCategory | null,
  categories: readonly CapCategory[],
  autoName: string | null,
): CapCategory | null {
  if (shape.capBase === 'none') return null
  const cat =
    shape.categoryPicker === 'user'
      ? selectedCat
      : autoName === null
        ? null
        : (categories.find((c) => c.type === 'expense' && c.name === autoName) ?? null)
  if (!cat) return null
  return isBudgetableCategory(cat) ? cat : null
}
