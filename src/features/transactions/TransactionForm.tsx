import { useEffect, useMemo, useState } from 'react'
import type { NewRecurringRule, NewTransaction } from '../../data'
import { toISODate } from '../../lib/dates'
import { formatMoney, parseMoney, type CurrencyCode } from '../../lib/money'
import type { RecurringFrequency } from '../../lib/recurring'
import type { TransactionRow, TransactionType } from '../../types/database.types'
import { useAccounts, useCategories } from '../../hooks/queries'
import { AccountPicker } from '../../components/AccountPicker'
import { NumPad, type NumPadKey } from './NumPad'
import { appendKey, evalExpression, MAX_AMOUNT_DIGITS } from './calc'

const LAST_ACCOUNT_KEY = 'sct-last-account'
const lastCategoryKey = (type: TransactionType) => `sct-last-category-${type}`

/** id danh mục lần trước của loại `type`, chỉ trả khi còn hợp lệ (không lưu trữ). */
function lastCategoryFor(
  type: TransactionType,
  categories: { id: string; type: TransactionType; is_archived: boolean }[],
): string | null {
  const id = localStorage.getItem(lastCategoryKey(type))
  if (!id) return null
  const c = categories.find((x) => x.id === id)
  return c && c.type === type && !c.is_archived ? id : null
}

const TYPE_TABS: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Chi' },
  { value: 'income', label: 'Thu' },
  { value: 'transfer', label: 'Chuyển khoản' },
]

const AMOUNT_COLOR: Record<TransactionType, string> = {
  expense: 'text-red-600 dark:text-red-400',
  income: 'text-green-600 dark:text-green-400',
  transfer: 'text-gray-600 dark:text-gray-300',
}

const hasOperator = (expr: string) => /[+−×÷]/.test(expr)

