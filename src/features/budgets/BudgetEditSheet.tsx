import { useState } from 'react'
import { useDeleteBudget, useRates, useUpsertBudget } from '../../hooks/queries'
import { useEscClose } from '../../hooks/useEscClose'
import { MoneyField, MONEY_FIELD_CLASS } from '../../components/MoneyField'
import { confirmDialog } from '../../lib/dialog'
import { formatMoney } from '../../lib/money'
import type { Suggestion } from './suggest'

interface Props {
  monthKey: string
  categoryId: string
  categoryLabel: string
  current: number // minor units base; 0 = chưa có
  currentRollover?: boolean
  budgetId?: string
  /** Câu giải thích hạn mức này là trần nhóm / mốc con / đặt riêng cho con. */
  hint?: string
  /** Lịch sử chi của danh mục này (mặt lập kế hoạch); null = không gợi ý. */
  suggestion?: Suggestion | null
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
  suggestion = null,
  onClose,
}: Props) {
  useEscClose(onClose)
  const { base } = useRates()
  const upsert = useUpsertBudget()
  const remove = useDeleteBudget()
  const [amount, setAmount] = useState(current)
  const [rollover, setRollover] = useState(currentRollover ?? false)

  // try/catch quanh mutateAsync: lưu hỏng thì GIỮ sheet mở (toast lỗi toàn cục đã
  // báo), không được vừa đóng sheet vừa im lặng như trước — người dùng tưởng đã lưu.
  async function handleSave() {
    try {
      if (amount <= 0) {
        // Nhập 0/để trống + đang có hạn mức → coi như xóa
        if (budgetId) await remove.mutateAsync(budgetId)
      } else {
        await upsert.mutateAsync({ categoryId, monthKey, amount, rollover })
      }
    } catch {
      return
    }
    onClose()
  }

  async function handleDelete() {
    if (!(await confirmDialog({ title: 'Xóa hạn mức này?', danger: true, confirmLabel: 'Xóa' })))
      return
    try {
      if (budgetId) await remove.mutateAsync(budgetId)
    } catch {
      return
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center"
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
            className="min-h-11 rounded-lg px-3 py-1.5 text-sm text-fg-muted hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Đóng
          </button>
        </div>

        {hint && <p className="mb-2 text-xs text-fg-muted">{hint}</p>}

        {/* <span>: MoneyField có hai ô (chạm/desktop), tên đến từ `ariaLabel`. */}
        <span className="mb-1 block text-xs font-medium text-fg-muted">Hạn mức tháng ({base})</span>
        <MoneyField
          value={amount}
          onChange={setAmount}
          currency={base}
          ariaLabel="Hạn mức tháng"
          onEnter={handleSave}
          className={MONEY_FIELD_CLASS}
        />

        {/* Ô trống bắt người ta bịa số từ trí nhớ, trong khi app biết rõ mấy tháng qua
            danh mục này tốn bao nhiêu. Bày cả trung bình lẫn cao nhất: chọn đúng trung
            bình thì một nửa số tháng sẽ vượt trần. */}
        {suggestion && suggestion.months.length > 0 && (
          <div className="mt-3 rounded-lg bg-surface-sunken p-2.5">
            <p className="text-2xs text-fg-muted">
              {suggestion.months.length} tháng gần đây:{' '}
              {suggestion.months
                .map((m) => `${m.monthKey} ${formatMoney(m.amount, base)}`)
                .join(' · ')}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAmount(suggestion.average)}
                className="min-h-11 rounded-lg border border-border-strong bg-surface px-3 text-xs font-medium text-fg-secondary"
              >
                Dùng {formatMoney(suggestion.average, base)} (trung bình)
              </button>
              {suggestion.max !== suggestion.average && (
                <button
                  type="button"
                  onClick={() => setAmount(suggestion.max)}
                  className="min-h-11 rounded-lg border border-border-strong bg-surface px-3 text-xs font-medium text-fg-secondary"
                >
                  Dùng {formatMoney(suggestion.max, base)} (cao nhất)
                </button>
              )}
            </div>
          </div>
        )}

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
