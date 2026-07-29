import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { CategoryRow } from '../../types/database.types'
import type { CategoryComparisonRow } from './aggregate'

interface Props {
  rows: CategoryComparisonRow[]
  categories: CategoryRow[]
  base: CurrencyCode
  /** số danh mục hiển thị tối đa */
  limit?: number
}

/** So sánh chi theo danh mục: bar tháng này (đậm) chồng với vạch TB3 (mờ), kèm ▲▼%. */
export function CategoryCompareBarsCard({ rows, categories, base, limit = 8 }: Props) {
  const shown = rows.slice(0, limit)
  if (shown.length === 0) return null
  const max = shown.reduce((m, r) => Math.max(m, r.thisMonth, r.avg3), 0) || 1
  const catOf = (id: string) => categories.find((c) => c.id === id)

  return (
    <section className="rounded-xl bg-surface p-3 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-fg-muted">
        So sánh chi theo danh mục
      </h2>
      <ul className="space-y-3">
        {shown.map((row) => {
          const cat = catOf(row.categoryId)
          const thisPct = (row.thisMonth / max) * 100
          const avgPct = (row.avg3 / max) * 100
          return (
            <li key={row.categoryId}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
                  {cat?.icon ?? '📦'} {cat?.name ?? '?'}
                </span>
                <span className="shrink-0 font-medium text-fg-primary">
                  {formatMoney(row.thisMonth, base)}
                </span>
                {row.isNew ? (
                  <span className="shrink-0 rounded bg-sky-50 dark:bg-sky-900/40 px-1 text-3xs text-sky-600 dark:text-sky-300">
                    mới
                  </span>
                ) : row.deltaPct !== null && row.deltaPct !== 0 ? (
                  <span
                    className={`shrink-0 text-2xs ${row.deltaPct > 0 ? 'text-money-out' : 'text-money-in'}`}
                  >
                    {row.deltaPct > 0 ? '▲' : '▼'}
                    {Math.abs(row.deltaPct)}%
                  </span>
                ) : (
                  <span className="w-8 shrink-0" />
                )}
              </div>
              {/* Thanh nền: bar tháng này; vạch dọc = trung bình 3 tháng để so sánh */}
              <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className={`h-full rounded-full ${row.deltaPct !== null && row.deltaPct > 0 ? 'bg-red-400' : 'bg-sky-500'}`}
                  style={{ width: `${thisPct}%` }}
                />
                {row.avg3 > 0 && (
                  <span
                    className="absolute top-[-2px] h-[calc(100%+4px)] w-0.5 bg-gray-500 dark:bg-gray-300"
                    style={{ left: `${avgPct}%` }}
                    title={`TB3: ${formatMoney(row.avg3, base)}`}
                  />
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <div className="mt-3 flex items-center justify-end gap-3 text-3xs text-fg-muted">
        <span className="flex items-center gap-1">
          <span className="h-2 w-3 rounded-sm bg-sky-500" /> Tháng này
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-0.5 bg-gray-500 dark:bg-gray-300" /> TB 3 tháng
        </span>
      </div>
    </section>
  )
}
