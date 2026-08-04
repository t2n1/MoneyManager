import { ArrowRightLeft, CheckCircle2, Circle, HandCoins, Repeat } from 'lucide-react'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { AccountRow, CategoryRow, TagRow, TransactionRow } from '../../types/database.types'
import { TAG_CHIP_CLASS, tagColor } from '../tags/colors'

const AMOUNT_STYLE: Record<TransactionRow['type'], { color: string; sign: string }> = {
  expense: { color: 'text-money-out', sign: '-' },
  income: { color: 'text-money-in', sign: '+' },
  transfer: { color: 'text-fg-muted', sign: '' },
}

interface Props {
  tx: TransactionRow
  categoryOf: (id: string | null) => CategoryRow | undefined
  accountOf: (id: string | null) => AccountRow | undefined
  base: CurrencyCode
  onClick: () => void
  /** Đang ở chế độ chọn nhiều → hiện ô tích, chạm dòng = tích/bỏ (trang tự lo onClick). */
  selecting?: boolean
  /** Dòng này đang được chọn. */
  selected?: boolean
  /**
   * Nhãn của giao dịch này (xem `tagsByTransaction`). Bỏ trống = không vẽ chip,
   * để những màn chưa tải bảng liên kết nhãn giữ nguyên dáng cũ.
   */
  tags?: TagRow[]
}

/** Một dòng giao dịch (dùng chung cho Sổ GD và Tìm kiếm). */
export function TransactionItem({
  tx,
  categoryOf,
  accountOf,
  base,
  onClick,
  selecting = false,
  selected = false,
  tags = [],
}: Props) {
  const cat = categoryOf(tx.category_id)
  const style = AMOUNT_STYLE[tx.type]
  const srcCur = accountOf(tx.account_id)?.currency ?? base
  const dstCur = tx.to_account_id ? (accountOf(tx.to_account_id)?.currency ?? srcCur) : srcCur
  const accountName = (id: string | null) => accountOf(id)?.name ?? '?'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selecting ? selected : undefined}
      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-gray-50 dark:hover:bg-gray-800 ${selected ? 'bg-green-50 dark:bg-green-900/20' : ''}`}
    >
      {selecting && (
        <span className="shrink-0">
          {selected ? (
            <CheckCircle2 className="h-5 w-5 text-green-700 dark:text-green-400" />
          ) : (
            <Circle className="h-5 w-5 text-fg-muted" />
          )}
        </span>
      )}
      <span className="text-xl">{tx.type === 'transfer' ? <ArrowRightLeft className="h-5 w-5" /> : cat?.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-fg-primary">
          {tx.type === 'transfer'
            ? `${accountName(tx.account_id)} → ${accountName(tx.to_account_id)}`
            : (cat?.name ?? '?')}
          {tx.note && <span className="text-fg-muted"> · {tx.note}</span>}
          {tx.recurring_rule_id && (
            <Repeat
              aria-label="Giao dịch định kỳ"
              className="ml-1 inline h-3 w-3 align-baseline text-fg-muted"
            />
          )}
          {tx.is_debt_flow && (
            <HandCoins
              aria-label="Dòng tiền nợ/cho vay — không tính vào Thu/Chi"
              className="ml-1 inline h-3 w-3 align-baseline text-fg-warn"
            />
          )}
        </span>
        {/* Dòng phụ: tài khoản + chip nhãn. Nhãn cắt ngang danh mục nên chỉ thấy
            nó ở báo cáo là không đủ — phải thấy ngay trên dòng để biết khoản này
            đã gắn nhãn hay chưa. Chip đứng cùng dòng tài khoản, tự xuống dòng khi
            chật thay vì chiếm thêm một hàng cố định. */}
        {(tx.type !== 'transfer' || tags.length > 0) && (
          <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-fg-muted">
            {tx.type !== 'transfer' && (
              <span className="min-w-0 truncate">{accountName(tx.account_id)}</span>
            )}
            {tags.map((t) => (
              <span
                key={t.id}
                className={`min-w-0 max-w-[9rem] truncate rounded-full px-1.5 py-px text-2xs font-medium ${TAG_CHIP_CLASS[tagColor(t.color)]}`}
              >
                {t.name}
              </span>
            ))}
          </span>
        )}
      </span>
      <span className={`text-right text-sm font-semibold tabular-nums ${style.color}`}>
        {style.sign}
        {formatMoney(tx.amount, srcCur)}
        {tx.to_amount != null && (
          <span className="block text-xs font-normal tabular-nums text-fg-muted">
            → +{formatMoney(tx.to_amount, dstCur)}
          </span>
        )}
      </span>
    </button>
  )
}
