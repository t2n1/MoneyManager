// Gom nhãn theo NHÓM. Tách khỏi aggregate.ts vì file đó lo phần cộng tiền;
// đây chỉ là chuyện xếp chỗ trên màn hình.
import type { TagGroupRow, TagRow } from '../../types/database.types'

/** Nhãn được coi là ngoài nhóm: chưa xếp, hoặc trỏ tới nhóm không còn tồn tại. */
function isUngrouped(t: TagRow, known: Set<string>): boolean {
  return !t.group_id || !known.has(t.group_id)
}

/**
 * Hàng đợi cho dải xếp nhanh: nhãn còn dùng mà chưa có nhóm.
 *
 * `skipped` là những nhãn vừa bấm "Để ở Khác" trong phiên này. Cần nó vì DB không
 * phân biệt được "tôi đã quyết nó thuộc Khác" với "tôi chưa xem tới" — cả hai đều
 * là `group_id = null`. Không có nó thì bấm "Để ở Khác" xong nhãn lại hiện ngay lại.
 *
 * Nhãn đã lưu trữ bị loại: xếp nhóm cho nhãn không còn xuất hiện khi nhập là việc
 * vô ích, và nó làm hàng đợi dài ra vì lý do không đáng.
 */
export function ungroupedQueue(
  tags: TagRow[],
  groups: TagGroupRow[],
  skipped: string[],
): TagRow[] {
  const known = new Set(groups.map((g) => g.id))
  const skip = new Set(skipped)
  return tags.filter((t) => !t.is_archived && !skip.has(t.id) && isUngrouped(t, known))
}
