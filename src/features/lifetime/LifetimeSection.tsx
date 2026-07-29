import { Link } from 'react-router-dom'
import { ChevronRight, TrendingUp } from 'lucide-react'
import { firstNegativeYear } from './insights'
import { useLifetime } from './useLifetime'

/** Thẻ vào Lifetime trên trang Tài sản — đặt ngay sau lịch sử tài sản ròng vì
 * Lifetime là phần kéo dài của chính con số đó (mục Lifetime). */
export function LifetimeSection() {
  const { scenarios, rows } = useLifetime()
  const hasScenario = scenarios.length > 0
  // Nhánh xấu (biên dưới của dải) — đáng lo hơn nhánh trung tâm, xem JSDoc firstNegativeYear.
  const negativeYear = hasScenario ? firstNegativeYear(rows, 'low') : null

  return (
    <section className="rounded-xl bg-surface p-3 shadow-sm">
      <Link to="/lifetime" className="flex min-h-11 items-center gap-3 active:scale-95">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-50 dark:bg-green-900/30">
          <TrendingUp className="h-5 w-5 text-money-in" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-fg-primary">
            Lifetime
          </span>
          <span className="block truncate text-xs text-fg-muted">
            Tài sản của bạn đủ đi hết đời không?
          </span>
          {hasScenario && (
            <span
              className={`mt-0.5 block text-xs font-medium ${
                negativeYear
                  ? 'text-money-out'
                  : 'text-money-in'
              }`}
            >
              {negativeYear
                ? `Nhánh xấu: cạn tiền từ năm ${negativeYear}`
                : 'Nhánh xấu: không bao giờ cạn tiền'}
            </span>
          )}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
      </Link>
    </section>
  )
}
