import { useMemo, type ReactNode } from 'react'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { AccountRow, CategoryRow, TagRow, TransactionRow } from '../../types/database.types'
import { approxLabel, groupByDay, splitDayHeader, sumInBase, type CurrencyOf } from './ledgerShared'
import { PeriodTotalsBar } from './PeriodTotalsBar'
import { TransactionItem } from './TransactionItem'
import { Card, EmptyState } from '../../components/ui'

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
  /** Bật/tắt chế độ chọn nhiều. Có hàm này thì nút "Chọn" mới hiện. */
  onToggleSelecting?: () => void
  /** Nhãn theo id giao dịch (xem `tagsByTransaction`) — để dòng nào có nhãn thì hiện chip. */
  tagsOfTx?: Map<string, TagRow[]>
  /**
   * Số dư chạy tới hết mỗi ngày, tra theo ISO (§4.2 mục 1). Thiếu = không vẽ cột đó —
   * màn Tìm kiếm dùng chung dáng dòng này nhưng không có khái niệm "số dư chạy trong kỳ".
   */
  balanceOfDay?: Map<string, number>
  /** Chèn ngay trên danh sách: chip lọc tại chỗ + dòng cảnh báo chưa phân loại. */
  aboveList?: ReactNode
  /** Nhân bản một khoản sang hôm nay (vuốt / chuột phải) — xem TransactionItem. */
  onDuplicate?: (tx: TransactionRow) => void
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
  onToggleSelecting,
  tagsOfTx,
  balanceOfDay,
  aboveList,
  onDuplicate,
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

      {/* Nút "Chọn" đứng SÁT danh sách nó điều khiển. Trước đây nó nằm trên thẻ
          tổng Thu/Chi, tức là ngay dưới thẻ "Cơ cấu chi" — đọc thành "chọn cái gì
          đó của Cơ cấu chi". -my-2 để vùng chạm 44px không nong khoảng cách ra. */}
      {onToggleSelecting && !isLoading && days.length > 0 && (
        <div className="-my-2 flex justify-end px-1">
          <button
            type="button"
            onClick={onToggleSelecting}
            className="inline-flex min-h-11 items-center justify-center px-2 text-sm font-medium text-fg-accent"
          >
            {selecting ? 'Xong' : 'Chọn'}
          </button>
        </div>
      )}

      {aboveList}

      {isLoading ? (
        <EmptyState>Đang tải…</EmptyState>
      ) : days.length === 0 ? (
        <EmptyState>Chưa có giao dịch trong tháng này</EmptyState>
      ) : (
        days.map(([day, txs]) => {
          const dayIncome = sumInBase(txs, 'income', currencyOf, base, rates)
          const dayExpense = sumInBase(txs, 'expense', currencyOf, base, rates)
          const header = splitDayHeader(day)
          return (
            <section key={day}>
              {/* Header nhóm ngày (redesign 2): KHÔNG còn nền chrome — ngày là một dòng
                  chữ trần trên nền trang, đứng NGOÀI thẻ danh sách; số ngày đi mono đậm
                  để mắt bám vào khi cuộn, thứ là nhãn chữ hoa lùi lại phía sau. */}
              <div className="mb-1.5 flex items-baseline gap-2.5 px-1">
                <span className="font-mono text-base font-semibold text-fg-primary">
                  {header.date}
                </span>
                <span className="text-2xs font-semibold uppercase tracking-label text-fg-muted">
                  {header.weekday}
                </span>
                {/* Số dư chạy (§4.2 mục 1): cộng dồn thu − chi từ đầu kỳ tới HẾT ngày
                    này, có ký hiệu Σ đứng trước để tách khỏi tổng ngày bên phải. Ẩn
                    dưới sm: ở 375px ba con số + nhãn thứ không xếp nổi một hàng. */}
                {balanceOfDay?.get(day) !== undefined && (
                  <span
                    className="hidden font-mono text-2xs text-fg-muted sm:inline"
                    title="Số dư chạy từ đầu kỳ tới hết ngày này"
                  >
                    Σ{' '}
                    <span
                      className={(balanceOfDay.get(day) ?? 0) < 0 ? 'text-money-out' : undefined}
                    >
                      {formatMoney(balanceOfDay.get(day) ?? 0, base)}
                    </span>
                  </span>
                )}
                {/* Chi của một ngày có thể ÂM (hoàn tiền nhiều hơn chi trong ngày đó)
                    — khi ấy đổi dấu và màu, chứ đừng in ra "-¥-400".
                    `font-mono` thay `tabular-nums` (§4.2: số phải mono): trong font đơn
                    cách mọi chữ số vốn cùng bề rộng, nên tabular-nums thành thừa. */}
                {/* `whitespace-nowrap` ở TỪNG vế: trình duyệt được phép ngắt dòng ngay
                    SAU dấu gạch nối, nên ở 375px "-¥69,060" từng gãy thành "· -" /
                    "¥69,060" — dấu trừ nằm lại dòng trên một mình. Chỗ được gãy là giữa
                    hai vế (quanh dấu ·), không phải giữa dấu và số. */}
                <span className="ml-auto font-mono text-sm font-semibold text-fg-muted">
                  {dayIncome && dayIncome.value > 0 && (
                    <span className="whitespace-nowrap text-money-in">+{approxLabel(dayIncome, base)}</span>
                  )}
                  {dayIncome && dayIncome.value > 0 && dayExpense && dayExpense.value !== 0 && ' · '}
                  {dayExpense && dayExpense.value !== 0 && (
                    <span className={`whitespace-nowrap ${dayExpense.value > 0 ? 'text-money-out' : 'text-money-in'}`}>
                      {dayExpense.value > 0 ? '-' : '+'}
                      {approxLabel({ ...dayExpense, value: Math.abs(dayExpense.value) }, base)}
                    </span>
                  )}
                </span>
              </div>
              <Card padding="none" className="divide-y divide-border-subtle overflow-hidden">
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
                    onDuplicate={onDuplicate && (() => onDuplicate(tx))}
                  />
                ))}
              </Card>
            </section>
          )
        })
      )}
    </div>
  )
}
