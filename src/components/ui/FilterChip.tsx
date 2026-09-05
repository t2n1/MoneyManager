// Chip LỌC — nửa còn lại của câu hỏi "chọn 1 trong N".
//
// App có HAI họ control cho câu hỏi đó, và chúng khác nhau thật:
//   <SegmentedControl> — đổi CÁCH XEM cùng một dữ liệu (Ngày | Lịch | Tháng | Tổng hợp).
//                        Luôn có đúng một mục bật, các mục chia đều một dải liền khối.
//   <FilterChip>       — LỌC / bật tắt một tập con (Chi · Thu · Chuyển khoản; chọn tài
//                        khoản; "So" một kịch bản). Có thể không mục nào bật, hoặc nhiều.
//
// Cái phải dẹp là NĂM dáng "đang bật" khác nhau trong họ thứ hai (đo 2026-08-25):
//   Sổ                  nền `state-good-bg` (xanh nhạt của trạng thái tốt) · cao 44
//   Tìm kiếm            nền `accent` đặc · cao 36 · không viền
//   Đầu tư              nền `fg-primary` (đảo trắng) · cao 32
//   Tương lai · nút So  nền `accent` đặc · cao 44
//   Biểu đồ Tương lai   nền `surface-sunken` · cao 32
// Cùng một chữ "Tất cả" ở Tìm kiếm ra nền XANH, ở Đầu tư ra nền TRẮNG, lệch cả 4px chiều
// cao. Người dùng phải học lại "đang chọn nghĩa là gì" ở từng màn.
//
// Chốt: nền `accent` đặc. Bảng token đã tách `accent` (hành động / tương tác) khỏi
// `money-in` (giá trị tiền) — xem docs/design-system.md — nên xanh accent ở đây KHÔNG bị
// đọc lẫn thành "tiền vào". `state-good-bg` thì bị: nó là màu của KẾT LUẬN "ổn", mà một
// bộ lọc đang bật không nói gì về tình hình tài chính.
import type { ButtonHTMLAttributes } from 'react'

/** 'md' 44px — sàn vùng chạm. 'sm' 32px — chỉ cho dải chip nằm TRONG một thẻ đã chật. */
export type FilterChipSize = 'md' | 'sm'

// Miễn trừ 'sm' đi theo đúng lý lẽ đã ghi ở DirectionTabs: sàn 44px là ngưỡng NGÓN TAY
// cho control đứng một mình. Dải chip trong đầu một thẻ biểu đồ luôn có ít nhất một chip
// đang bật và nằm cạnh nhau thành khối, nên ngưỡng cấp hai của WCAG 2.5.8 (24px) áp được.
const SIZE: Record<FilterChipSize, string> = {
  md: 'min-h-11 px-3.5 text-sm',
  sm: 'min-h-8 px-2.5 text-2xs',
}

const BASE =
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border font-medium transition active:scale-95'

const ON = 'border-accent bg-accent text-fg-on-accent'
// Tắt có NỀN thẻ (redesign 2) chứ không trong suốt: chip đứng thẳng trên nền trang,
// mà viền ở dark chỉ ~1,4:1 — không có nền thì hình cái chip gần như biến mất.
const OFF = 'border-border-strong bg-surface text-fg-secondary hover:bg-surface-sunken'

export function filterChipClass(on: boolean, size: FilterChipSize = 'md', extra = ''): string {
  return `${BASE} ${SIZE[size]} ${on ? ON : OFF} ${extra}`.trim()
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  on: boolean
  size?: FilterChipSize
  /**
   * Vai trợ năng. 'pressed' (mặc định) cho bật/tắt một bộ lọc; 'selected' cho chip nằm
   * trong một dải `role="tablist"`. Một nút mang cả `aria-pressed` và `aria-selected` thì
   * trình đọc màn hình đọc ra hai điều mâu thuẫn — lời ghi này lấy từ LifetimeChartCard.
   */
  aria?: 'pressed' | 'selected'
}

export function FilterChip({
  on,
  size = 'md',
  aria = 'pressed',
  className = '',
  type = 'button',
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      {...(aria === 'selected' ? { 'aria-selected': on } : { 'aria-pressed': on })}
      type={type}
      className={filterChipClass(on, size, className)}
    />
  )
}
