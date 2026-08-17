import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Banknote, ChevronDown, ChevronRight, ChevronUp, PenLine } from 'lucide-react'
import { BackLink } from '../../components/BackLink'
import {
  useDebtPayments,
  useDebts,
  useDeleteDebt,
  useDeleteDebtPayment,
  useTransaction,
  useUpdateDebt,
} from '../../hooks/queries'
import { formatMoney } from '../../lib/money'
import { confirmDialog, showToast } from '../../lib/dialog'
import { EditTransactionSheet } from '../transactions/EditTransactionSheet'
import { DebtEditSheet } from './DebtEditSheet'
import { DebtPaymentSheet } from './DebtPaymentSheet'
import { disbursedOf, remainingOf, repaidOf } from './aggregate'
import { buildSchedule } from './amortization'
import type { DebtRow } from '../../types/database.types'
import { Card } from '../../components/ui'

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
      <div className="p-6 text-center text-sm text-fg-muted">
        {isLoading ? 'Đang tải…' : 'Không tìm thấy khoản nợ.'}
        {!isLoading && (
          <div className="mt-3">
            <Link to="/debts" className="text-fg-accent underline">
              Về danh sách
            </Link>
          </div>
        )}
      </div>
    )
  }

  const remaining = Math.max(remainingOf(debt, allPayments), 0)
  const paid = repaidOf(debt.id, allPayments)
  const disbursed = disbursedOf(debt, allPayments)
  const isMine = debt.direction === 'i_owe'
  const dirLabel = isMine ? 'Mình nợ' : 'Cho vay'
  const fullyPaid = remaining <= 0

  async function handleDelete() {
    if (
      !(await confirmDialog({
        title: `Xóa khoản nợ "${debt!.counterparty}"?`,
        message: 'Mọi lần trả liên kết cũng bị xóa.',
        danger: true,
        confirmLabel: 'Xóa',
      }))
    )
      return
    // try/catch: xóa hỏng thì Ở LẠI trang (toast lỗi toàn cục đã báo),
    // không điều hướng đi như thể đã xóa xong.
    try {
      await deleteDebt.mutateAsync(debt!.id)
    } catch {
      return
    }
    navigate('/debts')
  }

  async function toggleSettled() {
    // .catch: toast lỗi toàn cục đã báo; ở đây chỉ cần không unhandled rejection.
    await updateDebt
      .mutateAsync({
        id: debt!.id,
        patch: { status: debt!.status === 'open' ? 'settled' : 'open' },
      })
      .catch(() => {})
  }

  async function handleDeletePayment(id: string, hasTx: boolean) {
    const msg = hasTx
      ? 'Giao dịch liên kết cũng bị xóa (số dư tài khoản sẽ hoàn lại).'
      : undefined
    if (
      !(await confirmDialog({
        title: 'Xóa lần trả này?',
        message: msg,
        danger: true,
        confirmLabel: 'Xóa',
      }))
    )
      return
    await deletePayment.mutateAsync(id).catch(() => {})
  }

  return (
    <div className="p-3 lg:p-6">
      <div className="mb-3 flex items-center gap-2">
        <BackLink to="/debts" aria-label="Quay lại" />
        <h1 className="flex-1 truncate text-lg font-bold text-fg-primary">{debt.counterparty}</h1>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-lg bg-surface px-3 py-1.5 text-sm font-medium text-fg-secondary shadow-sm active:scale-95"
        >
          Sửa
        </button>
      </div>

      {/* Thẻ tổng quan */}
      <section
        className={`rounded-2xl p-5 text-white shadow-md ${
          isMine ? 'bg-gradient-to-br from-rose-600 to-red-700' : 'bg-gradient-to-br from-green-700 to-emerald-800'
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
          còn lại · gốc {formatMoney(disbursed, debt.currency)} · đã trả{' '}
          {formatMoney(paid, debt.currency)}
        </p>
        {debt.due_on && <p className="mt-1 text-xs text-white/80">Hạn: {debt.due_on}</p>}
        {debt.note && <p className="mt-1 text-xs text-white/80">{debt.note}</p>}
      </section>

      {/* Hành động chính */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPaying(true)}
          className="min-h-11 rounded-lg bg-accent text-fg-on-accent px-4 py-2 text-sm font-semibold active:scale-95"
        >
          + Ghi nhận trả
        </button>
        <button
          type="button"
          onClick={toggleSettled}
          className="min-h-11 rounded-lg bg-surface px-4 py-2 text-sm font-medium text-fg-secondary shadow-sm active:scale-95"
        >
          {debt.status === 'open' ? 'Đánh dấu tất toán' : 'Mở lại'}
        </button>
      </div>

      {/* Hành động phá hủy — tách riêng khỏi cụm chính để tránh bấm nhầm */}
      <div className="mt-3 border-t border-border-subtle pt-3">
        <button
          type="button"
          onClick={handleDelete}
          className="min-h-11 rounded-lg px-4 py-2 text-sm font-medium text-money-out hover:bg-state-bad-bg"
        >
          Xóa khoản nợ
        </button>
      </div>

      {debt.status === 'open' && fullyPaid && (
        <p className="mt-3 rounded-lg bg-state-warn-bg text-state-warn-fg p-3 text-xs">
          Đã trả đủ. Bạn có thể "Đánh dấu tất toán" để đưa khoản này ra khỏi tổng nợ.
        </p>
      )}

      {/* Lịch trả góp dự kiến (mục AG) — chỉ khi có lãi suất + số kỳ */}
      <AmortizationSection debt={debt} />

      {/* Lịch sử trả / cho vay thêm */}
      <h2 className="mb-2 mt-5 px-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        Lịch sử ({payments.length})
      </h2>
      <Card padding="none" className="divide-y divide-border-subtle overflow-hidden">
        {payments.map((p) => {
          // amount âm = lần giải ngân thêm (cho vay/vay tiếp); dương = trả bớt.
          const isAdvance = p.amount < 0
          const advanceLabel = isMine ? 'Vay thêm' : 'Cho vay thêm'
          const info = (
            <>
              {p.transaction_id ? <Banknote className="h-4 w-4" /> : <PenLine className="h-4 w-4" />}
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium text-fg-primary">
                  {isAdvance ? (
                    <span className="text-blue-600 dark:text-blue-400">
                      + {formatMoney(-p.amount, debt.currency)}
                      <span className="ml-1 text-3xs font-normal text-blue-500/80">{advanceLabel}</span>
                    </span>
                  ) : (
                    formatMoney(p.amount, debt.currency)
                  )}
                  {!p.transaction_id && (
                    <span className="ml-1 text-3xs font-normal text-fg-muted">(ghi nhận suông)</span>
                  )}
                </p>
                <p className="truncate text-xs text-fg-muted">
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
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg -mx-1 px-1 py-0.5 active:scale-[0.99] hover:bg-surface-sunken"
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
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg px-2 text-xs text-fg-muted hover:bg-surface-sunken"
              >
                Xóa
              </button>
            </div>
          )
        })}
        {payments.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-fg-muted">Chưa có lần trả nào</p>
        )}
      </Card>

      {editing && <DebtEditSheet debt={debt} onClose={() => setEditing(false)} />}
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
      showToast('Giao dịch liên kết không còn tồn tại (có thể đã bị xóa).', 'error')
      onClose()
    }
  }, [missing, onClose])
  if (!tx) return null
  return <EditTransactionSheet tx={tx} onClose={onClose} />
}

/** Lịch trả góp dự kiến (mục AG). Chỉ hiện khi khoản nợ có lãi suất + số kỳ.
 *  Là ước tính theo niên kim — số dư thực tế vẫn tính từ các lần trả đã ghi. */
function AmortizationSection({ debt }: { debt: DebtRow }) {
  const [open, setOpen] = useState(false)
  const bps = debt.interest_bps
  const term = debt.term_months
  const schedule = useMemo(() => {
    if (bps == null || term == null || term <= 0) return null
    const startISO = debt.due_on ?? debt.created_at.slice(0, 10)
    return buildSchedule({ principalMinor: debt.principal, bps, termMonths: term, startISO })
  }, [bps, term, debt.principal, debt.due_on, debt.created_at])

  if (!schedule) return null
  const cur = debt.currency

  return (
    <div className="mt-5">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        Lịch trả dự kiến
      </h2>
      <Card padding="lg">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-2xs text-fg-muted">Mỗi kỳ</p>
            <p className="text-sm font-semibold text-fg-primary">
              {formatMoney(schedule.monthly, cur)}
            </p>
          </div>
          <div>
            <p className="text-2xs text-fg-muted">Tổng lãi</p>
            <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
              {formatMoney(schedule.totalInterest, cur)}
            </p>
          </div>
          <div>
            <p className="text-2xs text-fg-muted">Tổng phải trả</p>
            <p className="text-sm font-semibold text-fg-primary">
              {formatMoney(schedule.totalPaid, cur)}
            </p>
          </div>
        </div>
        <p className="mt-2 text-2xs text-fg-muted">
          {(bps! / 100).toString()}%/năm · {term} kỳ · ước tính theo niên kim (thực tế có thể lệch chút)
        </p>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-fg-accent"
        >
          {open ? 'Ẩn chi tiết từng kỳ' : 'Xem chi tiết từng kỳ'}
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {open && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-right text-xs tabular-nums">
              <thead>
                <tr className="text-fg-muted">
                  <th className="py-1 pr-2 text-left font-medium">Kỳ</th>
                  <th className="py-1 px-2 font-medium">Ngày</th>
                  <th className="py-1 px-2 font-medium">Trả</th>
                  <th className="py-1 px-2 font-medium">Lãi</th>
                  <th className="py-1 pl-2 font-medium">Dư nợ</th>
                </tr>
              </thead>
              <tbody className="text-fg-secondary">
                {schedule.rows.map((r) => (
                  <tr key={r.index} className="border-t border-border-subtle">
                    <td className="py-1 pr-2 text-left">{r.index}</td>
                    <td className="py-1 px-2 text-fg-muted">{r.dueOn.slice(2)}</td>
                    <td className="py-1 px-2">{formatMoney(r.payment, cur)}</td>
                    <td className="py-1 px-2 text-rose-600 dark:text-rose-400">
                      {formatMoney(r.interest, cur)}
                    </td>
                    <td className="py-1 pl-2">{formatMoney(r.balance, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
