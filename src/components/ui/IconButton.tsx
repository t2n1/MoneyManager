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

const VARIANT: Record<IconButtonVariant, string> = {
  surface: 'bg-surface shadow-sm hover:bg-surface-page dark:hover:bg-gray-800',
  ghost: 'text-fg-muted hover:bg-surface-sunken hover:text-fg-primary',
}

const BASE =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3 transition active:scale-95'

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
