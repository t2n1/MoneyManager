import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { DailyExpensePoint } from './aggregate'

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
    <section className="rounded-xl bg-surface p-3 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-fg-muted">
        Lịch chi tiêu trong tháng
      </h2>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-0.5 text-center text-3xs text-fg-muted">
            {w}
          </div>
        ))}
        {cells.map((p, i) =>
          p === null ? (
            <div key={`b${i}`} />
          ) : (
            <div
              key={p.date}
              title={`${Number(p.date.slice(5, 7))}/${Number(p.date.slice(8))}: ${formatMoney(p.expense, base)}`}
              className={`flex aspect-square items-center justify-center rounded text-3xs ${LEVEL_BG[levelOf(p.expense)]} ${
                levelOf(p.expense) >= 3 ? 'text-white' : 'text-gray-500 dark:text-gray-300'
              }`}
            >
              {Number(p.date.slice(8))}
            </div>
          ),
        )}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-3xs text-fg-muted">
        <span>Ít</span>
        {LEVEL_BG.map((bg, i) => (
          <span key={i} className={`h-2.5 w-2.5 rounded-sm ${bg}`} />
        ))}
        <span>Nhiều</span>
      </div>
    </section>
  )
}
