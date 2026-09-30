import type { CurrencyCode } from '../../lib/money'
import { ActionButton, Money } from '../../components/ui'
import { tr } from '../../i18n'
import { trn } from '../../i18n/react'

interface Props {
  /** Phần trả vượt số còn lại (minor units theo tệ KHOẢN NỢ). 0 → không bày gì. */
  overpay: number
  currency: CurrencyCode
  /** Đã xác nhận đúng số đang gõ chưa (xem overpayConfirmed ở aggregate.ts). */
  confirmed: boolean
  onToggle: () => void
  className?: string
}

/**
 * Khung vàng "Nhiều hơn số còn lại — trả thừa ¥X" + nút xác nhận. Dùng chung cho HAI
 * đường trả nợ (DebtPaymentSheet ở trang chi tiết nợ, DebtPickerField ở form Nhập) —
 * cùng một vật thì cùng một câu, cùng một nút, không thì người dùng học một cái rồi
 * bị cái kia lừa.
 *
 * KHÔNG chặn cứng: người ta có thể thật sự bị trả thừa. Chỉ đòi bấm riêng cho đúng số
 * đó — gõ nhầm thêm một số 0 là ca thường.
 */
export function OverpayConfirm({ overpay, currency, confirmed, onToggle, className = '' }: Props) {
  if (overpay <= 0) return null
  return (
    <div
      role="alert"
      className={`rounded-md border border-state-warn-border bg-state-warn-bg p-3 text-sm text-state-warn-fg ${className}`}
    >
      <p>
        {trn('Nhiều hơn số còn lại — trả thừa {amount}.', {
          amount: <Money amount={overpay} currency={currency} tone="warn" />,
        })}
      </p>
      <ActionButton variant="outline" className="mt-2" aria-pressed={confirmed} onClick={onToggle}>
        {confirmed ? tr('Đã xác nhận trả thừa ✓') : tr('Đúng, ghi trả thừa')}
      </ActionButton>
    </div>
  )
}
