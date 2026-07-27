import { useState } from 'react'
import { useCategories, useCreateCategory, useCreateTransaction } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { showToast } from '../../lib/dialog'
import { CURRENCIES, formatMoney, type CurrencyCode } from '../../lib/money'
import { MoneyField } from '../../components/MoneyField'
import type { AccountRow } from '../../types/database.types'
import {
  ADJUST_CATEGORY_ICON,
  ADJUST_CATEGORY_NAME,
  cardDebt,
  findAdjustCategory,
  reconcilePlan,
} from './reconcile'

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
  const createCategory = useCreateCategory()
  const { data: categories = [] } = useCategories()
  const currency = account.currency as CurrencyCode
  const isCard = account.type === 'card'
  const shown = isCard ? cardDebt(currentBalance) : currentBalance

  const [entered, setEntered] = useState(shown)
  const [saving, setSaving] = useState(false)

  const { diff, type } = reconcilePlan({ isCard, currentBalance, entered })
  const canSave = diff !== 0 && !saving

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      // Chi/thu bắt buộc có danh mục — dùng danh mục bù riêng, tạo lần đầu nếu chưa có
      const categoryId =
        findAdjustCategory(categories, type)?.id ??
        (
          await createCategory.mutateAsync({
            name: ADJUST_CATEGORY_NAME,
            type,
            icon: ADJUST_CATEGORY_ICON,
          })
        ).id
      await create.mutateAsync({
        type,
        amount: Math.abs(diff),
        to_amount: null,
        category_id: categoryId,
        account_id: account.id,
        to_account_id: null,
        occurred_on: toISODate(new Date()),
        note: isCard ? 'Điều chỉnh số nợ' : 'Điều chỉnh số dư',
        exclude_from_stats: true,
      })
      onClose()
    } catch (err) {
      // Không nuốt lỗi: trước đây sheet chỉ đứng im, người dùng không biết vì sao
      showToast(`Không lưu được: ${(err as Error).message}`, 'error')
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
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white dark:bg-gray-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
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
        <div className="mb-3">
          <MoneyField
            value={entered}
            onChange={setEntered}
            currency={currency}
            ariaLabel={isCard ? 'Số đang nợ thực tế' : 'Số dư thực tế'}
            onEnter={handleSubmit}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-right text-lg font-semibold outline-green-500 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>

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
