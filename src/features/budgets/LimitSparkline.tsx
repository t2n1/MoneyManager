// Nhịp 6 tháng của MỘT danh mục, sáu cột cao 14px — dữ liệu `suggestLimits()` đang trả
// về mà panel bỏ nguyên.
//
// Vì sao cần (B33): `average` một mình không trả lời được câu người dùng đang hỏi. `Gas`
// TB ¥58 / cao nhất ¥350 mà hạn mức ¥1,500 đọc ra "gấp 26 lần" — nghe như báo động, thực
// ra là một khoản bé có MỘT tháng nhảy. Sáu cột nói ngay điều đó; một tỷ số thì không.
//
// Vì sao không dùng <Sparkline> có sẵn: hàng kia vẽ ĐƯỜNG, trả lời "đang lên hay xuống".
// Ở đây câu hỏi là "đều đặn hay có một tháng nhảy", mà một khoản ba-tháng-một-lần vẽ
// thành đường thì ra hình zigzag đọc như xu hướng. Cột rời nhau mới nói được "tháng này
// có, tháng kia không".
//
// Không nhãn, không tooltip, không màu riêng: nó là HÌNH DẠNG, không phải số đọc được —
// hai con số chính xác (TB · cao nhất) đã nằm ngay cạnh nó trong cùng dòng.
import type { Suggestion } from './suggest'

/** Cột thấp nhất vẫn phải thấy được: 0 đồng vẽ ra một vạch mảnh, không phải khoảng trống. */
const MIN_PCT = 6

interface Props {
  months: Suggestion['months']
  className?: string
}

export function LimitSparkline({ months, className = '' }: Props) {
  // Tỉ lệ theo `max` của CHÍNH dòng đó, không phải max toàn bảng: lấy max toàn bảng thì
  // 27 dòng thành một vạch phẳng dưới Tiền nhà.
  const max = months.reduce((m, x) => Math.max(m, x.amount), 0)
  if (months.length === 0 || max <= 0) return null

  return (
    <span
      role="img"
      aria-label={`Nhịp ${months.length} tháng, cao nhất ${max}`}
      className={`inline-flex h-3.5 items-end justify-end gap-px ${className}`.trim()}
    >
      {months.map((m) => (
        <span
          key={m.monthKey}
          aria-hidden
          className="w-[0.3125rem] rounded-[1px] bg-fg-muted/70"
          style={{ height: `${Math.max(MIN_PCT, (m.amount / max) * 100)}%` }}
        />
      ))}
    </span>
  )
}
