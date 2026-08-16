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

/** 'surface' = nút nổi trên nền trang · 'ghost' = trong suốt, dùng trong thẻ */
export type IconButtonVariant = 'surface' | 'ghost'

// 'surface' ở dark: bỏ bóng, thay bằng viền control — 1a không có shadow, và trên nền
// #0e1014 thì shadow-sm chỉ còn là một vệt tối bẩn quanh nút. Light giữ nguyên.
// hover đi bằng token thay vì `dark:hover:bg-gray-800` viết tay: sắc độ đó là thang cũ,
// giữ lại thì nút hover sáng hơn hẳn thang mới.
const VARIANT: Record<IconButtonVariant, string> = {
  surface:
    'bg-surface shadow-sm hover:bg-surface-sunken dark:border dark:border-border-strong dark:shadow-none',
  ghost: 'text-fg-muted hover:bg-surface-sunken hover:text-fg-primary',
}

// rounded-md (6px): bán kính CONTROL của 1a, tách khỏi bán kính panel 8px (§1.3).
const BASE =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-3 transition active:scale-95'

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
