import { useState } from 'react'
import type { NewDebt } from '../../data'
import { useCreateDebt, useUpdateDebt } from '../../hooks/queries'
import { CURRENCIES, formatMoney, parseMoney, type CurrencyCode } from '../../lib/money'
import type { DebtDirection, DebtRow } from '../../types/database.types'

const CURRENCY_LIST = Object.keys(CURRENCIES) as CurrencyCode[]

interface Props {
  debt: DebtRow | null
  onClose: () => void
}

/** Sheet thêm/sửa một khoản nợ. */
export function DebtFormSheet({ debt, onClose }: Props) {
  const create = useCreateDebt()
  const update = useUpdateDebt()

  const [counterparty, setCounterparty] = useState(debt?.counterparty ?? '')
  const [direction, setDirection] = useState<DebtDirection>(debt?.direction ?? 'i_owe')
  const [currency, setCurrency] = useState<CurrencyCode>(debt?.currency ?? 'JPY')
  const [principalDigits, setPrincipalDigits] = useState(debt ? String(debt.principal) : '')
  const [dueOn, setDueOn] = useState(debt?.due_on ?? '')
  const [note, setNote] = useState(debt?.note ?? '')
  const [saving, setSaving] = useState(false)

  const principal = principalDigits === '' ? 0 : Number(principalDigits)
  const canSave = counterparty.trim().length > 0 && principal > 0 && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const input: NewDebt = {
        counterparty: counterparty.trim(),
        direction,
        currency,
        principal,
        due_on: dueOn || null,
        note: note.trim(),
      }
      if (debt) await update.mutateAsync({ id: debt.id, patch: input })
      else await create.mutateAsync(input)
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
        <h2 className="mb-3 text-base font-bold text-gray-800 dark:text-gray-100">
          {debt ? 'Sửa khoản nợ' : 'Thêm khoản nợ'}
        </h2>

        {/* Chiều */}
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
          {(
            [
              ['i_owe', 'Mình nợ'],
              ['owed_to_me', 'Cho vay'],
            ] as [DebtDirection, string][]
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setDirection(val)}
              className={`rounded-md py-1.5 text-sm font-medium transition ${
                direction === val ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
          {direction === 'i_owe' ? 'Chủ nợ (mình nợ ai)' : 'Con nợ (ai nợ mình)'}
        </label>
        <input
          autoFocus
          value={counterparty}
          onChange={(e) => setCounterparty(e.target.value)}
          placeholder="Tên người / công ty"
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm outline-green-500"
        />

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Loại tiền</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              disabled={!!debt}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-500"
            >
              {CURRENCY_LIST.map((c) => (
                <option key={c} value={c}>
                  {CURRENCIES[c].symbol} {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Hạn (không bắt buộc)</label>
            <input
              type="date"
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm outline-green-500"
            />
          </div>
        </div>

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Số tiền gốc</label>
        <input
          inputMode="numeric"
          value={principal === 0 ? '' : formatMoney(principal, currency)}
          onChange={(e) => {
            const parsed = String(parseMoney(e.target.value))
            setPrincipalDigits(parsed === '0' ? '' : parsed)
          }}
          placeholder={formatMoney(0, currency)}
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-right text-lg font-semibold outline-green-500"
        />

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Ghi chú (không bắt buộc)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: mượn lúc chuyển nhà"
          className="mb-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm outline-green-500"
        />

        {debt && (
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">Không đổi được loại tiền của khoản nợ đã tạo.</p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}
