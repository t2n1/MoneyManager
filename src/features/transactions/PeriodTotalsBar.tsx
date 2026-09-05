import { useMemo } from 'react'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'
import { approxLabel, sumInBase, sumPerCurrency, type CurrencyOf } from './ledgerShared'
import { Card, StatTile } from '../../components/ui'

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

  const thu = income
    ? approxLabel(income, base)
    : sumPerCurrency(transactions, 'income', currencyOf)
  const chi = expense
    ? approxLabel(expense, base)
    : sumPerCurrency(transactions, 'expense', currencyOf)

  // HAI dáng theo cỡ màn (redesign 2): desktop là ba thẻ gradient rời, nhãn chữ hoa +
  // số 22px mono (đúng khuôn <StatTile>); mobile giữ MỘT thẻ ba cột — 390px không có
  // chỗ cho ba con số 22px đứng cạnh nhau.
  return (
    <>
      <div className="hidden gap-3 lg:grid lg:grid-cols-3">
        <StatTile label="Thu" className="bg-panel-gradient">
          <span className="text-money-in">{thu}</span>
        </StatTile>
        <StatTile label="Chi" className="bg-panel-gradient">
          <span className="text-money-out">{chi}</span>
        </StatTile>
        <StatTile label="Chênh lệch" className="bg-panel-gradient">
          <span className={netNegative ? 'text-money-out' : undefined}>{net}</span>
        </StatTile>
      </div>
      <Card className="grid grid-cols-3 gap-2 bg-panel-gradient text-center lg:hidden">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-label text-fg-muted">Thu</div>
          <div className="mt-1 font-mono text-sm font-semibold text-money-in">{thu}</div>
        </div>
        <div className="border-x border-border-subtle">
          <div className="text-2xs font-semibold uppercase tracking-label text-fg-muted">Chi</div>
          <div className="mt-1 font-mono text-sm font-semibold text-money-out">{chi}</div>
        </div>
        <div>
          <div className="text-2xs font-semibold uppercase tracking-label text-fg-muted">
            Chênh lệch
          </div>
          <div
            className={`mt-1 font-mono text-sm font-semibold ${netNegative ? 'text-money-out' : 'text-fg-primary'}`}
          >
            {net}
          </div>
        </div>
      </Card>
    </>
  )
}