/** Biểu thức → chuỗi hiển thị: mỗi số định dạng như tiền, nối bằng dấu có khoảng trắng. */
function formatExpr(expr: string, currency: CurrencyCode): string {
  return expr
    .replace(/\d+/g, (n) => formatMoney(Number(n), currency))
    .replace(/([+−×÷])/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface TransactionFormProps {
  /** Có giá trị = form sửa; không = form nhập mới */
  initial?: TransactionRow
  /** Nhãn nút lưu chính (lưu rồi rời màn hình) */
  submitLabel: string
  onSubmit: (values: NewTransaction) => Promise<void>
  /**
   * Nút phụ "lưu rồi nhập tiếp": có mặt → hiện nút thứ hai, lưu xong tự xóa
   * số tiền + ghi chú để nhập giao dịch kế tiếp mà không rời màn hình.
   */
  continueLabel?: string
  onContinue?: (values: NewTransaction) => Promise<void>
  /** Loại khởi tạo khi mở mới (vd từ lối tắt PWA) — bỏ qua nếu có `initial`. */
  initialType?: TransactionType
  /**
   * Màn Nhập: cho phép "Lặp lại". Khi người dùng chọn chu kỳ, submit gọi hàm
   * này (tạo rule + catch-up sinh kỳ đầu) thay vì onSubmit. Không truyền
   * (form sửa) → không hiện selector.
   */
  onSubmitRecurring?: (rule: NewRecurringRule) => Promise<void>
}

export function TransactionForm({
  initial,
  submitLabel,
  onSubmit,
  continueLabel,
  onContinue,
  initialType,
  onSubmitRecurring,
}: TransactionFormProps) {
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()

  const [type, setType] = useState<TransactionType>(initial?.type ?? initialType ?? 'expense')
  const [digits, setDigits] = useState(initial ? String(initial.amount) : '')
  const [toDigits, setToDigits] = useState(initial?.to_amount ? String(initial.to_amount) : '')
  /** CK xuyên tệ trên mobile: numpad đang gõ vào ô nào */
  const [activeField, setActiveField] = useState<'main' | 'to'>('main')
  const [categoryId, setCategoryId] = useState<string | null>(
    initial?.category_id ?? lastCategoryFor(initial?.type ?? initialType ?? 'expense', categories),
  )
  const [accountId, setAccountId] = useState<string | null>(
    initial?.account_id ?? localStorage.getItem(LAST_ACCOUNT_KEY),
  )
  const [toAccountId, setToAccountId] = useState<string | null>(initial?.to_account_id ?? null)
  const [date, setDate] = useState(initial?.occurred_on ?? toISODate(new Date()))
  const [note, setNote] = useState(initial?.note ?? '')
  // Lặp lại (chỉ form nhập mới): 'none' = không lặp, còn lại là chu kỳ
  const [repeat, setRepeat] = useState<'none' | RecurringFrequency>('none')
  // Nút đang lưu: 'save' | 'continue' | null — để khóa cả hai nút và hiện "Đang lưu…"
  const [pending, setPending] = useState<'save' | 'continue' | null>(null)
  const saving = pending !== null
  const [error, setError] = useState<string | null>(null)
  // Picker danh mục con: đang mở nhóm cha nào (null = màn danh mục chính)
  const [drillId, setDrillId] = useState<string | null>(() => {
    const cid = initial?.category_id ?? lastCategoryFor(initial?.type ?? initialType ?? 'expense', categories)
    return categories.find((c) => c.id === cid)?.parent_id ?? null
  })

  // Điền sẵn danh mục lần trước khi categories tải xong (form mới, chưa chọn gì)
  useEffect(() => {
    if (initial || categoryId !== null || type === 'transfer') return
    const last = lastCategoryFor(type, categories)
    if (last) setCategoryId(last)
  }, [categories, type, initial, categoryId])

  // Tài khoản chọn được: đang hoạt động + tài khoản của GD đang sửa (kể cả đã
  // lưu trữ) — nếu không, form sửa sẽ âm thầm gán GD sang tài khoản khác.
  const activeAccounts = useMemo(() => {
    const list = accounts.filter((a) => !a.is_archived)
    for (const id of [initial?.account_id, initial?.to_account_id]) {
      if (id && !list.some((a) => a.id === id)) {
        const archived = accounts.find((a) => a.id === id)
        if (archived) list.push(archived)
      }
    }
    return list
  }, [accounts, initial])
  const activeOfType = useMemo(
    () => categories.filter((c) => c.type === type && !c.is_archived),
    [categories, type],
  )
  const topCategories = useMemo(() => activeOfType.filter((c) => !c.parent_id), [activeOfType])
  const childrenOf = (id: string) => activeOfType.filter((c) => c.parent_id === id)
  const selectedCat = categories.find((c) => c.id === categoryId) ?? null
  const drillParent = drillId ? topCategories.find((c) => c.id === drillId) ?? null : null
  const drillChildren = drillParent ? childrenOf(drillParent.id) : []

  // Tài khoản mặc định = dùng lần trước, fallback tài khoản đầu tiên
  const effectiveAccountId =
    accountId && activeAccounts.some((a) => a.id === accountId)
      ? accountId
      : (activeAccounts[0]?.id ?? null)

  const srcCurrency = activeAccounts.find((a) => a.id === effectiveAccountId)?.currency ?? 'JPY'
  const dstCurrency = activeAccounts.find((a) => a.id === toAccountId)?.currency ?? srcCurrency
  const crossCurrency = type === 'transfer' && !!toAccountId && dstCurrency !== srcCurrency

  const amountResult = evalExpression(digits)
  const amount = amountResult ?? 0
  const toAmountResult = evalExpression(toDigits)
  const toAmount = toAmountResult ?? 0

  const canSave =
    amount > 0 &&
    !!effectiveAccountId &&
    !saving &&
    (type === 'transfer'
      ? !!toAccountId && toAccountId !== effectiveAccountId && (!crossCurrency || toAmount > 0)
      : !!categoryId && activeOfType.some((c) => c.id === categoryId))

  function switchType(next: TransactionType) {
    setType(next)
    const last = lastCategoryFor(next, categories)
    setCategoryId(last)
    setDrillId(categories.find((c) => c.id === last)?.parent_id ?? null)
    setToAccountId(null)
    setToDigits('')
    setActiveField('main')
  }

  function onNumPadKey(key: NumPadKey) {
    const setter = activeField === 'to' && crossCurrency ? setToDigits : setDigits
    setter((d) => appendKey(d, key))
  }

  async function handleSubmit(mode: 'save' | 'continue' = 'save') {
    if (!canSave || !effectiveAccountId) return
    const keepGoing = mode === 'continue' && !!onContinue
    setPending(mode)
    setError(null)
    try {
      const values: NewTransaction = {
        type,
        amount,
        to_amount: crossCurrency ? toAmount : null,
        category_id: type === 'transfer' ? null : categoryId,
        account_id: effectiveAccountId,
        to_account_id: type === 'transfer' ? toAccountId : null,
        occurred_on: date,
        note: note.trim(),
      }
      if (repeat !== 'none' && onSubmitRecurring) {
        // Lặp lại: tạo rule (kỳ đầu do engine catch-up sinh, không tạo GD riêng)
        await onSubmitRecurring({
          type,
          amount,
          to_amount: crossCurrency ? toAmount : null,
          category_id: type === 'transfer' ? null : categoryId,
          account_id: effectiveAccountId,
          to_account_id: type === 'transfer' ? toAccountId : null,
          note: note.trim(),
          frequency: repeat,
          start_on: date,
          end_on: null,
        })
      } else {
        await (keepGoing ? onContinue!(values) : onSubmit(values))
      }
      localStorage.setItem(LAST_ACCOUNT_KEY, effectiveAccountId)
      if (type !== 'transfer' && categoryId) {
        localStorage.setItem(lastCategoryKey(type), categoryId)
      }
      if (keepGoing) {
        // Nhập liên tục: giữ danh mục + tài khoản + ngày, chỉ xóa số tiền + ghi chú
        setDigits('')
        setToDigits('')
        setNote('')
        setToAccountId(null)
        setActiveField('main')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lưu thất bại, thử lại.')
    } finally {
      setPending(null)
    }
  }

  /** Ô số tiền: div hiển thị trên mobile (numpad gõ), input trên desktop */
  const amountBox = (
    field: 'main' | 'to',
    expr: string,
    currency: CurrencyCode,
    setDigitsFn: (v: string) => void,
    label?: string,
  ) => {
    const isActive = crossCurrency && activeField === field
    const ring = isActive ? 'ring-2 ring-green-500' : ''
    const result = evalExpression(expr)
    const showExpr = hasOperator(expr)
    const mobileText = showExpr ? formatExpr(expr, currency) : formatMoney(result ?? 0, currency)
    const inputValue = result && result !== 0 ? formatMoney(result, currency) : ''
    return (
      <div className="flex flex-col gap-0.5">
        {label && <span className="px-1 text-xs text-gray-500 dark:text-gray-400">{label}</span>}
        <button
          type="button"
          onClick={() => setActiveField(field)}
          className={`truncate rounded-xl bg-white dark:bg-gray-900 px-4 py-2.5 text-right font-bold shadow-sm ${
            showExpr ? 'text-xl' : 'text-3xl'
          } ${AMOUNT_COLOR[type]} ${ring} lg:hidden`}
        >
          {mobileText}
        </button>
        {showExpr && result !== null && (
          <span className="px-1 text-right text-sm text-gray-500 dark:text-gray-400 lg:hidden">
            = {formatMoney(result, currency)}
          </span>
        )}
        <input
          inputMode="numeric"
          value={inputValue}
          onChange={(e) => {
            const parsed = String(parseMoney(e.target.value))
            setDigitsFn(parsed === '0' ? '' : parsed.slice(0, MAX_AMOUNT_DIGITS))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
          }}
          placeholder={formatMoney(0, currency)}
          className={`hidden rounded-xl bg-white dark:bg-gray-900 px-4 py-3 text-right text-3xl font-bold shadow-sm outline-green-500 lg:block ${AMOUNT_COLOR[type]}`}
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
      {/* Tab loại giao dịch */}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-200 dark:bg-gray-800 p-1">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => switchType(tab.value)}
            className={`rounded-lg py-1.5 text-sm font-medium transition ${
              type === tab.value ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Số tiền (nguồn); CK xuyên tệ có thêm ô "nhận được" */}
      {amountBox('main', digits, srcCurrency, setDigits, crossCurrency ? 'Chuyển đi' : undefined)}
      {crossCurrency &&
        amountBox('to', toDigits, dstCurrency, setToDigits, `Nhận được (${dstCurrency})`)}

      {/* Tài khoản + ngày */}
      <div className="flex flex-wrap items-center gap-2">
        {type === 'transfer' ? (
          <>
            <AccountPicker
              accounts={activeAccounts}
              value={effectiveAccountId}
              onChange={setAccountId}
              excludeId={toAccountId}
            />
            <span className="text-gray-400 dark:text-gray-500">→</span>
            <AccountPicker
              accounts={activeAccounts}
              value={toAccountId}
              onChange={setToAccountId}
              excludeId={effectiveAccountId}
            />
          </>
        ) : (
          <AccountPicker
            accounts={activeAccounts}
            value={effectiveAccountId}
            onChange={setAccountId}
          />
        )}
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300"
        />
        {!initial && onSubmitRecurring && (
          <select
            value={repeat}
            onChange={(e) => setRepeat(e.target.value as 'none' | RecurringFrequency)}
            aria-label="Lặp lại"
            className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300"
          >
            <option value="none">Không lặp</option>
            <option value="weekly">Hàng tuần</option>
            <option value="monthly">Hàng tháng</option>
            <option value="yearly">Hàng năm</option>
          </select>
        )}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit()
        }}
        placeholder="Ghi chú (tùy chọn)"
        className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 outline-green-500"
      />

      {/* Danh mục (ẩn khi chuyển khoản) */}
      {type !== 'transfer' &&
        (drillParent ? (
          /* Trong một nhóm cha → chọn danh mục con (bắt buộc) */
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
            <button
              type="button"
              onClick={() => setDrillId(null)}
              className="flex items-center gap-1.5 self-start rounded-lg bg-white dark:bg-gray-900 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 shadow-sm active:scale-95"
            >
              ‹ <span className="text-base leading-none">{drillParent.icon}</span> {drillParent.name}
            </button>
            <div className="grid auto-rows-min grid-cols-4 gap-1.5 lg:grid-cols-5">
              {drillChildren.map((c) => (
                <CategoryTile
                  key={c.id}
                  icon={c.icon}
                  name={c.name}
                  selected={categoryId === c.id}
                  onClick={() => setCategoryId(c.id)}
                />
              ))}
              {drillChildren.length === 0 && (
                <p className="col-span-full py-4 text-center text-xs text-gray-400 dark:text-gray-500">
                  Nhóm này chưa có danh mục con
                </p>
              )}
            </div>
          </div>
        ) : (
          /* Màn danh mục chính */
          <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-4 gap-1.5 overflow-y-auto lg:grid-cols-5">
            {topCategories.map((c) => {
              const kids = childrenOf(c.id)
              const hasKids = kids.length > 0
              return (
                <CategoryTile
                  key={c.id}
                  icon={c.icon}
                  name={c.name}
                  // Cha có con: chọn selection đang nằm bên trong; cha không con: chọn trực tiếp
                  selected={hasKids ? selectedCat?.parent_id === c.id : categoryId === c.id}
                  hasChildren={hasKids}
                  onClick={() => (hasKids ? setDrillId(c.id) : setCategoryId(c.id))}
                />
              )
            })}
          </div>
        ))}
      {type === 'transfer' && <div className="flex-1" />}

      {/* NumPad chỉ trên mobile */}
      <div className="lg:hidden">
        <NumPad onKey={onNumPadKey} />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {onContinue && repeat === 'none' ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleSubmit('continue')}
            disabled={!canSave}
            className="rounded-xl border border-green-600 bg-white py-3 text-base font-semibold text-green-700 shadow-sm transition enabled:active:scale-95 enabled:hover:bg-green-50 disabled:opacity-40 dark:bg-gray-900 dark:text-green-400 dark:enabled:hover:bg-gray-800"
          >
            {pending === 'continue' ? 'Đang lưu…' : continueLabel}
          </button>
          <button
            type="button"
            onClick={() => handleSubmit('save')}
            disabled={!canSave}
            className="rounded-xl bg-green-600 py-3 text-base font-semibold text-white shadow-sm transition enabled:active:scale-95 enabled:hover:bg-green-700 disabled:opacity-40"
          >
            {pending === 'save' ? 'Đang lưu…' : submitLabel}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => handleSubmit('save')}
          disabled={!canSave}
          className="rounded-xl bg-green-600 py-3 text-base font-semibold text-white shadow-sm transition enabled:active:scale-95 enabled:hover:bg-green-700 disabled:opacity-40"
        >
          {saving ? 'Đang lưu…' : submitLabel}
        </button>
      )}
    </div>
  )
}

function CategoryTile({
  icon,
  name,
  selected,
  hasChildren,
  onClick,
}: {
  icon: string
  name: string
  selected: boolean
  hasChildren?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center gap-0.5 rounded-xl border-2 bg-white dark:bg-gray-900 px-1 py-2 text-xs text-gray-700 dark:text-gray-300 transition active:scale-95 ${
        selected ? 'border-green-500 bg-green-50 dark:bg-green-900/30' : 'border-transparent shadow-sm'
      }`}
    >
      <span className="text-xl leading-none">{icon}</span>
      <span className="w-full truncate text-center">{name}</span>
      {hasChildren && (
        <span className="absolute top-1 right-1 text-[10px] leading-none text-gray-400 dark:text-gray-500">›</span>
      )}
    </button>
  )
}
