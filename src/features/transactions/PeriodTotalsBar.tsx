import { useMemo } from 'react'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'
import { approxLabel, splitExpense, sumInBase, sumPerCurrency, type CurrencyOf } from './ledgerShared'
import { Card, Money, StatTile } from '../../components/ui'
import { useTransferCategoryIds } from '../../hooks/queries'

interface Props {
  transactions: TransactionRow[]
  currencyOf: CurrencyOf
  base: CurrencyCode
  rates: Rates | undefined
}

/** Thẻ tổng Thu / Chi / Chênh lệch cho khoảng đang xem (quy đổi base, thiếu tỷ giá → tách loại tiền). */
export function PeriodTotalsBar({ transactions, currencyOf, base, rates }: Props) {
  // Khoản thuộc danh mục CHUYỂN TÀI SẢN (kind 'transfer', vd. Gửi tiền về VN) tách khỏi ô
  // Chi, cùng luật với Bản tin và Báo cáo ("Chuyển tài sản · không phải chi tiêu"). Trước
  // đây Sổ gộp nó vào: cùng tháng Sổ ghi Chi ¥120,930 còn hai màn kia ghi ¥90,930. Tiền
  // vẫn đi ra thật, nên nó hiện thành dòng phụ dưới ô Chi và vẫn trừ vào Chênh lệch —
  // Chênh lệch nhờ vậy khớp "Phần để lại" của Báo cáo.
  const transferIds = useTransferCategoryIds()
  const { income, expense, moved } = useMemo(() => {
    const { spending, moved } = splitExpense(transactions, transferIds, currencyOf, base, rates)
    return { income: sumInBase(transactions, 'income', currencyOf, base, rates), expense: spending, moved }
  }, [transactions, currencyOf, base, rates, transferIds])

  const outflow = expense && moved ? expense.value + moved.value : null
  const net =
    income && outflow !== null
      ? `${income.hasForeign || expense?.hasForeign || moved?.hasForeign ? '≈ ' : ''}${formatMoney(income.value - outflow, base)}`
      : '—'
  const netNegative = !!(income && outflow !== null && income.value - outflow < 0)

  const thu = income
    ? approxLabel(income, base)
    : sumPerCurrency(transactions, 'income', currencyOf)
  const chi = expense
    ? approxLabel(expense, base)
    : sumPerCurrency(transactions, 'expense', currencyOf)
  const movedLine =
    moved && moved.value !== 0 ? (
      <span className="block text-2xs font-normal text-fg-muted">
        + <Money amount={moved.value} currency={base} approx={moved.hasForeign} className="!text-2xs !text-fg-muted" />{' '}
        chuyển tài sản
      </span>
    ) : null

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
          {movedLine}
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
          {movedLine}
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
