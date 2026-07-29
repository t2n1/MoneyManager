// Tiêu đề — dàn xếp HAI quy ước đang đánh nhau trong code:
//   `text-sm font-semibold text-gray-500`  (19 chỗ) → nhãn thẻ, đọc nhỏ, nhường số
//   `text-base font-bold text-gray-800`    (14 chỗ) → tiêu đề khối, đọc to
// Cả hai đều đúng, chỉ là chưa ai nói rõ khi nào dùng cái nào, nên trong cùng một
// màn có thẻ dùng kiểu này thẻ dùng kiểu kia. Đặt tên theo VAI TRÒ, không theo cỡ:
//   'card'  — nhãn của một thẻ; nội dung (con số) mới là thứ cần đọc trước
//   'block' — tiêu đề một khối gồm nhiều thẻ; nó chính là thứ cần đọc trước
import type { ReactNode } from 'react'

export type TitleRole = 'card' | 'block'

const ROLE: Record<TitleRole, string> = {
  card: 'text-sm font-semibold text-fg-muted',
  block: 'text-base font-bold text-fg-primary',
}

interface Props {
  children: ReactNode
  role?: TitleRole
  /** Cấp heading thật trong tài liệu. Mặc định h2 — h1 đã thuộc về tiêu đề trang. */
  as?: 'h2' | 'h3' | 'h4'
  className?: string
}

export function SectionTitle({ children, role = 'card', as: Tag = 'h2', className = '' }: Props) {
  return <Tag className={`${ROLE[role]} ${className}`.trim()}>{children}</Tag>
}
