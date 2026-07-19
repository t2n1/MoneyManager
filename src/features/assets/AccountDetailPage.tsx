import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, LineChart, Scale, Trash2 } from 'lucide-react'
import { AccountTypeIcon } from '../../components/icons'
import type { TxFilter } from '../../data'
import {
  useAccountBalances,
  useAccounts,
  useAccountValuations,
  useCategories,
  useDeleteValuation,
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
import { investmentStats } from './investment'
import { ReconcileSheet } from './ReconcileSheet'
import { ValuationFormSheet } from './ValuationFormSheet'

export function AccountDetailPage() {
  const { accountId = '' } = useParams()
  const { data: profile } = useProfile()
  const { data: accounts = [] } = useAccounts()
  const { data: balances = [] } = useAccountBalances()
  const { data: categories = [] } = useCategories()
  const { base } = useRates()
  const { data: valuations = [] } = useAccountValuations()
  const deleteValuation = useDeleteValuation()
  const [editing, setEditing] = useState<TransactionRow | null>(null)
  const [showValuation, setShowValuation] = useState(false)
  const [showReconcile, setShowReconcile] = useState(false)

  const monthStartDay = profile?.month_start_day ?? 1
  // null = "kỳ hiện tại": tính lazy vì profile tải async — khởi tạo cứng trong
  // useState sẽ chốt nhầm kỳ khi month_start_day ≠ 1
  const [monthKey, setMonthKey] = useState<MonthKey | null>(null)
  const activeMonthKey = monthKey ?? monthKeyForDate(toISODate(new Date()), monthStartDay)

  const account = accounts.find((a) => a.id === accountId)
  const balanceRow = balances.find((b) => b.id === accountId)
  const balance = balanceRow?.balance ?? 0
  const isInvestment = account?.type === 'investment'
  // Đầu tư: vốn gốc = balance (sổ), giá thị trường = snapshot mới nhất (view market_value)
  const invStats = investmentStats(balance, isInvestment ? (balanceRow?.market_value ?? null) : null)
  const accountValuations = useMemo(
    () =>
      valuations
        .filter((v) => v.account_id === accountId)
        .sort((a, b) => b.valued_on.localeCompare(a.valued_on)),
    [valuations, accountId],
  )

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
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {account?.type === 'card'
            ? 'Đang nợ thẻ'
            : isInvestment
              ? 'Giá trị hiện tại'
              : 'Số dư hiện tại'}
        </p>
        <p
          className={`mt-1 text-2xl font-bold ${balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}
        >
          {account?.type === 'card'
            ? balance < 0
              ? `− ${formatMoney(-balance, currency)}`
              : formatMoney(0, currency)
            : isInvestment
              ? formatMoney(invStats.marketValue ?? balance, currency)
              : formatMoney(balance, currency)}
        </p>
        {account?.asset_group && (
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Nhóm: {account.asset_group}</p>
        )}

        {/* Điều chỉnh số dư (mục X) — cho ví/tài khoản thường, không cho đầu tư/thẻ */}
        {account && !isInvestment && account.type !== 'card' && (
          <button
            type="button"
            onClick={() => setShowReconcile(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-95"
          >
            <Scale className="h-3.5 w-3.5" /> Điều chỉnh số dư
          </button>
        )}

        {isInvestment && (
          <div className="mt-3 space-y-1.5 border-t border-gray-100 dark:border-gray-800 pt-3 text-sm">
            <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
              <span>Vốn gốc (đã bỏ vào)</span>
              <span className="tabular-nums font-medium text-gray-800 dark:text-gray-100">
                {formatMoney(invStats.costBasis, currency)}
              </span>
            </div>
            {invStats.unrealizedPnl == null ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Chưa cập nhật giá thị trường — đang tính theo vốn gốc.
              </p>
            ) : (
              <div
                className={`flex items-center justify-between font-medium ${
                  invStats.unrealizedPnl >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                <span>Lãi/lỗ chưa thực hiện</span>
                <span className="tabular-nums">
                  {invStats.unrealizedPnl >= 0 ? '+' : '−'}
                  {formatMoney(Math.abs(invStats.unrealizedPnl), currency)}
                  {invStats.pnlPercent != null && (
                    <span className="ml-1 text-xs">
                      ({invStats.unrealizedPnl >= 0 ? '+' : '−'}
                      {Math.abs(invStats.pnlPercent * 100).toFixed(1)}%)
                    </span>
                  )}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowValuation(true)}
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
            >
              <LineChart className="h-3.5 w-3.5" /> Cập nhật giá trị
            </button>
          </div>
        )}

        {account?.type === 'card' && (
          <div className="mt-3 space-y-1.5 border-t border-gray-100 dark:border-gray-800 pt-3 text-sm">
            {account.credit_limit != null && (
              <>
                <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
                  <span>Còn dùng được</span>
                  <span className="tabular-nums font-medium text-gray-800 dark:text-gray-100">
                    {formatMoney(account.credit_limit - (balance < 0 ? -balance : 0), currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-gray-400 dark:text-gray-500">
                  <span>Hạn mức</span>
                  <span className="tabular-nums">{formatMoney(account.credit_limit, currency)}</span>
                </div>
              </>
            )}
            {account.statement_day != null && (
              <div className="flex items-center justify-between text-gray-400 dark:text-gray-500">
                <span>Ngày chốt sao kê</span>
                <span className="tabular-nums">Ngày {account.statement_day}</span>
              </div>
            )}
            {account.payment_due_day != null && (
              <div className="flex items-center justify-between text-gray-400 dark:text-gray-500">
                <span>Ngày đến hạn</span>
                <span className="tabular-nums">Ngày {account.payment_due_day}</span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Lịch sử cập nhật giá trị (tài khoản đầu tư) */}
      {isInvestment && accountValuations.length > 0 && (
        <section className="mb-3 overflow-hidden rounded-xl bg-white dark:bg-gray-900 shadow-sm">
          <h2 className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Lịch sử giá trị
          </h2>
          <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
            {accountValuations.map((v) => (
              <li key={v.id} className="flex items-center gap-2 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium tabular-nums text-gray-800 dark:text-gray-100">
                    {formatMoney(v.market_value, currency)}
                  </span>
                  <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{v.valued_on}</span>
                  {v.note && (
                    <span className="block truncate text-xs text-gray-400 dark:text-gray-500">{v.note}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Xóa bản ghi giá trị này?')) deleteValuation.mutate(v.id)
                  }}
                  className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-800"
                  aria-label="Xóa bản ghi giá trị"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

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
      {showValuation && account && (
        <ValuationFormSheet
          account={account}
          currentValue={invStats.marketValue}
          onClose={() => setShowValuation(false)}
        />
      )}
      {showReconcile && account && (
        <ReconcileSheet
          account={account}
          currentBalance={balance}
          onClose={() => setShowReconcile(false)}
        />
      )}
    </div>
  )
}
