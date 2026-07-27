import { useState } from 'react'
import { useCreateTransaction } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { CURRENCIES, formatMoney, parseMoney, type CurrencyCode } from '../../lib/money'
import type { AccountRow } from '../../types/database.types'
import { cardDebt, reconcilePlan } from './reconcile'

interface Props {
  account: AccountRow
  /** Số dư sổ hiện tại (minor units theo currency tài khoản). Thẻ đang nợ → âm. */
  currentBalance: number
  onClose: () => void
}

/**
 * Sheet "Điều chỉnh số dư" (mục X): nhập số dư THỰC TẾ → app tạo một giao dịch
 * điều chỉnh (thu/chi) bù phần chênh lệch. Giao dịch này mang exclude_from_stats=true
 * nên KHÔNG lọt vào báo cáo/ngân sách/insight, nhưng vẫn khớp lại số dư tài khoản.
 *
 * Thẻ tín dụng nhập theo SỐ ĐANG NỢ (dương) cho khớp cách app hiển thị thẻ ở mọi
 * nơi khác; phần đổi dấu nằm trong reconcilePlan.
 */
export function ReconcileSheet({ account, currentBalance, onClose }: Props) {
  const create = useCreateTransaction()
  const currency = account.currency as CurrencyCode
  const isCard = account.type === 'card'
  const shown = isCard ? cardDebt(currentBalance) : currentBalance

  const [digits, setDigits] = useState(String(shown))
  const [saving, setSaving] = useState(false)

  const entered = digits === '' ? 0 : Number(digits)
  const { diff, type } = reconcilePlan({ isCard, currentBalance, entered })
  const canSave = digits !== '' && diff !== 0 && !saving

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      await create.mutateAsync({
        type,
        amount: Math.abs(diff),
        to_amount: null,
        category_id: null,
        account_id: account.id,
        to_account_id: null,
        occurred_on: toISODate(new Date()),
        note: isCard ? 'Điều chỉnh số nợ' : 'Điều chỉnh số dư',
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
          {isCard ? 'Điều chỉnh số nợ' : 'Điều chỉnh số dư'}
        </h2>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          {account.name} · {isCard ? 'sổ đang ghi nợ' : 'số dư sổ hiện tại'}{' '}
          {formatMoney(shown, currency)} ({CURRENCIES[currency].label})
        </p>

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
          {isCard ? 'Số đang nợ thực tế' : 'Số dư thực tế'}
        </label>
        <input
          autoFocus
          inputMode="numeric"
          value={entered === 0 ? '' : formatMoney(entered, currency)}
          onChange={(e) => {
            const parsed = String(parseMoney(e.target.value))
            setDigits(parsed === '0' ? '' : parsed)
          }}
          placeholder={formatMoney(0, currency)}
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-right text-lg font-semibold outline-green-500 dark:bg-gray-900 dark:text-gray-100"
        />

        <div className="mb-3 rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2 text-sm">
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
            <span>{isCard ? 'Nợ thay đổi' : 'Chênh lệch'}</span>
            <span
              className={`tabular-nums font-semibold ${
                diff === 0
                  ? 'text-gray-500 dark:text-gray-400'
                  : diff > 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
              }`}
            >
              {/* Thẻ: diff âm nghĩa là nợ TĂNG, nên đảo dấu hiển thị cho dễ đọc */}
              {diff === 0 ? '' : (isCard ? diff < 0 : diff > 0) ? '+' : '−'}
              {formatMoney(Math.abs(diff), currency)}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {diff === 0
              ? isCard
                ? 'Số nợ đã khớp — không cần điều chỉnh.'
                : 'Số dư đã khớp — không cần điều chỉnh.'
              : isCard
                ? `Nợ thật ${diff > 0 ? 'ít' : 'nhiều'} hơn sổ — sẽ tạo một giao dịch bù trên thẻ (không tính vào thống kê).`
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
