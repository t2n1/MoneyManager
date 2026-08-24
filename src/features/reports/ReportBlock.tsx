// Khối đánh số của bản 26a: eyebrow `01`…`05` + tiêu đề + kẻ ngang.
//
// Vì sao cần: bản trước có 18 thẻ MANG CÙNG MỘT CỠ CHỮ tiêu đề, nên không gì nổi lên
// trước và người đọc phải tự đoán trật tự đọc. Số thứ tự làm trang đọc được như một mạch
// lập luận (kết luận → tiền đi đâu → so với trước → phần không tiêu → đáng để ý) thay vì
// một đống thẻ ngang hàng.

import type { ReactNode } from 'react'
import { SectionTitle } from '../../components/ui'

export function ReportBlock({
  no,
  title,
  children,
  id,
}: {
  /** '01'…'05' — hai chữ số, mono, để cột số thẳng hàng nhau khi cuộn. */
  no: string
  title: string
  children: ReactNode
  id?: string
}) {
  return (
    <section id={id} className="flex flex-col gap-2.5">
      {/* scroll-mt: khối được nhắm tới bằng mục lục chip, mà top bar dính nên không có
          nó thì tiêu đề khối bị chính top bar che. */}
      <div className="flex items-baseline gap-2.5 scroll-mt-16 border-b border-border-panel pb-1.5">
        <span className="font-mono text-2xs font-semibold tracking-label text-fg-muted">{no}</span>
        <SectionTitle className="min-w-0 flex-1 truncate">{title}</SectionTitle>
      </div>
      {children}
    </section>
  )
}
