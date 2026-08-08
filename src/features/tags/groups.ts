// Gom nhãn theo NHÓM. Tách khỏi aggregate.ts vì file đó lo phần cộng tiền;
// đây chỉ là chuyện xếp chỗ trên màn hình.
import type { TagGroupRow, TagRow, TransactionTagRow } from '../../types/database.types'
import { pickerTags } from './aggregate'

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

export interface TagSection {
  /** null = mục "Khác". */
  group: TagGroupRow | null
  /** Nhãn hiện thẳng trong section. */
  shown: TagRow[]
  /** Nhãn còn lại của section — chỉ thấy khi bấm "Tất cả". */
  rest: TagRow[]
}

/**
 * Một section cho MỖI nhóm (theo thứ tự `groups`, repo đã sắp `sort_order`), rồi
 * mục "Khác" ở CUỐI.
 *
 * Ba quy ước, học từ lần làm ô chọn nhãn phẳng:
 *  - Nhóm rỗng VẪN có section: không thì nhóm vừa tạo trở nên vô hình và không có
 *    đường nào gắn nhãn đầu tiên vào nó.
 *  - Mục "Khác" thì ngược lại — hết nhãn là biến mất, vì nó không phải một nhóm
 *    thật, chỉ là chỗ chứa.
 *  - Nhãn trỏ tới nhóm không còn tồn tại (khôi phục backup lệch) rơi về mục Khác
 *    chứ không biến mất khỏi ô chọn.
 *
 * `limit` đếm RIÊNG từng nhóm. Việc xếp hạng trong một section (mức dùng giảm dần,
 * nhãn lưu trữ ẩn trừ khi đang chọn, nhãn đang chọn ngoài top thì xuống cuối) dùng
 * lại nguyên `pickerTags` — cùng một luật, không viết lại lần hai.
 */
export function pickerSections(
  tags: TagRow[],
  groups: TagGroupRow[],
  links: TransactionTagRow[],
  selectedIds: string[],
  limit: number,
): TagSection[] {
  const known = new Set(groups.map((g) => g.id))
  const out: TagSection[] = groups.map((g) => ({
    group: g,
    ...pickerTags(
      tags.filter((t) => t.group_id === g.id),
      links,
      selectedIds,
      limit,
    ),
  }))

  const other = tags.filter((t) => isUngrouped(t, known))
  if (other.length > 0) {
    const part = pickerTags(other, links, selectedIds, limit)
    // Cả mục này là nhãn lưu trữ chưa được chọn → pickerTags trả rỗng, đừng vẽ một
    // tiêu đề trống trơn.
    if (part.shown.length > 0 || part.rest.length > 0) out.push({ group: null, ...part })
  }
  return out
}
