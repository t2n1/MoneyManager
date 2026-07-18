import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDebtPayments, useDebts, useRates } from '../../hooks/queries'
import { CURRENCIES, formatMoney } from '../../lib/money'
import type { DebtRow } from '../../types/database.types'
import { DebtFormSheet } from './DebtFormSheet'
import { debtSummary, remainingOf } from './aggregate'

export function DebtsPage() {
  const { data: debts = [], isLoading } = useDebts()
  const { data: payments = [] } = useDebtPayments()
  const { base, rates } = useRates()
  const [adding, setAdding] = useState(false)
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
          to="/settings"
          className="rounded-lg bg-white px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Quay lại"
        >
          ←
        </Link>
        <h1 className="flex-1 text-lg font-bold text-gray-800">Nợ / cho vay</h1>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
        >
          + Thêm
        </button>
      </div>

      {/* Tổng quan quy đổi base */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-400">Mình nợ</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-red-600">
            {isLoading ? '…' : `${approx}${formatMoney(summary.iOwe, base)}`}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-400">Cho vay</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-green-600">
            {isLoading ? '…' : `${approx}${formatMoney(summary.owedToMe, base)}`}
          </p>
        </div>
      </div>
      {summary.hasOpen && (
        <p className="-mt-2 mb-4 px-1 text-xs text-gray-400">
          Nợ ròng {approx}
          {formatMoney(summary.net, base)} · quy đổi {CURRENCIES[base].label}
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
            className="mb-2 text-xs font-medium text-gray-500"
          >
            {showSettled ? 'Ẩn đã tất toán ▲' : `Đã tất toán (${settled.length}) ▼`}
          </button>
          {showSettled && (
            <div className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-sm">
              {settled.map((d) => (
                <Link
                  key={d.id}
                  to={`/settings/debts/${d.id}`}
                  className="flex items-center gap-2 px-3 py-2.5 opacity-70 hover:bg-gray-50"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700 line-through">
                    {d.counterparty}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-gray-400">
                    {formatMoney(d.principal, d.currency)}
                  </span>
                  <span className="shrink-0 text-gray-300">›</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {adding && <DebtFormSheet debt={null} onClose={() => setAdding(false)} />}
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
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {title}
      </h2>
      <div className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-sm">
        {debts.map((d) => {
          const remaining = Math.max(remainingOf(d, payments), 0)
          const paidRatio = d.principal > 0 ? 1 - remaining / d.principal : 0
          const overdue = isOverdue(d)
          return (
            <Link
              key={d.id}
              to={`/settings/debts/${d.id}`}
              className="block px-3 py-2.5 hover:bg-gray-50 active:bg-gray-100"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">
                  {d.counterparty}
                  {d.note && <span className="ml-1 text-xs font-normal text-gray-400">· {d.note}</span>}
                </span>
                <span
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    d.direction === 'i_owe' ? 'text-red-600' : 'text-green-600'
                  }`}
                >
                  {formatMoney(remaining, d.currency)}
                </span>
                <span className="shrink-0 text-gray-300">›</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-gray-300"
                    style={{ width: `${Math.min(Math.max(paidRatio * 100, 0), 100)}%` }}
                  />
                </div>
                <span className="shrink-0 text-[11px] text-gray-400">
                  gốc {formatMoney(d.principal, d.currency)}
                </span>
                {d.due_on && (
                  <span
                    className={`shrink-0 rounded px-1 text-[10px] ${
                      overdue ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'
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
          <p className="px-3 py-6 text-center text-sm text-gray-400">
            {loading ? 'Đang tải…' : emptyLabel}
          </p>
        )}
      </div>
    </section>
  )
}

function isOverdue(d: DebtRow): boolean {
  if (!d.due_on || d.status !== 'open') return false
  return d.due_on < new Date().toISOString().slice(0, 10)
}
