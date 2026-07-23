import { useState } from 'react'
import { useCreateTransaction } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { CURRENCIES, formatMoney, parseMoney, type CurrencyCode } from '../../lib/money'
import type { AccountRow } from '../../types/database.types'

interface Props {
  account: AccountRow
  /** Số dư sổ hiện tại (minor units theo currency tài khoản). */
  currentBalance: number
  onClose: () => void
}

/**
 * Sheet "Điều chỉnh số dư" (mục X): nhập số dư THỰC TẾ → app tạo một giao dịch
 * điều chỉnh (thu/chi) bù phần chênh lệch. Giao dịch này mang exclude_from_stats=true
 * nên KHÔNG lọt vào báo cáo/ngân sách/insight, nhưng vẫn khớp lại số dư tài khoản.
 */
export function ReconcileSheet({ account, currentBalance, onClose }: Props) {
  const create = useCreateTransaction()
  const currency = account.currency as CurrencyCode

  const [digits, setDigits] = useState(String(currentBalance))
  const [saving, setSaving] = useState(false)

  const actual = digits === '' ? 0 : Number(digits)
  const diff = actual - currentBalance
  const canSave = digits !== '' && diff !== 0 && !saving

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      await create.mutateAsync({
        type: diff > 0 ? 'income' : 'expense',
        amount: Math.abs(diff),
        to_amount: null,
        category_id: null,
        account_id: account.id,
        to_account_id: null,
        occurred_on: toISODate(new Date()),
        note: 'Điều chỉnh số dư',
        exclude_from_stats: true,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white dark:bg-gray-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-base font-bold text-gray-800 dark:text-gray-100">
          Điều chỉnh số dư
        </h2>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          {account.name} · số dư sổ hiện tại {formatMoney(currentBalance, currency)} (
          {CURRENCIES[currency].label})
        </p>

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
          Số dư thực tế
        </label>
        <input
          autoFocus
          inputMode="numeric"
          value={actual === 0 ? '' : formatMoney(actual, currency)}
          onChange={(e) => {
            const parsed = String(parseMoney(e.target.value))
            setDigits(parsed === '0' ? '' : parsed)
          }}
          placeholder={formatMoney(0, currency)}
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-right text-lg font-semibold outline-green-500 dark:bg-gray-900 dark:text-gray-100"
        />

        <div className="mb-3 rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm">
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
            <span>Chênh lệch</span>
            <span
              className={`tabular-nums font-semibold ${
                diff === 0
                  ? 'text-gray-500 dark:text-gray-400'
                  : diff > 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
              }`}
            >
              {diff > 0 ? '+' : diff < 0 ? '−' : ''}
              {formatMoney(Math.abs(diff), currency)}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {diff === 0
              ? 'Số dư đã khớp — không cần điều chỉnh.'
              : `Sẽ tạo một giao dịch ${diff > 0 ? 'thu' : 'chi'} điều chỉnh (không tính vào thống kê).`}
          </p>
        </div>

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSave}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white active:scale-95 disabled:opacity-50"
          >
            {saving ? 'Đang lưu…' : 'Điều chỉnh'}
          </button>
        </div>
      </div>
    </div>
  )
}
