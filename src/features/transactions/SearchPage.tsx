import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { TxFilter } from '../../data'
import { useAccounts, useCategories, useRates, useSearchTransactions } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { CURRENCIES, formatMoney, type CurrencyCode } from '../../lib/money'
import type { TransactionRow, TransactionType } from '../../types/database.types'
import { sumIncomeExpense } from '../reports/aggregate'
import { EditTransactionSheet } from './EditTransactionSheet'
import { TransactionItem } from './TransactionItem'

const TYPE_TABS: { value: TransactionType | 'all'; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'expense', label: 'Chi' },
  { value: 'income', label: 'Thu' },
  { value: 'transfer', label: 'Chuyển khoản' },
]

/** ISO ngày + 1 (để biến ngày "đến" thành mốc loại trừ). */
function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return toISODate(new Date(y, m - 1, d + 1))
}

function defaultFrom(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 11)
  d.setDate(1)
  return toISODate(d)
}

export function SearchPage() {
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { base, rates } = useRates()

  const [text, setText] = useState('')
  const [debouncedText, setDebouncedText] = useState('')
  const [typeFilter, setTypeFilter] = useState<TransactionType | 'all'>('all')
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(() => toISODate(new Date()))
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [accountIds, setAccountIds] = useState<string[]>([])
  const [showMore, setShowMore] = useState(false)
  const [editing, setEditing] = useState<TransactionRow | null>(null)

  // Debounce text 300ms (mỗi ký tự = 1 query khi chạy Supabase)
  useEffect(() => {
    const id = setTimeout(() => setDebouncedText(text), 300)
    return () => clearTimeout(id)
  }, [text])

  // Danh mục hiện theo loại đang lọc (Chi/Thu); CK không có danh mục
  const visibleCategories = useMemo(
    () =>
      categories.filter(
        (c) => typeFilter === 'all' || typeFilter === 'transfer' || c.type === typeFilter,
      ),
    [categories, typeFilter],
  )

  const filter: TxFilter = useMemo(
    () => ({
      start: from,
      end: nextDay(to),
      text: debouncedText || undefined,
      types: typeFilter === 'all' ? undefined : [typeFilter],
      categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
      accountIds: accountIds.length > 0 ? accountIds : undefined,
    }),
    [from, to, debouncedText, typeFilter, categoryIds, accountIds],
  )

  const { data: results = [], isLoading } = useSearchTransactions(filter)

  const accountOf = (id: string | null) => accounts.find((a) => a.id === id)
  const categoryOf = (id: string | null) => categories.find((c) => c.id === id)

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? base

  const totals = useMemo(
    () => sumIncomeExpense(results, currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, accounts, base, rates],
  )

  const days = useMemo(() => {
    const map = new Map<string, TransactionRow[]>()
    for (const t of results) {
      const list = map.get(t.occurred_on) ?? []
      list.push(t)
      map.set(t.occurred_on, list)
    }
    return [...map.entries()]
  }, [results])

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id]

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition ${
      active ? 'bg-green-600 text-white' : 'bg-white text-gray-600 shadow-sm'
    }`

  return (
    <div className="p-3 lg:p-6">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <Link
          to="/transactions"
          className="rounded-lg bg-white px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Quay lại"
        >
          ←
        </Link>
        <h1 className="flex-1 text-lg font-bold text-gray-800">Tìm kiếm</h1>
      </div>

      {/* Ô tìm ghi chú */}
      <div className="mb-2 flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm">
        <span className="text-gray-400">🔍</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tìm theo ghi chú…"
          className="flex-1 text-sm text-gray-800 outline-none"
        />
        {text && (
          <button type="button" onClick={() => setText('')} className="text-gray-400" aria-label="Xóa">
            ✕
          </button>
        )}
      </div>

      {/* Loại giao dịch */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {TYPE_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => {
              setTypeFilter(t.value)
              setCategoryIds([]) // đổi loại → bỏ chọn danh mục cũ
            }}
            className={chip(typeFilter === t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Khoảng ngày */}
      <div className="mb-2 flex items-center gap-2 text-sm text-gray-600">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5"
        />
        <span className="text-gray-400">→</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5"
        />
      </div>

      {/* Lọc thêm: danh mục + tài khoản */}
      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="mb-2 text-xs font-medium text-green-700"
      >
        {showMore ? 'Ẩn bộ lọc ▲' : 'Lọc theo danh mục / tài khoản ▼'}
      </button>
      {showMore && (
        <div className="mb-3 space-y-3 rounded-xl bg-gray-100 p-3">
          {typeFilter !== 'transfer' && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-gray-500">Danh mục</p>
              <div className="flex flex-wrap gap-1.5">
                {visibleCategories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoryIds((l) => toggle(l, c.id))}
                    className={chip(categoryIds.includes(c.id))}
                  >
                    {c.icon} {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-gray-500">Tài khoản</p>
            <div className="flex flex-wrap gap-1.5">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAccountIds((l) => toggle(l, a.id))}
                  className={chip(accountIds.includes(a.id))}
                >
                  {a.type === 'cash' ? '💵' : '🏦'} {a.name} · {CURRENCIES[a.currency].symbol}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Kết quả */}
      <p className="mb-2 px-1 text-xs text-gray-500">
        {isLoading ? 'Đang tìm…' : `${results.length} kết quả`}
      </p>
      {(totals.income > 0 || totals.expense > 0 || totals.hasMissingRate) && (
        <div className="mb-3 rounded-xl bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Thu</span>
            <span className="font-semibold text-green-600">
              {totals.hasForeign ? '≈ ' : ''}
              {formatMoney(totals.income, base)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="text-gray-500">Chi</span>
            <span className="font-semibold text-red-600">
              {totals.hasForeign ? '≈ ' : ''}
              {formatMoney(totals.expense, base)}
            </span>
          </div>
          {totals.hasMissingRate && (
            <p className="mt-2 text-xs text-amber-700">
              Một phần ngoại tệ chưa quy đổi được (đang chờ tỷ giá).
            </p>
          )}
        </div>
      )}
      {days.length === 0 && !isLoading ? (
        <p className="py-10 text-center text-gray-400">Không có giao dịch khớp bộ lọc</p>
      ) : (
        days.map(([day, txs]) => (
          <section key={day} className="mb-3">
            <div className="mb-1 px-1 text-xs font-medium text-gray-500">{day}</div>
            <div className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-sm">
              {txs.map((tx) => (
                <TransactionItem
                  key={tx.id}
                  tx={tx}
                  categoryOf={categoryOf}
                  accountOf={accountOf}
                  base={base}
                  onClick={() => setEditing(tx)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {editing && <EditTransactionSheet tx={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
