// Tiêu đề — dàn xếp những quy ước đang đánh nhau trong code. Bản đầu gom HAI:
//   `text-sm font-semibold text-gray-500`  → nhãn thẻ, đọc nhỏ, nhường số
//   `text-base font-bold text-gray-800`    → tiêu đề khối, đọc to
// Nhưng nó chỉ được dùng ở 4/137 file, nên hai quy ước đó vẫn tiếp tục đẻ ra. Đo lại
// 2026-08-25 trên 110 <h2>/<h3> viết tay: MƯỜI tổ hợp cho BA vai trò.
//
//   Vai trò "tên một thẻ" (14px) có năm tổ hợp — và lệch rõ nhất là MÀU:
//     35 chỗ `text-fg-primary`, 24 chỗ `text-fg-muted`. Cùng cỡ, cùng độ đậm, khác độ
//     sáng. Đã soát từng chỗ: KHÔNG có ranh giới nghĩa nào giữa hai nhóm — "Ngân sách",
//     "Tài khoản", "Dòng tiền 8 tháng" nằm nhóm sáng; "Tổng ngân sách", "Cơ cấu chi
//     tiêu", "Giao diện", "Cỡ chữ" nằm nhóm xám. Đều là tên của một thẻ. Chỉ là hai
//     thói quen. Bốn tổ hợp còn lại là lệch độ đậm lẻ tẻ (medium, bold).
//
// Nên `card` giờ là SÁNG, không phải xám: 35 > 24, các màn dựng gần nhất đều sáng, và
// tên thẻ vốn là thứ để đọc chứ không phải để lướt qua.
//
// Cái xám ĐÚNG NGHĨA tách ra thành vai trò riêng:
//   'micro' — nhãn đứng ngay trên MỘT con số ("TÀI SẢN RÒNG", "THU THÁNG"). Ở đây con
//             số mới là thứ đọc trước, nên nhãn phải lùi lại: nhỏ, chữ hoa, giãn ra,
//             xám. Đây là chỗ 12 nhãn chữ hoa viết tay đang tụ về.
import type { ReactNode } from 'react'

export type TitleRole = 'micro' | 'card' | 'block'

const ROLE: Record<TitleRole, string> = {
  micro: 'text-2xs font-semibold uppercase tracking-label text-fg-muted',
  card: 'text-sm font-semibold text-fg-primary',
  block: 'text-base font-bold text-fg-primary',
}

interface Props {
  children: ReactNode
  role?: TitleRole
  /** Cấp heading thật trong tài liệu. Mặc định h2 — h1 đã thuộc về tiêu đề trang. */
  as?: 'h2' | 'h3' | 'h4'
  className?: string
  /** Cho <h2 id> mà aria-labelledby của khối trỏ tới. */
  id?: string
}

export function SectionTitle({
  children,
  role = 'card',
  as: Tag = 'h2',
  className = '',
  id,
}: Props) {
  return (
    <Tag id={id} className={`${ROLE[role]} ${className}`.trim()}>
      {children}
    </Tag>
  )
}
