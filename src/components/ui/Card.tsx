// Thẻ — gom idiom `rounded-xl` + nền thẻ + `p-3 shadow-sm` xuất hiện
// ~70 lần (27× kèm p-3, 11× p-4, 9× không padding, 5× text-center...).
//
// `elevation` là lý do chính component này tồn tại: hiện 29 thẻ trong features/reports
// dùng ĐÚNG một kiểu, nên màn Báo cáo xếp 5 thẻ dọc mà "Cơ cấu chi tiêu" đọc to y như
// "Theo thẻ" — không có phân cấp. Có prop thì hạ thẻ phụ xuống 'flat' được mà không
// phải đụng layout.
import type { ElementType, ReactNode } from 'react'

/** 'raised' = nổi (thẻ chính) · 'flat' = viền, không đổ bóng (thẻ phụ) */
export type CardElevation = 'raised' | 'flat'
export type CardPadding = 'none' | 'sm' | 'md' | 'lg'

const ELEVATION: Record<CardElevation, string> = {
  raised: 'shadow-sm',
  flat: 'border border-border-subtle',
}

const PADDING: Record<CardPadding, string> = {
  none: '',
  sm: 'p-2.5',
  md: 'p-3',
  lg: 'p-4',
}

interface Props {
  children: ReactNode
  elevation?: CardElevation
  padding?: CardPadding
  /** Đổi thẻ bọc — dùng 'section' khi thẻ là một khối nội dung có tiêu đề. */
  as?: ElementType
  className?: string
}

export function Card({
  children,
  elevation = 'raised',
  padding = 'md',
  as: Tag = 'div',
  className = '',
}: Props) {
  return (
    <Tag
      className={`rounded-xl bg-surface ${ELEVATION[elevation]} ${PADDING[padding]} ${className}`.trim()}
    >
      {children}
    </Tag>
  )
}
