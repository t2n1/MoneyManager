import { useMemo } from 'react'
import { type CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { AccountRow, CategoryRow, TransactionRow } from '../../types/database.types'
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
                <span className="tabular-nums">
                  {dayIncome && dayIncome.value > 0 && (
                    <span className="text-money-in">+{approxLabel(dayIncome, base)}</span>
                  )}
                  {dayIncome && dayIncome.value > 0 && dayExpense && dayExpense.value > 0 && ' · '}
                  {dayExpense && dayExpense.value > 0 && (
                    <span className="text-money-out">-{approxLabel(dayExpense, base)}</span>
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
                    onClick={() => onEdit(tx)}
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
