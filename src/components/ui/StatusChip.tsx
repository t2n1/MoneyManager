// Huy hiệu trạng thái: nền nhạt + vài chữ + icon tuỳ chọn.
//
// Đã có sẵn ở HealthMetricCard (Tốt / Cần chú ý / Rủi ro) từ trước; tách ra thành
// primitive vì chế độ Gọn dùng đúng dáng này ở nhiều chỗ khác — VerdictNote nén câu kết
// luận thành chip, các thẻ báo cáo gắn chip cạnh tiêu đề. Gom lại để đừng có hai cái
// pill trông gần giống nhau mà lệch bậc màu hoặc lệch cỡ chữ.
//
// KHÔNG chỉ dựa vào màu: chip luôn có chữ. Icon chỉ để mắt bắt nhanh hơn, nên
// `aria-hidden` — chữ trong chip đã nói ra nghĩa rồi.
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { STATUS_CHIP, type StatusTone } from './statusColors'

interface Props {
  tone: StatusTone
  icon?: LucideIcon
  children: ReactNode
  className?: string
}

export function StatusChip({ tone, icon: Icon, children, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium ${STATUS_CHIP[tone]} ${className}`.trim()}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
      {children}
    </span>
  )
}
