import { ArrowRightLeft, Repeat } from 'lucide-react'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { AccountRow, CategoryRow, TransactionRow } from '../../types/database.types'

const AMOUNT_STYLE: Record<TransactionRow['type'], { color: string; sign: string }> = {
  expense: { color: 'text-red-600 dark:text-red-400', sign: '-' },
  income: { color: 'text-green-600 dark:text-green-400', sign: '+' },
  transfer: { color: 'text-gray-500 dark:text-gray-400', sign: '' },
}

interface Props {
  tx: TransactionRow
  categoryOf: (id: string | null) => CategoryRow | undefined
  accountOf: (id: string | null) => AccountRow | undefined
  base: CurrencyCode
  onClick: () => void
}

/** Một dòng giao dịch (dùng chung cho Sổ GD và Tìm kiếm). */
export function TransactionItem({ tx, categoryOf, accountOf, base, onClick }: Props) {
  const cat = categoryOf(tx.category_id)
  const style = AMOUNT_STYLE[tx.type]
  const srcCur = accountOf(tx.account_id)?.currency ?? base
  const dstCur = tx.to_account_id ? (accountOf(tx.to_account_id)?.currency ?? srcCur) : srcCur
  const accountName = (id: string | null) => accountOf(id)?.name ?? '?'

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-gray-50 dark:hover:bg-gray-800"
    >
      <span className="text-xl">{tx.type === 'transfer' ? <ArrowRightLeft className="h-5 w-5" /> : cat?.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-gray-800 dark:text-gray-100">
          {tx.type === 'transfer'
            ? `${accountName(tx.account_id)} → ${accountName(tx.to_account_id)}`
            : (cat?.name ?? '?')}
          {tx.note && <span className="text-gray-400 dark:text-gray-500"> · {tx.note}</span>}
          {tx.recurring_rule_id && (
            <Repeat
              aria-label="Giao dịch định kỳ"
              className="ml-1 inline h-3 w-3 align-baseline text-gray-400 dark:text-gray-500"
            />
          )}
        </span>
        {tx.type !== 'transfer' && (
          <span className="block text-xs text-gray-400 dark:text-gray-500">{accountName(tx.account_id)}</span>
        )}
      </span>
      <span className={`text-right text-sm font-semibold ${style.color}`}>
        {style.sign}
        {formatMoney(tx.amount, srcCur)}
        {tx.to_amount != null && (
          <span className="block text-xs font-normal text-gray-400 dark:text-gray-500">
            → +{formatMoney(tx.to_amount, dstCur)}
          </span>
        )}
      </span>
    </button>
  )
}
