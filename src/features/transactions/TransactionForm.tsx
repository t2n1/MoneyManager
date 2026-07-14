import { useMemo, useState } from 'react'
import type { NewTransaction } from '../../data'
import { toISODate } from '../../lib/dates'
import { formatVND, parseVND } from '../../lib/money'
import type { TransactionRow, TransactionType } from '../../types/database.types'
import { useAccounts, useCategories } from '../../hooks/queries'
import { NumPad, type NumPadKey } from './NumPad'

const LAST_ACCOUNT_KEY = 'sct-last-account'

const TYPE_TABS: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Chi' },
  { value: 'income', label: 'Thu' },
  { value: 'transfer', label: 'Chuyển khoản' },
]

const AMOUNT_COLOR: Record<TransactionType, string> = {
  expense: 'text-red-600',
  income: 'text-green-600',
  transfer: 'text-gray-600',
}

const MAX_AMOUNT_DIGITS = 12 // 999.999.999.999 ₫

interface TransactionFormProps {
  /** Có giá trị = form sửa; không = form nhập mới */
  initial?: TransactionRow
  submitLabel: string
  onSubmit: (values: NewTransaction) => Promise<void>
  /** Nhập nhanh: reset số tiền + ghi chú sau khi lưu để nhập tiếp */
  resetAfterSubmit?: boolean
}

export function TransactionForm({
  initial,
  submitLabel,
  onSubmit,
  resetAfterSubmit,
}: TransactionFormProps) {
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()

  const [type, setType] = useState<TransactionType>(initial?.type ?? 'expense')
  const [digits, setDigits] = useState(initial ? String(initial.amount) : '')
  const [categoryId, setCategoryId] = useState<string | null>(initial?.category_id ?? null)
  const [accountId, setAccountId] = useState<string | null>(
    initial?.account_id ?? localStorage.getItem(LAST_ACCOUNT_KEY),
  )
  const [toAccountId, setToAccountId] = useState<string | null>(initial?.to_account_id ?? null)
  const [date, setDate] = useState(initial?.occurred_on ?? toISODate(new Date()))
  const [note, setNote] = useState(initial?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.is_archived), [accounts])
  const visibleCategories = useMemo(
    () => categories.filter((c) => c.type === type && !c.is_archived),
    [categories, type],
  )

  // Tài khoản mặc định = dùng lần trước, fallback tài khoản đầu tiên
  const effectiveAccountId =
    accountId && activeAccounts.some((a) => a.id === accountId)
      ? accountId
      : (activeAccounts[0]?.id ?? null)

  const amount = digits === '' ? 0 : Number(digits)
  const canSave =
    amount > 0 &&
    !!effectiveAccountId &&
    !saving &&
    (type === 'transfer'
      ? !!toAccountId && toAccountId !== effectiveAccountId
      : !!categoryId && visibleCategories.some((c) => c.id === categoryId))

  function switchType(next: TransactionType) {
    setType(next)
    setCategoryId(null)
    setToAccountId(null)
  }

  function onNumPadKey(key: NumPadKey) {
    setDigits((d) => {
      if (key === '⌫') return d.slice(0, -1)
      const next = (d + key).replace(/^0+(?=\d)/, '')
      return next.length > MAX_AMOUNT_DIGITS ? d : next
    })
  }

  async function handleSubmit() {
    if (!canSave || !effectiveAccountId) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        type,
        amount,
        category_id: type === 'transfer' ? null : categoryId,
        account_id: effectiveAccountId,
        to_account_id: type === 'transfer' ? toAccountId : null,
        occurred_on: date,
        note: note.trim(),
      })
      localStorage.setItem(LAST_ACCOUNT_KEY, effectiveAccountId)
      if (resetAfterSubmit) {
        setDigits('')
        setNote('')
        setCategoryId(null)
        setToAccountId(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lưu thất bại, thử lại.')
    } finally {
      setSaving(false)
    }
  }

  const accountSelect = (
    value: string | null,
    onChange: (id: string) => void,
    excludeId?: string | null,
  ) => (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700"
    >
      <option value="" disabled>
        Chọn tài khoản…
      </option>
      {activeAccounts
        .filter((a) => a.id !== excludeId)
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.type === 'cash' ? '💵' : '🏦'} {a.name}
          </option>
        ))}
    </select>
  )

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Tab loại giao dịch */}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-200 p-1">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => switchType(tab.value)}
            className={`rounded-lg py-1.5 text-sm font-medium transition ${
              type === tab.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Số tiền: mobile hiển thị (numpad nhập), desktop là input gõ trực tiếp */}
      <div
        className={`rounded-xl bg-white px-4 py-3 text-right text-3xl font-bold shadow-sm ${AMOUNT_COLOR[type]} lg:hidden`}
      >
        {formatVND(amount)}
      </div>
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        inputMode="numeric"
        value={digits === '' ? '' : formatVND(amount)}
        onChange={(e) => {
          const parsed = String(parseVND(e.target.value))
          setDigits(parsed === '0' ? '' : parsed.slice(0, MAX_AMOUNT_DIGITS))
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit()
        }}
        placeholder="0 ₫"
        className={`hidden rounded-xl bg-white px-4 py-3 text-right text-3xl font-bold shadow-sm outline-green-500 lg:block ${AMOUNT_COLOR[type]}`}
      />

      {/* Tài khoản + ngày + ghi chú */}
      <div className="flex flex-wrap items-center gap-2">
        {type === 'transfer' ? (
          <>
            {accountSelect(effectiveAccountId, setAccountId, toAccountId)}
            <span className="text-gray-400">→</span>
            {accountSelect(toAccountId, setToAccountId, effectiveAccountId)}
          </>
        ) : (
          accountSelect(effectiveAccountId, setAccountId)
        )}
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700"
        />
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit()
        }}
        placeholder="Ghi chú (tùy chọn)"
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-green-500"
      />

      {/* Danh mục (ẩn khi chuyển khoản) */}
      {type !== 'transfer' && (
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-4 gap-1.5 overflow-y-auto lg:grid-cols-5">
          {visibleCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id)}
              className={`flex flex-col items-center gap-0.5 rounded-xl border-2 bg-white px-1 py-2 text-xs text-gray-700 transition active:scale-95 ${
                categoryId === c.id ? 'border-green-500 bg-green-50' : 'border-transparent shadow-sm'
              }`}
            >
              <span className="text-xl leading-none">{c.icon}</span>
              <span className="truncate w-full text-center">{c.name}</span>
            </button>
          ))}
        </div>
      )}
      {type === 'transfer' && <div className="flex-1" />}

      {/* NumPad chỉ trên mobile */}
      <div className="lg:hidden">
        <NumPad onKey={onNumPadKey} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSave}
        className="rounded-xl bg-green-600 py-3 text-base font-semibold text-white shadow-sm transition enabled:active:scale-95 enabled:hover:bg-green-700 disabled:opacity-40"
      >
        {saving ? 'Đang lưu…' : submitLabel}
      </button>
    </div>
  )
}
