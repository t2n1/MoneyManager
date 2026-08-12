import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Banknote } from 'lucide-react'
import { repo } from '../../data'
import {
  useDebtPayments,
  useDeleteTransaction,
  useUpdateTransaction,
} from '../../hooks/queries'
import { showUndoToast } from '../../lib/undoToast'
import type { TransactionRow } from '../../types/database.types'
import { TransactionForm } from './TransactionForm'
import { toNewTransaction } from './restore'
import { useEscClose } from '../../hooks/useEscClose'

interface Props {
  tx: TransactionRow
  onClose: () => void
}

/** Sheet sửa/xóa giao dịch (dùng chung cho Sổ GD và Tìm kiếm). */
export function EditTransactionSheet({ tx, onClose }: Props) {
  useEscClose(onClose)
  // Focus MỘT LẦN lúc mở. Không dùng ref callback: callback chạy lại mỗi lần render
  // nên đang gõ trong form là bị giật focus ra ngoài.
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true })
  }, [])
  const qc = useQueryClient()
  const navigate = useNavigate()
  const update = useUpdateTransaction()
  const remove = useDeleteTransaction()

  // Giao dịch sinh từ trả nợ → cho bấm về đúng khoản nợ. Nguồn sự thật là
  // debt_payments.transaction_id (không chỉ dựa cờ is_debt_flow).
  const { data: debtPayments = [] } = useDebtPayments()
  const linkedDebtId = tx.is_debt_flow
    ? debtPayments.find((p) => p.transaction_id === tx.id)?.debt_id
    : undefined

  async function handleDelete() {
    const snapshot = tx
    // try/catch: xóa hỏng thì GIỮ sheet mở (toast lỗi toàn cục đã báo) —
    // không được hiện "Đã xóa · Hoàn tác" cho một giao dịch còn nguyên.
    try {
      await remove.mutateAsync(snapshot.id)
    } catch {
      return
    }
    onClose()
    // Xóa xong mới cho hoàn tác: tạo lại giao dịch (id mới) nếu người dùng bấm.
    showUndoToast('Đã xóa giao dịch', async () => {
      await repo.createTransaction(toNewTransaction(snapshot))
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['balances'] })
      qc.invalidateQueries({ queryKey: ['search'] })
    })
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      {/* role/aria-modal/aria-labelledby: giống các sheet khác trong app (EventFormSheet,
          PhaseFormSheet, sheet thông báo…) — sheet dùng nhiều nhất lại là cái duy nhất
          thiếu, nên trình đọc màn hình không biết đây là hộp thoại.
          tabIndex + ref focus: KHÔNG bẫy focus (cả app không bẫy), chỉ đưa điểm đọc vào
          trong sheet để người dùng bàn phím không còn đứng ở dòng phía sau. preventScroll
          để mở sheet không giật trang nền. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-tx-title"
        tabIndex={-1}
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface-page p-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="edit-tx-title" className="text-base font-bold text-fg-primary">
            Sửa giao dịch
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              className="min-h-11 rounded-lg px-3 py-1.5 text-sm font-medium text-money-out hover:bg-red-50"
            >
              Xóa
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-lg px-3 py-1.5 text-sm text-fg-muted hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Đóng
            </button>
          </div>
        </div>
        {linkedDebtId && (
          <button
            type="button"
            onClick={() => {
              navigate(`/debts/${linkedDebtId}`)
              onClose()
            }}
            className="mb-3 flex w-full items-center gap-2 rounded-xl bg-green-50 dark:bg-green-900/30 px-3 py-2.5 text-left text-sm font-medium text-green-800 dark:text-green-300 active:scale-[0.99]"
          >
            <Banknote className="h-4 w-4 shrink-0" />
            <span className="flex-1">Giao dịch trả nợ · Xem khoản nợ</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-green-500 dark:text-green-400" />
          </button>
        )}
        <TransactionForm
          key={tx.id}
          initial={tx}
          showExcludeOption
          submitLabel="Cập nhật"
          onSubmit={async (values) => {
            await update.mutateAsync({ id: tx.id, patch: values })
            onClose()
          }}
        />
      </div>
    </div>
  )
}
