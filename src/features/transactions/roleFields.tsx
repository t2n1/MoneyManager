import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatMoney, parseMoney, type CurrencyCode } from '../../lib/money'
import type { DebtValue, RemitValue, SplitValue } from './entryRoles'

/**
 * Field riêng của từng vai trò (controlled). Field gốc (số tiền, tài khoản, ngày,
 * ghi chú) + segmented chiều/kiểu do form Nhập quản lý; block chỉ chứa phần thêm.
 */

const labelCls = 'mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400'
const inputCls =
  'w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 outline-green-500'
const moneyInputCls =
  'w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-right text-lg font-semibold text-gray-800 dark:text-gray-100 outline-green-500'
// Nút tiền trên mobile (do NumPad app gõ) — giống ô số tiền chính, không bật bàn phím hệ thống.
const moneyBoxCls =
  'w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-right text-lg font-semibold'
// Bọc field vai trò: nền tint + viền trái theo màu để phân biệt với field gốc.
const blockCls =
  'flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900 dark:bg-blue-950/30'

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
}) {
  const isEmpty = value === 0
  return (
    <>
      <button
        type="button"
        onClick={onFocus}
        aria-label={`${ariaLabel}: ${formatMoney(value, currency)}`}
        className={`${moneyBoxCls} ${active ? 'ring-2 ring-green-500' : ''} ${
          isEmpty ? 'text-gray-300 dark:text-gray-600' : 'text-gray-800 dark:text-gray-100'
        } lg:hidden`}
      >
        {formatMoney(value, currency)}
      </button>
      <input
        inputMode="numeric"
        aria-label={ariaLabel}
        value={value === 0 ? '' : formatMoney(value, currency)}
        onChange={(e) => onChange(parseMoney(e.target.value))}
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
}: {
  value: number
  currency: CurrencyCode
  active: boolean
  onFocus: () => void
  onChange: (v: number) => void
  /** Câu giải thích phí sẽ đi đâu. */
  hint: string
}) {
  const [open, setOpen] = useState(false)
  if (!open && value === 0) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-lg border border-dashed border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-500 transition active:scale-95 dark:border-gray-600 dark:text-gray-400"
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
      />
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
    </div>
  )
}

