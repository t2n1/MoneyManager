// Chọn hoá đơn ứng với kỳ đang xem trên panel thẻ.
//
// Tách khỏi JSX vì đây là chỗ dễ sai lặng lẽ: lấy nhầm hoá đơn của thẻ khác, hoặc của
// kỳ liền kề, đều ra một con số trông rất hợp lý bên cạnh chữ "Hoá đơn PayPay".

import type { CardBillRow } from '../../types/database.types'
import type { CardBillingRange } from './cardMonthCharge'

/** `null` = kỳ này chưa nạp sao kê ⇒ panel giữ nguyên như cũ, KHÔNG bịa số. */
export function billForRange(
  bills: CardBillRow[],
  accountId: string,
  range: Pick<CardBillingRange, 'closeISO'> | null,
): CardBillRow | null {
  if (!range) return null
  return (
    bills.find((b) => b.account_id === accountId && b.close_date === range.closeISO) ?? null
  )
}
