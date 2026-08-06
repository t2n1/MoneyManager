import { useEffect, useMemo, useState } from 'react'
import type { NewDebtPayment, NewTransaction } from '../../data'
import { useAccounts, useCategories, useCreateDebtPayment } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { MoneyField } from '../../components/MoneyField'
import type { DebtRow } from '../../types/database.types'

interface Props {
  debt: DebtRow
  /** còn lại (minor units theo currency của nợ) — gợi ý điền sẵn */
  remaining: number
  onClose: () => void
}

/** Sheet ghi nhận một lần trả nợ. Tùy chọn tạo giao dịch thật (đổi số dư tài khoản). */
export function DebtPaymentSheet({ debt, remaining, onClose }: Props) {
  const createPayment = useCreateDebtPayment()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()

  // Chỉ cho trả từ tài khoản CÙNG loại tiền với khoản nợ (v1 tránh xuyên tệ)
  const matchingAccounts = useMemo(
    () => accounts.filter((a) => !a.is_archived && a.currency === debt.currency),
    [accounts, debt.currency],
  )
  // Giao dịch: mình trả (i_owe) = chi; người ta trả mình (owed_to_me) = thu
  const txType = debt.direction === 'i_owe' ? 'expense' : 'income'
  const categoryOptions = useMemo(
    () => categories.filter((c) => !c.is_archived && c.type === txType),
    [categories, txType],
  )

  const canRecordReal = matchingAccounts.length > 0 && categoryOptions.length > 0
  // Mặc định bật; realOn còn phụ thuộc canRecordReal (accounts/categories tải xong).
  const [withTransaction, setWithTransaction] = useState(true)
  const [amount, setAmount] = useState(Math.max(remaining, 0))
  const [paidOn, setPaidOn] = useState(toISODate(new Date()))
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Điền tài khoản/danh mục mặc định khi dữ liệu về (useState không nhận được data async).
  useEffect(() => {
    if (!accountId && matchingAccounts[0]) setAccountId(matchingAccounts[0].id)
  }, [accountId, matchingAccounts])
  useEffect(() => {
    if (!categoryId && categoryOptions[0]) setCategoryId(categoryOptions[0].id)
  }, [categoryId, categoryOptions])

  const realOn = withTransaction && canRecordReal
  const canSave = amount > 0 && !saving && (!realOn || (!!accountId && !!categoryId))

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      let transaction: NewTransaction | null = null
      if (realOn) {
        transaction = {
          type: txType,
          amount, // cùng tệ vì tài khoản đã lọc theo currency của khoản nợ
          to_amount: null,
          category_id: categoryId,
          account_id: accountId,
          to_account_id: null,
          occurred_on: paidOn,
          note: note.trim() || `${txType === 'expense' ? 'Trả nợ' : 'Thu nợ'} · ${debt.counterparty}`,
        }
      }
      const input: NewDebtPayment = {
        debt_id: debt.id,
        amount,
        paid_on: paidOn,
        note: note.trim(),
        transaction,
      }
      await createPayment.mutateAsync(input)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-base font-bold text-fg-primary">Ghi nhận trả</h2>
        <p className="mb-3 text-xs text-fg-muted">
          {debt.direction === 'i_owe' ? 'Mình trả' : 'Người ta trả'} · {debt.counterparty} · còn{' '}
          {formatMoney(Math.max(remaining, 0), debt.currency)}
        </p>

        <label className="mb-1 block text-xs font-medium text-fg-muted">Số tiền trả</label>
        <div className="mb-3">
          <MoneyField
            value={amount}
            onChange={setAmount}
            currency={debt.currency}
            ariaLabel="Số tiền trả"
            onEnter={handleSave}
            className="w-full rounded-lg border border-border-strong px-3 py-2 text-right text-lg font-semibold outline-green-500"
          />
        </div>

        <label className="mb-1 block text-xs font-medium text-fg-muted">Ngày trả</label>
        <input
          type="date"
          value={paidOn}
          onChange={(e) => setPaidOn(e.target.value)}
          className="mb-3 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm outline-green-500"
        />

        {/* Công tắc tạo giao dịch thật */}
        <div className="mb-3 rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
          <label className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
            <span>
              Có chuyển tiền thật
              <span className="block text-xs text-fg-muted">
                {debt.direction === 'i_owe' ? 'Tạo giao dịch chi (trừ số dư)' : 'Tạo giao dịch thu (cộng số dư)'}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={realOn}
              aria-label="Có chuyển tiền thật"
              disabled={!canRecordReal}
              onClick={() => setWithTransaction((v) => !v)}
              className={`relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-40 ${
                realOn ? 'bg-green-700' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                  realOn ? 'left-[18px]' : 'left-0.5'
                }`}
              />
            </button>
          </label>

          {!canRecordReal && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              Chưa có tài khoản {debt.currency} (và danh mục phù hợp) để tạo giao dịch thật. Vẫn ghi
              nhận được lần trả (không đổi số dư).
            </p>
          )}

          {realOn && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Tài khoản</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full rounded-lg border border-border-strong bg-surface px-2 py-2 text-sm"
                >
                  {matchingAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Danh mục</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-lg border border-border-strong bg-surface px-2 py-2 text-sm"
                >
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        <label className="mb-1 block text-xs font-medium text-fg-muted">Ghi chú (không bắt buộc)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: trả đợt 1"
          className="w-full rounded-lg border border-border-strong px-3 py-2 text-sm outline-green-500"
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-lg px-3 py-2 text-sm text-fg-muted hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="min-h-11 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? 'Đang lưu…' : 'Ghi nhận'}
          </button>
        </div>
      </div>
    </div>
  )
}
