import { useEffect, useMemo, useState } from 'react'
import type { NewDebt, NewTransaction } from '../../data'
import { useAccounts, useCategories, useCreateDebt, useUpdateDebt } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { CURRENCIES, formatMoney, parseMoney, type CurrencyCode } from '../../lib/money'
import type { DebtDirection, DebtRow } from '../../types/database.types'

const CURRENCY_LIST = Object.keys(CURRENCIES) as CurrencyCode[]

interface Props {
  debt: DebtRow | null
  onClose: () => void
}

/** Sheet thêm/sửa một khoản nợ. Khi TẠO mới có thể kèm giải ngân (chuyển tiền thật). */
export function DebtFormSheet({ debt, onClose }: Props) {
  const create = useCreateDebt()
  const update = useUpdateDebt()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()

  const [counterparty, setCounterparty] = useState(debt?.counterparty ?? '')
  const [direction, setDirection] = useState<DebtDirection>(debt?.direction ?? 'i_owe')
  const [currency, setCurrency] = useState<CurrencyCode>(debt?.currency ?? 'JPY')
  const [principalDigits, setPrincipalDigits] = useState(debt ? String(debt.principal) : '')
  const [dueOn, setDueOn] = useState(debt?.due_on ?? '')
  const [note, setNote] = useState(debt?.note ?? '')
  // Trả góp / lãi suất (mục AG) — %/năm và số kỳ, đều không bắt buộc
  const [interestPct, setInterestPct] = useState(
    debt?.interest_bps != null ? String(debt.interest_bps / 100) : '',
  )
  const [termMonths, setTermMonths] = useState(
    debt?.term_months != null ? String(debt.term_months) : '',
  )
  const [saving, setSaving] = useState(false)

  // --- Giải ngân (chỉ khi TẠO mới) ---
  // Cho vay = tiền RỜI tài khoản (chi); Mình nợ = tiền VÀO tài khoản (thu).
  const txType = direction === 'owed_to_me' ? 'expense' : 'income'
  // Chỉ cho chuyển từ/vào tài khoản CÙNG loại tiền với khoản nợ (v1 tránh xuyên tệ).
  const matchingAccounts = useMemo(
    () => accounts.filter((a) => !a.is_archived && a.currency === currency),
    [accounts, currency],
  )
  const categoryOptions = useMemo(
    () => categories.filter((c) => !c.is_archived && c.type === txType),
    [categories, txType],
  )
  const canRecordReal = !debt && matchingAccounts.length > 0 && categoryOptions.length > 0

  const [withTransaction, setWithTransaction] = useState(true)
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')

  // Điền/đồng bộ tài khoản mặc định khi dữ liệu về hoặc khi đổi loại tiền.
  useEffect(() => {
    if (!matchingAccounts.some((a) => a.id === accountId)) {
      setAccountId(matchingAccounts[0]?.id ?? '')
    }
  }, [accountId, matchingAccounts])
  // Đồng bộ danh mục khi đổi chiều (chi ↔ thu).
  useEffect(() => {
    if (!categoryOptions.some((c) => c.id === categoryId)) {
      setCategoryId(categoryOptions[0]?.id ?? '')
    }
  }, [categoryId, categoryOptions])

  const principal = principalDigits === '' ? 0 : Number(principalDigits)
  const realOn = canRecordReal && withTransaction
  const canSave =
    counterparty.trim().length > 0 &&
    principal > 0 &&
    !saving &&
    (!realOn || (!!accountId && !!categoryId))

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      let transaction: NewTransaction | null = null
      if (realOn) {
        transaction = {
          type: txType,
          amount: principal, // cùng tệ vì tài khoản đã lọc theo currency của khoản nợ
          to_amount: null,
          category_id: categoryId,
          account_id: accountId,
          to_account_id: null,
          occurred_on: toISODate(new Date()),
          note:
            note.trim() ||
            `${txType === 'expense' ? 'Cho vay' : 'Vay'} · ${counterparty.trim()}`,
        }
      }
      const pct = Number(interestPct)
      const term = Number(termMonths)
      const input: NewDebt = {
        counterparty: counterparty.trim(),
        direction,
        currency,
        principal,
        due_on: dueOn || null,
        note: note.trim(),
        interest_bps: interestPct.trim() && !Number.isNaN(pct) ? Math.round(pct * 100) : null,
        term_months: termMonths.trim() && !Number.isNaN(term) && term > 0 ? Math.round(term) : null,
        transaction,
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
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white dark:bg-gray-900 p-4 lg:rounded-2xl"
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

        {/* Trả góp / lãi suất (mục AG) — điền cả hai để xem lịch trả dự kiến */}
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Lãi suất %/năm (tùy chọn)
            </label>
            <input
              inputMode="decimal"
              value={interestPct}
              onChange={(e) => setInterestPct(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="vd 5.5"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-right text-sm outline-green-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Số kỳ / tháng (tùy chọn)
            </label>
            <input
              inputMode="numeric"
              value={termMonths}
              onChange={(e) => setTermMonths(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="vd 12"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-right text-sm outline-green-500"
            />
          </div>
        </div>

        {/* Giải ngân: chỉ khi tạo mới */}
        {!debt && (
          <div className="mb-3 rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
            <label className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
              <span>
                Có chuyển tiền thật
                <span className="block text-xs text-gray-400 dark:text-gray-500">
                  {direction === 'owed_to_me'
                    ? 'Tạo giao dịch chi (trừ số dư tài khoản)'
                    : 'Tạo giao dịch thu (cộng số dư tài khoản)'}
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
                  realOn ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'
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
                Chưa có tài khoản {currency} (và danh mục {txType === 'expense' ? 'chi' : 'thu'} phù
                hợp) để tạo giao dịch thật. Vẫn lưu được khoản nợ (không đổi số dư).
              </p>
            )}

            {realOn && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                    {direction === 'owed_to_me' ? 'Trừ từ tài khoản' : 'Cộng vào tài khoản'}
                  </label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm"
                  >
                    {matchingAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Danh mục</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm"
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
        )}

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
