// Đồng hồ hình quạt cho điểm sức khỏe 0–100 — ba vùng màu + kim chỉ, số nằm trong lòng cung.
//
// Vì sao vẽ tay bằng SVG chứ không dùng Recharts: cần đặt màu theo dark mode, mà
// Recharts nhận màu qua prop nên phải là hằng số JS không lật được theo `.dark`
// (xem docs/design-system.md §"Màu biểu đồ"). SVG viết tay thì `stroke-*` là class
// Tailwind bình thường, lật được — và dùng đúng bộ sắc độ của thanh thang đo ở
// HealthMetricCard để hai chỗ không nói hai màu khác nhau về cùng một mức.
//
// Chữ số KHÔNG nằm trong <text> của SVG: cỡ chữ SVG tính bằng px nên không co theo
// Cài đặt → Cỡ chữ. Số là HTML đặt đè lên, nên vẫn dùng scale rem của app.
import type { Verdict } from './health'
import { ZONE_STROKE } from './zoneColors'

interface Props {
  /** 0–100. */
  score: number
  verdict: Verdict
  /** Nhãn dưới số — thường là "Tốt" / "Cần chú ý" / "Rủi ro". */
  label: string
}

const CX = 100
const CY = 95
const R = 80
const WIDTH = 14

/** Điểm trên cung ứng với `score` (0 ở bên trái, 100 ở bên phải). */
function pointAt(score: number, radius: number) {
  const deg = 180 - (Math.min(100, Math.max(0, score)) / 100) * 180
  const rad = (deg * Math.PI) / 180
  return { x: CX + radius * Math.cos(rad), y: CY - radius * Math.sin(rad) }
}

/** Đường cung từ điểm `from` tới `to` trên thang 0–100. */
function arc(from: number, to: number) {
  const a = pointAt(from, R)
  const b = pointAt(to, R)
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${R} ${R} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
}

// Ba vùng trùng đúng dải điểm trong health.ts (bad 0–40, warn 40–70, good 70–100).
// Chừa 1 điểm giữa các vùng để mắt thấy được ranh giới mà không cần vạch riêng.
const SEGMENTS = [
  { from: 0, to: 39.5, cls: ZONE_STROKE.bad },
  { from: 40.5, to: 69.5, cls: ZONE_STROKE.warn },
  { from: 70.5, to: 100, cls: ZONE_STROKE.good },
]

const VALUE: Record<Verdict, string> = {
  good: 'text-money-in',
  warn: 'text-fg-warn',
  bad: 'text-money-out',
  unknown: 'text-fg-muted',
}

export function ScoreGauge({ score, verdict, label }: Props) {
  const inner = pointAt(score, R - WIDTH / 2 - 3)
  const outer = pointAt(score, R + WIDTH / 2 + 3)

  return (
    <div
      className="relative mx-auto w-full max-w-60"
      role="img"
      aria-label={`Điểm sức khỏe tài chính ${score} trên 100, mức ${label.toLowerCase()}`}
    >
      <svg viewBox="0 0 200 110" className="h-auto w-full" aria-hidden="true">
        {SEGMENTS.map((s) => (
          <path
            key={s.from}
            d={arc(s.from, s.to)}
            className={s.cls}
            fill="none"
            strokeWidth={WIDTH}
            strokeLinecap="round"
          />
        ))}
        {/* Kim vẽ hai lớp: lớp dưới màu nền để tách kim khỏi cung, lớp trên là kim thật.
            Cùng cách làm với vạch chỉ trên thanh thang đo (ring-2 ring-white). */}
        <line
          x1={inner.x}
          y1={inner.y}
          x2={outer.x}
          y2={outer.y}
          className="stroke-white dark:stroke-gray-900"
          strokeWidth={7}
          strokeLinecap="round"
        />
        <line
          x1={inner.x}
          y1={inner.y}
          x2={outer.x}
          y2={outer.y}
          className="stroke-gray-900 dark:stroke-white"
          strokeWidth={3}
          strokeLinecap="round"
        />
      </svg>

      <div className="pointer-events-none absolute inset-x-0 bottom-[6%] flex flex-col items-center">
        <p className={`text-3xl font-bold leading-none tabular-nums ${VALUE[verdict]}`}>
          {score}
          <span className="text-sm font-medium text-fg-muted">/100</span>
        </p>
        <p className="mt-1 text-2xs font-medium text-fg-secondary">{label}</p>
      </div>

      {/* Hai đầu thang ghi bằng CHỮ: đọc được chiều mà không cần phân biệt màu. */}
      <div className="mt-1 flex justify-between text-3xs text-fg-muted">
        <span>Rủi ro</span>
        <span>Tốt</span>
      </div>
    </div>
  )
}
