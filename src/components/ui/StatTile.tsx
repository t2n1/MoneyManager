// Ô số liệu — nhãn nhỏ ở trên, một con số ở dưới. Hình dạng này lặp ở 5 ô KPI năm
// của Báo cáo và 3 ô Thu/Chi/Chênh lệch của PeriodTotalsBar.
//
// Lý do tách ra: cả 8 ô đang để nhãn text-xs và giá trị text-sm — chỉ cách nhau MỘT
// bậc, nên con số (thứ người ta mở app để xem) không nổi hơn nhãn của nó. Đổi ở một
// chỗ này là đổi cho cả 8 ô.
//
// Bản 1a nới khoảng cách đó ra hết cỡ: nhãn 11px hoa (eyebrow), số 26px mono. Đây là
// nhịp gõ của cả màn Bản tin — bốn ô KPI đọc được trong một cái liếc.
import type { ReactNode } from 'react'
import { Card, type CardElevation } from './Card'

interface Props {
  label: string
  /** Giá trị: truyền <Money> để có màu thu/chi, hoặc chuỗi cho số trung tính. */
  children: ReactNode
  elevation?: CardElevation
  /** Căn giữa — dùng khi nhiều ô nằm trong cùng một thẻ thay vì mỗi ô một thẻ. */
  center?: boolean
  className?: string
}

export function StatTile({
  label,
  children,
  elevation = 'raised',
  center = false,
  className = '',
}: Props) {
  return (
    <Card elevation={elevation} className={`${center ? 'text-center' : ''} ${className}`.trim()}>
      {/* Nhãn = "eyebrow" của 1a: 11px hoa, giãn chữ .1em. Chữ hoa nhỏ đọc chậm hơn
          chữ thường, nên nó chỉ hợp với NHÃN (2–3 từ, người ta quét chứ không đọc) —
          đừng bê cách viết này sang câu. */}
      <p className="text-2xs uppercase tracking-[.1em] text-fg-muted">{label}</p>
      {/* 26px mono/500, không phải text-base/bold: khoảng cách nhãn–số giãn từ hai bậc
          lên bốn, nên số bắt mắt bằng KÍCH THƯỚC chứ không cần độ đậm — và ở cỡ này
          font-bold làm chữ số mono bít nét. leading-none + tracking âm để số cao mà
          không đội chiều cao ô lên.
          rem chứ không px (26px = 1.625rem): Cài đặt → Cỡ chữ chỉ co giãn được cái tính
          theo rem, giá trị px đứng yên khi người dùng phóng chữ.
          tabular-nums/font-mono đặt ở đây luôn cho trường hợp giá trị là chuỗi thuần
          chứ không phải <Money>. */}
      <p className="mt-1.5 font-mono text-[1.625rem] font-medium leading-none tracking-[-.02em] tabular-nums text-fg-primary">
        {children}
      </p>
    </Card>
  )
}
