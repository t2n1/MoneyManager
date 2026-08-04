import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, LineChart, Scale, Trash2 } from 'lucide-react'
import { AccountTypeIcon } from '../../components/icons'
import { Card, IconButton, Money, SectionTitle, iconButtonClass } from '../../components/ui'
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
  dueDateLabel,
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
import { useCardStatements } from './useCardStatements'
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
  // Thẻ tín dụng: tách kỳ đã chốt (sắp bị rút) khỏi phần chưa chốt. Số lớn phía
  // trên vẫn là TỔNG nợ — hai dòng này nói rõ tổng đó chia ra sao.
  const cardForSplit = useMemo(
    () =>
      account?.type === 'card'
        ? [
            {
              id: accountId,
              balance,
              statementDay: account.statement_day,
              paymentDueDay: account.payment_due_day,
            },
          ]
        : [],
    [account?.type, account?.statement_day, account?.payment_due_day, accountId, balance],
  )
  const cardStatement = useCardStatements(cardForSplit, todayISO).get(accountId)

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
        <Link to="/assets" className={iconButtonClass()} aria-label="Quay lại">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 truncate text-lg font-bold text-fg-primary">
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
      <Card as="section" padding="lg" className="mb-3">
        <p className="text-sm font-medium text-fg-muted">
          {account?.type === 'card'
            ? 'Đang nợ thẻ'
            : isInvestment || isFixed
              ? 'Giá trị hiện tại'
              : 'Số dư hiện tại'}
        </p>
        {/* Tô màu vẫn theo `balance` (số sổ) chứ không theo con số đang hiện: với tài
            khoản đầu tư/cố định, số hiện là giá thị trường nhưng "âm hay không" là
            chuyện của số dư sổ. Giữ đúng hành vi cũ. */}
        <p className="mt-1 text-2xl font-bold">
          {account?.type === 'card' ? (
            <Money
              amount={balance < 0 ? -balance : 0}
              currency={currency}
              tone={balance < 0 ? 'out' : 'neutral'}
              showSign={balance < 0}
            />
          ) : (
            <Money
              amount={
                isInvestment
                  ? (invStats.marketValue ?? balance)
                  : isFixed
                    ? // Định giá nhập tay thắng công thức khấu hao
                      (balanceRow?.market_value ?? dep?.currentValue ?? balance)
                    : balance
              }
              currency={currency}
              tone={balance < 0 ? 'out' : 'neutral'}
            />
          )}
        </p>
        {account?.asset_group && (
          <p className="mt-1 text-xs text-fg-muted">Nhóm: {account.asset_group}</p>
        )}

        {/* Điều chỉnh số dư (mục X) — cho ví/tài khoản thường và thẻ; đầu tư và tài
            sản cố định đi đường "Cập nhật giá trị" (định giá theo ngày) thay vì bù */}
        {account && !isInvestment && !isFixed && (
          <button
            type="button"
            onClick={() => setShowReconcile(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-fg-secondary hover:bg-gray-50 dark:hover:bg-gray-800 active:scale-95"
          >
            <Scale className="h-3.5 w-3.5" />{' '}
            {account.type === 'card' ? 'Điều chỉnh số nợ' : 'Điều chỉnh số dư'}
          </button>
        )}

        {isInvestment && (
          <div className="mt-3 space-y-1.5 border-t border-border-subtle pt-3 text-sm">
            <div className="flex items-center justify-between text-fg-muted">
              <span>Vốn gốc (đã bỏ vào)</span>
              <Money
                amount={invStats.costBasis}
                currency={currency}
                className="font-medium text-fg-primary"
              />
            </div>
            {invStats.unrealizedPnl == null ? (
              <p className="text-xs text-fg-muted">
                Chưa cập nhật giá thị trường — đang tính theo vốn gốc.
              </p>
            ) : (
              <div className="flex items-center justify-between font-medium">
                <span
                  className={invStats.unrealizedPnl >= 0 ? 'text-money-in' : 'text-money-out'}
                >
                  Lãi/lỗ chưa thực hiện
                </span>
                <span>
                  {/* Dấu ASCII của <Money> thay cho '−' (U+2212) viết tay: trang này
                      trước đó trộn cả hai, mà formatMoney tự in '-' nên bề rộng chữ
                      số lệch nhau dù đã tabular-nums. */}
                  <Money
                    amount={Math.abs(invStats.unrealizedPnl)}
                    currency={currency}
                    tone={invStats.unrealizedPnl >= 0 ? 'in' : 'out'}
                    showSign
                  />
                  {invStats.pnlPercent != null && (
                    <span
                      className={`ml-1 text-xs tabular-nums ${invStats.unrealizedPnl >= 0 ? 'text-money-in' : 'text-money-out'}`}
                    >
                      ({invStats.unrealizedPnl >= 0 ? '+' : '-'}
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
          <div className="mt-3 border-t border-border-subtle pt-3">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-fg-muted">
                {TAX_SHELTER_LABELS[account.tax_shelter]}
              </span>
              <span className="shrink-0 text-xs text-fg-muted">
                năm {shelterYear}
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
              <div
                className={`h-full rounded-full ${
                  (shelter.ratio ?? 0) >= 1 ? 'bg-amber-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(100, (shelter.ratio ?? 0) * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-fg-secondary">
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
            <p className="mt-0.5 text-2xs text-fg-muted">
              Hạn mức tính theo năm dương lịch và không dồn sang năm sau. Rút tiền ra giữa năm cũng
              không hoàn lại phần hạn mức đã dùng.
            </p>
          </div>
        )}

        {/* Tài sản cố định: khấu hao */}
        {isFixed && (
          <div className="mt-3 space-y-1.5 border-t border-border-subtle pt-3 text-sm">
            <div className="flex items-center justify-between text-fg-muted">
              <span>Giá mua</span>
              <Money
                amount={account?.initial_balance ?? 0}
                currency={currency}
                className="font-medium text-fg-primary"
              />
            </div>
            {dep ? (
              <>
                <div className="flex items-center justify-between font-medium text-money-out">
                  <span>Đã khấu hao</span>
                  <span>
                    <Money amount={dep.accumulated} currency={currency} tone="out" showSign />
                    <span className="ml-1 text-xs tabular-nums">
                      ({Math.round(dep.elapsedRatio * 100)}%)
                    </span>
                  </span>
                </div>
                <p className="text-xs text-fg-muted">
                  {dep.monthsLeft > 0
                    ? `Còn ${dep.monthsLeft} tháng nữa là hết vòng đời khấu hao.`
                    : 'Đã hết vòng đời khấu hao — giá trị giữ ở mức còn lại.'}
                </p>
              </>
            ) : (
              <p className="text-xs text-fg-muted">
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
          <div className="mt-3 space-y-1.5 border-t border-border-subtle pt-3 text-sm">
            {/* Chia kỳ đứng TRƯỚC hạn mức: câu hỏi "sắp mất bao nhiêu" gấp hơn
                "còn quẹt được bao nhiêu". Chỉ hiện khi đủ ngày chốt + ngày trả. */}
            {cardStatement?.billed != null && cardStatement.dueISO && (
              <>
                <div className="flex items-center justify-between text-fg-muted">
                  <span>Kỳ này · đến hạn {dueDateLabel(cardStatement.dueISO)}</span>
                  <Money
                    amount={cardStatement.billed}
                    currency={currency}
                    tone={cardStatement.billed > 0 ? 'out' : 'neutral'}
                    className="font-semibold"
                  />
                </div>
                {(cardStatement.unbilled ?? 0) > 0 && (
                  <div className="flex items-center justify-between text-fg-muted">
                    <span>Chưa chốt · kỳ sau mới đòi</span>
                    <Money
                      amount={cardStatement.unbilled ?? 0}
                      currency={currency}
                      className="font-medium text-fg-primary"
                    />
                  </div>
                )}
              </>
            )}
            {account.credit_limit != null && (
              <>
                <div className="flex items-center justify-between text-fg-muted">
                  <span>Còn dùng được</span>
                  <Money
                    amount={account.credit_limit - (balance < 0 ? -balance : 0)}
                    currency={currency}
                    className="font-medium text-fg-primary"
                  />
                </div>
                <div className="flex items-center justify-between text-fg-muted">
                  <span>Hạn mức</span>
                  {/* Không đặt text-fg-primary: dòng này cố ý mờ hơn dòng trên */}
                  <Money amount={account.credit_limit} currency={currency} className="text-fg-muted" />
                </div>
              </>
            )}
            {account.statement_day != null && (
              <div className="flex items-center justify-between text-fg-muted">
                <span>Ngày chốt sao kê</span>
                <span className="tabular-nums">Ngày {account.statement_day}</span>
              </div>
            )}
            {account.payment_due_day != null && (
              <div className="flex items-center justify-between text-fg-muted">
                <span>Ngày đến hạn</span>
                <span className="tabular-nums">Ngày {account.payment_due_day}</span>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Lịch sử cập nhật giá trị (tài khoản đầu tư) */}
      {(isInvestment || isFixed) && accountValuations.length > 0 && (
        <Card as="section" padding="none" className="mb-3 overflow-hidden">
          <SectionTitle className="px-4 pt-3">Lịch sử giá trị</SectionTitle>
          <ul className="mt-2 divide-y divide-border-subtle">
            {accountValuations.map((v) => (
              <li key={v.id} className="flex items-center gap-2 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <Money
                    amount={v.market_value}
                    currency={currency}
                    className="text-sm font-medium"
                  />
                  <span className="ml-2 text-xs text-fg-muted">{v.valued_on}</span>
                  {v.note && <span className="block truncate text-xs text-fg-muted">{v.note}</span>}
                </div>
                <IconButton
                  variant="ghost"
                  onClick={async () => {
                    if (await confirmDialog({ title: 'Xóa bản ghi giá trị này?', danger: true, confirmLabel: 'Xóa' }))
                      deleteValuation.mutate(v.id)
                  }}
                  className="shrink-0 hover:text-money-out"
                  aria-label="Xóa bản ghi giá trị"
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Chuyển tháng */}
      <div className="mb-3 flex items-center gap-2">
        <IconButton
          onClick={() => setMonthKey((k) => addMonths(k ?? activeMonthKey, -1))}
          aria-label="Tháng trước"
        >
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
        <h2 className="flex-1 text-center text-sm font-bold text-fg-primary">
          {formatMonthLabel(activeMonthKey)}
        </h2>
        <IconButton
          onClick={() => setMonthKey((k) => addMonths(k ?? activeMonthKey, 1))}
          aria-label="Tháng sau"
        >
          <ChevronRight className="h-5 w-5" />
        </IconButton>
      </div>

      {/* Lịch sử giao dịch trong tháng */}
      <p className="mb-2 px-1 text-xs text-fg-muted">
        {isLoading ? 'Đang tải…' : `${results.length} giao dịch`}
      </p>
      {days.length === 0 && !isLoading ? (
        <p className="py-10 text-center text-fg-muted">Không có giao dịch trong tháng này</p>
      ) : (
        days.map(([day, txs]) => (
          <section key={day} className="mb-3">
            <div className="mb-1 px-1 text-xs font-medium text-fg-muted">{day}</div>
            <Card padding="none" className="divide-y divide-border-subtle overflow-hidden">
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
            </Card>
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