/** Trả hộ / chia bill: phần người khác nợ lại + ai nợ mình (Chi luôn). */
export function SplitFields({
  value,
  onChange,
  total,
  currency,
  people,
  othersActive,
  onFocusOthers,
}: {
  value: SplitValue
  onChange: (v: SplitValue) => void
  total: number
  currency: CurrencyCode
  /** Người đã cho vay (khoản owed_to_me đang mở, cùng loại tiền) — chọn để cộng dồn. */
  people: DebtPerson[]
  /** Ô "Phần người khác nợ lại" đang được NumPad nhắm tới (mobile). */
  othersActive: boolean
  onFocusOthers: () => void
}) {
  const mine = total - value.others
  const over = value.others > total
  const selected = value.existingDebtId
    ? people.find((p) => p.id === value.existingDebtId) ?? null
    : null
  return (
    <div className={blockCls}>
      <div>
        <label className={labelCls}>Phần người khác nợ lại</label>
        <MoneyField
          value={value.others}
          currency={currency}
          active={othersActive}
          onFocus={onFocusOthers}
          onChange={(v) => onChange({ ...value, others: v })}
          ariaLabel="Phần người khác nợ lại"
        />
      </div>
      {total > 0 && value.others > 0 && (
        <p className={`text-right text-xs ${over ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
          {over ? (
            'Phần người khác không được lớn hơn tổng.'
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
      {people.length > 0 && (
        <div>
          <label className={labelCls}>Người đã cho vay (cộng dồn)</label>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {people.map((p) => {
              const active = value.existingDebtId === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    onChange(
                      active
                        ? { ...value, existingDebtId: null, counterparty: '' }
                        : { ...value, existingDebtId: p.id, counterparty: p.name },
                    )
                  }
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                    active
                      ? 'border-green-600 bg-green-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200'
                  }`}
                >
                  <span className="max-w-[9rem] truncate">{p.name}</span>
                  <span className={`text-xs tabular-nums ${active ? 'text-white/80' : 'text-gray-400'}`}>
                    {formatMoney(p.remaining, p.currency)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      <div>
        <label className={labelCls}>Ai nợ mình</label>
        <input
          value={value.counterparty}
          onChange={(e) =>
            // Gõ tay → bỏ liên kết người đã chọn (vẫn tự cộng dồn nếu trùng tên khi lưu).
            onChange({ ...value, counterparty: e.target.value, existingDebtId: null })
          }
          placeholder="Tên người"
          className={inputCls}
        />
        {selected && (
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
}: {
  value: DebtValue
  onChange: (v: DebtValue) => void
  /** Có tài khoản + danh mục phù hợp để tạo giao dịch thật không. */
  canRecordReal: boolean
  /** Người đã cho vay/nợ (khoản đang mở, cùng chiều) — chọn để cộng dồn. */
  people: DebtPerson[]
  /** Loại tiền tài khoản nguồn — phí trừ vào chính tài khoản đó. */
  currency: CurrencyCode
  /** Ô Phí đang được NumPad nhắm tới (mobile). */
  feeActive: boolean
  onFocusFee: () => void
}) {
  const [showMore, setShowMore] = useState(false)
  const realOn = canRecordReal && value.withTransaction
  const selected = value.existingDebtId
    ? people.find((p) => p.id === value.existingDebtId) ?? null
    : null
  return (
    <div className={blockCls}>
      {people.length > 0 && (
        <div>
          <label className={labelCls}>
            {value.direction === 'i_owe' ? 'Chủ nợ đã có (cộng dồn)' : 'Người đã cho vay (cộng dồn)'}
          </label>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {people.map((p) => {
              const active = value.existingDebtId === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    onChange(
                      active
                        ? { ...value, existingDebtId: null, counterparty: '' }
                        : { ...value, existingDebtId: p.id, counterparty: p.name },
                    )
                  }
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                    active
                      ? 'border-green-600 bg-green-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200'
                  }`}
                >
                  <span className="max-w-[9rem] truncate">{p.name}</span>
                  <span className={`text-xs tabular-nums ${active ? 'text-white/80' : 'text-gray-400'}`}>
                    {formatMoney(p.remaining, p.currency)}
                  </span>
                </button>
              )
            })}
          </div>
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
          placeholder="Tên người / công ty"
          className={inputCls}
        />
        {selected && (
          <p className="mt-1 text-xs text-green-700 dark:text-green-400">
            Cộng dồn vào khoản đang mở · còn lại {formatMoney(selected.remaining, selected.currency)}
          </p>
        )}
      </div>

      <div className="rounded-lg bg-white/70 p-2.5 dark:bg-gray-900/50">
        <label className="flex items-center justify-between gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>
            Có chuyển tiền thật
            <span className="block text-xs text-gray-500 dark:text-gray-400">
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
            Chưa có danh mục phù hợp để tạo giao dịch thật. Vẫn lưu được khoản nợ (không đổi số dư).
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
      />

      {/* Cộng dồn → hạn/lãi lấy theo khoản cũ, không nhập lại. */}
      {!selected && (
        <>
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400"
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
}) {
  const [showMore, setShowMore] = useState(false)
  const rate = sent > 0 && value.received > 0 ? value.received / sent : 0
  return (
    <div className={blockCls}>
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
          />
        </div>
      </div>
      {rate > 0 && (
        <p className="text-right text-xs text-gray-500 dark:text-gray-400">
          Tỷ giá: 1 ¥ ≈ {rate.toFixed(1)} ₫
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${showMore ? 'rotate-180' : ''}`} />
        {showMore ? 'Ẩn bớt' : 'Thêm chi tiết (dịch vụ)'}
      </button>
      {showMore && (
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
      )}
    </div>
  )
}
