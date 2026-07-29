import { useMemo } from 'react'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'
import { approxLabel, sumInBase, sumPerCurrency, type CurrencyOf } from './ledgerShared'

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
    <div className="grid grid-cols-3 gap-2 rounded-xl bg-white dark:bg-gray-900 p-3 text-center shadow-sm">
      <div>
        <div className="text-xs text-gray-500 dark:text-gray-400">Thu</div>
        <div className="mt-0.5 text-sm font-semibold tabular-nums text-money-in">
          {income ? approxLabel(income, base) : sumPerCurrency(transactions, 'income', currencyOf)}
        </div>
      </div>
      <div className="border-x border-gray-100 dark:border-gray-800">
        <div className="text-xs text-gray-500 dark:text-gray-400">Chi</div>
        <div className="mt-0.5 text-sm font-semibold tabular-nums text-money-out">
          {expense ? approxLabel(expense, base) : sumPerCurrency(transactions, 'expense', currencyOf)}
        </div>
      </div>
      <div>
        <div className="text-xs text-gray-500 dark:text-gray-400">Chênh lệch</div>
        <div
          className={`mt-0.5 text-sm font-semibold tabular-nums ${netNegative ? 'text-money-out' : 'text-gray-800 dark:text-gray-100'}`}
        >
          {net}
        </div>
      </div>
    </div>
  )
}
