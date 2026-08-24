// Nút có CHỮ (khác <IconButton> chỉ có icon) — gom ba dáng đang bị chép tay khắp
// các sheet và trang chi tiết:
//   'outline'  viền mảnh, chữ nhỏ — hành động phụ nằm trong thẻ ("Điều chỉnh số nợ")
//   'primary'  nền xanh — hành động chính của một sheet ("Lưu", "Điều chỉnh")
//   'danger'   chữ đỏ, không nền — hành động PHÁ HỦY ("Xóa khoản nợ", "Xóa quy tắc")
//
// Lý do gom: `active:scale-95` và `transition` phải đi cùng nhau, chép tay thì
// luôn có chỗ quên `transition` và nút giật cục. Cỡ chữ/độ đậm KHÔNG nằm trong
// BASE — hai dáng dùng hai bậc khác nhau, để chung thì thứ tự thắng của Tailwind
// không đảm bảo.
import type { ButtonHTMLAttributes } from 'react'

export type ActionButtonVariant = 'outline' | 'primary' | 'danger'

// min-h-11 = 44px: chuẩn vùng chạm, nằm ở BASE để mọi nút chữ tự đạt không cần nhớ.
//
// ⚠️ Bản 1a ghi nút chính cao 30px. KHÔNG áp con số đó ở đây, và đây là mâu thuẫn
// trong chính bộ tài liệu chứ không phải mình bỏ sót: §2.5 tả cái nút "+ Giao dịch"
// nằm trên TOP BAR desktop (một chỗ, chuột), còn §4.6 nói thẳng "mọi vùng chạm giữ
// min-h-11 (44px) đúng như code hiện tại". ActionButton là nút chữ dùng chung cho ~90
// chỗ, phần lớn là sheet trên điện thoại. Hạ sàn xuống 30px để khớp một cái nút ở
// desktop là đổi vùng chạm của tất cả — 44px thắng.
// Nút 30px của top bar dựng cùng PR khung app (PR 3), ở đó nó là một dáng riêng.
//
// rounded-md (6px) chứ không rounded-lg: 1a tách bán kính CONTROL (5–7px) khỏi bán
// kính PANEL (8px) — xem §1.3. Trước đây app dùng 8px cho cả hai.
const BASE =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md transition active:scale-95 disabled:opacity-50'

const VARIANT: Record<ActionButtonVariant, string> = {
  // Nền TRONG SUỐT, không phải bg-surface: nút phụ của 1a chỉ là một khung viền đặt
  // thẳng lên nền nó đang đứng. Hover đổi nền thay vì đổi màu viền — cùng ý "nút này
  // sống", nhưng không cần thêm một token viền chỉ dùng cho hover.
  outline:
    'border border-border-strong bg-transparent px-3 py-1.5 text-sm font-medium text-fg-secondary hover:bg-surface-sunken',
  // bg-accent + text-fg-on-accent, không phải bg-green-700 + text-white: token đã lật
  // sẵn theo chế độ, còn chữ trắng trên --accent ở dark chỉ được 2,22:1 (bẫy ghi ở
  // tests/contrast.test.ts). 13px/600 là bậc chữ nút của 1a.
  primary: 'bg-accent px-4 py-2 text-sm font-semibold text-fg-on-accent',
  // Chữ đỏ trên nền TRONG SUỐT, không phải nút đỏ đặc: hành động phá hủy phải đọc được
  // là phá hủy mà KHÔNG được bắt mắt hơn hành động chính ngay cạnh nó. Đo 2026-08-25: 11
  // nút loại này đang có TÁM dáng — px-2 py-1 / px-3 py-2 / px-4 py-3 / min-h-9 /
  // min-h-11 / có viền / không hover / và một chỗ dùng `hover:bg-red-50` thô (bảng màu
  // trần, không lật theo Sáng-Tối) thay cho token `state-bad-bg`.
  danger: 'px-4 py-2 text-sm font-medium text-money-out hover:bg-state-bad-bg',
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
