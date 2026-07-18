import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  useDebtPayments,
  useDebts,
  useDeleteDebt,
  useDeleteDebtPayment,
  useUpdateDebt,
} from '../../hooks/queries'
import { formatMoney } from '../../lib/money'
import { DebtFormSheet } from './DebtFormSheet'
import { DebtPaymentSheet } from './DebtPaymentSheet'
import { paidOf, remainingOf } from './aggregate'

export function DebtDetailPage() {
  const { debtId = '' } = useParams()
  const navigate = useNavigate()
  const { data: debts = [], isLoading } = useDebts()
  const { data: allPayments = [] } = useDebtPayments()
  const updateDebt = useUpdateDebt()
  const deleteDebt = useDeleteDebt()
  const deletePayment = useDeleteDebtPayment()

  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState(false)

  const debt = debts.find((d) => d.id === debtId)
  const payments = useMemo(
    () => allPayments.filter((p) => p.debt_id === debtId),
    [allPayments, debtId],
  )

  if (!debt) {
    return (
      <div className="p-6 text-center text-sm text-gray-400">
        {isLoading ? 'Đang tải…' : 'Không tìm thấy khoản nợ.'}
        {!isLoading && (
          <div className="mt-3">
            <Link to="/settings/debts" className="text-green-700 underline">
              Về danh sách
            </Link>
          </div>
        )}
      </div>
    )
  }

  const remaining = Math.max(remainingOf(debt, allPayments), 0)
  const paid = paidOf(debt.id, allPayments)
  const isMine = debt.direction === 'i_owe'
  const dirLabel = isMine ? 'Mình nợ' : 'Cho vay'
  const fullyPaid = remaining <= 0

  async function handleDelete() {
    if (!window.confirm(`Xóa khoản nợ "${debt!.counterparty}"? Mọi lần trả liên kết cũng bị xóa.`))
      return
    await deleteDebt.mutateAsync(debt!.id)
    navigate('/settings/debts')
  }

  async function toggleSettled() {
    await updateDebt.mutateAsync({
      id: debt!.id,
      patch: { status: debt!.status === 'open' ? 'settled' : 'open' },
    })
  }

  async function handleDeletePayment(id: string, hasTx: boolean) {
    const msg = hasTx
      ? 'Xóa lần trả này? Giao dịch liên kết cũng bị xóa (số dư tài khoản sẽ hoàn lại).'
      : 'Xóa lần trả này?'
    if (!window.confirm(msg)) return
    await deletePayment.mutateAsync(id)
  }

  return (
    <div className="p-3 lg:p-6">
      <div className="mb-3 flex items-center gap-2">
        <Link
          to="/settings/debts"
          className="rounded-lg bg-white px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Quay lại"
        >
          ←
        </Link>
        <h1 className="flex-1 truncate text-lg font-bold text-gray-800">{debt.counterparty}</h1>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-600 shadow-sm active:scale-95"
        >
          Sửa
        </button>
      </div>

      {/* Thẻ tổng quan */}
      <section
        className={`rounded-2xl p-5 text-white shadow-md ${
          isMine ? 'bg-gradient-to-br from-rose-500 to-red-600' : 'bg-gradient-to-br from-green-600 to-emerald-700'
        }`}
      >
        <p className="text-sm font-medium text-white/85">
          {dirLabel}
          {debt.status === 'settled' && ' · đã tất toán'}
        </p>
        <p className="mt-1 text-[2rem] font-bold leading-none tabular-nums">
          {formatMoney(remaining, debt.currency)}
        </p>
        <p className="mt-2 text-xs text-white/80">
          còn lại · gốc {formatMoney(debt.principal, debt.currency)} · đã trả{' '}
          {formatMoney(paid, debt.currency)}
        </p>
        {debt.due_on && <p className="mt-1 text-xs text-white/80">Hạn: {debt.due_on}</p>}
        {debt.note && <p className="mt-1 text-xs text-white/80">{debt.note}</p>}
      </section>

      {/* Hành động */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPaying(true)}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white active:scale-95"
        >
          + Ghi nhận trả
        </button>
        <button
          type="button"
          onClick={toggleSettled}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm active:scale-95"
        >
          {debt.status === 'open' ? 'Đánh dấu tất toán' : 'Mở lại'}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Xóa
        </button>
      </div>

      {debt.status === 'open' && fullyPaid && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
          Đã trả đủ. Bạn có thể "Đánh dấu tất toán" để đưa khoản này ra khỏi tổng nợ.
        </p>
      )}

      {/* Lịch sử trả */}
      <h2 className="mb-2 mt-5 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Lịch sử trả ({payments.length})
      </h2>
      <div className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-sm">
        {payments.map((p) => (
          <div key={p.id} className="flex items-center gap-2 px-3 py-2.5">
            <span className="text-base">{p.transaction_id ? '💸' : '📝'}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-800">
                {formatMoney(p.amount, debt.currency)}
                {!p.transaction_id && (
                  <span className="ml-1 text-[10px] font-normal text-gray-400">(ghi nhận suông)</span>
                )}
              </p>
              <p className="truncate text-xs text-gray-400">
                {p.paid_on}
                {p.note && ` · ${p.note}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleDeletePayment(p.id, !!p.transaction_id)}
              className="rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-gray-100"
            >
              Xóa
            </button>
          </div>
        ))}
        {payments.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-gray-400">Chưa có lần trả nào</p>
        )}
      </div>

      {editing && <DebtFormSheet debt={debt} onClose={() => setEditing(false)} />}
      {paying && (
        <DebtPaymentSheet debt={debt} remaining={remaining} onClose={() => setPaying(false)} />
      )}
    </div>
  )
}
