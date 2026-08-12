import { useMemo } from 'react'
import { type CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { AccountRow, CategoryRow, TagRow, TransactionRow } from '../../types/database.types'
import { approxLabel, formatDayHeader, groupByDay, sumInBase, type CurrencyOf } from './ledgerShared'
import { PeriodTotalsBar } from './PeriodTotalsBar'
import { TransactionItem } from './TransactionItem'

interface Props {
  transactions: TransactionRow[]
  isLoading: boolean
  accountOf: (id: string | null) => AccountRow | undefined
  categoryOf: (id: string | null) => CategoryRow | undefined
  currencyOf: CurrencyOf
  base: CurrencyCode
  rates: Rates | undefined
  onEdit: (tx: TransactionRow) => void
  /** Chế độ chọn nhiều (mặc định tắt → hành vi cũ). */
  selecting?: boolean
  isSelected?: (id: string) => boolean
  onToggleSelect?: (id: string) => void
  /** Nhãn theo id giao dịch (xem `tagsByTransaction`) — để dòng nào có nhãn thì hiện chip. */
  tagsOfTx?: Map<string, TagRow[]>
}

/** Xem theo ngày: tổng tháng + danh sách giao dịch gộp theo từng ngày. */
export function DailyView({
  transactions,
  isLoading,
  accountOf,
  categoryOf,
  currencyOf,
  base,
  rates,
  onEdit,
  selecting = false,
  isSelected,
  onToggleSelect,
  tagsOfTx,
}: Props) {
  const days = useMemo(() => groupByDay(transactions), [transactions])

  return (
    <div className="flex flex-col gap-3">
      <PeriodTotalsBar
        transactions={transactions}
        currencyOf={currencyOf}
        base={base}
        rates={rates}
      />

      {isLoading ? (
        <p className="py-10 text-center text-fg-muted">Đang tải…</p>
      ) : days.length === 0 ? (
        <p className="py-10 text-center text-fg-muted">Chưa có giao dịch trong tháng này</p>
      ) : (
        days.map(([day, txs]) => {
          const dayIncome = sumInBase(txs, 'income', currencyOf, base, rates)
          const dayExpense = sumInBase(txs, 'expense', currencyOf, base, rates)
          return (
            <section key={day}>
              <div className="mb-1 flex items-baseline justify-between px-1 text-xs text-fg-muted">
                <span className="font-medium">{formatDayHeader(day)}</span>
                {/* Chi của một ngày có thể ÂM (hoàn tiền nhiều hơn chi trong ngày đó)
                    — khi ấy đổi dấu và màu, chứ đừng in ra "-¥-400". */}
                <span className="tabular-nums">
                  {dayIncome && dayIncome.value > 0 && (
                    <span className="text-money-in">+{approxLabel(dayIncome, base)}</span>
                  )}
                  {dayIncome && dayIncome.value > 0 && dayExpense && dayExpense.value !== 0 && ' · '}
                  {dayExpense && dayExpense.value !== 0 && (
                    <span className={dayExpense.value > 0 ? 'text-money-out' : 'text-money-in'}>
                      {dayExpense.value > 0 ? '-' : '+'}
                      {approxLabel({ ...dayExpense, value: Math.abs(dayExpense.value) }, base)}
                    </span>
                  )}
                </span>
              </div>
              <div className="divide-y divide-border-subtle overflow-hidden rounded-xl bg-surface shadow-sm">
                {txs.map((tx) => (
                  <TransactionItem
                    key={tx.id}
                    tx={tx}
                    categoryOf={categoryOf}
                    accountOf={accountOf}
                    base={base}
                    onClick={() => (selecting ? onToggleSelect?.(tx.id) : onEdit(tx))}
                    selecting={selecting}
                    selected={isSelected?.(tx.id) ?? false}
                    tags={tagsOfTx?.get(tx.id)}
                  />
                ))}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
