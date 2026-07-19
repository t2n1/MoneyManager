import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Banknote, ChevronLeft, ChevronRight, PenLine } from 'lucide-react'
import {
  useDebtPayments,
  useDebts,
  useDeleteDebt,
  useDeleteDebtPayment,
  useTransaction,
  useUpdateDebt,
} from '../../hooks/queries'
import { formatMoney } from '../../lib/money'
import { EditTransactionSheet } from '../transactions/EditTransactionSheet'
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
  const [viewingTxId, setViewingTxId] = useState<string | null>(null)

  const debt = debts.find((d) => d.id === debtId)
  const payments = useMemo(
    () => allPayments.filter((p) => p.debt_id === debtId),
    [allPayments, debtId],
  )

  if (!debt) {
    return (
      <div className="p-6 text-center text-sm text-gray-400 dark:text-gray-500">
        {isLoading ? 'Đang tải…' : 'Không tìm thấy khoản nợ.'}
        {!isLoading && (
          <div className="mt-3">
            <Link to="/settings/debts" className="text-green-700 dark:text-green-400 underline">
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
          className="rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Quay lại"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 truncate text-lg font-bold text-gray-800 dark:text-gray-100">{debt.counterparty}</h1>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 shadow-sm active:scale-95"
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
          className="rounded-lg bg-white dark:bg-gray-900 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm active:scale-95"
        >
          {debt.status === 'open' ? 'Đánh dấu tất toán' : 'Mở lại'}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
        >
          Xóa
        </button>
      </div>

      {debt.status === 'open' && fullyPaid && (
        <p className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 p-3 text-xs text-amber-700 dark:text-amber-300">
          Đã trả đủ. Bạn có thể "Đánh dấu tất toán" để đưa khoản này ra khỏi tổng nợ.
        </p>
      )}

      {/* Lịch sử trả */}
      <h2 className="mb-2 mt-5 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        Lịch sử trả ({payments.length})
      </h2>
      <div className="divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden rounded-xl bg-white dark:bg-gray-900 shadow-sm">
        {payments.map((p) => {
          const info = (
            <>
              {p.transaction_id ? <Banknote className="h-4 w-4" /> : <PenLine className="h-4 w-4" />}
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                  {formatMoney(p.amount, debt.currency)}
                  {!p.transaction_id && (
                    <span className="ml-1 text-[10px] font-normal text-gray-400 dark:text-gray-500">(ghi nhận suông)</span>
                  )}
                </p>
                <p className="truncate text-xs text-gray-400 dark:text-gray-500">
                  {p.paid_on}
                  {p.note && ` · ${p.note}`}
                </p>
              </div>
              {p.transaction_id && <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600" />}
            </>
          )
          return (
            <div key={p.id} className="flex items-center gap-2 px-3 py-2.5">
              {p.transaction_id ? (
                <button
                  type="button"
                  onClick={() => setViewingTxId(p.transaction_id)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg -mx-1 px-1 py-0.5 active:scale-[0.99] hover:bg-gray-50 dark:hover:bg-gray-800"
                  aria-label="Xem giao dịch liên kết"
                >
                  {info}
                </button>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-2">{info}</div>
              )}
              <button
                type="button"
                onClick={() => handleDeletePayment(p.id, !!p.transaction_id)}
                className="rounded-lg px-2 py-1 text-xs text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Xóa
              </button>
            </div>
          )
        })}
        {payments.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-gray-400 dark:text-gray-500">Chưa có lần trả nào</p>
        )}
      </div>

      {editing && <DebtFormSheet debt={debt} onClose={() => setEditing(false)} />}
      {paying && (
        <DebtPaymentSheet debt={debt} remaining={remaining} onClose={() => setPaying(false)} />
      )}
      {viewingTxId && (
        <PaymentTxSheet txId={viewingTxId} onClose={() => setViewingTxId(null)} />
      )}
    </div>
  )
}

/** Nạp giao dịch liên kết theo id rồi mở sheet sửa quen thuộc. */
function PaymentTxSheet({ txId, onClose }: { txId: string; onClose: () => void }) {
  const { data: tx, isLoading } = useTransaction(txId)
  // Giao dịch đã bị xóa nơi khác — báo nhẹ rồi đóng (đặt trong effect, không side-effect khi render).
  const missing = !isLoading && !tx
  useEffect(() => {
    if (missing) {
      window.alert('Giao dịch liên kết không còn tồn tại (có thể đã bị xóa).')
      onClose()
    }
  }, [missing, onClose])
  if (!tx) return null
  return <EditTransactionSheet tx={tx} onClose={onClose} />
}
