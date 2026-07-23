import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import type { CategoryRow } from '../../types/database.types'
import type { Breakdown } from './aggregate'

// Bảng màu cho thanh danh mục (lặp lại nếu > 12). Màu chỉ để phân biệt nhanh —
// nghĩa được truyền tải bằng NHÃN (tên + số tiền + %) nên không phụ thuộc màu.
const PALETTE = [
  '#16a34a', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7',
]

// Số danh mục hiển thị tối đa trước khi gộp phần còn lại thành "Khác" —
// tránh danh sách quá dài mà vẫn giữ đúng tổng.
const MAX_ROWS = 8

interface Props {
  breakdown: Breakdown
  categories: CategoryRow[]
  base: CurrencyCode
  kind: 'expense' | 'income'
  onKindChange: (kind: 'expense' | 'income') => void
  periodNoun: string
}

interface Row {
  key: string
  name: string
  icon: string
  value: number
  pct: number
  color: string
}

export function CategoryBreakdownCard({
  breakdown,
  categories,
  base,
  kind,
  onKindChange,
  periodNoun,
}: Props) {
  const total = breakdown.total
  const pctOf = (v: number) => (total > 0 ? (v / total) * 100 : 0)

  const all: Row[] = breakdown.slices.map((s, i) => {
    const cat = categories.find((c) => c.id === s.categoryId)
    return {
      key: s.categoryId,
      name: cat?.name ?? '?',
      icon: cat?.icon ?? '📦',
      value: s.amount,
      pct: pctOf(s.amount),
      color: PALETTE[i % PALETTE.length],
    }
  })

  // Gộp phần đuôi thành "Khác" khi vượt ngưỡng (giữ tổng %/số tiền chính xác).
  let rows = all
  if (all.length > MAX_ROWS + 1) {
    const head = all.slice(0, MAX_ROWS)
    const tail = all.slice(MAX_ROWS)
    const restValue = tail.reduce((sum, r) => sum + r.value, 0)
    rows = [
      ...head,
      {
        key: '__other__',
        name: `Khác (${tail.length} mục)`,
        icon: '',
        value: restValue,
        pct: pctOf(restValue),
        color: '#9ca3af',
      },
    ]
  }

  const approx = breakdown.hasForeign ? '≈ ' : ''

  return (
    <section className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400">
            Cơ cấu theo danh mục
          </h2>
          {rows.length > 0 && (
            <p className="tabular-nums text-lg font-bold text-gray-800 dark:text-gray-100">
              {approx}
              {formatCompact(total, base)}
            </p>
          )}
        </div>
        <div
          role="tablist"
          aria-label="Loại giao dịch"
          className="flex shrink-0 rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 text-xs font-medium"
        >
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'expense'}
            onClick={() => onKindChange('expense')}
            className={`rounded-md px-3 py-2.5 ${kind === 'expense' ? 'bg-white dark:bg-gray-900 text-red-600 dark:text-red-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
          >
            Chi
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'income'}
            onClick={() => onKindChange('income')}
            className={`rounded-md px-3 py-2.5 ${kind === 'income' ? 'bg-white dark:bg-gray-900 text-green-600 dark:text-green-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
          >
            Thu
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          Chưa có {kind === 'expense' ? 'chi tiêu' : 'thu nhập'} trong {periodNoun}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="mb-1 flex items-baseline gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-300">
                  {r.icon ? `${r.icon} ` : ''}
                  {r.name}
                </span>
                <span className="shrink-0 tabular-nums text-xs text-gray-500 dark:text-gray-400">
                  {r.pct.toFixed(0)}%
                </span>
                <span className="shrink-0 tabular-nums font-medium text-gray-800 dark:text-gray-100">
                  {formatMoney(r.value, base)}
                </span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
                role="presentation"
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(r.pct, 1.5)}%`, backgroundColor: r.color }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
