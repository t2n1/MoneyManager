import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronUp, Search, X } from 'lucide-react'
import { AccountTypeIcon } from '../../components/icons'
import type { TxFilter } from '../../data'
import {
  useAccounts,
  useCategories,
  useRates,
  useSearchTransactions,
  useTags,
  useTransactionTags,
} from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { CURRENCIES, formatMoney, type CurrencyCode } from '../../lib/money'
import type { TransactionRow, TransactionType } from '../../types/database.types'
import { sumIncomeExpense } from '../reports/aggregate'
import { filterByTags } from '../tags/aggregate'
import { TAG_CHIP_CLASS, tagColor } from '../tags/colors'
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
  // setDate(1) TRƯỚC setMonth: ngày 31 mà lùi sang tháng thiếu ngày sẽ bị tràn thêm 1 tháng
  d.setDate(1)
  d.setMonth(d.getMonth() - 11)
  return toISODate(d)
}

export function SearchPage() {
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: tags = [] } = useTags()
  const { data: tagLinks = [] } = useTransactionTags()
  const { base, rates } = useRates()

  // Deep-link từ thẻ "Chi theo nhãn": ?tags=id1,id2&from=…&to=… . Chỉ đọc một lần
  // lúc mount — sau đó người dùng làm chủ bộ lọc, URL không kéo ngược lại nữa.
  const [searchParams] = useSearchParams()
  const initial = useState(() => ({
    tagIds: (searchParams.get('tags') ?? '').split(',').filter(Boolean),
    from: searchParams.get('from') || defaultFrom(),
    to: searchParams.get('to') || toISODate(new Date()),
  }))[0]

  const [text, setText] = useState('')
  const [debouncedText, setDebouncedText] = useState('')
  const [typeFilter, setTypeFilter] = useState<TransactionType | 'all'>('all')
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [accountIds, setAccountIds] = useState<string[]>([])
  const [tagIds, setTagIds] = useState<string[]>(initial.tagIds)
  const [amountMinStr, setAmountMinStr] = useState('')
  const [amountMaxStr, setAmountMaxStr] = useState('')
  // Mở sẵn khối lọc nếu vào từ deep-link, để thấy ngay mình đang lọc theo nhãn nào
  const [showMore, setShowMore] = useState(initial.tagIds.length > 0)
  const [editing, setEditing] = useState<TransactionRow | null>(null)

  // Nhập theo đơn vị chính của tiền gốc → quy ra minor units để so với amount đã lưu.
  const baseFactor = 10 ** CURRENCIES[base].decimals
  const toMinor = (s: string): number | undefined => {
    const n = Number(s.replace(/[^\d.]/g, ''))
    return s.trim() === '' || Number.isNaN(n) ? undefined : Math.round(n * baseFactor)
  }

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
      amountMin: toMinor(amountMinStr),
      amountMax: toMinor(amountMaxStr),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from, to, debouncedText, typeFilter, categoryIds, accountIds, amountMinStr, amountMaxStr, baseFactor],
  )

  const { data: rawResults = [], isLoading } = useSearchTransactions(filter)
  // Nhãn lọc sau cùng, phía client: bảng liên kết nhỏ và đã nằm sẵn trong cache
  const results = useMemo(
    () => filterByTags(rawResults, tagLinks, tagIds),
    [rawResults, tagLinks, tagIds],
  )

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
    `rounded-full px-3 py-2.5 text-xs font-medium transition ${
      active ? 'bg-green-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 shadow-sm'
    }`

  return (
    <div className="p-3 lg:p-6">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <Link
          to="/transactions"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white dark:bg-gray-900 px-3 text-lg shadow-sm active:scale-95"
          aria-label="Quay lại"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-lg font-bold text-gray-800 dark:text-gray-100">Tìm kiếm</h1>
      </div>

      {/* Ô tìm ghi chú */}
      <div className="mb-2 flex items-center gap-2 rounded-xl bg-white dark:bg-gray-900 px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-green-500">
        <Search className="h-5 w-5 text-gray-400 dark:text-gray-500" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tìm theo ghi chú…"
          className="flex-1 text-sm text-gray-800 dark:text-gray-100 outline-none"
        />
        {text && (
          <button type="button" onClick={() => setText('')} className="inline-flex min-h-11 min-w-11 items-center justify-center text-gray-400 dark:text-gray-500" aria-label="Xóa">
            <X className="h-5 w-5" />
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
      <div className="mb-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5"
        />
        <span className="text-gray-400 dark:text-gray-500">→</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5"
        />
      </div>

      {/* Lọc thêm: danh mục + tài khoản */}
      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400"
      >
        {showMore ? 'Ẩn bộ lọc' : 'Lọc theo danh mục / nhãn / tài khoản'}
        {showMore ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {showMore && (
        <div className="mb-3 space-y-3 rounded-xl bg-gray-100 dark:bg-gray-800 p-3">
          {tags.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                Nhãn{' '}
                <span className="font-normal text-gray-400 dark:text-gray-500">
                  (chọn nhiều = khớp bất kỳ)
                </span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => {
                  const active = tagIds.includes(t.id)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTagIds((l) => toggle(l, t.id))}
                      aria-pressed={active}
                      className={`rounded-full px-3 py-2.5 text-xs font-medium transition ${
                        active
                          ? 'bg-green-600 text-white'
                          : TAG_CHIP_CLASS[tagColor(t.color)]
                      }`}
                    >
                      {t.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {typeFilter !== 'transfer' && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Danh mục</p>
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
            <p className="mb-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
              Số tiền ({CURRENCIES[base].symbol})
            </p>
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input
                type="number"
                inputMode="numeric"
                value={amountMinStr}
                onChange={(e) => setAmountMinStr(e.target.value)}
                placeholder="Tối thiểu"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5"
              />
              <span className="text-gray-400 dark:text-gray-500">→</span>
              <input
                type="number"
                inputMode="numeric"
                value={amountMaxStr}
                onChange={(e) => setAmountMaxStr(e.target.value)}
                placeholder="Tối đa"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5"
              />
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Tài khoản</p>
            <div className="flex flex-wrap gap-1.5">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAccountIds((l) => toggle(l, a.id))}
                  className={chip(accountIds.includes(a.id))}
                >
                  <span className="inline-flex items-center gap-1">
                    <AccountTypeIcon type={a.type} className="h-4 w-4" /> {a.name} ·{' '}
                    {CURRENCIES[a.currency].symbol}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Kết quả */}
      <p className="mb-2 flex flex-wrap items-center gap-x-2 px-1 text-xs text-gray-500 dark:text-gray-400">
        <span>{isLoading ? 'Đang tìm…' : `${results.length} kết quả`}</span>
        {/* Nhãn đang lọc phải thấy được cả khi khối bộ lọc đang thu gọn */}
        {tagIds.length > 0 && (
          <>
            <span>
              · lọc theo{' '}
              {tagIds
                .map((id) => tags.find((t) => t.id === id)?.name)
                .filter(Boolean)
                .join(', ')}
            </span>
            <button
              type="button"
              onClick={() => setTagIds([])}
              className="font-medium text-green-700 dark:text-green-400"
            >
              Bỏ lọc nhãn
            </button>
          </>
        )}
      </p>
      {(totals.income > 0 || totals.expense > 0 || totals.hasMissingRate) && (
        <div className="mb-3 rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Thu</span>
            <span className="font-semibold text-green-600 dark:text-green-400">
              {totals.hasForeign ? '≈ ' : ''}
              {formatMoney(totals.income, base)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Chi</span>
            <span className="font-semibold text-red-600 dark:text-red-400">
              {totals.hasForeign ? '≈ ' : ''}
              {formatMoney(totals.expense, base)}
            </span>
          </div>
          {totals.hasMissingRate && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              Một phần ngoại tệ chưa quy đổi được (đang chờ tỷ giá).
            </p>
          )}
        </div>
      )}
      {days.length === 0 && !isLoading ? (
        <p className="py-10 text-center text-gray-500 dark:text-gray-400">Không có giao dịch khớp bộ lọc</p>
      ) : (
        days.map(([day, txs]) => (
          <section key={day} className="mb-3">
            <div className="mb-1 px-1 text-xs font-medium text-gray-500 dark:text-gray-400">{day}</div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden rounded-xl bg-white dark:bg-gray-900 shadow-sm">
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
