import { useEffect, useMemo, useState } from 'react'
import { Repeat, Sparkles, Star, X } from 'lucide-react'
import type { NewRecurringRule, NewTransaction } from '../../data'
import { toISODate } from '../../lib/dates'
import { formatMoney, parseMoney, type CurrencyCode } from '../../lib/money'
import type { RecurringFrequency } from '../../lib/recurring'
import type { TransactionRow, TransactionType } from '../../types/database.types'
import { useAccounts, useCategories } from '../../hooks/queries'
import { AccountPicker } from '../../components/AccountPicker'
import { NumPad, type NumPadKey } from './NumPad'
import { appendKey, evalExpression, MAX_AMOUNT_DIGITS } from './calc'
import { parseNl } from './parseNl'
import {
  addQuickTemplate,
  deleteQuickTemplate,
  useQuickTemplates,
  type QuickTemplate,
} from './quickTemplates'

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

// Nút "Lặp lại" gọn: chạm để xoay vòng qua các chu kỳ
const REPEAT_CYCLE: ('none' | RecurringFrequency)[] = ['none', 'weekly', 'monthly', 'yearly']
const REPEAT_LABEL: Record<'none' | RecurringFrequency, string> = {
  none: 'Không lặp',
  weekly: 'Tuần',
  monthly: 'Tháng',
  yearly: 'Năm',
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
  /** Hiện tùy chọn "Không tính vào thống kê" (mục AM) — dùng ở màn sửa, ẩn ở màn nhập nhanh. */
  showExcludeOption?: boolean
  /** Hiện ô "nhập nhanh bằng lời" (chỉ màn nhập mới). Gõ câu → tự điền các trường. */
  enableNlInput?: boolean
  /** Hiện hàng mẫu giao dịch nhanh (mục J) — chỉ màn nhập mới. */
  enableTemplates?: boolean
}

