import { useEffect, useMemo, useState } from 'react'
import {
  useAccounts,
  useCategories,
  useDeleteTransaction,
  useMonthTransactions,
  useRates,
  useUpdateTransaction,
} from '../../hooks/queries'
import {
  addMonths,
  formatMonthLabel,
  monthKeyForDate,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'
import { TransactionForm } from './TransactionForm'

const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']

function formatDayHeader(dateISO: string) {
  const [y, m, d] = dateISO.split('-').map(Number)
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${d}/${m}`
}

const AMOUNT_STYLE: Record<TransactionRow['type'], { color: string; sign: string }> = {
  expense: { color: 'text-red-600', sign: '-' },
  income: { color: 'text-green-600', sign: '+' },
  transfer: { color: 'text-gray-500', sign: '' },
}

/**
 * Tổng thu/chi quy đổi về base. Trả về:
 * - {converted, hasForeign} khi đủ tỷ giá
 * - null khi thiếu tỷ giá → caller fallback hiển thị tách loại tiền
 */
function sumInBase(
  txs: TransactionRow[],
  kind: 'income' | 'expense',
  currencyOf: (accountId: string) => CurrencyCode,
  base: CurrencyCode,
  rates: Rates | undefined,
): { value: number; hasForeign: boolean } | null {
  let value = 0
  let hasForeign = false
  for (const t of txs) {
    if (t.type !== kind) continue
    const cur = currencyOf(t.account_id)
    if (cur !== base) hasForeign = true
    const v = convertToBase(t.amount, cur, base, rates ?? {})
    if (v === null) return null
    value += v
  }
  return { value, hasForeign }
}

/** Fallback: tổng theo từng loại tiền, ví dụ "¥3.280 · 1.500.000 ₫" */
function sumPerCurrency(
  txs: TransactionRow[],
  kind: 'income' | 'expense',
  currencyOf: (accountId: string) => CurrencyCode,
): string {
  const sums = new Map<CurrencyCode, number>()
  for (const t of txs) {
    if (t.type !== kind) continue
    const cur = currencyOf(t.account_id)
    sums.set(cur, (sums.get(cur) ?? 0) + t.amount)
  }
  if (sums.size === 0) return '0'
  return [...sums.entries()].map(([cur, v]) => formatMoney(v, cur)).join(' · ')
}

export function LedgerPage() {
  const [monthKey, setMonthKey] = useState<MonthKey>(() => monthKeyForDate(toISODate(new Date())))
  const [editing, setEditing] = useState<TransactionRow | null>(null)

  const { data: transactions = [], isLoading } = useMonthTransactions(monthKey)
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { base, rates } = useRates()
  const update = useUpdateTransaction()
  const remove = useDeleteTransaction()

  // Phím tắt desktop: ←/→ chuyển tháng
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'))
        return
      if (e.key === 'ArrowLeft') setMonthKey((k) => addMonths(k, -1))
      if (e.key === 'ArrowRight') setMonthKey((k) => addMonths(k, 1))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const accountOf = (id: string | null) => accounts.find((a) => a.id === id)
  const accountName = (id: string | null) => accountOf(id)?.name ?? '?'
  const currencyOf = (id: string): CurrencyCode => accountOf(id)?.currency ?? base
  const categoryOf = (id: string | null) => categories.find((c) => c.id === id)

  const totals = useMemo(() => {
    // Chuyển khoản KHÔNG tính vào thu/chi (quyết định thiết kế #2)
    const income = sumInBase(transactions, 'income', currencyOf, base, rates)
    const expense = sumInBase(transactions, 'expense', currencyOf, base, rates)
    return { income, expense }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, accounts, base, rates])

  const days = useMemo(() => {
    const map = new Map<string, TransactionRow[]>()
    for (const t of transactions) {
      const list = map.get(t.occurred_on) ?? []
      list.push(t)
      map.set(t.occurred_on, list)
    }
    return [...map.entries()] // đã sort desc từ repo
  }, [transactions])

  async function handleDelete(tx: TransactionRow) {
    if (!window.confirm('Xóa giao dịch này?')) return
    await remove.mutateAsync(tx.id)
    setEditing(null)
  }

  const approx = (r: { value: number; hasForeign: boolean }) =>
    `${r.hasForeign ? '≈ ' : ''}${formatMoney(r.value, base)}`

  return (
    <div className="p-3 lg:p-6">
      {/* Header chuyển tháng */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonthKey((k) => addMonths(k, -1))}
          className="rounded-lg bg-white px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Tháng trước"
        >
          ←
        </button>
        <h1 className="text-lg font-bold text-gray-800">{formatMonthLabel(monthKey)}</h1>
        <button
          type="button"
          onClick={() => setMonthKey((k) => addMonths(k, 1))}
          className="rounded-lg bg-white px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Tháng sau"
        >
          →
        </button>
      </div>

      {/* Tổng quan tháng (quy đổi về base; thiếu tỷ giá → tách loại tiền) */}
      <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-white p-3 text-center shadow-sm">
        <div>
          <div className="text-xs text-gray-500">Tổng thu</div>
          <div className="text-sm font-semibold text-green-600">
            {totals.income ? approx(totals.income) : sumPerCurrency(transactions, 'income', currencyOf)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Tổng chi</div>
          <div className="text-sm font-semibold text-red-600">
            {totals.expense
              ? approx(totals.expense)
              : sumPerCurrency(transactions, 'expense', currencyOf)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Chênh lệch</div>
          <div
            className={`text-sm font-semibold ${
              totals.income && totals.expense && totals.income.value - totals.expense.value < 0
                ? 'text-red-600'
                : 'text-gray-800'
            }`}
          >
            {totals.income && totals.expense
              ? `${totals.income.hasForeign || totals.expense.hasForeign ? '≈ ' : ''}${formatMoney(
                  totals.income.value - totals.expense.value,
                  base,
                )}`
              : '—'}
          </div>
        </div>
      </div>

      {/* Danh sách nhóm theo ngày */}
      {isLoading ? (
        <p className="py-10 text-center text-gray-400">Đang tải…</p>
      ) : days.length === 0 ? (
        <p className="py-10 text-center text-gray-400">Chưa có giao dịch trong tháng này</p>
      ) : (
        days.map(([day, txs]) => {
          const dayIncome = sumInBase(txs, 'income', currencyOf, base, rates)
          const dayExpense = sumInBase(txs, 'expense', currencyOf, base, rates)
          return (
            <section key={day} className="mb-3">
              <div className="mb-1 flex items-baseline justify-between px-1 text-xs text-gray-500">
                <span className="font-medium">{formatDayHeader(day)}</span>
                <span>
                  {dayIncome && dayIncome.value > 0 && (
                    <span className="text-green-600">+{approx(dayIncome)}</span>
                  )}
                  {dayIncome && dayIncome.value > 0 && dayExpense && dayExpense.value > 0 && ' · '}
                  {dayExpense && dayExpense.value > 0 && (
                    <span className="text-red-600">-{approx(dayExpense)}</span>
                  )}
                </span>
              </div>
              <div className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-sm">
                {txs.map((tx) => {
                  const cat = categoryOf(tx.category_id)
                  const style = AMOUNT_STYLE[tx.type]
                  const srcCur = currencyOf(tx.account_id)
                  const dstCur = tx.to_account_id ? currencyOf(tx.to_account_id) : srcCur
                  return (
                    <button
                      key={tx.id}
                      type="button"
                      onClick={() => setEditing(tx)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-gray-50"
                    >
                      <span className="text-xl">{tx.type === 'transfer' ? '🔁' : cat?.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-gray-800">
                          {tx.type === 'transfer'
                            ? `${accountName(tx.account_id)} → ${accountName(tx.to_account_id)}`
                            : (cat?.name ?? '?')}
                          {tx.note && <span className="text-gray-400"> · {tx.note}</span>}
                        </span>
                        {tx.type !== 'transfer' && (
                          <span className="block text-xs text-gray-400">
                            {accountName(tx.account_id)}
                          </span>
                        )}
                      </span>
                      <span className={`text-right text-sm font-semibold ${style.color}`}>
                        {style.sign}
                        {formatMoney(tx.amount, srcCur)}
                        {tx.to_amount != null && (
                          <span className="block text-xs font-normal text-gray-400">
                            → +{formatMoney(tx.to_amount, dstCur)}
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })
      )}

      {/* Sheet sửa giao dịch */}
      {editing && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center"
          onClick={() => setEditing(null)}
        >
          <div
            className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-gray-50 p-4 lg:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-800">Sửa giao dịch</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleDelete(editing)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Xóa
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
                >
                  Đóng
                </button>
              </div>
            </div>
            <TransactionForm
              key={editing.id}
              initial={editing}
              submitLabel="Cập nhật"
              onSubmit={async (values) => {
                await update.mutateAsync({ id: editing.id, patch: values })
                setEditing(null)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
