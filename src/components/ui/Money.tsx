// Số tiền — primitive quan trọng nhất của design system: gom 106 chỗ rải rác đang
// tự ghép `tabular-nums` + màu thu/chi bằng tay. Gom lại để hai thứ này thành cấu
// trúc chứ không phải thói quen:
//   1. tabular-nums LUÔN bật. Thiếu nó thì danh sách 20 dòng có chữ số nhảy ngang.
//      Từ bản 1a có thêm font-mono: tabular-nums chỉ khoá BỀ RỘNG chữ số trong font
//      sans, còn IBM Plex Mono khoá cả dáng chữ — dấu phẩy nghìn, dấu trừ và ký hiệu
//      tiền cũng vào ô đều, nên cột số đọc như bảng chứ không như câu văn. Đây là một
//      dòng, nhưng là thay đổi NHÌN THẤY RÕ NHẤT của cả bản redesign.
//   2. Màu thu/chi lấy từ token --money-in/--money-out, tức là quyết định contrast
//      nằm ở MỘT chỗ (src/index.css) thay vì 124 chỗ.
// KHÔNG tự định dạng số: bọc formatMoney/formatCompact của lib/money để giữ nguyên
// chế độ riêng tư (isPrivacyEnabled → mask) và quy ước dấu thập phân theo loại tiền.
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'

/** 'bySign' = suy ra từ dấu của `amount`; 'neutral' = màu chữ thường;
 *  'onAccent' = số nằm TRÊN nền --accent (ô đang chọn của dải tháng…);
 *  'good'/'warn' = TÌNH TRẠNG, không phải chiều tiền — xem ghi chú ở TONE_CLASS. */
export type MoneyTone = 'in' | 'out' | 'neutral' | 'bySign' | 'onAccent' | 'good' | 'warn'

const TONE_CLASS: Record<Exclude<MoneyTone, 'bySign'>, string> = {
  in: 'text-money-in',
  out: 'text-money-out',
  neutral: 'text-fg-primary',
  // 'good'/'warn' KHÁC 'in'/'out' về nghĩa, dù 'good' cũng ra màu xanh: hai cái trên nói
  // TIỀN ĐI CHIỀU NÀO (thu / chi), hai cái này nói SỐ ĐÓ ĐANG ỔN HAY KHÔNG. Mức tiêu cho
  // phép mỗi ngày là chỗ cần đúng cặp sau — nó không phải khoản thu, nên mượn 'in' là nói
  // sai nghĩa dù ra đúng màu.
  //
  // Lấy thẳng bộ --state-*/--fg-warn mà StatusDot, VerdictNote và AppRail đã dùng cho
  // đúng nghĩa "tình trạng", nên một câu có <Money tone="warn"> và một chip cảnh báo
  // cạnh nhau là CÙNG một màu, không phải hai sắc hổ phách gần giống.
  good: 'text-state-good-fg',
  warn: 'text-fg-warn',
  // Phải là một TONE, không phải việc của `className`: component luôn nhả
  // TONE_CLASS[resolved], nên truyền thêm class màu từ ngoài là hai utility cùng
  // hạng đấu nhau và thứ tự trong CSS build ra quyết định — thực tế text-fg-primary
  // thắng, đo được 2,01:1 trên nền accent ở dark. Giữ đúng lời hứa ở đầu file:
  // quyết định contrast nằm ở MỘT chỗ.
  onAccent: 'text-fg-on-accent',
}

interface Props {
  /** Số tiền ở đơn vị nhỏ nhất (minor units) — cùng quy ước với formatMoney. */
  amount: number
  currency: CurrencyCode
  tone?: MoneyTone
  /**
   * Thêm dấu +/- ở đầu. Chỉ dùng khi `amount` là số DƯƠNG và chiều thu/chi nằm ở
   * `tone` (như dòng giao dịch: tiền lưu dương, chi thì hiện '-'). Với số đã có
   * dấu thì để false — formatMoney tự in '-' rồi, bật lên sẽ ra '--'.
   */
  showSign?: boolean
  /** Rút gọn: 569k / 1.2M. Dùng cho ô KPI hẹp. */
  compact?: boolean
  /** Tiền tố '≈ ' khi tổng có ngoại tệ quy đổi theo tỷ giá. */
  approx?: boolean
  className?: string
}

export function Money({
  amount,
  currency,
  tone = 'neutral',
  showSign = false,
  compact = false,
  approx = false,
  className = '',
}: Props) {
  const resolved = tone === 'bySign' ? (amount < 0 ? 'out' : 'in') : tone
  const body = compact ? formatCompact(amount, currency) : formatMoney(amount, currency)
  // Dấu ASCII cho khớp với chính formatMoney (nó in '-'), không dùng '−' U+2212 —
  // trộn hai glyph trong cùng một danh sách sẽ lệch bề rộng dù đã tabular-nums.
  const prefix = showSign ? (resolved === 'out' ? '-' : '+') : ''
  return (
    <span className={`font-mono tabular-nums ${TONE_CLASS[resolved]} ${className}`.trim()}>
      {approx ? '≈ ' : ''}
      {prefix}
      {body}
    </span>
  )
}
