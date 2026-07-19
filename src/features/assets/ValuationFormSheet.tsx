import { useState } from 'react'
import { useUpsertValuation } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { CURRENCIES, formatMoney, parseMoney, type CurrencyCode } from '../../lib/money'
import type { AccountRow } from '../../types/database.types'

interface Props {
  account: AccountRow
  /** Giá trị thị trường hiện có (minor units) để điền sẵn; null/undefined = chưa cập nhật */
  currentValue?: number | null
  onClose: () => void
}

/**
 * Sheet "Cập nhật giá trị" cho tài khoản đầu tư (mục AE). Lưu một snapshot giá trị
 * thị trường (minor units theo currency tài khoản) tại một ngày. Upsert theo
 * (account_id, valued_on): cập nhật lại cùng ngày sẽ đè giá trị cũ.
 */
export function ValuationFormSheet({ account, currentValue, onClose }: Props) {
  const upsert = useUpsertValuation()
  const currency = account.currency as CurrencyCode

  const [valueDigits, setValueDigits] = useState(
    currentValue != null ? String(currentValue) : '',
  )
  const [valuedOn, setValuedOn] = useState(toISODate(new Date()))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const marketValue = valueDigits === '' ? 0 : Number(valueDigits)
  const canSave = valueDigits !== '' && !saving

  async function handleSubmit() {
    if (!canSave) return
    setSaving(true)
    try {
      await upsert.mutateAsync({
        account_id: account.id,
        valued_on: valuedOn,
        market_value: marketValue,
        note: note.trim(),
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
        className="w-full max-w-md rounded-t-2xl bg-white dark:bg-gray-900 p-4 lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-base font-bold text-gray-800 dark:text-gray-100">
          Cập nhật giá trị
        </h2>
        <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
          {account.name} · giá trị thị trường hiện tại ({CURRENCIES[currency].label})
        </p>

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
          Giá trị hiện tại
        </label>
        <input
          autoFocus
          inputMode="numeric"
          value={marketValue === 0 ? '' : formatMoney(marketValue, currency)}
          onChange={(e) => {
            const parsed = String(parseMoney(e.target.value))
            setValueDigits(parsed === '0' ? '' : parsed)
          }}
          placeholder={formatMoney(0, currency)}
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-right text-lg font-semibold outline-green-500"
        />

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Ngày</label>
        <input
          type="date"
          value={valuedOn}
          max={toISODate(new Date())}
          onChange={(e) => setValuedOn(e.target.value)}
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm outline-green-500"
        />

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
          Ghi chú <span className="text-gray-400 dark:text-gray-500">(không bắt buộc)</span>
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: theo giá đóng cửa"
          className="mb-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm outline-green-500"
        />
        <p className="mb-3 text-xs text-gray-400 dark:text-gray-500">
          Chỉ ghi nhận giá trị — không tạo giao dịch, không đổi báo cáo thu/chi. Chênh lệch
          so với vốn gốc là lãi/lỗ chưa thực hiện.
        </p>

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
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}
