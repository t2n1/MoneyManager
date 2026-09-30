import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Banknote, ChevronDown, ChevronRight, ChevronUp, PenLine } from 'lucide-react'
import {
  useDebtPayments,
  useDebts,
  useDeleteDebt,
  useDeleteDebtPayment,
  useTransaction,
  useUpdateDebt,
} from '../../hooks/queries'
import { loadStatus, mergeLoad, pendingText } from '../../lib/loadStatus'
import { formatMoney } from '../../lib/money'
import { confirmDialog, showToast } from '../../lib/dialog'
import { EditTransactionSheet } from '../transactions/EditTransactionSheet'
import { DebtEditSheet } from './DebtEditSheet'
import { DebtPaymentSheet } from './DebtPaymentSheet'
import { debtBalance, disbursedOf, repaidOf } from './aggregate'
import { buildSchedule } from './amortization'
import type { DebtRow } from '../../types/database.types'
import { Card, EmptyState, Money, PageHeader, SectionTitle, actionButtonClass } from '../../components/ui'
import { formatDateLabel } from '../../lib/dates'
import { tr } from '../../i18n'

export function DebtDetailPage() {
  const { debtId = '' } = useParams()
  const navigate = useNavigate()
  const debtsQ = useDebts()
  const paymentsQ = useDebtPayments()
  const { data: debts = [] } = debtsQ
  const { data: allPayments = [] } = paymentsQ
  // Chờ CẢ các lần trả: bản trước chỉ chờ khoản nợ, nên vài giây đầu "còn lại" bằng nguyên
  // gốc và nút ghi trả bật cả với khoản đã trả xong.
  const load = mergeLoad(loadStatus(debtsQ), loadStatus(paymentsQ))
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

  if (load !== 'ready' || !debt) {
    const waiting = load === 'pending'
    return (
      <div className="p-6 text-center text-sm text-fg-muted">
        {load !== 'ready' ? pendingText(load) : tr('Không tìm thấy khoản nợ.')}
        {!waiting && (
          <div className="mt-3">
            <Link to="/debts" className="text-fg-accent underline">
              {tr('Về danh sách')}
            </Link>
          </div>
        )}
      </div>
    )
  }

  const { remaining, overpaid, paidOff } = debtBalance(debt, allPayments)
  const paid = repaidOf(debt.id, allPayments)
  const disbursed = disbursedOf(debt, allPayments)
  const isMine = debt.direction === 'i_owe'
  const dirLabel = isMine ? tr('Mình nợ') : tr('Cho vay')
  const fullyPaid = paidOff

  async function handleDelete() {
    if (
      !(await confirmDialog({
        title: tr('Xóa khoản nợ "{name}"?', { name: debt!.counterparty }),
        message: tr('Mọi lần trả liên kết cũng bị xóa.'),
        danger: true,
        confirmLabel: tr('Xóa'),
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
      ? tr('Giao dịch liên kết cũng bị xóa (số dư tài khoản sẽ hoàn lại).')
      : undefined
    if (
      !(await confirmDialog({
        title: tr('Xóa lần trả này?'),
        message: msg,
        danger: true,
        confirmLabel: tr('Xóa'),
      }))
    )
      return
    await deletePayment.mutateAsync(id).catch(() => {})
  }

  return (
    <div className="p-3 lg:p-6">
      <PageHeader title={debt.counterparty} back="/debts">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-md bg-surface px-3 py-1.5 text-sm font-medium text-fg-secondary shadow-sm transition active:scale-95"
        >
          {tr('Sửa')}
        </button>
      </PageHeader>

      {/* Thẻ tổng quan.
          Trước 2026-08-25 khối này là một tấm GRADIENT ĐẶC (rose-600 → red-700) với chữ
          trắng — thứ duy nhất kiểu đó trong cả app: 24 màn còn lại đều là thẻ xám trên
          nền tối. Nó cũng tự mang một bảng màu riêng (rose/emerald của Tailwind v3) thay
          vì token, nên không lật theo Sáng/Tối và không đi qua contrast.test.ts.
          Nay là <Card> như mọi thẻ khác; DẤU HIỆU nợ/cho vay chuyển từ NỀN sang chính con
          số, bằng đúng cặp token tiền của app (money-out / money-in). Ít ồn hơn mà vẫn
          đọc ra ngay chiều của khoản. */}
      <Card as="section" padding="lg">
        <SectionTitle role="micro">
          {dirLabel}
          {debt.status === 'settled' && tr(' · đã tất toán')}
        </SectionTitle>
        {overpaid > 0 ? (
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
            <span className="text-base font-medium text-fg-warn">{tr('Trả thừa')}</span>
            <Money amount={overpaid} currency={debt.currency} tone="warn" className="text-hero font-medium tracking-number" />
          </p>
        ) : (
          <p
            className={`mt-1.5 font-mono text-hero font-medium tracking-number tabular-nums ${
              isMine ? 'text-money-out' : 'text-money-in'
            }`}
          >
            {formatMoney(remaining, debt.currency)}
          </p>
        )}
        <p className="mt-2 text-sm text-fg-muted">
          {overpaid > 0
            ? tr('đã trả nhiều hơn số nợ · gốc {principal} · đã trả {paid}', {
                principal: formatMoney(disbursed, debt.currency),
                paid: formatMoney(paid, debt.currency),
              })
            : tr('còn lại · gốc {principal} · đã trả {paid}', {
                principal: formatMoney(disbursed, debt.currency),
                paid: formatMoney(paid, debt.currency),
              })}
        </p>
        {debt.due_on && <p className="mt-1 text-sm text-fg-muted">{tr('Hạn: {date}', { date: formatDateLabel(debt.due_on) })}</p>}
        {debt.note && <p className="mt-1 text-sm text-fg-secondary">{debt.note}</p>}
      </Card>

      {/* Hành động chính */}
      <div className="mt-4 flex flex-wrap gap-2">
        {/* Đã trả hết thì tắt: mở biểu mẫu với số điền sẵn ¥0 chỉ để người dùng gõ một lần trả thừa. */}
        <button
          type="button"
          onClick={() => setPaying(true)}
          disabled={paidOff}
          aria-describedby={paidOff ? 'debt-paid-off-note' : undefined}
          className={actionButtonClass('primary')}
        >
          {tr('+ Ghi nhận trả')}
        </button>
        <button
          type="button"
          onClick={toggleSettled}
          className={actionButtonClass('outline')}
        >
          {debt.status === 'open' ? tr('Đánh dấu tất toán') : tr('Mở lại')}
        </button>
      </div>

      {/* Hành động phá hủy — tách riêng khỏi cụm chính để tránh bấm nhầm */}
      <div className="mt-3 border-t border-border-subtle pt-3">
        <button
          type="button"
          onClick={handleDelete}
          className={actionButtonClass('danger')}
        >
          {tr('Xóa khoản nợ')}
        </button>
      </div>

      {paidOff && (
        <p id="debt-paid-off-note" className="mt-2 text-sm text-fg-muted">
          {overpaid > 0 ? tr('Đã trả thừa — không còn gì để ghi trả.') : tr('Đã trả hết — không còn gì để ghi trả.')}
        </p>
      )}

      {debt.status === 'open' && fullyPaid && (
        <p className="mt-3 rounded-lg bg-state-warn-bg text-state-warn-fg p-3 text-sm">
          {tr('Đã trả đủ. Bạn có thể "Đánh dấu tất toán" để đưa khoản này ra khỏi tổng nợ.')}
        </p>
      )}

      {/* Lịch trả góp dự kiến (mục AG) — chỉ khi có lãi suất + số kỳ */}
      <AmortizationSection debt={debt} />

      {/* Lịch sử trả / cho vay thêm */}
      <SectionTitle role="micro" className="mb-2 mt-5 px-1">
        {tr('Lịch sử ({n})', { n: payments.length })}
      </SectionTitle>
      <Card padding="none" className="divide-y divide-border-subtle overflow-hidden">
        {payments.map((p) => {
          // amount âm = lần giải ngân thêm (cho vay/vay tiếp); dương = trả bớt.
          const isAdvance = p.amount < 0
          const advanceLabel = isMine ? tr('Vay thêm') : tr('Cho vay thêm')
          const info = (
            <>
              {p.transaction_id ? <Banknote className="h-4 w-4" /> : <PenLine className="h-4 w-4" />}
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium text-fg-primary">
                  {isAdvance ? (
                    <span className="text-blue-600 dark:text-blue-400">
                      + {formatMoney(-p.amount, debt.currency)}
                      <span className="ml-1 text-2xs font-normal text-blue-500/80">{advanceLabel}</span>
                    </span>
                  ) : (
                    formatMoney(p.amount, debt.currency)
                  )}
                  {!p.transaction_id && (
                    <span className="ml-1 text-2xs font-normal text-fg-muted">{tr('(ghi nhận suông)')}</span>
                  )}
                </p>
                <p className="truncate text-sm text-fg-muted">
                  {formatDateLabel(p.paid_on)}
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
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md -mx-1 px-1 py-0.5 active:scale-[0.99] hover:bg-surface-sunken"
                  aria-label={tr('Xem giao dịch liên kết')}
                >
                  {info}
                </button>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-2">{info}</div>
              )}
              <button
                type="button"
                onClick={() => handleDeletePayment(p.id, !!p.transaction_id)}
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md px-2 text-sm text-fg-muted hover:bg-surface-sunken"
              >
                {tr('Xóa')}
              </button>
            </div>
          )
        })}
        {payments.length === 0 && (
          <EmptyState compact>{tr('Chưa có lần trả nào')}</EmptyState>
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
      showToast(tr('Giao dịch liên kết không còn tồn tại (có thể đã bị xóa).'), 'error')
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
      <SectionTitle role="micro" className="mb-2 px-1">
        {tr('Lịch trả dự kiến')}
      </SectionTitle>
      <Card padding="lg">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-2xs text-fg-muted">{tr('Mỗi kỳ')}</p>
            <p className="text-sm font-semibold text-fg-primary">
              {formatMoney(schedule.monthly, cur)}
            </p>
          </div>
          <div>
            <p className="text-2xs text-fg-muted">{tr('Tổng lãi')}</p>
            <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
              {formatMoney(schedule.totalInterest, cur)}
            </p>
          </div>
          <div>
            <p className="text-2xs text-fg-muted">{tr('Tổng phải trả')}</p>
            <p className="text-sm font-semibold text-fg-primary">
              {formatMoney(schedule.totalPaid, cur)}
            </p>
          </div>
        </div>
        <p className="mt-2 text-2xs text-fg-muted">
          {tr('{rate}%/năm · {n} kỳ', { rate: (bps! / 100).toString(), n: term! })}
          {/* E-ink + Gọn: bỏ ghi chú phương pháp, giữ lãi suất và số kỳ. */}
          <span className="eink-gon:hidden">{tr(' · ước tính theo niên kim (thực tế có thể lệch chút)')}</span>
        </p>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-fg-accent"
        >
          {open ? tr('Ẩn chi tiết từng kỳ') : tr('Xem chi tiết từng kỳ')}
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {open && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-right text-sm tabular-nums">
              <thead>
                <tr className="text-fg-muted">
                  <th className="py-1 pr-2 text-left font-medium">{tr('Kỳ')}</th>
                  <th className="py-1 px-2 font-medium">{tr('Ngày')}</th>
                  <th className="py-1 px-2 font-medium">{tr('Trả')}</th>
                  <th className="py-1 px-2 font-medium">{tr('Lãi')}</th>
                  <th className="py-1 pl-2 font-medium">{tr('Dư nợ')}</th>
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
