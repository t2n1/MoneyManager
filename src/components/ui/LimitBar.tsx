// Thanh hạn mức — "đã chi bao nhiêu phần của trần". Trước đây mỗi chỗ tự vẽ một cái
// (thanh ngân sách ở Ngân sách, dòng chạm ngưỡng ở Bản tin, thanh Hạn mức ở Hôm nay,
// thanh phân bổ ở Kế hoạch), cùng một idiom `h-2 rounded-full bg-surface-sunken` + khối
// tô kẹp 100%.
//
// Lý do gom: giao diện E-ink (handoff 09/2026) vẽ PHẦN VƯỢT bằng hình chứ không bằng
// màu — thanh là toàn bộ số đã chi, khối mực đặc đúng bằng phần trần, khe giấy 2px, rồi
// sọc gỉ sắt cho phần vượt. Việc đó cần biết tỷ lệ thật (> 1), mà bản chép tay chỉ biết
// "kẹp về 100%". Hình học nằm ở limitBarParts.ts (hàm thuần, có test).
//
// Ở Sáng / Tối thanh vẽ Y NHƯ trước: cùng track, cùng lớp màu nơi gọi truyền vào, vượt
// thì đầy thanh. Mọi khác biệt của e-ink nằm ở index.css, móc vào các thuộc tính
// `data-limit-*` bên dưới — không có nhánh theo giao diện nào trong file này.
import type { ReactNode } from 'react'
import { limitBarParts, splitGrow } from './limitBarParts'

export type LimitBarSize = 'xs' | 'sm' | 'md'

const HEIGHT: Record<LimitBarSize, string> = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2',
}

interface Props {
  /** Đã chi / trần. Được phép > 1 — phần vượt là thứ e-ink vẽ ra. */
  ratio: number
  /** Lớp màu khối tô ở Sáng/Tối, vd `STATUS_FILL.bad` hay `bg-money-out`. */
  fillClassName: string
  /** Gần chạm trần (dáng "chú ý"): e-ink tô khối bằng đất thay vì mực. */
  warn?: boolean
  size?: LimitBarSize
  /**
   * Có nhãn thì thanh là `role="meter"` đọc được; không có thì nó là hình minh hoạ cho
   * một con số đã in bên cạnh (`aria-hidden`).
   */
  label?: string
  /** Câu đọc thay cho "N% hạn mức" mặc định, vd kèm "kỳ đã trôi 60%". */
  valueText?: string
  className?: string
  /** Vạch mốc nơi gọi tự vẽ (vd "kỳ đã trôi tới đây"), định vị theo khung thanh. */
  children?: ReactNode
}

export function LimitBar({
  ratio,
  fillClassName,
  warn = false,
  size = 'md',
  label,
  valueText,
  className = '',
  children,
}: Props) {
  const parts = limitBarParts(ratio)
  const grow = parts.kind === 'split' ? splitGrow(parts.solid, parts.rest) : null
  const pct = Math.round((Number.isFinite(ratio) ? Math.max(ratio, 0) : 1) * 100)
  const a11y = label
    ? {
        role: 'meter' as const,
        'aria-label': label,
        'aria-valuemin': 0,
        // meter không cho valuenow vượt max; vượt trần là trạng thái thật, nên nới max.
        'aria-valuemax': Math.max(100, pct),
        'aria-valuenow': pct,
        'aria-valuetext': valueText ?? (Number.isFinite(ratio) ? `${pct}% hạn mức` : 'vượt trần 0'),
      }
    : { 'aria-hidden': true }
  return (
    // Bọc KHÔNG cắt tràn: vạch mốc của nơi gọi nhô ra hai đầu thanh, mà `overflow-hidden`
    // của track (thứ giữ khối tô bo đúng) sẽ xén mất.
    <div className={`relative ${className}`.trim()}>
      <div
        {...a11y}
        data-limit-track
        className={`flex overflow-hidden rounded-full bg-surface-sunken ${HEIGHT[size]}`}
      >
        {parts.kind === 'fill' ? (
          <div
            data-limit-fill={warn ? 'warn' : ''}
            className={`h-full rounded-full ${fillClassName}`}
            style={{ width: `${parts.pct}%` }}
          />
        ) : (
          <>
            {/* Vượt: hai phần chia theo flex-grow. Ở Sáng/Tối phần vượt `hidden` nên phần
                trong trần là phần tử DUY NHẤT còn lớn lên → đầy thanh, đúng như bản cũ
                (hệ số qua `splitGrow`, xem lý do ở đó). */}
            {parts.solid > 0 && (
              <div
                data-limit-fill=""
                className={`h-full rounded-full ${fillClassName}`}
                style={{ flex: `${grow!.solid} 1 0` }}
              />
            )}
            <div
              data-limit-rest
              // Không có phần trong trần (trần 0 mà đã chi) thì chính nó là cả thanh, nên
              // ở Sáng/Tối nó phải hiện và mang màu của khối tô.
              className={`h-full ${parts.solid > 0 ? 'hidden' : `rounded-full ${fillClassName}`}`}
              style={{ flex: `${grow!.rest} 1 0` }}
            />
          </>
        )}
      </div>
      {children}
    </div>
  )
}