export function TransactionForm({
  initial,
  submitLabel,
  onSubmit,
  continueLabel,
  onContinue,
  initialType,
  onSubmitRecurring,
  showExcludeOption,
  enableNlInput,
  enableTemplates,
}: TransactionFormProps) {
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const templates = useQuickTemplates()

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
  const [excludeFromStats, setExcludeFromStats] = useState(initial?.exclude_from_stats ?? false)
  // Lặp lại (chỉ form nhập mới): 'none' = không lặp, còn lại là chu kỳ
  const [repeat, setRepeat] = useState<'none' | RecurringFrequency>('none')
  // Nút đang lưu: 'save' | 'continue' | null — để khóa cả hai nút và hiện "Đang lưu…"
  const [pending, setPending] = useState<'save' | 'continue' | null>(null)
  const saving = pending !== null
  const [error, setError] = useState<string | null>(null)
  // Nhập nhanh bằng lời: câu đang gõ + tóm tắt những gì vừa nhận diện
  const [nlText, setNlText] = useState('')
  const [nlHint, setNlHint] = useState<string | null>(null)
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

  /** Phân tích câu nhập nhanh rồi điền sẵn các trường (người dùng vẫn xác nhận trước khi Lưu). */
  function applyNl() {
    const text = nlText.trim()
    if (!text) return
    const r = parseNl({
      text,
      categories: categories.filter((c) => !c.is_archived),
      currency: srcCurrency,
      todayISO: toISODate(new Date()),
    })
    if (r.type && r.type !== 'transfer') setType(r.type)
    if (r.amountMinor != null) setDigits(String(r.amountMinor))
    if (r.categoryId) {
      setCategoryId(r.categoryId)
      setDrillId(categories.find((c) => c.id === r.categoryId)?.parent_id ?? null)
    }
    if (r.dateISO) setDate(r.dateISO)
    if (r.note) setNote(r.note)

    // Tóm tắt cho người dùng đối chiếu; cảnh báo nếu thiếu số tiền / danh mục
    const parts: string[] = []
    if (r.amountMinor != null) parts.push(formatMoney(r.amountMinor, srcCurrency))
    if (r.matchedCategoryName) parts.push(r.matchedCategoryName)
    if (r.dateISO) parts.push(r.dateISO.slice(5).replace('-', '/'))
    const missing: string[] = []
    if (r.amountMinor == null) missing.push('số tiền')
    if (!r.categoryId) missing.push('danh mục')
    setNlHint(
      (parts.length ? `Đã điền: ${parts.join(' · ')}` : 'Chưa nhận ra thông tin') +
        (missing.length ? ` — thiếu ${missing.join(', ')}, kiểm tra lại` : ''),
    )
    setNlText('')
  }

  /** Áp một mẫu nhanh vào form (người dùng vẫn bấm Lưu để ghi). */
  function applyTemplate(t: QuickTemplate) {
    setType(t.type)
    setDigits(t.amountMinor > 0 ? String(t.amountMinor) : '')
    if (t.categoryId) {
      setCategoryId(t.categoryId)
      setDrillId(categories.find((c) => c.id === t.categoryId)?.parent_id ?? null)
    }
    if (t.accountId) setAccountId(t.accountId)
    setNote(t.note)
    setToAccountId(null)
    setActiveField('main')
  }

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

  // Lưu mẫu: chỉ với chi/thu đã đủ số tiền + danh mục
  const canSaveTemplate = type !== 'transfer' && amount > 0 && !!categoryId
  function saveCurrentAsTemplate() {
    if (!canSaveTemplate) return
    const suggested = selectedCat?.name ?? note.trim()
    const label = window.prompt('Đặt tên mẫu (vd "Ăn trưa", "Vé tàu"):', suggested)?.trim()
    if (!label) return
    addQuickTemplate({
      label,
      type,
      amountMinor: amount,
      categoryId,
      accountId: effectiveAccountId,
      note: note.trim(),
    })
  }

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
        exclude_from_stats: type === 'transfer' ? false : excludeFromStats,
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
      {/* Nhập nhanh bằng lời: gõ "hôm qua trưa 850 yên" → tự điền các trường bên dưới */}
      {enableNlInput && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 rounded-xl border border-green-300 bg-green-50 px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-green-500 dark:border-green-800 dark:bg-green-900/20">
            <Sparkles className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
            <input
              value={nlText}
              onChange={(e) => setNlText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  applyNl()
                }
              }}
              placeholder='Gõ nhanh, vd "hôm qua trưa 850 yên"'
              className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none dark:text-gray-100 dark:placeholder:text-gray-500"
              aria-label="Nhập nhanh bằng lời"
            />
            <button
              type="button"
              onClick={applyNl}
              disabled={!nlText.trim()}
              className="shrink-0 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white active:scale-95 disabled:opacity-40"
            >
              Điền
            </button>
          </div>
          {nlHint && <p className="px-1 text-xs text-gray-500 dark:text-gray-400">{nlHint}</p>}
        </div>
      )}

      {/* Mẫu giao dịch nhanh (mục J): 1 chạm điền sẵn, hoặc lưu form hiện tại thành mẫu */}
      {enableTemplates && (templates.length > 0 || canSaveTemplate) && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {templates.map((t) => {
            const cur =
              accounts.find((a) => a.id === t.accountId)?.currency ?? srcCurrency
            return (
              <span key={t.id} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="flex items-center gap-1 rounded-full bg-white dark:bg-gray-900 py-1.5 pl-3 pr-6 text-xs font-medium text-gray-700 dark:text-gray-200 shadow-sm active:scale-95"
                >
                  <Star className="h-3 w-3 text-amber-400" fill="currentColor" />
                  <span className="max-w-[9rem] truncate">{t.label}</span>
                  <span className="text-gray-400 dark:text-gray-500">
                    {formatMoney(t.amountMinor, cur)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteQuickTemplate(t.id)}
                  aria-label={`Xóa mẫu ${t.label}`}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-gray-300 hover:text-red-500 dark:text-gray-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}
          {canSaveTemplate && (
            <button
              type="button"
              onClick={saveCurrentAsTemplate}
              className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 active:scale-95"
            >
              <Star className="h-3 w-3" /> Lưu mẫu
            </button>
          )}
        </div>
      )}

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
            className="min-w-0 flex-1"
          />
        )}
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-[7.5rem] shrink-0 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm text-gray-700 dark:text-gray-300"
        />
        {!initial && onSubmitRecurring && (
          <button
            type="button"
            onClick={() =>
              setRepeat((r) => REPEAT_CYCLE[(REPEAT_CYCLE.indexOf(r) + 1) % REPEAT_CYCLE.length])
            }
            aria-label={`Lặp lại: ${REPEAT_LABEL[repeat]}. Chạm để đổi chu kỳ.`}
            title="Chạm để đổi chu kỳ lặp"
            className={`flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1.5 text-sm transition active:scale-95 ${
              repeat === 'none'
                ? 'border-gray-300 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400'
                : 'border-green-500 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400'
            }`}
          >
            <Repeat className="h-4 w-4 shrink-0" />
            {repeat !== 'none' && <span>{REPEAT_LABEL[repeat]}</span>}
          </button>
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

      {showExcludeOption && type !== 'transfer' && (
        <label className="flex items-center gap-2 px-1 text-sm text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={excludeFromStats}
            onChange={(e) => setExcludeFromStats(e.target.checked)}
          />
          Không tính vào thống kê (hoàn tiền, mua hộ…)
        </label>
      )}

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

      {/* Hàng nút: ⌫ (chỉ mobile, thay cho hàng xóa lùi riêng) + Tiếp tục/Lưu */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onNumPadKey('⌫')}
          aria-label="Xóa"
          className="flex shrink-0 items-center justify-center rounded-xl bg-white dark:bg-gray-800 px-5 text-lg font-semibold text-gray-800 dark:text-gray-100 shadow-sm transition active:scale-95 active:bg-gray-200 lg:hidden"
        >
          ⌫
        </button>
        {onContinue && repeat === 'none' ? (
          <>
            <button
              type="button"
              onClick={() => handleSubmit('continue')}
              disabled={!canSave}
              className="flex-1 rounded-xl border border-green-600 bg-white py-3 text-base font-semibold text-green-700 shadow-sm transition enabled:active:scale-95 enabled:hover:bg-green-50 disabled:opacity-40 dark:bg-gray-900 dark:text-green-400 dark:enabled:hover:bg-gray-800"
            >
              {pending === 'continue' ? 'Đang lưu…' : continueLabel}
            </button>
            <button
              type="button"
              onClick={() => handleSubmit('save')}
              disabled={!canSave}
              className="flex-1 rounded-xl bg-green-600 py-3 text-base font-semibold text-white shadow-sm transition enabled:active:scale-95 enabled:hover:bg-green-700 disabled:opacity-40"
            >
              {pending === 'save' ? 'Đang lưu…' : submitLabel}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => handleSubmit('save')}
            disabled={!canSave}
            className="flex-1 rounded-xl bg-green-600 py-3 text-base font-semibold text-white shadow-sm transition enabled:active:scale-95 enabled:hover:bg-green-700 disabled:opacity-40"
          >
            {saving ? 'Đang lưu…' : submitLabel}
          </button>
        )}
      </div>
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
