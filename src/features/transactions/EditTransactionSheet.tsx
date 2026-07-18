import { useDeleteTransaction, useUpdateTransaction } from '../../hooks/queries'
import type { TransactionRow } from '../../types/database.types'
import { TransactionForm } from './TransactionForm'

interface Props {
  tx: TransactionRow
  onClose: () => void
}

/** Sheet sửa/xóa giao dịch (dùng chung cho Sổ GD và Tìm kiếm). */
export function EditTransactionSheet({ tx, onClose }: Props) {
  const update = useUpdateTransaction()
  const remove = useDeleteTransaction()

  async function handleDelete() {
    if (!window.confirm('Xóa giao dịch này?')) return
    await remove.mutateAsync(tx.id)
    onClose()
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
