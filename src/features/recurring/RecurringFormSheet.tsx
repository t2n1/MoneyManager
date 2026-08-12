import { useId, useMemo, useState } from 'react'
import { Guide } from '../../components/Guide'
import type { NewRecurringRule } from '../../data'
import {
  useAccounts,
  useCategories,
  useCreateRecurringRule,
  useRecurringRuleTags,
  useRunRecurringCatchUp,
  useUpdateRecurringRule,
} from '../../hooks/queries'
import { TagPicker } from '../tags/TagPicker'
import { toISODate } from '../../lib/dates'
import { type CurrencyCode } from '../../lib/money'
import { AccountPicker } from '../../components/AccountPicker'
import { MoneyField } from '../../components/MoneyField'
import { DateField } from '../../components/DateField'
import type { RecurringFrequency, RecurringMode } from '../../lib/recurring'
import type { RecurringRuleRow, TransactionType } from '../../types/database.types'
import { useEscClose } from '../../hooks/useEscClose'

const TYPE_TABS: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Chi' },
  { value: 'income', label: 'Thu' },
  { value: 'transfer', label: 'Chuyển khoản' },
]

/** Hai kiểu quy tắc — xem migration 0037. */
const MODE_OPTIONS: readonly (readonly [RecurringMode, string])[] = [
  ['auto', 'App tự ghi'],
  ['remind', 'Chỉ nhắc tôi'],
]
const MODE_HINT: Record<RecurringMode, string> = {
  auto: 'Dành cho khoản tự động rời tài khoản (tiền nhà chuyển tự động, phí thuê bao). Tới hạn là app ghi luôn.',
  remind:
    'Dành cho khoản phải tự tay làm (gửi tiền về nhà). App không ghi gì cả, chỉ nhắc — bạn ghi xong mới tính là xong.',
}

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
  useEscClose(onClose)
  const uid = useId()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const create = useCreateRecurringRule()
  const update = useUpdateRecurringRule()
  const catchUp = useRunRecurringCatchUp()

  const [type, setType] = useState<TransactionType>(rule?.type ?? 'expense')
  const [amount, setAmount] = useState(rule?.amount ?? 0)
  const [toAmount, setToAmount] = useState(rule?.to_amount ?? 0)
  const [categoryId, setCategoryId] = useState<string | null>(rule?.category_id ?? null)
  const [accountId, setAccountId] = useState<string | null>(rule?.account_id ?? null)
  const [toAccountId, setToAccountId] = useState<string | null>(rule?.to_account_id ?? null)
  const [frequency, setFrequency] = useState<RecurringFrequency>(rule?.frequency ?? 'monthly')
  const [startOn, setStartOn] = useState(rule?.start_on ?? toISODate(new Date()))
  const [endOn, setEndOn] = useState(rule?.end_on ?? '')
  const [note, setNote] = useState(rule?.note ?? '')
  // Nhãn của quy tắc (migration 0042). null = chưa đụng vào → giữ nhãn đang có; danh
  // sách nhãn tới muộn hơn lần render đầu nên KHÔNG gieo vào useState.
  const { data: ruleTagLinks = [] } = useRecurringRuleTags()
  const [tagIds, setTagIds] = useState<string[] | null>(null)
  const currentTagIds = useMemo(
    () => (rule ? ruleTagLinks.filter((l) => l.rule_id === rule.id).map((l) => l.tag_id) : []),
    [ruleTagLinks, rule],
  )
  const effectiveTagIds = tagIds ?? currentTagIds
  const [mode, setMode] = useState<RecurringMode>(rule?.mode ?? 'auto')
  const [remindDays, setRemindDays] = useState(String(rule?.remind_days_before ?? 0))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Tài khoản chọn được: đang hoạt động + tài khoản của rule đang sửa (kể cả đã
  // lưu trữ) — nếu không, form sửa sẽ âm thầm gán rule sang tài khoản khác.
  const activeAccounts = useMemo(() => {
    const list = accounts.filter((a) => !a.is_archived)
    for (const id of [rule?.account_id, rule?.to_account_id]) {
      if (id && !list.some((a) => a.id === id)) {
        const archived = accounts.find((a) => a.id === id)
        if (archived) list.push(archived)
      }
    }
    return list
  }, [accounts, rule])
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
    setToAmount(0)
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
        mode,
        // Chỉ có nghĩa với kiểu nhắc; kiểu tự ghi luôn để 0 cho khỏi lưu số rác.
        remind_days_before: mode === 'remind' ? Number(remindDays) || 0 : 0,
        tag_ids: effectiveTagIds,
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

  const moneyInput = (
    value: number,
    onChange: (v: number) => void,
    currency: CurrencyCode,
    ariaLabel: string,
    autoOpen = true,
  ) => (
    <MoneyField
      value={value}
      onChange={onChange}
      currency={currency}
      ariaLabel={ariaLabel}
      autoOpen={autoOpen}
      onEnter={handleSave}
      className="w-full rounded-lg border border-border-strong px-3 py-2 text-right text-lg font-semibold outline-green-500"
    />
  )

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-base font-bold text-fg-primary">
          {rule ? 'Sửa quy tắc định kỳ' : 'Thêm quy tắc định kỳ'}
        </h2>

        {/* Loại giao dịch */}
        <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-surface-sunken p-1">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => switchType(tab.value)}
              className={`min-h-11 rounded-md py-1.5 text-sm font-medium transition ${
                type === tab.value
                  ? 'bg-surface text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-fg-muted'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tài khoản (+ đích nếu chuyển khoản) */}
        {/* <span> chứ không <label htmlFor>: AccountPicker là <button>, mà tên đọc được
            của <button> tính từ NỘI DUNG — `<label for>` không đặt tên cho nó. Tên đi vào
            qua `ariaLabel` (chữ sr-only bên trong nút). */}
        <span className="mb-1 block text-xs font-medium text-fg-muted">
          {type === 'transfer' ? 'Từ tài khoản' : 'Tài khoản'}
        </span>
        <div className="mb-3">
          <AccountPicker
            accounts={activeAccounts}
            value={effectiveAccountId}
            onChange={setAccountId}
            excludeId={toAccountId}
            ariaLabel={type === 'transfer' ? 'Từ tài khoản' : 'Tài khoản'}
            className="w-full"
          />
        </div>
        {type === 'transfer' && (
          <>
            <span className="mb-1 block text-xs font-medium text-fg-muted">
              Đến tài khoản
            </span>
            <div className="mb-3">
              <AccountPicker
                accounts={activeAccounts}
                value={toAccountId}
                onChange={setToAccountId}
                excludeId={effectiveAccountId}
                ariaLabel="Đến tài khoản"
                className="w-full"
              />
            </div>
          </>
        )}

        {/* Danh mục (ẩn khi chuyển khoản) */}
        {type !== 'transfer' && (
          <>
            <label htmlFor={`${uid}-cat`} className="mb-1 block text-xs font-medium text-fg-muted">
              Danh mục
            </label>
            <select
              id={`${uid}-cat`}
              value={categoryId ?? ''}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mb-3 w-full rounded-lg border border-border-strong bg-surface px-2 py-2 text-sm text-gray-700 dark:text-gray-300"
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
        {/* <span>: MoneyField có hai ô (chạm/desktop), tên đến từ `ariaLabel`. */}
        <span className="mb-1 block text-xs font-medium text-fg-muted">
          Số tiền ({srcCurrency})
        </span>
        <div className="mb-3">{moneyInput(amount, setAmount, srcCurrency, 'Số tiền')}</div>
        {crossCurrency && (
          <>
            <span className="mb-1 block text-xs font-medium text-fg-muted">
              Nhận được ({dstCurrency})
            </span>
            <div className="mb-3">
              {moneyInput(toAmount, setToAmount, dstCurrency, 'Nhận được', false)}
            </div>
          </>
        )}

        {/* Kiểu quy tắc — quyết định lớn nhất của cả form, nên đứng trước chu kỳ:
            "app tự ghi hộ" và "app chỉ nhắc" là hai thứ khác hẳn nhau. */}
        {/* Nhãn cho một HÀNG NÚT, không cho một ô — nên <span> + role="group" mang tên,
            đúng cách SegmentedControl đang làm ở chỗ khác. */}
        <span className="mb-1 block text-xs font-medium text-fg-muted">Khi tới hạn</span>
        <div
          role="group"
          aria-label="Khi tới hạn"
          className="mb-1 flex overflow-hidden rounded-lg border border-border-strong"
        >
          {MODE_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              aria-pressed={mode === value}
              className={`min-h-11 flex-1 px-2 text-sm font-medium ${
                mode === value
                  ? 'bg-green-700 text-white'
                  : 'text-fg-secondary hover:bg-surface-sunken'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mb-3 text-xs text-fg-muted">{MODE_HINT[mode]}</p>

        {mode === 'remind' && (
          <>
            {/* id sinh động thay cho "remind-days" viết cứng — cùng lý do ghi ở uid trên. */}
            <label className="mb-1 block text-xs font-medium text-fg-muted" htmlFor={`${uid}-remind`}>
              Nhắc trước mấy ngày
            </label>
            <input
              id={`${uid}-remind`}
              inputMode="numeric"
              value={remindDays}
              onChange={(e) => setRemindDays(e.target.value.replace(/[^\d]/g, '').slice(0, 2))}
              placeholder="0"
              className="mb-3 w-24 rounded-lg border border-border-strong px-3 py-2 text-right text-base outline-green-500 sm:text-sm"
            />
          </>
        )}

        {/* Chu kỳ + ngày bắt đầu / kết thúc */}
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${uid}-freq`} className="mb-1 block text-xs font-medium text-fg-muted">
              Chu kỳ
            </label>
            <select
              id={`${uid}-freq`}
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
              className="w-full rounded-lg border border-border-strong bg-surface px-2 py-2 text-sm text-gray-700 dark:text-gray-300"
            >
              {FREQ_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            {/* <span> chứ không <label>: ô ngày là <button>, tên đi qua ariaLabel. */}
            <span className="mb-1 block text-xs font-medium text-fg-muted">
              Bắt đầu (kỳ đầu tiên)
            </span>
            <DateField
              ariaLabel="Bắt đầu (kỳ đầu tiên)"
              value={startOn}
              onChange={setStartOn}
              className="w-full py-2"
            />
          </div>
        </div>
        <span className="mb-1 block text-xs font-medium text-fg-muted">
          Kết thúc (không bắt buộc)
        </span>
        <DateField
          ariaLabel="Kết thúc"
          value={endOn}
          onChange={setEndOn}
          clearable
          placeholder="Không giới hạn"
          className="mb-3 w-full py-2"
        />

        <label htmlFor={`${uid}-note`} className="mb-1 block text-xs font-medium text-fg-muted">
          Ghi chú (không bắt buộc)
        </label>
        <input
          id={`${uid}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ví dụ: tiền nhà"
          className="mb-1 w-full rounded-lg border border-border-strong px-3 py-2 text-sm outline-green-500"
        />

        {/* Nhãn: mỗi kỳ do quy tắc sinh ra sẽ mang đúng những nhãn này. Đặt dưới ghi
            chú vì nó là thứ tùy chọn, giống thứ tự ở form Nhập. */}
        <div className="mb-1 mt-3">
          <TagPicker value={effectiveTagIds} onChange={setTagIds} />
        </div>

        {rule && (
          <Guide className="mt-2 text-xs text-fg-muted">
            Thay đổi chỉ áp dụng cho các kỳ tương lai; giao dịch đã sinh giữ nguyên.
          </Guide>
        )}
        {error && <p className="mt-2 text-sm text-money-out">{error}</p>}

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
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}
