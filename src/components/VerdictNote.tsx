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
//
// ---- Hai chế độ trình bày (src/lib/density.ts) -------------------------------------
//
// Đầy đủ — cả câu, như cũ.
// Gọn    — nén thành chip: icon + `short` (vài chữ, nên kèm con số quyết định).
//
// Vì sao KHÔNG tự cắt câu dài thành chip: câu kết luận là JSX có <b>, có tiền đã format,
// có nhánh theo tone — cắt máy móc thì ra chữ dở dang. `short` viết tay ở từng chỗ gọi,
// và nó phải nói được điều quan trọng nhất: "Chi +23%" chứ không phải "Cần chú ý".
// Thiếu `short` thì lùi về `label`, thiếu cả hai thì lùi về từ chung theo tone — vẫn
// còn tín hiệu tốt/xấu, chỉ là nhạt nghĩa hơn.
import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { useDensity } from '../hooks/useDensity'
import { StatusChip } from './ui/StatusChip'
import type { StatusTone } from './ui/statusColors'

/** Cùng bốn mức với `StatusTone` của tầng primitive; giữ tên cũ vì 17 chỗ đang gọi. */
export type NoteTone = StatusTone

const STYLE: Record<NoteTone, { icon: typeof Info; cls: string; sr: string; word: string }> = {
  // Dùng lại token tiền cho chiều tốt/xấu, giống HealthMetricCard đang làm cho giá trị
  // chỉ số. Cố ý KHÔNG thêm token --fg-good/--fg-bad mới: sẽ là cặp màu thứ hai cho
  // cùng một ý nghĩa (xem docs/design-system.md — đặt tên cho cái đã có).
  good: { icon: CheckCircle2, cls: 'text-money-in', sr: 'Tốt: ', word: 'Ổn' },
  warn: { icon: AlertTriangle, cls: 'text-fg-warn', sr: 'Cần chú ý: ', word: 'Cần chú ý' },
  bad: { icon: XCircle, cls: 'text-money-out', sr: 'Rủi ro: ', word: 'Rủi ro' },
  info: { icon: Info, cls: 'text-fg-secondary', sr: '', word: 'Lưu ý' },
}

interface Props {
  tone: NoteTone
  /** Phần dẫn in đậm trước dấu hai chấm, kiểu "Chi tăng mạnh". */
  label?: string
  /** Bản vài chữ cho chế độ Gọn. Nên chứa con số quyết định, vd "Chi +23%". */
  short?: ReactNode
  children: ReactNode
}

export function VerdictNote({ tone, label, short, children }: Props) {
  const { visual } = useDensity()
  const { icon: Icon, cls, sr, word } = STYLE[tone]

  if (visual) {
    return (
      // self-start: chip hay nằm trong flex-col, không có nó thì nền pill kéo dài hết
      // bề ngang thẻ và trông như một dải màu chứ không phải huy hiệu.
      <StatusChip tone={tone} icon={Icon} className="self-start">
        {sr && <span className="sr-only">{sr}</span>}
        {short ?? label ?? word}
      </StatusChip>
    )
  }

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
