import { formatMoney, type CurrencyCode } from '../../lib/money'

/** Một hàng danh mục: nhãn + % + số tiền + thanh tỉ lệ (kèm vạch mục tiêu tùy chọn). */
export function BreakdownRow({
  icon,
  name,
  pct,
  value,
  barPct,
  color,
  base,
  selected = false,
  targetPct,
  warn = false,
}: {
  icon: string
  name: string
  pct: number
  value: number
  barPct: number
  color: string
  base: CurrencyCode
  selected?: boolean
  /** 0–100: vẽ vạch mục tiêu trên thanh + nhãn "mục tiêu" */
  targetPct?: number
  /** true = dùng màu cảnh báo cho thanh (vd vượt mốc) */
  warn?: boolean
}) {
  const barColor = warn ? '#dc2626' : color
  return (
    <div className={selected ? '-m-1 rounded-md bg-gray-100 p-1 dark:bg-gray-800' : ''}>
      <div className="mb-1 flex items-baseline gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
          {icon ? `${icon} ` : ''}
          {name}
        </span>
        {targetPct != null && (
          <span className="shrink-0 text-[0.625rem] text-gray-400 dark:text-gray-500">
            mục tiêu {targetPct}%
          </span>
        )}
        <span className="shrink-0 tabular-nums text-xs text-gray-500 dark:text-gray-400">
          {pct.toFixed(0)}%
        </span>
        <span className="shrink-0 tabular-nums font-medium text-gray-800 dark:text-gray-100">
          {formatMoney(value, base)}
        </span>
      </div>
      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
        role="presentation"
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(Math.max(barPct, 1.5), 100)}%`, backgroundColor: barColor }}
        />
        {targetPct != null && (
          <div
            className="absolute top-0 h-full w-0.5 bg-gray-500/70 dark:bg-gray-300/70"
            style={{ left: `${Math.min(targetPct, 100)}%` }}
            aria-hidden
          />
        )}
      </div>
    </div>
  )
}
