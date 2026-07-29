// Ô số liệu — nhãn nhỏ ở trên, một con số ở dưới. Hình dạng này lặp ở 5 ô KPI năm
// của Báo cáo và 3 ô Thu/Chi/Chênh lệch của PeriodTotalsBar.
//
// Lý do tách ra: cả 8 ô đang để nhãn text-xs và giá trị text-sm — chỉ cách nhau MỘT
// bậc, nên con số (thứ người ta mở app để xem) không nổi hơn nhãn của nó. Ở đây giá
// trị mặc định là text-base, nhãn giữ text-xs: khoảng cách hai bậc, đủ để mắt bắt
// vào số trước. Đổi ở một chỗ này là đổi cho cả 8 ô.
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
      <p className="text-xs text-fg-muted">{label}</p>
      {/* text-base (không phải text-sm) để số cách nhãn hai bậc. tabular-nums đặt ở
          đây luôn cho trường hợp giá trị là chuỗi thuần chứ không phải <Money>. */}
      <p className="mt-1 text-base font-bold tabular-nums text-fg-primary">{children}</p>
    </Card>
  )
}
