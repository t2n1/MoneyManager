// Màn trống / đang tải — một câu canh giữa.
//
// Đo 2026-08-25: BỐN dáng cho cùng một việc.
//   `py-10 text-center text-sm text-fg-muted`      — dáng đông nhất, ở mức TRANG
//   `px-3 py-6 text-center text-sm text-fg-muted`  — trong một thẻ
//   `py-10 text-center text-fg-muted`              — THIẾU `text-sm`, nên chữ rơi về cỡ
//                                                     kế thừa 16px: to hơn hẳn bốn màn
//                                                     bên cạnh (Chi tiết tài khoản, Nhóm
//                                                     tài sản, Sổ · Ngày, Tìm kiếm)
//   `py-16 text-center text-sm text-fg-muted`      — một chỗ duy nhất
//
// Ba dáng đầu chỉ khác nhau vì chép tay, không vì nghĩa. Cái đáng giữ là phân biệt MỨC:
// một câu thay cả trang cần nhiều khoảng thở hơn một câu thay ruột một thẻ.
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Thay ruột một THẺ chứ không cả trang: bớt khoảng thở dọc. */
  compact?: boolean
  className?: string
}

export function EmptyState({ children, compact, className = '' }: Props) {
  return (
    <p
      className={`px-3 text-center text-sm text-fg-muted ${compact ? 'py-6' : 'py-10'} ${className}`.trim()}
    >
      {children}
    </p>
  )
}
