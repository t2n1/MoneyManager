import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AccountTypeIcon } from '../../components/icons'
import type { TxFilter } from '../../data'
import {
  useAccountBalances,
  useAccounts,
  useCategories,
  useProfile,
  useRates,
  useSearchTransactions,
} from '../../hooks/queries'
import {
  addMonths,
  formatMonthLabel,
  getMonthRange,
  monthKeyForDate,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import type { TransactionRow } from '../../types/database.types'
import { EditTransactionSheet } from '../transactions/EditTransactionSheet'
import { TransactionItem } from '../transactions/TransactionItem'

export function AccountDetailPage() {
  const { accountId = '' } = useParams()
  const { data: profile } = useProfile()
  const { data: accounts = [] } = useAccounts()
  const { data: balances = [] } = useAccountBalances()
  const { data: categories = [] } = useCategories()
  const { base } = useRates()
  const [editing, setEditing] = useState<TransactionRow | null>(null)

  const monthStartDay = profile?.month_start_day ?? 1
  // null = "kỳ hiện tại": tính lazy vì profile tải async — khởi tạo cứng trong
  // useState sẽ chốt nhầm kỳ khi month_start_day ≠ 1
  const [monthKey, setMonthKey] = useState<MonthKey | null>(null)
  const activeMonthKey = monthKey ?? monthKeyForDate(toISODate(new Date()), monthStartDay)

  const account = accounts.find((a) => a.id === accountId)
  const balance = balances.find((b) => b.id === accountId)?.balance ?? 0

  // Phím tắt desktop: ←/→ chuyển tháng
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'))
        return
      const fallback = () => monthKeyForDate(toISODate(new Date()), monthStartDay)
      if (e.key === 'ArrowLeft') setMonthKey((k) => addMonths(k ?? fallback(), -1))
      if (e.key === 'ArrowRight') setMonthKey((k) => addMonths(k ?? fallback(), 1))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [monthStartDay])

  // Lịch sử của tài khoản này trong "tháng" đang xem (khớp account_id HOẶC to_account_id).
  const range = getMonthRange(activeMonthKey, monthStartDay)
  const filter: TxFilter = useMemo(
    () => ({
      start: range.start,
      end: range.end,
      accountIds: accountId ? [accountId] : undefined,
    }),
    [range.start, range.end, accountId],
  )
  const { data: results = [], isLoading } = useSearchTransactions(filter, !!accountId && !!profile)

  const accountOf = (id: string | null) => accounts.find((a) => a.id === id)
  const categoryOf = (id: string | null) => categories.find((c) => c.id === id)

  const days = useMemo(() => {
    const map = new Map<string, TransactionRow[]>()
    for (const t of results) {
      const list = map.get(t.occurred_on) ?? []
      list.push(t)
      map.set(t.occurred_on, list)
    }
    return [...map.entries()]
  }, [results])

  const currency = account?.currency ?? base

  return (
    <div className="p-3 lg:p-6">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <Link
          to="/assets"
          className="rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Quay lại"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 truncate text-lg font-bold text-gray-800 dark:text-gray-100">
          {account ? (
            <span className="inline-flex items-center gap-1.5">
              <AccountTypeIcon type={account.type} className="h-5 w-5" /> {account.name}
            </span>
          ) : (
            'Tài khoản'
          )}
        </h1>
      </div>

      {/* Số dư hiện tại */}
      <section className="mb-3 rounded-xl bg-white dark:bg-gray-900 p-4 shadow-sm">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Số dư hiện tại</p>
        <p
          className={`mt-1 text-2xl font-bold ${balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}
        >
          {formatMoney(balance, currency)}
        </p>
        {account?.asset_group && (
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Nhóm: {account.asset_group}</p>
        )}
      </section>

      {/* Chuyển tháng */}
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMonthKey((k) => addMonths(k ?? activeMonthKey, -1))}
          className="rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Tháng trước"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="flex-1 text-center text-sm font-bold text-gray-800 dark:text-gray-100">
          {formatMonthLabel(activeMonthKey)}
        </h2>
        <button
          type="button"
          onClick={() => setMonthKey((k) => addMonths(k ?? activeMonthKey, 1))}
          className="rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Tháng sau"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Lịch sử giao dịch trong tháng */}
      <p className="mb-2 px-1 text-xs text-gray-500 dark:text-gray-400">
        {isLoading ? 'Đang tải…' : `${results.length} giao dịch`}
      </p>
      {days.length === 0 && !isLoading ? (
        <p className="py-10 text-center text-gray-400 dark:text-gray-500">Không có giao dịch trong tháng này</p>
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
