import { useState } from 'react'
import { useDeleteBudget, useRates, useUpsertBudget } from '../../hooks/queries'
import { MoneyField } from '../../components/MoneyField'
import { confirmDialog } from '../../lib/dialog'

interface Props {
  monthKey: string
  categoryId: string
  categoryLabel: string
  current: number // minor units base; 0 = chưa có
  currentRollover?: boolean
  budgetId?: string
  /** Câu giải thích hạn mức này là trần nhóm / mốc con / đặt riêng cho con. */
  hint?: string
  onClose: () => void
}

/** Sheet đặt/sửa/xóa hạn mức cho một danh mục trong một tháng. */
export function BudgetEditSheet({
  monthKey,
  categoryId,
  categoryLabel,
  current,
  currentRollover,
  budgetId,
  hint,
  onClose,
}: Props) {
  const { base } = useRates()
  const upsert = useUpsertBudget()
  const remove = useDeleteBudget()
  const [amount, setAmount] = useState(current)
  const [rollover, setRollover] = useState(currentRollover ?? false)

  async function handleSave() {
    if (amount <= 0) {
      // Nhập 0/để trống + đang có hạn mức → coi như xóa
      if (budgetId) await remove.mutateAsync(budgetId)
      onClose()
      return
    }
    await upsert.mutateAsync({ categoryId, monthKey, amount, rollover })
    onClose()
  }

  async function handleDelete() {
    if (!(await confirmDialog({ title: 'Xóa hạn mức này?', danger: true, confirmLabel: 'Xóa' })))
      return
    if (budgetId) await remove.mutateAsync(budgetId)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface-page p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-fg-primary">Hạn mức: {categoryLabel}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-fg-muted hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Đóng
          </button>
        </div>

        {hint && <p className="mb-2 text-xs text-fg-muted">{hint}</p>}

        <label className="mb-1 block text-xs font-medium text-fg-muted">Hạn mức tháng ({base})</label>
        <MoneyField
          value={amount}
          onChange={setAmount}
          currency={base}
          ariaLabel="Hạn mức tháng"
          onEnter={handleSave}
          className="w-full rounded-xl border border-border-strong bg-surface p-3 text-right text-lg font-semibold text-fg-primary focus:border-green-500 focus:outline-none"
        />

        <label className="mt-3 flex items-center gap-2 text-sm text-fg-secondary">
          <input type="checkbox" checked={rollover} onChange={(e) => setRollover(e.target.checked)} />
          Dồn phần chưa tiêu sang tháng sau
        </label>

        <div className="mt-4 flex gap-2">
          {budgetId && (
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-xl px-4 py-3 text-sm font-medium text-money-out hover:bg-red-50 dark:hover:bg-red-900/30"
            >
              Xóa
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded-xl bg-green-700 py-3 text-sm font-semibold text-white active:scale-[0.99]"
          >
            Lưu
          </button>
        </div>
      </div>
    </div>
  )
}
