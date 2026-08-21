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
//
// KHÔNG dùng cho câu kết luận ĐẦU MÀN — cái đó đi bằng `ConclusionLine` ở cuối file
// này. §5.0 tách hai thứ ra vì chúng khác loại: kết luận đầu màn là DỮ LIỆU, còn thứ
// VerdictNote gói là chữ để dạy, và chỉ chữ dạy mới được phép biến mất ở chế độ Gọn.
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

/**
 * CÂU KẾT LUẬN ĐẦU MÀN — khác `VerdictNote`, và cố ý đặt ngay cạnh nó để lần sau ai đọc
 * cũng thấy hai vai trò đối nhau ở cùng một chỗ.
 *
 * §5.0 của bản 1a: *"Câu kết luận đứng đầu màn (Báo cáo, Dài hạn, Sức khỏe, mặt lập kế
 * hoạch) là kết luận, không phải chữ để dạy — giữ nguyên ở CẢ HAI chế độ, KHÔNG đi qua
 * VerdictNote. Chỉ mệnh đề giải thích phía sau con số được nén (dùng bản ngắn có sẵn
 * trong headline.ts)."* R7 xếp câu này vào nhóm ĐÃ CHỐT.
 *
 * Trước đây cả Bản tin lẫn Báo cáo đều đưa câu này qua `VerdictNote`, nên ở chế độ Gọn
 * nó co thành một cái chip. Mà Gọn là MẶC ĐỊNH (`DEFAULT_DENSITY = 'visual'`) — tức mặc
 * định người dùng KHÔNG thấy kết luận của màn mình đang mở, chỉ thấy một huy hiệu. Đo
 * trên Báo cáo: Đầy đủ 7 câu kết luận → Gọn còn 3 chip.
 *
 * Khác biệt duy nhất giữa hai chế độ ở đây là ĐỘ DÀI CHỮ, không phải hình dạng:
 *   Đầy đủ — "Giữ lại được 65% thu nhập tháng này, chi gấp 11,9 lần kỳ trước."
 *   Gọn    — "Giữ lại 65% · chi gấp 11,9 lần"
 * Cả hai vẫn là một DÒNG có icon, vẫn đứng đầu màn, vẫn giữ nguyên hai con số quyết
 * định. Đó là cách đọc "giữ nguyên ở cả hai chế độ" khớp được với vế sau của chính câu
 * đó ("chỉ mệnh đề giải thích được nén").
 *
 * Vì sao KHÔNG thêm một prop vào `VerdictNote` cho xong: hợp đồng của VerdictNote là
 * "chữ dạy, nén được"; nhét thêm một nhánh "chữ dữ liệu, không nén được" vào đó là làm
 * mờ đúng cái ranh giới mà §5.0 dựng lên.
 */
export function ConclusionLine({
  tone,
  short,
  children,
}: {
  tone: NoteTone
  /** Bản ngắn cho chế độ Gọn — phải giữ con số quyết định. */
  short: ReactNode
  /** Bản đầy đủ. */
  children: ReactNode
}) {
  const { visual } = useDensity()
  const { icon: Icon, cls, sr } = STYLE[tone]
  return (
    // Cỡ `text-lg` + `font-semibold` + `fg-primary`: câu này là KẾT LUẬN của cả màn, và
    // ở cỡ cũ (13px, fg-secondary) nó đọc nhẹ hơn cả nhãn của mấy ô số ngay dưới —
    // đúng thứ tự đọc ngược với "kết luận trước, bằng chứng sau" (§14).
    //
    // Icon phóng theo `em` chứ không đóng cứng `h-3.5`: nó là kênh phân biệt tốt/xấu
    // thứ hai bên cạnh màu (dự án cấm phân biệt bằng màu đơn thuần), nên nó phải lớn
    // theo chữ, kể cả khi người dùng phóng chữ ở Cài đặt → Cỡ chữ.
    <p className="flex items-start gap-2 text-lg font-semibold leading-snug text-fg-primary">
      <Icon className={`mt-[0.15em] h-[1.05em] w-[1.05em] shrink-0 ${cls}`} aria-hidden="true" />
      <span>
        {sr && <span className="sr-only">{sr}</span>}
        {visual ? short : children}
      </span>
    </p>
  )
}
