// Nút có CHỮ (khác <IconButton> chỉ có icon) — gom hai dáng đang bị chép tay khắp
// các sheet và trang chi tiết:
//   'outline'  viền mảnh, chữ nhỏ — hành động phụ nằm trong thẻ ("Điều chỉnh số nợ")
//   'primary'  nền xanh — hành động chính của một sheet ("Lưu", "Điều chỉnh")
//
// Lý do gom: `active:scale-95` và `transition` phải đi cùng nhau, chép tay thì
// luôn có chỗ quên `transition` và nút giật cục. Cỡ chữ/độ đậm KHÔNG nằm trong
// BASE — hai dáng dùng hai bậc khác nhau, để chung thì thứ tự thắng của Tailwind
// không đảm bảo.
import type { ButtonHTMLAttributes } from 'react'

export type ActionButtonVariant = 'outline' | 'primary'

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg transition active:scale-95 disabled:opacity-50'

const VARIANT: Record<ActionButtonVariant, string> = {
  outline:
    'border border-border-strong px-3 py-1.5 text-xs font-medium text-fg-secondary hover:bg-gray-50 dark:hover:bg-gray-800',
  primary: 'bg-green-700 px-4 py-2 text-sm font-semibold text-white',
}

export function actionButtonClass(variant: ActionButtonVariant = 'outline', extra = ''): string {
  return `${BASE} ${VARIANT[variant]} ${extra}`.trim()
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ActionButtonVariant
}

export function ActionButton({ variant = 'outline', className = '', type = 'button', ...rest }: Props) {
  return <button {...rest} type={type} className={actionButtonClass(variant, className)} />
}
