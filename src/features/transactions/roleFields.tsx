import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { SegmentedControl } from '../../components/ui'
import { formatMoney, parseMoney, type CurrencyCode } from '../../lib/money'
import type { DebtValue, RemitValue, SplitValue } from './entryRoles'

/**
 * Field riêng của từng vai trò (controlled). Field gốc (số tiền, tài khoản, ngày,
 * ghi chú) + segmented chiều/kiểu do form Nhập quản lý; block chỉ chứa phần thêm.
 */

const labelCls = 'mb-1 block text-xs font-medium text-fg-muted'
const inputCls =
  'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg-primary outline-green-500'
const moneyInputCls =
  'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-right text-lg font-semibold text-fg-primary outline-green-500'
// Nút tiền trên mobile (do NumPad app gõ) — giống ô số tiền chính, không bật bàn phím hệ thống.
const moneyBoxCls =
  'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-right text-lg font-semibold'
// Bọc field vai trò: nền tint theo ĐÚNG màu banner của vai trò (split xanh dương,
// debt hổ phách, remit xanh lá) — cùng một tín hiệu màu từ banner xuống field.
const blockTint = {
  split: 'border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30',
  debt: 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30',
  remit: 'border-green-200 bg-green-50/60 dark:border-green-900 dark:bg-green-950/30',
} as const
const blockCls = (tint: keyof typeof blockTint) =>
  `flex flex-col gap-2 rounded-xl border p-3 ${blockTint[tint]}`
// Nút chữ nhỏ (Thêm chi tiết, + Phí): after:-inset kéo vùng chạm lên ~44px.
const smallBtnTap = 'relative after:absolute after:-inset-y-2 after:inset-x-0'

/**
 * Ô nhập tiền của vai trò. Trên mobile là nút chạm do NumPad của app điều khiển
 * (đồng nhất với ô số tiền chính, không bật bàn phím hệ thống); trên desktop là
 * input gõ số trực tiếp.
 */
function MoneyField({
  value,
  currency,
  active,
  onFocus,
  onChange,
  ariaLabel,
  onEnter,
}: {
  value: number
  currency: CurrencyCode
  /** Đang là ô NumPad nhắm tới (mobile) → hiện viền. */
  active: boolean
  /** Chạm để NumPad gõ vào ô này (mobile). */
  onFocus: () => void
  /** Gõ trực tiếp (desktop). */
  onChange: (v: number) => void
  ariaLabel: string
  /** Enter trên desktop = lưu, đồng nhất với ô số tiền chính + ghi chú. */
  onEnter?: () => void
}) {
  const isEmpty = value === 0
  return (
    <>
      <button
        type="button"
        onClick={onFocus}
        aria-label={`${ariaLabel}: ${formatMoney(value, currency)}`}
        className={`${moneyBoxCls} ${active ? 'ring-2 ring-green-500' : ''} ${
          isEmpty ? 'text-fg-muted' : 'text-fg-primary'
        } lg:hidden`}
      >
        {formatMoney(value, currency)}
      </button>
      <input
        inputMode="numeric"
        aria-label={ariaLabel}
        value={value === 0 ? '' : formatMoney(value, currency)}
        onChange={(e) => onChange(parseMoney(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.()
        }}
        placeholder={formatMoney(0, currency)}
        className={`${moneyInputCls} hidden lg:block`}
      />
    </>
  )
}

/**
 * Ô "Phí" thu gọn: mặc định chỉ là nút "+ Phí" cho đỡ rối, chạm mới mở ô nhập.
 * Đã có số thì luôn mở. Phí lưu thành một giao dịch CHI riêng vào danh mục
 * "Tài chính" (không cộng vào số tiền chính) — chú thích ngay dưới ô để khỏi bất ngờ.
 */
export function FeeField({
  value,
  currency,
  active,
  onFocus,
  onChange,
  hint,
  onEnter,
}: {
  value: number
  currency: CurrencyCode
  active: boolean
  onFocus: () => void
  onChange: (v: number) => void
  /** Câu giải thích phí sẽ đi đâu. */
  hint: string
  onEnter?: () => void
}) {
  const [open, setOpen] = useState(false)
  if (!open && value === 0) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`self-start rounded-lg border border-dashed border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-500 transition active:scale-95 dark:border-gray-600 dark:text-gray-400 ${smallBtnTap}`}
      >
        + Phí
      </button>
    )
  }
  return (
    <div>
      <label className={labelCls}>Phí ({currency})</label>
      <MoneyField
        value={value}
        currency={currency}
        active={active}
        onFocus={onFocus}
        onChange={onChange}
        ariaLabel={`Phí (${currency})`}
        onEnter={onEnter}
      />
      <p className="mt-1 text-xs text-fg-muted">{hint}</p>
    </div>
  )
}

