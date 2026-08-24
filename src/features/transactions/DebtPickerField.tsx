import { useId } from 'react'
import { Guide } from '../../components/Guide'
import { formatMoney } from '../../lib/money'
import type { DebtDirection, DebtPaymentRow, DebtRow } from '../../types/database.types'
import { openDebtsFor, prefillFor } from './debtPick'
import { blockCls, labelCls } from './roleFields'
import type { PaymentValue } from './roleSave'
import { Select } from '../../components/ui'

interface Props {
  value: PaymentValue
  /** `prefillAmount` = số còn lại của khoản vừa chọn — TransactionForm điền vào ô số tiền. */
  onChange: (next: PaymentValue, prefillAmount?: number) => void
  debts: DebtRow[]
  payments: DebtPaymentRow[]
  /** Chiều khoản nợ mà dạng này trả: repay → i_owe, collect → owed_to_me. */
  direction: DebtDirection
}

/**
 * Chọn khoản nợ để trả (Tôi trả nợ) / thu lại (Người trả lại) — DẠNG DUY NHẤT của
 * form Nhập có field phụ thuộc nhau: chọn nợ ở đây đổi cả danh sách ví bên ngoài
 * (v1 tránh xuyên tệ, xem TransactionForm). Mọi lọc/quyết định nằm ở debtPick.ts —
 * component ở đây chỉ bày ra, không tự lọc gì.
 */
export function DebtPickerField({ value, onChange, debts, payments, direction }: Props) {
  const uid = useId()
  const open = openDebtsFor(debts, payments, direction)

  // Không có khoản nợ nào đang mở → nói ra, đừng để ô chọn rỗng (cùng nếp với
  // nhánh "Chưa có tài khoản JPY" khi remitLike hết ví — một câu cảnh báo còn hơn
  // một <Select> trống không bấm được gì).
  if (open.length === 0) {
    return (
      <div className={blockCls('debt')}>
        <p className="rounded-lg bg-state-warn-bg px-3 py-2 text-sm text-state-warn-fg">
          Chưa có khoản nợ nào đang mở ở chiều này. Ghi &quot;Cho vay&quot; hoặc &quot;Vay
          được&quot; trước.
        </p>
      </div>
    )
  }

  const selected = open.find((d) => d.id === value.debtId)

  return (
    <div className={blockCls('debt')}>
      <div>
        <label htmlFor={`${uid}-debt`} className={labelCls}>
          Khoản nợ nào
        </label>
        {/* Mỗi dòng nói CÒN LẠI bao nhiêu, không phải số gốc — người chọn cần biết
            đang trả/thu vào đâu, số gốc đã trả một phần thì không còn đúng nữa. */}
        <Select
          id={`${uid}-debt`}
          value={value.debtId}
          onChange={(e) => {
            const id = e.target.value
            onChange(
              { ...value, debtId: id },
              // Điền sẵn TOÀN BỘ số còn lại: trả đủ là ca thường, và DebtPaymentSheet
              // (đường vào thứ nhất) cũng mặc định vậy — hai đường vào cùng một vật
              // thì phải cùng một nếp, không thì người dùng học một cái rồi bị cái
              // kia lừa.
              prefillFor(debts, payments, id) ?? undefined,
            )
          }}
          wrapClassName="w-full"
        >
          <option value="">— chọn —</option>
          {open.map((d) => (
            <option key={d.id} value={d.id}>
              {d.counterparty} · còn {formatMoney(d.remaining, d.currency)}
            </option>
          ))}
        </Select>
        {selected && (
          <p className="mt-1 text-sm text-fg-accent">
            {direction === 'i_owe' ? 'Mình trả' : 'Người ta trả'} · còn{' '}
            {formatMoney(selected.remaining, selected.currency)}
          </p>
        )}
      </div>

      {/* Công tắc tạo giao dịch thật — cùng khuôn với DebtFields/DebtPaymentSheet. */}
      <div className="rounded-lg bg-surface/70 p-2.5">
        <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-fg-secondary">
          <span>
            Có chuyển tiền thật
            <Guide as="span" className="block text-sm text-fg-muted">
              {direction === 'i_owe'
                ? 'Tạo giao dịch chi (trừ số dư tài khoản)'
                : 'Tạo giao dịch thu (cộng số dư tài khoản)'}
            </Guide>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={value.withTransaction}
            aria-label="Có chuyển tiền thật"
            onClick={() => onChange({ ...value, withTransaction: !value.withTransaction })}
            // Vùng chạm 44×44 ở nút, đường ray 24×44 ở <span> trong — cùng khuôn với các
            // công tắc khác trong app (ray đặt thẳng lên nút thì chỉ cao 24px).
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center"
          >
            <span
              className={`relative block h-6 w-11 rounded-full transition ${
                value.withTransaction ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  value.withTransaction ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </span>
          </button>
        </label>
      </div>
    </div>
  )
}
