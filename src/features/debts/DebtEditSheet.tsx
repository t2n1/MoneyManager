import { useId, useState } from 'react'
import { useUpdateDebt } from '../../hooks/queries'
import { CURRENCIES } from '../../lib/money'
import { MoneyField } from '../../components/MoneyField'
import type { DebtDirection, DebtRow } from '../../types/database.types'
import { DebtDetailInputs } from '../transactions/roleFields'
import { useEscClose } from '../../hooks/useEscClose'

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
  useEscClose(onClose)
  const uid = useId()
  const update = useUpdateDebt()

  const [counterparty, setCounterparty] = useState(debt.counterparty)
  const [direction, setDirection] = useState<DebtDirection>(debt.direction)
  const [principal, setPrincipal] = useState(debt.principal)
  const [dueOn, setDueOn] = useState(debt.due_on ?? '')
  const [note, setNote] = useState(debt.note ?? '')
  const [interestPct, setInterestPct] = useState(
    debt.interest_bps != null ? String(debt.interest_bps / 100) : '',
  )
  const [termMonths, setTermMonths] = useState(
    debt.term_months != null ? String(debt.term_months) : '',
  )
  const [saving, setSaving] = useState(false)

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
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-bold text-fg-primary">Sửa khoản nợ</h2>

        {/* Chiều */}
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg bg-surface-sunken p-1">
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
                  ? 'bg-surface text-fg-primary shadow-sm'
                  : 'text-fg-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label htmlFor={`${uid}-party`} className="mb-1 block text-xs font-medium text-fg-muted">
          {direction === 'i_owe' ? 'Chủ nợ (mình nợ ai)' : 'Con nợ (ai nợ mình)'}
        </label>
        <input
          id={`${uid}-party`}
          autoFocus
          value={counterparty}
          onChange={(e) => setCounterparty(e.target.value)}
          placeholder="Tên người / công ty"
          className="mb-3 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg-primary outline-green-500"
        />

        {/* <span>: MoneyField có hai ô (chạm/desktop), tên đến từ `ariaLabel`. */}
        <span className="mb-1 block text-xs font-medium text-fg-muted">
          Số tiền gốc ({CURRENCIES[debt.currency].symbol})
        </span>
        <div className="mb-3">
          <MoneyField
            value={principal}
            onChange={setPrincipal}
            currency={debt.currency}
            ariaLabel="Số tiền gốc"
            onEnter={handleSave}
            className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-right text-lg font-semibold text-fg-primary outline-green-500"
          />
        </div>

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

        <label htmlFor={`${uid}-note`} className="mb-1 block text-xs font-medium text-fg-muted">
          Ghi chú (không bắt buộc)
        </label>
        <input
          id={`${uid}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: mượn lúc chuyển nhà"
          className="mb-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg-primary outline-green-500"
        />

        <p className="mt-2 text-xs text-fg-muted">
          Không đổi được loại tiền của khoản nợ đã tạo.
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md px-3 py-2 text-sm text-fg-muted hover:bg-surface-sunken"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="min-h-11 rounded-md bg-accent text-fg-on-accent px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}
