import { useMemo, useState } from 'react'
import type { NewRecurringRule } from '../../data'
import {
  useAccounts,
  useCategories,
  useCreateRecurringRule,
  useRunRecurringCatchUp,
  useUpdateRecurringRule,
} from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { CURRENCIES, formatMoney, parseMoney, type CurrencyCode } from '../../lib/money'
import type { RecurringFrequency } from '../../lib/recurring'
import type { RecurringRuleRow, TransactionType } from '../../types/database.types'

const TYPE_TABS: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Chi' },
  { value: 'income', label: 'Thu' },
  { value: 'transfer', label: 'Chuyển khoản' },
]

const FREQ_OPTIONS: { value: RecurringFrequency; label: string }[] = [
  { value: 'weekly', label: 'Hàng tuần' },
  { value: 'monthly', label: 'Hàng tháng' },
  { value: 'yearly', label: 'Hàng năm' },
]

interface Props {
  rule: RecurringRuleRow | null
  onClose: () => void
}

/** Sheet thêm/sửa một quy tắc định kỳ. */
export function RecurringFormSheet({ rule, onClose }: Props) {
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const create = useCreateRecurringRule()
  const update = useUpdateRecurringRule()
  const catchUp = useRunRecurringCatchUp()

  const [type, setType] = useState<TransactionType>(rule?.type ?? 'expense')
  const [amountDigits, setAmountDigits] = useState(rule ? String(rule.amount) : '')
  const [toDigits, setToDigits] = useState(rule?.to_amount ? String(rule.to_amount) : '')
  const [categoryId, setCategoryId] = useState<string | null>(rule?.category_id ?? null)
  const [accountId, setAccountId] = useState<string | null>(rule?.account_id ?? null)
  const [toAccountId, setToAccountId] = useState<string | null>(rule?.to_account_id ?? null)
  const [frequency, setFrequency] = useState<RecurringFrequency>(rule?.frequency ?? 'monthly')
  const [startOn, setStartOn] = useState(rule?.start_on ?? toISODate(new Date()))
  const [endOn, setEndOn] = useState(rule?.end_on ?? '')
  const [note, setNote] = useState(rule?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.is_archived), [accounts])
  const activeOfType = useMemo(
    () => categories.filter((c) => c.type === type && !c.is_archived),
    [categories, type],
  )
  const topCategories = activeOfType.filter((c) => !c.parent_id)
  const childrenOf = (id: string) => activeOfType.filter((c) => c.parent_id === id)

  const effectiveAccountId =
    accountId && activeAccounts.some((a) => a.id === accountId)
      ? accountId
      : (activeAccounts[0]?.id ?? null)
  const srcCurrency = activeAccounts.find((a) => a.id === effectiveAccountId)?.currency ?? 'JPY'
  const dstCurrency = activeAccounts.find((a) => a.id === toAccountId)?.currency ?? srcCurrency
  const crossCurrency = type === 'transfer' && !!toAccountId && dstCurrency !== srcCurrency

  const amount = amountDigits === '' ? 0 : Number(amountDigits)
  const toAmount = toDigits === '' ? 0 : Number(toDigits)

  const canSave =
    amount > 0 &&
    !!effectiveAccountId &&
    !!startOn &&
    !saving &&
    (type === 'transfer'
      ? !!toAccountId && toAccountId !== effectiveAccountId && (!crossCurrency || toAmount > 0)
      : !!categoryId && activeOfType.some((c) => c.id === categoryId))

  function switchType(next: TransactionType) {
    setType(next)
    setCategoryId(null)
    setToAccountId(null)
    setToDigits('')
  }

  async function handleSave() {
    if (!canSave || !effectiveAccountId) return
    setSaving(true)
    setError(null)
    try {
      const input: NewRecurringRule = {
        type,
        amount,
        to_amount: crossCurrency ? toAmount : null,
        category_id: type === 'transfer' ? null : categoryId,
        account_id: effectiveAccountId,
        to_account_id: type === 'transfer' ? toAccountId : null,
        note: note.trim(),
        frequency,
        start_on: startOn,
        end_on: endOn || null,
      }
      if (rule) await update.mutateAsync({ id: rule.id, patch: input })
      else await create.mutateAsync(input)
      // Kỳ đã đến hạn sinh ngay, không đợi lần mở app sau
      await catchUp.mutateAsync()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lưu thất bại, thử lại.')
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
      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm text-gray-700 dark:text-gray-300"
    >
      <option value="" disabled>
        Chọn tài khoản…
      </option>
      {activeAccounts
        .filter((a) => a.id !== excludeId)
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {CURRENCIES[a.currency].symbol}
          </option>
        ))}
    </select>
  )

  const moneyInput = (
    digits: string,
    setDigits: (v: string) => void,
    currency: CurrencyCode,
  ) => (
    <input
      inputMode="numeric"
      value={digits === '' ? '' : formatMoney(Number(digits), currency)}
      onChange={(e) => {
        const parsed = String(parseMoney(e.target.value))
        setDigits(parsed === '0' ? '' : parsed)
      }}
      placeholder={formatMoney(0, currency)}
      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-right text-lg font-semibold outline-green-500"
    />
  )

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white dark:bg-gray-900 p-4 lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-bold text-gray-800 dark:text-gray-100">
          {rule ? 'Sửa quy tắc định kỳ' : 'Thêm quy tắc định kỳ'}
        </h2>

        {/* Loại giao dịch */}
        <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => switchType(tab.value)}
              className={`rounded-md py-1.5 text-sm font-medium transition ${
                type === tab.value
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tài khoản (+ đích nếu chuyển khoản) */}
        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
          {type === 'transfer' ? 'Từ tài khoản' : 'Tài khoản'}
        </label>
        <div className="mb-3">{accountSelect(effectiveAccountId, setAccountId, toAccountId)}</div>
        {type === 'transfer' && (
          <>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Đến tài khoản
            </label>
            <div className="mb-3">{accountSelect(toAccountId, setToAccountId, effectiveAccountId)}</div>
          </>
        )}

        {/* Danh mục (ẩn khi chuyển khoản) */}
        {type !== 'transfer' && (
          <>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Danh mục
            </label>
            <select
              value={categoryId ?? ''}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm text-gray-700 dark:text-gray-300"
            >
              <option value="" disabled>
                Chọn danh mục…
              </option>
              {topCategories.map((parent) => {
                const kids = childrenOf(parent.id)
                // Cha có con: chỉ chọn được con (như màn Nhập); cha không con: chọn trực tiếp
                return kids.length > 0 ? (
                  <optgroup key={parent.id} label={`${parent.icon} ${parent.name}`}>
                    {kids.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.name}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  <option key={parent.id} value={parent.id}>
                    {parent.icon} {parent.name}
                  </option>
                )
              })}
            </select>
          </>
        )}

        {/* Số tiền */}
        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
          Số tiền ({srcCurrency})
        </label>
        <div className="mb-3">{moneyInput(amountDigits, setAmountDigits, srcCurrency)}</div>
        {crossCurrency && (
          <>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Nhận được ({dstCurrency})
            </label>
            <div className="mb-3">{moneyInput(toDigits, setToDigits, dstCurrency)}</div>
          </>
        )}

        {/* Chu kỳ + ngày bắt đầu / kết thúc */}
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Chu kỳ
            </label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm text-gray-700 dark:text-gray-300"
            >
              {FREQ_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              Bắt đầu (kỳ đầu tiên)
            </label>
            <input
              type="date"
              value={startOn}
              onChange={(e) => setStartOn(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm outline-green-500"
            />
          </div>
        </div>
        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
          Kết thúc (không bắt buộc)
        </label>
        <input
          type="date"
          value={endOn}
          onChange={(e) => setEndOn(e.target.value)}
          className="mb-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2 text-sm outline-green-500"
        />

        <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
          Ghi chú (không bắt buộc)
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: tiền nhà"
          className="mb-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm outline-green-500"
        />

        {rule && (
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            Thay đổi chỉ áp dụng cho các kỳ tương lai; giao dịch đã sinh giữ nguyên.
          </p>
        )}
        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

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
