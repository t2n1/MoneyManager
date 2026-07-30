import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { useDebtPayments, useDebts, useRates } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { CURRENCIES, formatMoney } from '../../lib/money'
import type { DebtRow } from '../../types/database.types'
import { debtSummary, disbursedOf, remainingOf } from './aggregate'

export function DebtsPage() {
  const { data: debts = [], isLoading } = useDebts()
  const { data: payments = [] } = useDebtPayments()
  const { base, rates } = useRates()
  const [showSettled, setShowSettled] = useState(false)

  const summary = useMemo(
    () => debtSummary(debts, payments, base, rates ?? {}),
    [debts, payments, base, rates],
  )

  const open = debts.filter((d) => d.status === 'open')
  const settled = debts.filter((d) => d.status === 'settled')
  const iOwe = open.filter((d) => d.direction === 'i_owe')
  const owedToMe = open.filter((d) => d.direction === 'owed_to_me')
  const approx = summary.hasMissingRate ? '≈ ' : ''

  return (
    <div className="p-3 lg:p-6">
      <div className="mb-3 flex items-center gap-2">
        <Link
          to="/assets"
          className="rounded-lg bg-surface px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Quay lại Tài sản"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-lg font-bold text-fg-primary">Nợ / cho vay</h1>
        <Link
          to="/entry?role=debt"
          className="rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
        >
          + Thêm
        </Link>
      </div>

      {/* Tổng quan quy đổi base */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface p-4 shadow-sm">
          <p className="text-xs font-medium text-fg-muted">Mình nợ</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-money-out">
            {isLoading ? '…' : `${approx}${formatMoney(summary.iOwe, base)}`}
          </p>
        </div>
        <div className="rounded-2xl bg-surface p-4 shadow-sm">
          <p className="text-xs font-medium text-fg-muted">Cho vay</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-money-in">
            {isLoading ? '…' : `${approx}${formatMoney(summary.owedToMe, base)}`}
          </p>
        </div>
      </div>
      {summary.hasOpen && (
        <p className="-mt-2 mb-4 px-1 text-xs text-fg-muted">
          {summary.net < 0 ? 'Nợ ròng' : 'Cho vay ròng'} {approx}
          {formatMoney(Math.abs(summary.net), base)} · quy đổi {CURRENCIES[base].label}
          {summary.hasMissingRate && ' · một phần chưa có tỷ giá'}
        </p>
      )}

      <DebtSection
        title="Mình nợ"
        emptyLabel="Không có khoản nào bạn đang nợ"
        debts={iOwe}
        payments={payments}
        loading={isLoading}
      />
      <DebtSection
        title="Người ta nợ mình"
        emptyLabel="Chưa cho ai vay"
        debts={owedToMe}
        payments={payments}
        loading={isLoading}
      />

      {settled.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowSettled((v) => !v)}
            className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-fg-muted"
          >
            {showSettled ? 'Ẩn đã tất toán' : `Đã tất toán (${settled.length})`}
            {showSettled ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showSettled && (
            <div className="divide-y divide-border-subtle overflow-hidden rounded-xl bg-surface shadow-sm">
              {settled.map((d) => (
                <Link
                  key={d.id}
                  to={`/debts/${d.id}`}
                  className="flex items-center gap-2 px-3 py-2.5 opacity-70 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-300 line-through">
                    {d.counterparty}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-fg-muted">
                    {formatMoney(disbursedOf(d, payments), d.currency)}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface SectionProps {
  title: string
  emptyLabel: string
  debts: DebtRow[]
  payments: Parameters<typeof remainingOf>[1]
  loading: boolean
}

function DebtSection({ title, emptyLabel, debts, payments, loading }: SectionProps) {
  return (
    <section className="mb-4">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {title}
      </h2>
      <div className="divide-y divide-border-subtle overflow-hidden rounded-xl bg-surface shadow-sm">
        {debts.map((d) => {
          const remaining = Math.max(remainingOf(d, payments), 0)
          const disbursed = disbursedOf(d, payments)
          const paidRatio = disbursed > 0 ? 1 - remaining / disbursed : 0
          const overdue = isOverdue(d)
          return (
            <Link
              key={d.id}
              to={`/debts/${d.id}`}
              className="block px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-800"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg-primary">
                  {d.counterparty}
                  {d.note && <span className="ml-1 text-xs font-normal text-fg-muted">· {d.note}</span>}
                </span>
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    d.direction === 'i_owe' ? 'text-money-out' : 'text-money-in'
                  }`}
                >
                  {formatMoney(remaining, d.currency)}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className="h-full rounded-full bg-gray-300"
                    style={{ width: `${Math.min(Math.max(paidRatio * 100, 0), 100)}%` }}
                  />
                </div>
                <span className="shrink-0 text-xs text-fg-muted">
                  gốc {formatMoney(disbursed, d.currency)}
                </span>
                {d.due_on && (
                  <span
                    className={`shrink-0 rounded px-1 text-xs ${
                      overdue ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-surface-sunken text-fg-on-track'
                    }`}
                  >
                    hạn {d.due_on.slice(5)}
                  </span>
                )}
              </div>
            </Link>
          )
        })}
        {debts.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-fg-muted">
            {loading ? 'Đang tải…' : emptyLabel}
          </p>
        )}
      </div>
    </section>
  )
}

function isOverdue(d: DebtRow): boolean {
  if (!d.due_on || d.status !== 'open') return false
  return d.due_on < toISODate(new Date())
}
