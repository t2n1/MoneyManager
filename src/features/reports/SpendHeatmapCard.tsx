import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { DailyExpensePoint } from './aggregate'
import { Card } from '../../components/ui'

interface Props {
  /** chi từng ngày cho trọn tháng tài chính */
  points: DailyExpensePoint[]
  base: CurrencyCode
}

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

// 0 = không chi; 1..4 tăng dần theo mức chi so với ngày chi cao nhất trong tháng
const LEVEL_BG = [
  'bg-surface-sunken',
  'bg-amber-200 dark:bg-amber-900/70',
  'bg-amber-300 dark:bg-amber-700/80',
  'bg-orange-400 dark:bg-orange-600',
  'bg-red-500 dark:bg-red-500',
]

/** Thứ trong tuần (T2=0 … CN=6) của một ngày ISO, tính bằng UTC để khỏi lệch múi giờ. */
function weekdayIndex(iso: string): number {
  return (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7
}

/** Lịch chi tiêu: mỗi ô là một ngày, càng chi nhiều ô càng đậm. */
export function SpendHeatmapCard({ points, base }: Props) {
  if (points.length === 0) return null
  const max = points.reduce((m, p) => Math.max(m, p.expense), 0)
  const levelOf = (v: number): number => {
    if (v <= 0 || max <= 0) return 0
    const ratio = v / max
    if (ratio > 0.75) return 4
    if (ratio > 0.5) return 3
    if (ratio > 0.25) return 2
    return 1
  }

  const leading = weekdayIndex(points[0].date)
  const cells: (DailyExpensePoint | null)[] = [...Array(leading).fill(null), ...points]

  return (
    <Card as="section">
      <h2 className="mb-2 text-sm font-semibold text-fg-muted">
        Lịch chi tiêu trong tháng
      </h2>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-0.5 text-center text-3xs text-fg-muted">
            {w}
          </div>
        ))}
        {cells.map((p, i) => {
          if (p === null) return <div key={`b${i}`} />
          const level = levelOf(p.expense)
          return (
            <div
              key={p.date}
              title={`${Number(p.date.slice(5, 7))}/${Number(p.date.slice(8))}: ${formatMoney(p.expense, base)}`}
              // Màu CHỮ ngày, đo thật trên từng nền của LEVEL_BG (canvas pixel readback).
              // Trước đây cả 5 bậc đều trượt AA ở light: bậc 0–2 dùng gray-500 (4,39 /
              // 3,89 / 3,34) và bậc 3–4 dùng text-white (2,38 / 3,81 — bậc 3 tệ nhất app).
              //   bậc 0–2 "nguội": token fg-secondary — đúng cặp gray-600 (light) /
              //     gray-300 (dark) đã đo: 6,87 / 6,07 / 5,22 và 9,96 / 7,94 / 4,54.
              //     KHÔNG dùng fg-on-track — ở dark nó là gray-400, chỉ 2,57 trên
              //     amber-700/80. Cũng không viết tay cặp sáng/tối (tests/designSystem).
              //   bậc 3–4 "nóng": gray-950 đạt ở CẢ HAI chế độ (light 8,47 / 5,29; dark
              //     5,62 / 5,29) nên không cần biến thể dark: và không phải đổi nền nào.
              // Giữ hai bậc mực (nguội nhạt / nóng đậm) để ngày không chi vẫn im tiếng.
              className={`flex aspect-square items-center justify-center rounded text-3xs ${LEVEL_BG[level]} ${
                level >= 3 ? 'text-gray-950' : 'text-fg-secondary'
              }`}
            >
              {Number(p.date.slice(8))}
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-3xs text-fg-muted">
        <span>Ít</span>
        {LEVEL_BG.map((bg, i) => (
          <span key={i} className={`h-2.5 w-2.5 rounded-sm ${bg}`} />
        ))}
        <span>Nhiều</span>
      </div>
    </Card>
  )
}
