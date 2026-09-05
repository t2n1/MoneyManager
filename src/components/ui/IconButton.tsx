// Nút chỉ có icon — gom `min-h-11 min-w-11 ... active:scale-95` (35 chỗ dùng cặp
// min-h/min-w, 103 chỗ dùng active:scale-95).
//
// Ba thứ dễ quên nhất khi chép tay, ở đây thành mặc định:
//   1. 44×44px: ngưỡng vùng chạm của Apple HIG. Icon 20px trần thì quá nhỏ.
//   2. `transition`: thiếu nó thì active:scale-95 giật cục, không có gia tốc.
//   3. hover: máy tính không có trạng thái chạm, chỉ active:scale-95 thì trỏ chuột
//      lên nút hoàn toàn không phản hồi.
// Không tự đặt focus ring: index.css đã có ring toàn cục cho button/a bằng
// :focus-visible với specificity 0, nên nó tự lấp vào đây.
import type { ButtonHTMLAttributes } from 'react'

/**
 * 'surface' = nút nổi trên nền trang · 'ghost' = trong suốt, dùng trong thẻ ·
 * 'accent' = nền xanh, hành động THÊM ở đầu một hàng ("+" thêm danh mục con).
 *
 * `accent` thêm 2026-08-25 khi gom nút: nút "+" thêm danh mục con đang tự viết nền xanh
 * nhạt lên một nút icon. Không gộp được vào <ActionButton>: nó khai `px-4 py-2` cho nút
 * CÓ CHỮ, còn nút icon cần vuông 44×44.
 */
export type IconButtonVariant = 'surface' | 'ghost' | 'accent'

// 'surface' ở dark: bỏ bóng, thay bằng viền control — 1a không có shadow, và trên nền
// #0e1014 thì shadow-sm chỉ còn là một vệt tối bẩn quanh nút. Light giữ nguyên.
// hover đi bằng token thay vì `dark:hover:bg-gray-800` viết tay: sắc độ đó là thang cũ,
// giữ lại thì nút hover sáng hơn hẳn thang mới.
const VARIANT: Record<IconButtonVariant, string> = {
  // Viền ở CẢ hai chế độ từ redesign 2 (nút tròn không viền trên nền trang chỉ là một
  // hình mờ): light viền panel rất nhạt + shadow như cũ, dark viền control.
  surface:
    'border border-border-panel bg-surface shadow-sm hover:bg-surface-sunken dark:border-border-strong dark:shadow-none',
  ghost: 'text-fg-muted hover:bg-surface-sunken hover:text-fg-primary',
  // Nền xanh NHẠT, không phải nền xanh đặc: nút này lặp trên mỗi dòng danh mục cha, một
  // dãy nút xanh đặc xếp dọc thì thành bức tường màu và không còn là "hành động phụ".
  accent: 'bg-accent-muted-bg text-fg-accent hover:opacity-90',
}

// rounded-full: redesign 2 pill hoá NÚT (điểm mù có chủ đích của guardrail bán kính —
// đổi ở hằng số này là đổi cho cả app, xem chú thích trong tests/designSystem.test.ts).
// Ô NHẬP thì vẫn rounded-md: pill chỉ dành cho thứ bấm được, không dành cho chỗ gõ chữ.
const BASE =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 transition active:scale-95'

/**
 * Lớp CSS của IconButton, cho những chỗ KHÔNG render ra <button>: `<Link>` của
 * react-router là thẻ <a>. Làm IconButton polymorphic bằng `as` thì phải kéo theo
 * generic cho props của Link — không đáng, chỉ để đổi một tên thẻ.
 */
export function iconButtonClass(variant: IconButtonVariant = 'surface', extra = ''): string {
  return `${BASE} ${VARIANT[variant]} ${extra}`.trim()
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Bắt buộc: nút chỉ có icon thì không có chữ nào cho trình đọc màn hình. */
  'aria-label': string
  variant?: IconButtonVariant
}

export function IconButton({
  variant = 'surface',
  className = '',
  type = 'button',
  ...rest
}: Props) {
  return <button {...rest} type={type} className={iconButtonClass(variant, className)} />
}