const SETTLE_ITEMS = [
  { value: 'now' as const, label: 'Đã trả lại' },
  { value: 'later' as const, label: 'Còn nợ' },
]

/**
 * Hàng chip người đang có khoản nợ mở — chạm để cộng dồn, chạm lại để bỏ.
 * Dùng chung cho Trả hộ (còn nợ) và Cho vay/Ghi nợ.
 */
function PeopleChips({
  people,
  selectedId,
  onPick,
}: {
  people: DebtPerson[]
  selectedId: string | null
  /** null = bỏ chọn người đang chọn. */
  onPick: (p: DebtPerson | null) => void
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto py-1">
      {people.map((p) => {
        const active = selectedId === p.id
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={active}
            onClick={() => onPick(active ? null : p)}
            className={`relative flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-sm after:absolute after:inset-x-0 after:-inset-y-1 ${
              active
                ? 'border-green-600 bg-green-700 text-white'
                : 'border-gray-300 bg-surface text-gray-700 dark:border-gray-700 dark:text-gray-200'
            }`}
          >
            <span className="max-w-[9rem] truncate">{p.name}</span>
            <span className={`text-xs tabular-nums ${active ? 'text-white/80' : 'text-fg-muted'}`}>
              {formatMoney(p.remaining, p.currency)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Trả hộ / chia bill: phần người khác + đã hoàn tiền chưa (Chi luôn).
 * "Đã trả lại" → không sinh khoản nợ, chỉ cần biết tiền về ví nào.
 * "Còn nợ" → tạo/cộng dồn khoản cho vay như trước.
 */
export function SplitFields({
  value,
  onChange,
  total,
  currency,
  people,
  backAccounts,
  sourceName,
  othersActive,
  onFocusOthers,
  onEnter,
}: {
  value: SplitValue
  onChange: (v: SplitValue) => void
  total: number
  currency: CurrencyCode
  /** Người đã cho vay (khoản owed_to_me đang mở, cùng loại tiền) — chọn để cộng dồn. */
  people: DebtPerson[]
  /** Ví có thể nhận lại tiền (cùng loại tiền, khác tài khoản đã trả). */
  backAccounts: { id: string; name: string }[]
  /** Tên tài khoản đã trả — để nhãn "về chính ví đó" nói rõ là ví nào. */
  sourceName: string
  /** Ô "Phần người khác" đang được NumPad nhắm tới (mobile). */
  othersActive: boolean
  onFocusOthers: () => void
  /** Enter trên desktop = lưu. */
  onEnter?: () => void
}) {
  const mine = total - value.others
  const over = value.others > total
  const settledNow = value.settle === 'now'
  const selected = value.existingDebtId
    ? people.find((p) => p.id === value.existingDebtId) ?? null
    : null
  return (
    <div className={blockCls('split')}>
      <div>
        <label className={labelCls}>{settledNow ? 'Phần người khác trả lại' : 'Phần người khác nợ lại'}</label>
        <MoneyField
          value={value.others}
          currency={currency}
          active={othersActive}
          onFocus={onFocusOthers}
          onChange={(v) => onChange({ ...value, others: v })}
          ariaLabel={settledNow ? 'Phần người khác trả lại' : 'Phần người khác nợ lại'}
          onEnter={onEnter}
        />
      </div>
      {total > 0 && value.others > 0 && (
        <p className={`text-right text-xs ${over && !settledNow ? 'text-money-out' : 'text-fg-muted'}`}>
          {over ? (
            settledNow ? (
              // Đưa dư khi trả lại ngay: hợp lệ — phần dư ghi thành khoản THU.
              <>
                Người kia đưa dư{' '}
                <span className="font-semibold text-money-in">
                  {formatMoney(value.others - total, currency)}
                </span>{' '}
                — phần dư ghi thành khoản thu, chi của mình {formatMoney(0, currency)}.
              </>
            ) : (
              'Phần người khác nợ không được lớn hơn tổng.'
            )
          ) : (
            <>
              Phần của mình (tính vào chi tiêu):{' '}
              <span className="font-semibold text-gray-700 dark:text-gray-200">
                {formatMoney(mine, currency)}
              </span>
            </>
          )}
        </p>
      )}

      <SegmentedControl
        items={SETTLE_ITEMS}
        value={value.settle}
        onChange={(settle) => onChange({ ...value, settle })}
        label="Người khác đã trả lại tiền chưa"
      />

      {settledNow && (
        <div>
          <label className={labelCls}>Nhận lại vào</label>
          <select
            value={value.receivedAccountId}
            onChange={(e) => onChange({ ...value, receivedAccountId: e.target.value })}
            className={inputCls}
          >
            <option value="">Chính {sourceName || 'tài khoản đã trả'}</option>
            {backAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-fg-muted">
            {value.receivedAccountId
              ? 'Thêm một chuyển khoản để tài khoản đã trả vẫn trừ đủ tổng (khớp sao kê thẻ).'
              : 'Tiền ra tiền vào cùng một chỗ → chỉ ghi một dòng chi phần của mình.'}
          </p>
        </div>
      )}

      {!settledNow && people.length > 0 && (
        <div>
          <label className={labelCls}>Người đã cho vay (cộng dồn)</label>
          <PeopleChips
            people={people}
            selectedId={value.existingDebtId}
            onPick={(p) =>
              onChange(
                p
                  ? { ...value, existingDebtId: p.id, counterparty: p.name }
                  : { ...value, existingDebtId: null, counterparty: '' },
              )
            }
          />
        </div>
      )}
      <div>
        <label className={labelCls}>
          {settledNow ? 'Chia với ai (không bắt buộc)' : 'Ai nợ mình'}
        </label>
        <input
          value={value.counterparty}
          onChange={(e) =>
            // Gõ tay → bỏ liên kết người đã chọn (vẫn tự cộng dồn nếu trùng tên khi lưu).
            onChange({ ...value, counterparty: e.target.value, existingDebtId: null })
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEnter?.()
          }}
          placeholder="Tên người"
          className={inputCls}
        />
        {!settledNow && selected && (
          <p className="mt-1 text-xs text-green-700 dark:text-green-400">
            Cộng dồn vào khoản đang mở · còn lại {formatMoney(selected.remaining, selected.currency)}
          </p>
        )}
      </div>
    </div>
  )
}

/** Chi tiết nợ dùng chung cho cả nhập & sửa: hạn, lãi suất %/năm, số kỳ trả góp. */
export function DebtDetailInputs({
  dueOn,
  interestPct,
  termMonths,
  onChange,
}: {
  dueOn: string
  interestPct: string
  termMonths: string
  onChange: (patch: { dueOn?: string; interestPct?: string; termMonths?: string }) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className={labelCls}>Hạn (không bắt buộc)</label>
        <input
          type="date"
          value={dueOn}
          onChange={(e) => onChange({ dueOn: e.target.value })}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Lãi suất %/năm</label>
        <input
          inputMode="decimal"
          value={interestPct}
          onChange={(e) => onChange({ interestPct: e.target.value.replace(/[^0-9.]/g, '') })}
          placeholder="vd 5.5"
          className={`${inputCls} text-right`}
        />
      </div>
      <div>
        <label className={labelCls}>Số kỳ / tháng</label>
        <input
          inputMode="numeric"
          value={termMonths}
          onChange={(e) => onChange({ termMonths: e.target.value.replace(/[^0-9]/g, '') })}
          placeholder="vd 12"
          className={`${inputCls} text-right`}
        />
      </div>
    </div>
  )
}

/** Người đã cho vay/nợ (khoản đang mở) — để gợi ý cộng dồn ở form Nhập. */
export interface DebtPerson {
  id: string
  name: string
  currency: CurrencyCode
  /** số còn lại (minor units theo currency của khoản) */
  remaining: number
}

/**
 * Ghi nợ / cho vay: tên đối tác + toggle chuyển tiền thật + (thêm) hạn/lãi/kỳ.
 * Chiều (Mình nợ / Cho vay) do form quản lý qua segmented. Loại tiền = tài khoản gốc.
 * Chọn người đã có → cộng dồn vào khoản đang mở của họ (không tạo người trùng tên).
 */
export function DebtFields({
  value,
  onChange,
  canRecordReal,
  people,
  currency,
  feeActive,
  onFocusFee,
  onEnter,
}: {
  value: DebtValue
  onChange: (v: DebtValue) => void
  /** Có tài khoản để tạo giao dịch giải ngân thật không (danh mục tự gán khi lưu). */
  canRecordReal: boolean
  /** Người đã cho vay/nợ (khoản đang mở, cùng chiều) — chọn để cộng dồn. */
  people: DebtPerson[]
  /** Loại tiền tài khoản nguồn — phí trừ vào chính tài khoản đó. */
  currency: CurrencyCode
  /** Ô Phí đang được NumPad nhắm tới (mobile). */
  feeActive: boolean
  onFocusFee: () => void
  /** Enter trên desktop = lưu. */
  onEnter?: () => void
}) {
  const [showMore, setShowMore] = useState(false)
  const realOn = canRecordReal && value.withTransaction
  const selected = value.existingDebtId
    ? people.find((p) => p.id === value.existingDebtId) ?? null
    : null
  return (
    <div className={blockCls('debt')}>
      {people.length > 0 && (
        <div>
          <label className={labelCls}>
            {value.direction === 'i_owe' ? 'Chủ nợ đã có (cộng dồn)' : 'Người đã cho vay (cộng dồn)'}
          </label>
          <PeopleChips
            people={people}
            selectedId={value.existingDebtId}
            onPick={(p) =>
              onChange(
                p
                  ? { ...value, existingDebtId: p.id, counterparty: p.name }
                  : { ...value, existingDebtId: null, counterparty: '' },
              )
            }
          />
        </div>
      )}

      <div>
        <label className={labelCls}>
          {value.direction === 'i_owe' ? 'Chủ nợ (mình nợ ai)' : 'Con nợ (ai nợ mình)'}
        </label>
        <input
          value={value.counterparty}
          onChange={(e) =>
            // Gõ tay → bỏ liên kết người đã chọn (vẫn tự cộng dồn nếu trùng tên khi lưu).
            onChange({ ...value, counterparty: e.target.value, existingDebtId: null })
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEnter?.()
          }}
          placeholder="Tên người / công ty"
          className={inputCls}
        />
        {selected && (
          <p className="mt-1 text-xs text-green-700 dark:text-green-400">
            Cộng dồn vào khoản đang mở · còn lại {formatMoney(selected.remaining, selected.currency)}
          </p>
        )}
      </div>

      <div className="rounded-lg bg-surface/70 p-2.5">
        <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>
            Có chuyển tiền thật
            <span className="block text-xs text-fg-muted">
              {value.direction === 'owed_to_me'
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
            onClick={() => onChange({ ...value, withTransaction: !value.withTransaction })}
            className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40 ${
              realOn ? 'bg-green-700' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                realOn ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </label>
        {!canRecordReal && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            Chưa có tài khoản để tạo giao dịch thật. Vẫn lưu được khoản nợ (không đổi số dư).
          </p>
        )}
      </div>

      <FeeField
        value={value.fee}
        currency={currency}
        active={feeActive}
        onFocus={onFocusFee}
        onChange={(v) => onChange({ ...value, fee: v })}
        hint='Ghi riêng thành khoản chi "Tài chính", không cộng vào gốc nợ.'
        onEnter={onEnter}
      />

      {/* Cộng dồn → hạn/lãi lấy theo khoản cũ, không nhập lại. */}
      {!selected && (
        <>
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className={`flex items-center gap-1 py-1 text-xs font-medium text-fg-muted ${smallBtnTap}`}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${showMore ? 'rotate-180' : ''}`} />
            {showMore ? 'Ẩn bớt' : 'Thêm chi tiết (hạn, lãi suất)'}
          </button>
          {showMore && (
            <DebtDetailInputs
              dueOn={value.dueOn}
              interestPct={value.interestPct}
              termMonths={value.termMonths}
              onChange={(patch) => onChange({ ...value, ...patch })}
            />
          )}
        </>
      )}
    </div>
  )
}

/**
 * Gửi về VN: TK đích VND (khi chuyển tài sản) + phí + số nhận + dịch vụ.
 * Kiểu (Hỗ trợ / Chuyển tài sản) do form quản lý qua segmented. Nguồn = tài khoản gốc (JPY).
 */
export function RemitFields({
  value,
  onChange,
  sent,
  vndAccounts,
  services,
  feeActive,
  receivedActive,
  onFocusFee,
  onFocusReceived,
  onEnter,
}: {
  value: RemitValue
  onChange: (v: RemitValue) => void
  /** số gửi JPY (từ ô số tiền gốc) — để tính tỷ giá. */
  sent: number
  vndAccounts: { id: string; name: string }[]
  services: readonly string[]
  /** Ô Phí / Số nhận đang được NumPad nhắm tới (mobile). */
  feeActive: boolean
  receivedActive: boolean
  onFocusFee: () => void
  onFocusReceived: () => void
  /** Enter trên desktop = lưu. */
  onEnter?: () => void
}) {
  // Tài khoản bị trừ THẬT = số gửi + phí (roleSave cộng phí vào amount) — phải nói
  // trước mặt, không thì người nhìn số bank trừ (đã gồm phí) sẽ nhập trùng phí.
  const totalOut = sent + value.fee
  const rate = sent > 0 && value.received > 0 ? value.received / sent : 0
  const effRate = totalOut > 0 && value.received > 0 ? value.received / totalOut : 0
  return (
    <div className={blockCls('remit')}>
      {value.kind === 'transfer' && (
        <div>
          <label className={labelCls}>Đến tài khoản VND</label>
          {vndAccounts.length === 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              Chưa có tài khoản VND. Tạo một tài khoản VND (vd "Tiền ở VN") hoặc chọn "Hỗ trợ gia đình".
            </p>
          ) : (
            <select
              value={value.destId}
              onChange={(e) => onChange({ ...value, destId: e.target.value })}
              className={inputCls}
            >
              <option value="">— chọn —</option>
              {vndAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Phí (JPY)</label>
          <MoneyField
            value={value.fee}
            currency="JPY"
            active={feeActive}
            onFocus={onFocusFee}
            onChange={(v) => onChange({ ...value, fee: v })}
            ariaLabel="Phí gửi tiền (JPY)"
            onEnter={onEnter}
          />
        </div>
        <div>
          <label className={labelCls}>Số nhận (VND)</label>
          <MoneyField
            value={value.received}
            currency="VND"
            active={receivedActive}
            onFocus={onFocusReceived}
            onChange={(v) => onChange({ ...value, received: v })}
            ariaLabel="Số tiền người nhận nhận được (VND)"
            onEnter={onEnter}
          />
        </div>
      </div>
      {sent > 0 && value.fee > 0 && (
        <p className="text-right text-xs text-fg-secondary">
          Trừ khỏi tài khoản:{' '}
          <span className="font-semibold">{formatMoney(totalOut, 'JPY')}</span> (số gửi + phí)
        </p>
      )}
      {rate > 0 && (
        <p className="text-right text-xs text-fg-muted">
          {value.fee > 0
            ? `Tỷ giá thực (tính cả phí): 1 ¥ ≈ ${effRate.toFixed(1)} ₫`
            : `Tỷ giá: 1 ¥ ≈ ${rate.toFixed(1)} ₫`}
        </p>
      )}

      {/* Dịch vụ hiện luôn — giấu sau "Thêm chi tiết" thì ai dùng SBI/DCOM sẽ bị
          ghi nhầm mặc định Wise mãi mà không biết. */}
      <div>
        <label className={labelCls}>Dịch vụ</label>
        <select
          value={value.service}
          onChange={(e) => onChange({ ...value, service: e.target.value })}
          className={inputCls}
        >
          {services.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
