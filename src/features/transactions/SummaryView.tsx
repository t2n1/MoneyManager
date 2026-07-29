import { useMemo, useState } from 'react'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { CategoryRow, TransactionRow } from '../../types/database.types'
import { categoryBreakdown } from '../reports/aggregate'
import type { CurrencyOf } from './ledgerShared'

// Bảng màu đồng bộ với ReportsPage / AssetsPage
const PALETTE = [
  '#16a34a', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7',
]

interface Props {
  transactions: TransactionRow[]
  categoryOf: (id: string | null) => CategoryRow | undefined
  currencyOf: CurrencyOf
  base: CurrencyCode
  rates: Rates | undefined
  isLoading: boolean
}

/** Cơ cấu thu/chi theo danh mục trong tháng (số đầy đủ + tỷ trọng). */
export function SummaryView({
  transactions,
  categoryOf,
  currencyOf,
  base,
  rates,
  isLoading,
}: Props) {
  const [kind, setKind] = useState<'expense' | 'income'>('expense')

  const breakdown = useMemo(
    () => categoryBreakdown(transactions, kind, currencyOf, base, rates ?? {}),
    [transactions, kind, currencyOf, base, rates],
  )

  const approx = breakdown.hasForeign ? '≈ ' : ''
  const rows = breakdown.slices.map((s, i) => {
    const cat = categoryOf(s.categoryId)
    return {
      id: s.categoryId,
      name: cat?.name ?? '?',
      icon: cat?.icon ?? '📦',
      amount: s.amount,
      color: PALETTE[i % PALETTE.length],
      pct: breakdown.total > 0 ? (s.amount / breakdown.total) * 100 : 0,
    }
  })

  return (
    <div className="flex flex-col gap-3">
      {/* Chọn Chi / Thu */}
      <div className="flex rounded-lg bg-surface-sunken p-0.5 text-sm font-medium">
        <button
          type="button"
          onClick={() => setKind('expense')}
          className={`flex-1 rounded-md py-2.5 ${kind === 'expense' ? 'bg-surface text-money-out shadow-sm' : 'text-fg-muted'}`}
        >
          Chi
        </button>
        <button
          type="button"
          onClick={() => setKind('income')}
          className={`flex-1 rounded-md py-2.5 ${kind === 'income' ? 'bg-surface text-money-in shadow-sm' : 'text-fg-muted'}`}
        >
          Thu
        </button>
      </div>

      {/* Tổng */}
      <div className="rounded-xl bg-surface p-4 text-center shadow-sm">
        <div className="text-xs text-fg-muted">
          Tổng {kind === 'expense' ? 'chi' : 'thu'} tháng này
        </div>
        <div
          className={`mt-1 text-2xl font-bold tabular-nums ${kind === 'expense' ? 'text-money-out' : 'text-money-in'}`}
        >
          {approx}
          {formatMoney(breakdown.total, base)}
        </div>
      </div>

      {breakdown.hasMissingRate && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 p-2 text-xs text-amber-700 dark:text-amber-300">
          Một phần giao dịch ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên có thể thiếu.
        </div>
      )}

      {isLoading ? (
        <p className="py-10 text-center text-fg-muted">Đang tải…</p>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-fg-muted">
          Chưa có {kind === 'expense' ? 'chi tiêu' : 'thu nhập'} trong tháng này
        </p>
      ) : (
        <ul className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-sm">
          {rows.map((r) => (
            <li key={r.id}>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-base">{r.icon}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-gray-700 dark:text-gray-300">{r.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-fg-muted">
                  {r.pct.toFixed(0)}%
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                  {formatMoney(r.amount, base)}
                </span>
              </div>
              <div className="mt-1.5 ml-6 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(r.pct, 2)}%`, backgroundColor: r.color }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
