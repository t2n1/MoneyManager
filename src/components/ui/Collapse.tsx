// Xổ nhóm: 0fr → 1fr (§12).
//
// Vì sao `grid-template-rows` chứ không `max-height`: chiều cao `auto` không nội suy
// được, nên cách cũ là đoán một con số px cho `max-height` — dòng nào xuống hai hàng, hay
// người dùng phóng cỡ chữ (--app-font-scale), là đoán thiếu và nội dung bị cắt. Lưới một
// hàng thì `1fr` ĐO đúng chiều cao thật của nội dung, còn `0fr` là đúng số không.
//
// Vì sao cần `min-h-0` ở lớp trong: một hàng lưới mặc định không co xuống dưới chiều cao
// tối thiểu của nội dung, nên thiếu nó thì `0fr` không có tác dụng gì cả — đây là cái bẫy
// duy nhất của kỹ thuật này.
//
// KHÔNG dùng cho cây danh mục (BudgetView, CategoryBreakdownCard): ở đó nội dung gập lại
// là hàng chục dòng con của 60 danh mục, mà component này giữ MỌI nhánh trong DOM kể cả
// khi đóng — đó chính là thứ việc gập lại ở đó đang tránh. Chỗ nào nội dung có chặn trên
// nhỏ (một đoạn văn, vài thẻ, ba trục) thì dùng.
import type { ReactNode } from 'react'

interface Props {
  open: boolean
  children: ReactNode
  /** Class cho lớp NỘI DUNG (lớp ngoài phải giữ nguyên `grid` nên không nhận class). */
  className?: string
  /** id để nút mở gắn `aria-controls`. */
  id?: string
}

export function Collapse({ open, children, className = '', id }: Props) {
  return (
    <div className={`grid motion-group ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
      {/* Đóng thì nội dung vẫn nằm trong DOM (điều kiện để có cái mà nội suy), nên phải
          rút nó khỏi tầm với: `inert` bỏ nó khỏi thứ tự Tab, khỏi cây a11y và khỏi cả
          chuột. Chỉ `overflow-hidden` thôi thì có một danh sách link vô hình mà Tab vẫn
          nhảy vào được — người dùng bàn phím mất dấu tiêu điểm. */}
      <div id={id} inert={!open} className={`min-h-0 overflow-hidden ${className}`.trim()}>
        {children}
      </div>
    </div>
  )
}
