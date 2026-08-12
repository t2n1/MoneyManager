// Gom nhãn theo NHÓM. Tách khỏi aggregate.ts vì file đó lo phần cộng tiền;
// đây chỉ là chuyện xếp chỗ trên màn hình.
import type { TagGroupRow, TagRow, TransactionTagRow } from '../../types/database.types'
import { pickerTags } from './aggregate'

/** Nhãn được coi là ngoài nhóm: chưa xếp, hoặc trỏ tới nhóm không còn tồn tại. */
function isUngrouped(t: TagRow, known: Set<string>): boolean {
  return !t.group_id || !known.has(t.group_id)
}

/**
 * Số nhãn hiện thẳng trong MỖI nhóm khi chưa bấm "Tất cả".
 *
 * Buộc vào số NHÓM chứ không phải số mục đang vẽ: `sections` là kết quả của
 * `pickerSections(…, limit)`, nên lấy `sections.length` ra quyết định limit là vòng
 * tròn — phải có limit trước mới có sections.
 *
 * Số 3 của bản trước sinh ra khi mỗi mục còn ăn MỘT hàng tiêu đề riêng. Nay tên nhóm
 * nằm cùng hàng với chip nên chỗ đó dư ra, trả lại cho nhãn. Người dùng chốt chỉ dùng
 * 2 nhóm ("Ai?", "Ở đâu?") và không định thêm, nên nhánh `<= 2` là nhánh chạy thật.
 *
 * Đánh đổi đã biết: mục "Khác" tự xuất hiện (khôi phục sao lưu lệch, nhãn trỏ tới nhóm
 * đã xoá) thì có 3 mục mà limit vẫn 4. Ca hiếm, và đo lại rồi hạ được — đổi lấy việc
 * không phải lặp logic "mục Khác có xuất hiện hay không" ở hai chỗ rồi để hai bên trôi.
 */
export function collapsedLimit(groupCount: number): number {
  return groupCount <= 2 ? 4 : 3
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

/** Một chỗ có thể tạo nhãn mới vào. `group: null` = mục "Khác". */
export interface CreateTarget {
  group: TagGroupRow | null
}

/**
 * Gõ một tên chưa có vào ô tìm thì mỗi nhóm hiện một chip "＋ Tạo …", để chọn luôn chỗ
 * đặt. Sau khi bỏ nút "+ mới" ở từng nhóm, đây là đường tạo nhãn duy nhất — nên mọi
 * nhánh dưới đây đều phải để lại ít nhất một chỗ tạo, không được thành ngõ cụt.
 *
 * Trùng tên HẲN thì trả rỗng: lúc đó việc đúng là chọn nhãn có sẵn. Xét cả nhãn đã lưu
 * trữ, vì gõ trùng tên nhãn lưu trữ sẽ làm nó SỐNG LẠI (xem `addTag` trong TagPicker) —
 * mời tạo ở đó là mời tạo một thứ không tạo được.
 *
 * Mục "Khác" chỉ được mời khi nó ĐANG tồn tại. Không tự mọc mục Khác ra để nhận nhãn
 * mới: chốt 2026-08-08 là nhãn tạo lúc nhập phải sinh ra đã có nhóm, không đẻ thêm việc
 * "vào Cài đặt xếp lại sau". Ngoại lệ duy nhất là chưa có nhóm nào.
 */
export function createTargets(
  tags: TagRow[],
  sections: TagSection[],
  query: string,
): CreateTarget[] {
  const name = query.trim()
  if (!name) return []
  const lower = name.toLowerCase()
  if (tags.some((t) => t.name.toLowerCase() === lower)) return []

  const out: CreateTarget[] = []
  for (const s of sections) if (s.group) out.push({ group: s.group })
  if (out.length === 0) return [{ group: null }]
  if (sections.some((s) => !s.group)) out.push({ group: null })
  return out
}
