// Màu lát của nhóm tài sản — MỘT bảng cho ba màn.
//
// Trước file này, dãy 12 mã màu và vòng lặp gán màu được chép nguyên ở AssetsNowView và
// AssetsTrendView, kèm chú thích "cùng dãy với chế độ Hôm nay để chấm màu hai màn khớp
// nhau" — tức chính người viết đã biết đây là thứ phải khớp, và cách giữ khớp là nhớ
// chép cho đúng. Trang Nhóm tài sản là chỗ thứ BA cần đúng dãy đó (chấm màu ở đầu mỗi
// dòng phải khớp lát trên vạch), nên gom lại đây.
//
// Phép gán màu KHÔNG phải "màu thứ i của nhóm thứ i": chỉ nhóm CÓ LÁT trên vạch mới
// tiêu một màu (tính vào tổng và total > 0). Nhóm đứng ngoài tổng mà vẫn ăn một màu
// thì hai màn vẽ cùng bộ nhóm sẽ lệch màu ngay khi một nhóm bị tắt "tính vào tổng".
import type { AssetGroup } from './aggregate'

export const GROUP_PALETTE = [
  '#16a34a', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7',
]

/** Nhóm không có lát (ngoài tổng, hoặc rỗng) — xám, không tiêu một màu của dãy. */
export const GROUP_COLOR_NONE = '#cbd5e1'

/** Map tên nhóm → màu, theo THỨ TỰ ĐANG HIỆN của mảng truyền vào. */
export function groupColorMap(groups: AssetGroup[]): Map<string, string> {
  const m = new Map<string, string>()
  let i = 0
  for (const g of groups) {
    if (!g.includeInTotals || g.total <= 0) continue
    m.set(g.name, GROUP_PALETTE[i % GROUP_PALETTE.length])
    i++
  }
  return m
}
