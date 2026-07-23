import { useState } from 'react'
import { useUpdateDebt } from '../../hooks/queries'
import { CURRENCIES, formatMoney, parseMoney } from '../../lib/money'
import type { DebtDirection, DebtRow } from '../../types/database.types'
import { DebtDetailInputs } from '../transactions/roleFields'

interface Props {
  debt: DebtRow
  onClose: () => void
}

/**
 * Sửa một khoản nợ đã tạo (bản ghi nợ — KHÔNG tạo giao dịch giải ngân). Việc TẠO
 * mới nợ/cho vay đã gộp vào màn Nhập (vai trò "Cho vay / Ghi nợ"). Sheet này chỉ
 * còn cho luồng sửa từ trang chi tiết Nợ; dùng lại DebtDetailInputs với form nhập.
 */
export function DebtEditSheet({ debt, onClose }: Props) {
  const update = useUpdateDebt()

  const [counterparty, setCounterparty] = useState(debt.counterparty)
  const [direction, setDirection] = useState<DebtDirection>(debt.direction)
  const [principalDigits, setPrincipalDigits] = useState(String(debt.principal))
  const [dueOn, setDueOn] = useState(debt.due_on ?? '')
  const [note, setNote] = useState(debt.note ?? '')
  const [interestPct, setInterestPct] = useState(
    debt.interest_bps != null ? String(debt.interest_bps / 100) : '',
  )
  const [termMonths, setTermMonths] = useState(
    debt.term_months != null ? String(debt.term_months) : '',
  )
  const [saving, setSaving] = useState(false)

  const principal = principalDigits === '' ? 0 : Number(principalDigits)
  const canSave = counterparty.trim().length > 0 && principal > 0 && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const pct = Number(interestPct)
      const term = Number(termMonths)
      await update.mutateAsync({
        id: debt.id,
        patch: {
          counterparty: counterparty.trim(),
          direction,
          principal,
          due_on: dueOn || null,
          note: note.trim(),
          interest_bps: interestPct.trim() && !Number.isNaN(pct) ? Math.round(pct * 100) : null,
          term_months:
            termMonths.trim() && !Number.isNaN(term) && term > 0 ? Math.round(term) : null,
        },
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
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white dark:bg-gray-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-bold text-gray-800 dark:text-gray-100">Sửa khoản nợ</h2>

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
                direction === val
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-gray-100'
                  : 'text-gray-500 dark:text-gray-400'
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
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 outline-green-500"
        />

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
          Số tiền gốc ({CURRENCIES[debt.currency].symbol})
        </label>
        <input
          inputMode="numeric"
          value={principal === 0 ? '' : formatMoney(principal, debt.currency)}
          onChange={(e) => {
            const parsed = String(parseMoney(e.target.value))
            setPrincipalDigits(parsed === '0' ? '' : parsed)
          }}
          placeholder={formatMoney(0, debt.currency)}
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-right text-lg font-semibold text-gray-800 dark:text-gray-100 outline-green-500"
        />

        <div className="mb-3">
          <DebtDetailInputs
            dueOn={dueOn}
            interestPct={interestPct}
            termMonths={termMonths}
            onChange={(patch) => {
              if (patch.dueOn !== undefined) setDueOn(patch.dueOn)
              if (patch.interestPct !== undefined) setInterestPct(patch.interestPct)
              if (patch.termMonths !== undefined) setTermMonths(patch.termMonths)
            }}
          />
        </div>

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
          Ghi chú (không bắt buộc)
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: mượn lúc chuyển nhà"
          className="mb-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 outline-green-500"
        />

        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Không đổi được loại tiền của khoản nợ đã tạo.
        </p>

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
