import { useState } from 'react'
import { useCreateSavingsGoal, useDeleteSavingsGoal, useUpdateSavingsGoal } from '../../hooks/queries'
import { formatMoney, parseMoney, type CurrencyCode } from '../../lib/money'
import type { AccountRow, SavingsGoalRow } from '../../types/database.types'

interface Props {
  accounts: AccountRow[]
  /** Có giá trị = sửa; không = tạo mới */
  goal?: SavingsGoalRow
  onClose: () => void
}

/** Sheet tạo/sửa mục tiêu tiết kiệm (mục AD). */
export function SavingsGoalFormSheet({ accounts, goal, onClose }: Props) {
  const create = useCreateSavingsGoal()
  const update = useUpdateSavingsGoal()
  const del = useDeleteSavingsGoal()

  const [name, setName] = useState(goal?.name ?? '')
  const [accountId, setAccountId] = useState(goal?.account_id ?? accounts[0]?.id ?? '')
  const [digits, setDigits] = useState(goal ? String(goal.target_amount) : '')
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? '')
  const [note, setNote] = useState(goal?.note ?? '')
  const [saving, setSaving] = useState(false)

  const currency = (accounts.find((a) => a.id === accountId)?.currency ?? 'JPY') as CurrencyCode
  const target = digits === '' ? 0 : Number(digits)
  const canSave = name.trim() !== '' && !!accountId && target > 0 && !saving

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      const input = {
        name: name.trim(),
        account_id: accountId,
        target_amount: target,
        target_date: targetDate || null,
        note: note.trim(),
      }
      if (goal) await update.mutateAsync({ id: goal.id, patch: input })
      else await create.mutateAsync(input)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!goal || !window.confirm('Xóa mục tiêu này?')) return
    setSaving(true)
    try {
      await del.mutateAsync(goal.id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm outline-green-500 dark:text-gray-100'

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white dark:bg-gray-900 p-4 lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-bold text-gray-800 dark:text-gray-100">
          {goal ? 'Sửa mục tiêu' : 'Mục tiêu tiết kiệm mới'}
        </h2>

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Tên mục tiêu</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Quỹ du lịch" className={`mb-3 ${field}`} />

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Theo dõi qua tài khoản</label>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={`mb-3 ${field}`}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </select>

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Số tiền đích</label>
        <input
          inputMode="numeric"
          value={target === 0 ? '' : formatMoney(target, currency)}
          onChange={(e) => {
            const parsed = String(parseMoney(e.target.value))
            setDigits(parsed === '0' ? '' : parsed)
          }}
          placeholder={formatMoney(0, currency)}
          className={`mb-3 text-right font-semibold ${field}`}
        />

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
          Hạn hoàn thành <span className="text-gray-400 dark:text-gray-500">(không bắt buộc)</span>
        </label>
        <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={`mb-3 ${field}`} />

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
          Ghi chú <span className="text-gray-400 dark:text-gray-500">(không bắt buộc)</span>
        </label>
        <input value={note} onChange={(e) => setNote(e.target.value)} className={`mb-4 ${field}`} />

        <div className="flex items-center justify-between gap-2">
          {goal ? (
            <button type="button" onClick={handleDelete} disabled={saving} className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50">
              Xóa
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
              Hủy
            </button>
            <button type="button" onClick={handleSubmit} disabled={!canSave} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white active:scale-95 disabled:opacity-50">
              {saving ? 'Đang lưu…' : 'Lưu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
