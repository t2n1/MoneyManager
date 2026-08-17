import { useMemo, useState } from 'react'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import { getMonthRange, toISODate, type MonthKey } from '../../lib/dates'
import type { AccountRow, CategoryRow, TagRow, TransactionRow } from '../../types/database.types'
import {
  approxLabel,
  formatDayHeader,
  sumInBase,
  WEEKDAYS_SHORT,
  type CurrencyOf,
} from './ledgerShared'
import { expenseSign } from '../reports/aggregate'
import { TransactionItem } from './TransactionItem'

interface Props {
  transactions: TransactionRow[]
  monthKey: MonthKey
  /** Ngày bắt đầu "tháng" tùy chỉnh (profiles.month_start_day) — lưới phải khớp kỳ dữ liệu */
  monthStartDay: number
  accountOf: (id: string | null) => AccountRow | undefined
  categoryOf: (id: string | null) => CategoryRow | undefined
  currencyOf: CurrencyOf
  base: CurrencyCode
  rates: Rates | undefined
  onEdit: (tx: TransactionRow) => void
  /** Nhãn theo id giao dịch (xem `tagsByTransaction`) — để dòng nào có nhãn thì hiện chip. */
  tagsOfTx?: Map<string, TagRow[]>
}

interface DaySums {
  income: number
  expense: number
}

/** Xem theo lịch: mỗi ô ngày hiện thu (xanh) / chi (đỏ) rút gọn; chạm để xem chi tiết ngày. */
export function CalendarView({
  transactions,
  monthKey,
  monthStartDay,
  accountOf,
  categoryOf,
  currencyOf,
  base,
  rates,
  onEdit,
  tagsOfTx,
}: Props) {
  // Lưới hiển thị đúng kỳ dữ liệu [start, end) — với monthStartDay ≠ 1 kỳ này
  // vắt sang tháng dương lịch kế tiếp, không phải 1..cuối tháng của monthKey
  const range = getMonthRange(monthKey, monthStartDay)
  const periodDays = useMemo(() => {
    const [y, m, d] = range.start.split('-').map(Number)
    const cur = new Date(y, m - 1, d)
    const out: string[] = []
    for (let iso = toISODate(cur); iso < range.end; iso = toISODate(cur)) {
      out.push(iso)
      cur.setDate(cur.getDate() + 1)
    }
    return out
  }, [range.start, range.end])
  const startParts = range.start.split('-').map(Number)
  const leadingBlanks = new Date(startParts[0], startParts[1] - 1, startParts[2]).getDay()

  // Tổng thu/chi (quy đổi base) theo từng ngày dương lịch
  const byDay = useMemo(() => {
    const map = new Map<string, DaySums>()
    for (const t of transactions) {
      if (t.type === 'transfer' || t.is_debt_flow || t.exclude_from_stats) continue
      const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates ?? {})
      if (v === null) continue
      const cur = map.get(t.occurred_on) ?? { income: 0, expense: 0 }
      // Hoàn tiền là chi ÂM, giống sumInBase và mọi module báo cáo.
      if (t.type === 'income') cur.income += v
      else cur.expense += v * expenseSign(t)
      map.set(t.occurred_on, cur)
    }
    return map
  }, [transactions, currencyOf, base, rates])

  const todayISO = toISODate(new Date())

  const [selected, setSelected] = useState<string | null>(() => {
    const t = toISODate(new Date())
    return t >= range.start && t < range.end ? t : null
  })

  const selectedTxs = selected ? transactions.filter((t) => t.occurred_on === selected) : []
  const selIncome = sumInBase(selectedTxs, 'income', currencyOf, base, rates)
  const selExpense = sumInBase(selectedTxs, 'expense', currencyOf, base, rates)

  const cells: (string | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...periodDays,
  ]

  /** Nhãn ô: số ngày; ngày 1 hiện "8/1" (tháng/ngày) để khỏi lẫn khi kỳ vắt sang tháng sau */
  const dayLabel = (iso: string) => {
    const day = Number(iso.slice(8, 10))
    return day === 1 && monthStartDay !== 1 ? `${Number(iso.slice(5, 7))}/1` : String(day)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl bg-surface p-2 shadow-sm">
        {/* Nhãn thứ. Chủ nhật đỏ là quy ước LỊCH, không phải "tiền ra" — nhưng mượn
            --money-out vì đó là sắc đỏ DUY NHẤT của app đạt AA ở cả hai chế độ
            (red-400 trơ chỉ 2,89:1 trên trắng). Thêm token đỏ thứ hai cho một quy ước
            lịch là phát minh scale mới cho đúng một chỗ. */}
        <div className="grid grid-cols-7 text-center text-2xs font-medium text-fg-muted">
          {WEEKDAYS_SHORT.map((w, i) => (
            <div key={w} className={`py-1 ${i === 0 ? 'text-money-out' : ''}`}>
              {w}
            </div>
          ))}
        </div>

        {/* Ô ngày */}
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((iso, i) => {
            if (iso === null) return <div key={`b${i}`} />
            const sums = byDay.get(iso)
            const isSelected = selected === iso
            const isToday = iso === todayISO
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelected(iso)}
                className={`flex min-h-[3.25rem] flex-col rounded-lg p-1 text-left transition ${
                  isSelected ? 'bg-state-good-bg ring-1 ring-green-400' : 'hover:bg-surface-sunken'
                }`}
              >
                <span
                  className={`text-2xs leading-none ${
                    isToday
                      ? 'flex h-4 w-4 items-center justify-center rounded-full bg-accent font-bold text-fg-on-accent'
                      : i % 7 === 0
                        ? 'text-money-out'
                        : 'text-fg-muted'
                  }`}
                >
                  {dayLabel(iso)}
                </span>
                <span className="mt-auto flex flex-col items-end gap-px text-3xs leading-tight tabular-nums">
                  {sums && sums.income > 0 && (
                    <span className="break-all text-money-in">{formatMoney(sums.income, base)}</span>
                  )}
                  {/* Chi âm = ngày đó hoàn tiền nhiều hơn chi → đọc như một khoản tiền vào */}
                  {sums && sums.expense !== 0 && (
                    <span
                      className={`break-all ${sums.expense > 0 ? 'text-money-out' : 'text-money-in'}`}
                    >
                      {formatMoney(Math.abs(sums.expense), base)}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Chi tiết ngày được chọn */}
      {selected && (
        <section>
          <div className="mb-1 flex items-baseline justify-between px-1 text-xs text-fg-muted">
            <span className="font-medium">{formatDayHeader(selected)}</span>
            <span className="tabular-nums">
              {selIncome && selIncome.value > 0 && (
                <span className="text-money-in">+{approxLabel(selIncome, base)}</span>
              )}
              {selIncome && selIncome.value > 0 && selExpense && selExpense.value > 0 && ' · '}
              {selExpense && selExpense.value > 0 && (
                <span className="text-money-out">-{approxLabel(selExpense, base)}</span>
              )}
            </span>
          </div>
          {selectedTxs.length === 0 ? (
            <p className="rounded-xl bg-surface py-6 text-center text-sm text-fg-muted shadow-sm">
              Không có giao dịch ngày này
            </p>
          ) : (
            <div className="divide-y divide-border-subtle overflow-hidden rounded-xl bg-surface shadow-sm">
              {selectedTxs.map((tx) => (
                <TransactionItem
                  key={tx.id}
                  tx={tx}
                  categoryOf={categoryOf}
                  accountOf={accountOf}
                  base={base}
                  onClick={() => onEdit(tx)}
                  tags={tagsOfTx?.get(tx.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
