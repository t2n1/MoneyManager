import { useMemo } from 'react'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'
import { approxLabel, sumInBase, sumPerCurrency, type CurrencyOf } from './ledgerShared'
import { Card } from '../../components/ui'

interface Props {
  transactions: TransactionRow[]
  currencyOf: CurrencyOf
  base: CurrencyCode
  rates: Rates | undefined
}

/** Thẻ tổng Thu / Chi / Chênh lệch cho khoảng đang xem (quy đổi base, thiếu tỷ giá → tách loại tiền). */
export function PeriodTotalsBar({ transactions, currencyOf, base, rates }: Props) {
  const { income, expense } = useMemo(
    () => ({
      income: sumInBase(transactions, 'income', currencyOf, base, rates),
      expense: sumInBase(transactions, 'expense', currencyOf, base, rates),
    }),
    [transactions, currencyOf, base, rates],
  )

  const net =
    income && expense
      ? `${income.hasForeign || expense.hasForeign ? '≈ ' : ''}${formatMoney(income.value - expense.value, base)}`
      : '—'
  const netNegative = !!(income && expense && income.value - expense.value < 0)

  return (
    <Card className="grid grid-cols-3 gap-2 text-center">
      <div>
        <div className="text-sm text-fg-muted">Thu</div>
        <div className="mt-0.5 text-sm font-semibold tabular-nums text-money-in">
          {income ? approxLabel(income, base) : sumPerCurrency(transactions, 'income', currencyOf)}
        </div>
      </div>
      <div className="border-x border-border-subtle">
        <div className="text-sm text-fg-muted">Chi</div>
        <div className="mt-0.5 text-sm font-semibold tabular-nums text-money-out">
          {expense ? approxLabel(expense, base) : sumPerCurrency(transactions, 'expense', currencyOf)}
        </div>
      </div>
      <div>
        <div className="text-sm text-fg-muted">Chênh lệch</div>
        <div
          className={`mt-0.5 text-sm font-semibold tabular-nums ${netNegative ? 'text-money-out' : 'text-fg-primary'}`}
        >
          {net}
        </div>
      </div>
    </Card>
  )
}
