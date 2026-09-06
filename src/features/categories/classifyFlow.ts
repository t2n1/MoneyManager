// Logic thuần của trang Phân loại chi tiêu (redesign 2026-09-06, phương án "nhãn
// tóm tắt + bảng chọn"): dòng danh mục chỉ hiện MỘT nhãn tóm tắt, bảng chọn trồi
// lên lo phần gán, lưu xong tự nhảy sang mục chưa xong kế tiếp.
//
// Nằm ngoài React theo quy ước "toán thuần" — component render kết quả, không tính.
import type { CostType, NeedLevel } from '../../types/database.types'
import { COST_OPTIONS, NEED_OPTIONS } from './ClassificationToggle'

/** Hai trục phân loại của một danh mục — phần `CategoryRow` mà trang này quan tâm. */
export interface ClassifyState {
  need_level: NeedLevel | null
  cost_type: CostType | null
}

/** Xong = đủ CẢ hai trục. Một trục lẻ vẫn là "chưa xong" — Báo cáo cần cả hai. */
export const isClassified = (s: ClassifyState): boolean =>
  s.need_level != null && s.cost_type != null

const needLabel = (v: NeedLevel | null) => NEED_OPTIONS.find(([o]) => o === v)?.[1] ?? 'Chưa'
const costLabel = (v: CostType | null) => COST_OPTIONS.find(([o]) => o === v)?.[1] ?? 'Chưa'

/**
 * Chữ trên nhãn tóm tắt của một dòng. Cả hai trống → "Chưa phân loại"; thiếu một
 * trục thì trục đó ghi "Chưa" — cùng từ với lựa chọn null của bộ toggle cũ, để
 * người đã quen màn trước không phải học từ mới.
 */
export function summaryLabel(s: ClassifyState): string {
  if (s.need_level == null && s.cost_type == null) return 'Chưa phân loại'
  return `${needLabel(s.need_level)} · ${costLabel(s.cost_type)}`
}

/**
 * Mục CHƯA XONG kế tiếp sau `afterId` — quét xuôi hết danh sách rồi vòng lên đầu,
 * không bao giờ trả lại chính `afterId` (vừa lưu xong thì pending có thể chưa kịp
 * phản ánh, trả lại chính nó là bảng chọn đứng yên một chỗ).
 *
 * `rows` là danh sách ĐANG HIỂN THỊ (đã qua bộ lọc) với giá trị hiệu lực đã trộn
 * pending — thứ tự nhảy đúng bằng thứ tự mắt đang thấy.
 */
export function nextTodo<T extends { id: string } & ClassifyState>(
  rows: T[],
  afterId: string | null,
): T | null {
  const at = afterId === null ? -1 : rows.findIndex((r) => r.id === afterId)
  for (let step = 1; step <= rows.length; step++) {
    const row = rows[(at + step + rows.length) % rows.length]
    if (!row || row.id === afterId) continue
    if (!isClassified(row)) return row
  }
  return null
}
