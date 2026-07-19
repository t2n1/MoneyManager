import { useState } from 'react'
import { useDeleteBudget, useRates, useUpsertBudget } from '../../hooks/queries'
import { formatMoney, parseMoney } from '../../lib/money'

interface Props {
  monthKey: string
  categoryId: string
  categoryLabel: string
  current: number // minor units base; 0 = chưa có
  currentRollover?: boolean
  budgetId?: string
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
  onClose,
}: Props) {
  const { base } = useRates()
  const upsert = useUpsertBudget()
  const remove = useDeleteBudget()
  const [raw, setRaw] = useState(current > 0 ? String(current) : '')
  const [rollover, setRollover] = useState(currentRollover ?? false)
  const amount = parseMoney(raw)

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
    if (!window.confirm('Xóa hạn mức này?')) return
    if (budgetId) await remove.mutateAsync(budgetId)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl bg-gray-50 dark:bg-gray-950 p-4 lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">Hạn mức: {categoryLabel}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Đóng
          </button>
        </div>

        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">Hạn mức tháng ({base})</label>
        <input
          autoFocus
          inputMode="numeric"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="0"
          className="mt-1 w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-right text-lg font-semibold text-gray-800 dark:text-gray-100 focus:border-green-500 focus:outline-none"
        />
        <p className="mt-1 text-right text-sm text-gray-500 dark:text-gray-400">{formatMoney(amount, base)}</p>

        <label className="mt-3 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={rollover} onChange={(e) => setRollover(e.target.checked)} />
          Dồn phần chưa tiêu sang tháng sau
        </label>

        <div className="mt-4 flex gap-2">
          {budgetId && (
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-xl px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
            >
              Xóa
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white active:scale-[0.99]"
          >
            Lưu
          </button>
        </div>
      </div>
    </div>
  )
}
