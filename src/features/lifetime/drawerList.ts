// Phiếu "Danh sách đầy đủ" — phần LỌC và SẮP XẾP. THUẦN, không React.
//
// Bản vẽ (dsg-handoff/README.md §"Drawer Danh sách đầy đủ"): mục mốc có một ô tìm và ba
// chip sắp xếp — Theo năm · Tiền lớn nhất · Theo loại.
//
// Dùng `normalizeText` của `features/transactions/filter.ts` (thuần) chứ không viết phép
// bỏ dấu thứ hai: ô tìm ở đây phải cư xử giống mọi ô tìm khác trong app, và hai phép bỏ
// dấu là hai thứ để lệch nhau.
import { normalizeText } from '../transactions/filter'

export type DrawerSort = 'year' | 'money' | 'type'

/**
 * Hình dạng tối thiểu mà danh sách cần — cố ý KHÔNG nhận `DraftEvent` đầy đủ: hàm này chỉ
 * đọc sáu trường, và nhận hình nhỏ nhất thì test dựng được dữ liệu bằng số, không phải
 * dựng cả một bản nháp.
 */
export interface DrawerEventLike {
  id: string
  label: string
  startYear: number
  endYear: number | null
  kind: 'income' | 'expense'
  amountMinor: number
  /** Khoá icon — xem chú thích của `sort: 'type'`. */
  icon: string
}

export function drawerEvents<T extends DrawerEventLike>(
  events: readonly T[],
  { q, sort }: { q: string; sort: DrawerSort },
): T[] {
  const key = normalizeText(q)
  // LỌC trước, SẮP sau: nhóm của "Theo loại" phải dựng từ chính danh sách đã lọc, không
  // thì một nhóm chỉ còn một mốc vẫn giữ chỗ của cả nhóm cũ.
  const loc = key === '' ? [...events] : events.filter((e) => normalizeText(e.label).includes(key))

  const theoNam = (a: T, b: T) => a.startYear - b.startYear || a.label.localeCompare(b.label, 'vi')

  if (sort === 'money') {
    // Độ LỚN giảm dần: một khoản thu lớn cũng là một dòng đáng nhìn trước một khoản chi
    // nhỏ — cùng thang với bảng xếp hạng ở `lifetimeCost.ts`.
    return loc.sort((a, b) => Math.abs(b.amountMinor) - Math.abs(a.amountMinor) || theoNam(a, b))
  }

  if (sort === 'type') {
    // App KHÔNG có cột `type`, và cố ý không có (spec §6: mốc là một hình chung, "loại"
    // chỉ tồn tại lúc nhập qua bộ mẫu). Thứ gần nhất mà dữ liệu THẬT có là ICON — chính
    // là thứ người dùng chọn để nói mốc này là việc gì. Mốc chưa chọn icon (`''`) rơi về
    // Thu/Chi để nó vẫn có một nhóm ổn định, không lẫn vào nhóm của mốc khác.
    const nhom = (e: T) => e.icon || `~${e.kind}`
    return loc.sort((a, b) => nhom(a).localeCompare(nhom(b)) || theoNam(a, b))
  }

  return loc.sort(theoNam)
}
