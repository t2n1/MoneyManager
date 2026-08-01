// Một dòng KẾT LUẬN đặt dưới biểu đồ: icon màu + câu tiếng người.
//
// Khác ExplainBox ở vai trò, và hai cái đi cùng nhau chứ không thay nhau:
//   ExplainBox  — "số này ở đâu ra", phải BẤM mới mở, cho ai muốn đào.
//   VerdictNote — "vậy tôi đang tốt hay tệ", HIỆN SẴN, cho người chỉ nhìn 3 giây.
//
// Trước đây app có đủ biểu đồ nhưng phần lớn thẻ không có câu chốt nào — người dùng
// phải tự suy từ hình. Đây là khuôn để mọi thẻ nói được kết luận theo cùng một cách.
//
// Icon KHÔNG phải kênh thông tin duy nhất: câu chữ luôn tự nói ra chiều tốt/xấu, và
// icon có nhãn cho trình đọc màn hình. Ai không phân biệt được đỏ/xanh vẫn đọc được.
import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'

export type NoteTone = 'good' | 'warn' | 'bad' | 'info'

const STYLE: Record<NoteTone, { icon: typeof Info; cls: string; sr: string }> = {
  // Dùng lại token tiền cho chiều tốt/xấu, giống HealthMetricCard đang làm cho giá trị
  // chỉ số. Cố ý KHÔNG thêm token --fg-good/--fg-bad mới: sẽ là cặp màu thứ hai cho
  // cùng một ý nghĩa (xem docs/design-system.md — đặt tên cho cái đã có).
  good: { icon: CheckCircle2, cls: 'text-money-in', sr: 'Tốt: ' },
  warn: { icon: AlertTriangle, cls: 'text-fg-warn', sr: 'Cần chú ý: ' },
  bad: { icon: XCircle, cls: 'text-money-out', sr: 'Rủi ro: ' },
  info: { icon: Info, cls: 'text-fg-secondary', sr: '' },
}

interface Props {
  tone: NoteTone
  /** Phần dẫn in đậm trước dấu hai chấm, kiểu "Chi tăng mạnh". */
  label?: string
  children: ReactNode
}

export function VerdictNote({ tone, label, children }: Props) {
  const { icon: Icon, cls, sr } = STYLE[tone]
  return (
    <p className="flex items-start gap-1.5 text-xs leading-relaxed text-fg-secondary">
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${cls}`} aria-hidden="true" />
      <span>
        {sr && <span className="sr-only">{sr}</span>}
        {label && <b className={cls}>{label}: </b>}
        {children}
      </span>
    </p>
  )
}
