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
  useRangeTransactions,
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
import { depreciate } from './depreciation'
import { investmentStats } from './investment'
import { shelterUsage, TAX_SHELTER_LABELS } from './shelter'
import { ReconcileSheet } from './ReconcileSheet'
import { ValuationFormSheet } from './ValuationFormSheet'
import { confirmDialog } from '../../lib/dialog'

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
  const isFixed = account?.type === 'fixed'
  // Đầu tư: vốn gốc = balance (sổ), giá thị trường = snapshot mới nhất (view market_value)
  const invStats = investmentStats(balance, isInvestment ? (balanceRow?.market_value ?? null) : null)

  const todayISO = toISODate(new Date())
  // Tài sản cố định: khấu hao tuyến tính (chỉ hiển thị, giá trị nhập tay vẫn thắng)
  const dep = isFixed
    ? depreciate({
        costBasis: account?.initial_balance ?? 0,
        salvageValue: account?.salvage_value ?? 0,
        months: account?.depreciation_months ?? null,
        fromISO: account?.depreciation_from ?? null,
        todayISO,
      })
    : null

  // Hạn mức nạp NISA/iDeCo — đếm chuyển khoản vào tài khoản trong năm dương lịch
  const shelterYear = Number(todayISO.slice(0, 4))
  const { data: yearTxs = [] } = useRangeTransactions(
    { start: `${shelterYear}-01-01`, end: `${shelterYear + 1}-01-01` },
    !!account?.tax_shelter,
  )
  const shelter = shelterUsage(
    accountId,
    yearTxs,
    shelterYear,
    account?.shelter_annual_limit ?? null,
  )
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
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-lg shadow-sm active:scale-95"
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
            : isInvestment || isFixed
              ? 'Giá trị hiện tại'
              : 'Số dư hiện tại'}
        </p>
        <p
          className={`mt-1 text-2xl font-bold ${balance < 0 ? 'text-money-out' : 'text-gray-900 dark:text-gray-100'}`}
        >
          {account?.type === 'card'
            ? balance < 0
              ? `− ${formatMoney(-balance, currency)}`
              : formatMoney(0, currency)
            : isInvestment
              ? formatMoney(invStats.marketValue ?? balance, currency)
              : isFixed
                ? // Định giá nhập tay thắng công thức khấu hao
                  formatMoney(balanceRow?.market_value ?? dep?.currentValue ?? balance, currency)
                : formatMoney(balance, currency)}
        </p>
        {account?.asset_group && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Nhóm: {account.asset_group}</p>
        )}

        {/* Điều chỉnh số dư (mục X) — cho ví/tài khoản thường và thẻ; đầu tư và tài
            sản cố định đi đường "Cập nhật giá trị" (định giá theo ngày) thay vì bù */}
        {account && !isInvestment && !isFixed && (
          <button
            type="button"
            onClick={() => setShowReconcile(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-95"
          >
            <Scale className="h-3.5 w-3.5" />{' '}
            {account.type === 'card' ? 'Điều chỉnh số nợ' : 'Điều chỉnh số dư'}
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
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Chưa cập nhật giá thị trường — đang tính theo vốn gốc.
              </p>
            ) : (
              <div
                className={`flex items-center justify-between font-medium ${
                  invStats.unrealizedPnl >= 0
                    ? 'text-money-in'
                    : 'text-money-out'
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
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
            >
              <LineChart className="h-3.5 w-3.5" /> Cập nhật giá trị
            </button>
          </div>
        )}

        {/* Hạn mức nạp NISA / iDeCo trong năm */}
        {isInvestment && account?.tax_shelter && (
          <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-gray-500 dark:text-gray-400">
                {TAX_SHELTER_LABELS[account.tax_shelter]}
              </span>
              <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                năm {shelterYear}
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className={`h-full rounded-full ${
                  (shelter.ratio ?? 0) >= 1 ? 'bg-amber-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(100, (shelter.ratio ?? 0) * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-300">
              Đã nạp <b>{formatMoney(shelter.used, currency)}</b>
              {shelter.limit !== null && <> / {formatMoney(shelter.limit, currency)}</>}
              {shelter.remaining !== null && shelter.remaining > 0 && (
                <>
                  {' '}
                  · còn <b>{formatMoney(shelter.remaining, currency)}</b> hạn mức năm nay
                </>
              )}
              {shelter.remaining === 0 && <> · đã dùng hết hạn mức</>}
            </p>
            <p className="mt-0.5 text-[0.6875rem] text-gray-500 dark:text-gray-400">
              Hạn mức tính theo năm dương lịch và không dồn sang năm sau. Rút tiền ra giữa năm cũng
              không hoàn lại phần hạn mức đã dùng.
            </p>
          </div>
        )}

        {/* Tài sản cố định: khấu hao */}
        {isFixed && (
          <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 text-sm dark:border-gray-800">
            <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
              <span>Giá mua</span>
              <span className="font-medium tabular-nums text-gray-800 dark:text-gray-100">
                {formatMoney(account?.initial_balance ?? 0, currency)}
              </span>
            </div>
            {dep ? (
              <>
                <div className="flex items-center justify-between font-medium text-money-out">
                  <span>Đã khấu hao</span>
                  <span className="tabular-nums">
                    − {formatMoney(dep.accumulated, currency)}
                    <span className="ml-1 text-xs">({Math.round(dep.elapsedRatio * 100)}%)</span>
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {dep.monthsLeft > 0
                    ? `Còn ${dep.monthsLeft} tháng nữa là hết vòng đời khấu hao.`
                    : 'Đã hết vòng đời khấu hao — giá trị giữ ở mức còn lại.'}
                </p>
              </>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Chưa đặt ngày mua / số tháng khấu hao nên giá trị giữ nguyên theo sổ. Sửa tài khoản
                để bật khấu hao tự động.
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowValuation(true)}
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
            >
              <LineChart className="h-3.5 w-3.5" /> Cập nhật giá trị thực tế
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
                <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
                  <span>Hạn mức</span>
                  <span className="tabular-nums">{formatMoney(account.credit_limit, currency)}</span>
                </div>
              </>
            )}
            {account.statement_day != null && (
              <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
                <span>Ngày chốt sao kê</span>
                <span className="tabular-nums">Ngày {account.statement_day}</span>
              </div>
            )}
            {account.payment_due_day != null && (
              <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
                <span>Ngày đến hạn</span>
                <span className="tabular-nums">Ngày {account.payment_due_day}</span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Lịch sử cập nhật giá trị (tài khoản đầu tư) */}
      {(isInvestment || isFixed) && accountValuations.length > 0 && (
        <section className="mb-3 overflow-hidden rounded-xl bg-white dark:bg-gray-900 shadow-sm">
          <h2 className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Lịch sử giá trị
          </h2>
          <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
            {accountValuations.map((v) => (
              <li key={v.id} className="flex items-center gap-2 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium tabular-nums text-gray-800 dark:text-gray-100">
                    {formatMoney(v.market_value, currency)}
                  </span>
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{v.valued_on}</span>
                  {v.note && (
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{v.note}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (await confirmDialog({ title: 'Xóa bản ghi giá trị này?', danger: true, confirmLabel: 'Xóa' }))
                      deleteValuation.mutate(v.id)
                  }}
                  className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-red-400"
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
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-lg shadow-sm active:scale-95"
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
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-lg shadow-sm active:scale-95"
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
        <p className="py-10 text-center text-gray-500 dark:text-gray-400">Không có giao dịch trong tháng này</p>
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
