// Ô chọn xổ xuống.
//
// Vẫn là `<select>` GỐC bên trong, không phải dropdown tự vẽ — và đó là chủ ý, không phải
// làm tạm: trên điện thoại `<select>` gốc mở bộ chọn của hệ điều hành (bánh xe iOS, tấm
// trượt Android), thứ dùng một tay được và người dùng đã quen. Một dropdown tự vẽ đẹp hơn
// trên desktop nhưng tệ hơn trên chính thiết bị app này được dùng nhiều nhất.
//
// Vậy vấn đề nằm ở đâu: 18 file dùng `<select>` trần với ~10 biến thể class viết tay —
// px-2 hay px-3, py-1 hay py-2, text-xs hay text-sm, có `min-h-11` hay không. Kết quả là
// hai ô chọn cạnh nhau trong cùng một tấm trượt cao lệch nhau, và một nửa số ô thấp hơn
// sàn vùng chạm 44px.
//
// `appearance-none` + mũi tên tự vẽ: mũi tên mặc định của Windows là một hình tam giác xám
// hệ thống, không theo token nào — nó là chỗ lộ ra rõ nhất rằng ô này "không thuộc app".
// Bỏ appearance KHÔNG làm mất bộ chọn native: nó chỉ đổi cách vẽ cái ô đóng.
import type { SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'

const BOX =
  'min-h-11 w-full appearance-none rounded-md border border-border-strong bg-surface pl-3 pr-9 text-sm text-fg-primary transition disabled:opacity-50'

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Lớp cho KHUNG BAO (bề rộng, lề), không cho chính <select>. */
  wrapClassName?: string
}

export function Select({ className = '', wrapClassName = '', children, ...rest }: Props) {
  return (
    <span className={`relative inline-block ${wrapClassName}`.trim()}>
      <select {...rest} className={`${BOX} ${className}`.trim()}>
        {children}
      </select>
      {/* Mũi tên là TRANG TRÍ: `<select>` bên dưới đã nhận mọi cú bấm, nên nó phải
          `pointer-events-none`, còn không thì bấm đúng mũi tên lại không mở được ô. */}
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted"
      />
    </span>
  )
}
