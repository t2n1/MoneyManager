import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronUp, Search, X } from 'lucide-react'
import { AccountTypeIcon } from '../../components/icons'
import type { TxFilter } from '../../data'
import {
  useAccounts,
  useCategories,
  useDeleteTransactions,
  useRates,
  useSearchTransactions,
  useTagGroups,
  useTags,
  useTransactionTags,
} from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { confirmDialog, showToast } from '../../lib/dialog'
import { CURRENCIES, formatMoney, type CurrencyCode } from '../../lib/money'
import type { TransactionRow, TransactionType } from '../../types/database.types'
import { sumIncomeExpense } from '../reports/aggregate'
import { filterByTags, tagsByTransaction } from '../tags/aggregate'
import { TAG_CHIP_CLASS, tagColor } from '../tags/colors'
import { EditTransactionSheet } from './EditTransactionSheet'
import { SelectionActionBar } from './SelectionActionBar'
import { TransactionItem } from './TransactionItem'
import { useTxSelection } from './useTxSelection'

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
  const { data: tagGroups = [] } = useTagGroups()
  const { data: tagLinks = [] } = useTransactionTags()
  const { base, rates } = useRates()

  /** Nhãn của màn lọc chia theo nhóm. Khác ô chọn nhãn khi nhập ở hai điểm:
   *  hiện CẢ nhãn đã lưu trữ (lọc lịch sử vẫn cần chúng), và không cắt top-N. */
  const tagSections = useMemo(() => {
    const known = new Set(tagGroups.map((g) => g.id))
    return [
      ...tagGroups.map((g) => ({
        key: g.id,
        title: g.name,
        list: tags.filter((t) => t.group_id === g.id),
      })),
      {
        key: '__other__',
        title: 'Khác',
        list: tags.filter((t) => !t.group_id || !known.has(t.group_id)),
      },
    ].filter((s) => s.list.length > 0)
  }, [tags, tagGroups])

  // Deep-link từ thẻ "Chi theo nhãn": ?tags=id1,id2&from=…&to=… . Chỉ đọc một lần
  // lúc mount — sau đó người dùng làm chủ bộ lọc, URL không kéo ngược lại nữa.
  const [searchParams] = useSearchParams()
  const initial = useState(() => ({
    tagIds: (searchParams.get('tags') ?? '').split(',').filter(Boolean),
    from: searchParams.get('from') || defaultFrom(),
    to: searchParams.get('to') || toISODate(new Date()),
    // Từ bảng "khoản chưa gắn danh mục" ở tab Thấu hiểu: ?uncat=1&from=…&to=…
    uncat: searchParams.get('uncat') === '1',
  }))[0]

  const [text, setText] = useState('')
  const [debouncedText, setDebouncedText] = useState('')
  const [typeFilter, setTypeFilter] = useState<TransactionType | 'all'>('all')
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [accountIds, setAccountIds] = useState<string[]>([])
  const [tagIds, setTagIds] = useState<string[]>(initial.tagIds)
  const [uncategorized, setUncategorized] = useState(initial.uncat)
  const [amountMinStr, setAmountMinStr] = useState('')
  const [amountMaxStr, setAmountMaxStr] = useState('')
  // Mở sẵn khối lọc nếu vào từ deep-link, để thấy ngay mình đang lọc theo nhãn nào
  const [showMore, setShowMore] = useState(initial.tagIds.length > 0 || initial.uncat)
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
      // undefined khi tắt: để khoá này không xuất hiện trong queryKey của react-query,
      // nhờ vậy bật rồi tắt lại là dùng luôn cache cũ chứ không gọi mạng thêm lần nữa.
      uncategorized: uncategorized || undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from, to, debouncedText, typeFilter, categoryIds, accountIds, amountMinStr, amountMaxStr, baseFactor, uncategorized],
  )

  const { data: rawResults = [], isLoading } = useSearchTransactions(filter)
  // Nhãn lọc sau cùng, phía client: bảng liên kết nhỏ và đã nằm sẵn trong cache
  const results = useMemo(
    () => filterByTags(rawResults, tagLinks, tagIds, tags),
    [rawResults, tagLinks, tagIds, tags],
  )
  // Chip nhãn trên từng dòng — cùng cách trình bày với danh sách ở Sổ
  const tagsOfTx = useMemo(() => tagsByTransaction(tagLinks, tags), [tagLinks, tags])

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

  // Chọn nhiều để xóa hàng loạt (dọn giao dịch lỗi sau import).
  const selection = useTxSelection()
  const bulkDelete = useDeleteTransactions()
  const resultIds = useMemo(() => results.map((t) => t.id), [results])
  const allSelected = resultIds.length > 0 && resultIds.every((id) => selection.isSelected(id))

  async function handleBulkDelete() {
    const ids = selection.selectedIds
    if (ids.length === 0) return
    if (
      !(await confirmDialog({
        title: `Xóa ${ids.length} giao dịch?`,
        message: 'Không hoàn tác được.',
        danger: true,
        confirmLabel: 'Xóa',
      }))
    )
      return
    await bulkDelete.mutateAsync(ids)
    showToast(`Đã xóa ${ids.length} giao dịch`)
    selection.exit()
  }

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id]

  const chip = (active: boolean) =>
    `rounded-full px-3 py-2.5 text-xs font-medium transition ${
      active ? 'bg-green-700 text-white' : 'bg-surface text-fg-secondary shadow-sm'
    }`

  return (
    <div className="p-3 lg:p-6">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <Link
          to="/transactions"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-surface px-3 text-lg shadow-sm active:scale-95"
          aria-label="Quay lại"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-lg font-bold text-fg-primary">Tìm kiếm</h1>
      </div>

      {/* Ô tìm ghi chú */}
      <div className="mb-2 flex items-center gap-2 rounded-xl bg-surface px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-green-500">
        <Search className="h-5 w-5 text-fg-muted" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tìm theo ghi chú…"
          className="flex-1 text-sm text-fg-primary outline-none"
        />
        {text && (
          <button type="button" onClick={() => setText('')} className="inline-flex min-h-11 min-w-11 items-center justify-center text-fg-muted" aria-label="Xóa">
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
      <div className="mb-2 flex items-center gap-2 text-sm text-fg-secondary">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-2 py-1.5"
        />
        <span className="text-fg-muted">→</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-2 py-1.5"
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
        <div className="mb-3 space-y-3 rounded-xl bg-surface-sunken p-3">
          {tagSections.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-fg-muted">
                Nhãn{' '}
                <span className="font-normal text-fg-muted">
                  (trong cùng nhóm = khớp bất kỳ · khác nhóm = phải khớp đủ)
                </span>
              </p>
              <div className="flex flex-col gap-2">
                {tagSections.map((s) => (
                  <div key={s.key}>
                    <p className="mb-1 text-2xs font-semibold text-fg-muted">{s.title}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {s.list.map((t) => {
                        const active = tagIds.includes(t.id)
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setTagIds((l) => toggle(l, t.id))}
                            aria-pressed={active}
                            className={`rounded-full px-3 py-2.5 text-xs font-medium transition ${
                              active
                                ? 'bg-green-700 text-white'
                                : TAG_CHIP_CLASS[tagColor(t.color)]
                            }`}
                          >
                            {t.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {typeFilter !== 'transfer' && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-fg-muted">Danh mục</p>
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
            <p className="mb-1.5 text-xs font-semibold text-fg-muted">
              Số tiền ({CURRENCIES[base].symbol})
            </p>
            <div className="flex items-center gap-2 text-sm text-fg-secondary">
              <input
                type="number"
                inputMode="numeric"
                value={amountMinStr}
                onChange={(e) => setAmountMinStr(e.target.value)}
                placeholder="Tối thiểu"
                className="w-full rounded-lg border border-border-strong bg-surface px-2 py-1.5"
              />
              <span className="text-fg-muted">→</span>
              <input
                type="number"
                inputMode="numeric"
                value={amountMaxStr}
                onChange={(e) => setAmountMaxStr(e.target.value)}
                placeholder="Tối đa"
                className="w-full rounded-lg border border-border-strong bg-surface px-2 py-1.5"
              />
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-fg-muted">Tài khoản</p>
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

          {/* Chỉ khoản chưa gắn danh mục — cửa vào từ bảng "còn tồn" ở tab Thấu hiểu,
              và cũng để tự dọn tay khi muốn. Ô tích chứ không phải chip: đây là bật/tắt
              một điều kiện, không phải chọn trong một tập. */}
          <label className="flex min-h-11 items-center gap-2 text-xs text-fg-secondary">
            <input
              type="checkbox"
              checked={uncategorized}
              onChange={(e) => setUncategorized(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Chỉ khoản chưa gắn danh mục
          </label>
        </div>
      )}

      {/* Kết quả */}
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
          <span>{isLoading ? 'Đang tìm…' : `${results.length} kết quả`}</span>
          {/* Nhãn đang lọc phải thấy được cả khi khối bộ lọc đang thu gọn */}
          {tagIds.length > 0 && (
            <>
              <span>
                · lọc theo{' '}
                {tagIds
                  .map((id) => tags.find((t) => t.id === id)?.name)
                  .filter(Boolean)
                  .join(' + ')}
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
        {results.length > 0 && (
          <button
            type="button"
            onClick={() => (selection.selecting ? selection.exit() : selection.enter())}
            // -my-2 để vùng chạm 44px không đội dòng "n kết quả" ra xa danh sách
            className="-my-2 inline-flex min-h-11 shrink-0 items-center justify-center px-2 text-xs font-medium text-green-700 dark:text-green-400"
          >
            {selection.selecting ? 'Xong' : 'Chọn'}
          </button>
        )}
      </div>
      {(totals.income > 0 || totals.expense > 0 || totals.hasMissingRate) && (
        <div className="mb-3 rounded-xl bg-surface p-3 shadow-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="text-fg-muted">Thu</span>
            <span className="font-semibold text-money-in">
              {totals.hasForeign ? '≈ ' : ''}
              {formatMoney(totals.income, base)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="text-fg-muted">Chi</span>
            <span className="font-semibold text-money-out">
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
        <p className="py-10 text-center text-fg-muted">Không có giao dịch khớp bộ lọc</p>
      ) : (
        days.map(([day, txs]) => (
          <section key={day} className="mb-3">
            <div className="mb-1 px-1 text-xs font-medium text-fg-muted">{day}</div>
            <div className="divide-y divide-border-subtle overflow-hidden rounded-xl bg-surface shadow-sm">
              {txs.map((tx) => (
                <TransactionItem
                  key={tx.id}
                  tx={tx}
                  categoryOf={categoryOf}
                  accountOf={accountOf}
                  base={base}
                  onClick={() => (selection.selecting ? selection.toggle(tx.id) : setEditing(tx))}
                  selecting={selection.selecting}
                  selected={selection.isSelected(tx.id)}
                  tags={tagsOfTx.get(tx.id)}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {/* Chừa chỗ cho thanh thao tác cố định ở dưới, không che dòng cuối */}
      {selection.selecting && <div className="h-20" />}

      {editing && <EditTransactionSheet tx={editing} onClose={() => setEditing(null)} />}

      {selection.selecting && (
        <SelectionActionBar
          count={selection.count}
          allSelected={allSelected}
          onToggleAll={() => (allSelected ? selection.clear() : selection.selectAll(resultIds))}
          onDelete={handleBulkDelete}
        />
      )}
    </div>
  )
}
