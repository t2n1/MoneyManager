import { useQueryClient } from '@tanstack/react-query'
import { repo, type NewTransaction } from '../../data'
import { useDeleteTransaction, useUpdateTransaction } from '../../hooks/queries'
import { showUndoToast } from '../../lib/undoToast'
import type { TransactionRow } from '../../types/database.types'
import { TransactionForm } from './TransactionForm'

interface Props {
  tx: TransactionRow
  onClose: () => void
}

/** TransactionRow → NewTransaction để tạo lại khi hoàn tác. */
function toNewTransaction(t: TransactionRow): NewTransaction {
  return {
    type: t.type,
    amount: t.amount,
    to_amount: t.to_amount,
    category_id: t.category_id,
    account_id: t.account_id,
    to_account_id: t.to_account_id,
    occurred_on: t.occurred_on,
    note: t.note,
    is_remittance: t.is_remittance,
    remit_service: t.remit_service,
    remit_fee_jpy: t.remit_fee_jpy,
    remit_received_vnd: t.remit_received_vnd,
    is_debt_flow: t.is_debt_flow,
  }
}

/** Sheet sửa/xóa giao dịch (dùng chung cho Sổ GD và Tìm kiếm). */
export function EditTransactionSheet({ tx, onClose }: Props) {
  const qc = useQueryClient()
  const update = useUpdateTransaction()
  const remove = useDeleteTransaction()

  async function handleDelete() {
    const snapshot = tx
    await remove.mutateAsync(snapshot.id)
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
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-gray-50 dark:bg-gray-950 p-4 lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">Sửa giao dịch</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50"
            >
              Xóa
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Đóng
            </button>
          </div>
        </div>
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
