// Chấm tròn màu nói ra trạng thái của một dòng/khối, KHÔNG cần chữ.
//
// Sinh ra cho chế độ Gọn (src/lib/density.ts): ở đó câu kết luận bị nén lại, nên những
// chỗ chỉ có một con số trơ (dòng nợ, dòng khoản sắp chi, ô tài khoản) mất luôn tín
// hiệu tốt/xấu. Chấm lấp đúng chỗ đó — nó chiếm 8px, đặt được vào dòng danh sách mà
// chip hay câu chữ thì không.
//
// `label` BẮT BUỘC, không phải tuỳ chọn: màu là kênh duy nhất ở đây, nên người dùng
// trình đọc màn hình và người không phân biệt đỏ/xanh phải có đường khác để biết. Đó
// cũng là lý do chấm hầu như luôn đứng cạnh một con số đã tự mang dấu.
import { STATUS_FILL, type StatusTone } from './statusColors'

interface Props {
  tone: StatusTone
  /** Đọc thành tiếng thay cho màu, vd "Đã vượt hạn mức". */
  label: string
  className?: string
}

export function StatusDot({ tone, label, className = '' }: Props) {
  return (
    <span
      role="img"
      aria-label={label}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${STATUS_FILL[tone]} ${className}`.trim()}
    />
  )
}
