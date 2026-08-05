// Số tiền QUẸT trong một "tháng" của thẻ tín dụng — con số để đối chiếu với sao
// kê thật (PayPay Card, Rakuten Card: mở app, chọn tháng, thấy tổng tiền tháng đó).
//
// Khác với `cardStatement.ts`: tệp kia chia dư nợ HÔM NAY thành "đã chốt / chưa
// chốt". Tệp này nhìn theo tháng người dùng đang xem, dùng đúng rổ giao dịch mà
// trang chi tiết đã tải — nên con số luôn bằng tổng những dòng hiện trên màn hình.
//
// Thuần, không phụ thuộc React, để unit-test được.

import { addDaysISO, nextCardDueDate } from '../../lib/dates'
import { txBalanceDelta, type BalanceTxLike } from '../../lib/cardBalance'

export type MonthChargeTx = BalanceTxLike

/**
 * Tổng tiền quẹt trong rổ `txs` (đã lọc sẵn theo tháng ở nơi gọi).
 *
 * Đảo dấu `txBalanceDelta` vì quẹt làm số dư thẻ ÂM đi. Khoản TRẢ NỢ thẻ (chuyển
 * tiền vào thẻ) bị loại: sao kê hỏi "tháng này quẹt bao nhiêu", không quan tâm đã
 * trả hay chưa — trừ nó ra sẽ ra số không có ở bất kỳ đâu trên sao kê thật.
 *
 * Chuyển tiền RA KHỎI thẻ (rút tiền mặt) vẫn tính: nó có trên sao kê.
 * Giao dịch `exclude_from_stats` cũng tính — kể cả khoản bù do chính tính năng
 * này tạo ra, nếu không số vừa chỉnh sẽ không khớp lại.
 */
export function cardMonthCharge(cardId: string, txs: MonthChargeTx[]): number {
  let charged = 0
  for (const t of txs) {
    if (t.type === 'transfer' && t.to_account_id === cardId) continue
    charged -= txBalanceDelta(t, cardId)
  }
  return charged
}

export interface MonthDueInput {
  /** Ngày đầu tháng kế của khoảng đang xem (mốc loại trừ của `getMonthRange`). */
  rangeEndISO: string
  statementDay: number | null
  paymentDueDay: number | null
}

/**
 * Ngày thẻ bị rút tiền cho tháng đang xem; null khi không nói chắc được.
 *
 * `rangeEndISO` chính là ngày sau ngày cuối kỳ, nên `nextCardDueDate` từ mốc đó
 * ra đúng lần trả kế tiếp (kỳ chốt cuối tháng 6 + trả ngày 27 → 27/7), đã dời
 * T7/CN sang T2 giống mọi chỗ khác trong app.
 *
 * Thẻ chốt GIỮA tháng (`statementDay < 28`) thì kỳ sao kê không trùng tháng lịch
 * — suy ngày rút từ tháng lịch sẽ sai, nên trả null để nơi hiển thị ẩn dòng đó đi.
 */
export function monthDueDate({
  rangeEndISO,
  statementDay,
  paymentDueDay,
}: MonthDueInput): string | null {
  if (paymentDueDay == null) return null
  if (statementDay != null && statementDay < 28) return null
  return nextCardDueDate(paymentDueDay, rangeEndISO)
}

export interface MonthAdjustDateInput {
  rangeEndISO: string
  todayISO: string
}

/**
 * Ngày ghi giao dịch bù: ngày cuối cùng của tháng đang xem, kẹp không quá hôm nay.
 *
 * Nằm TRONG kỳ nên máy tự-trả-thẻ (`runCardAutopayCatchUp`, tính theo số dư tại
 * ngày chốt) nhìn thấy khoản bù và rút đúng số. Kẹp về hôm nay để tháng hiện tại
 * — và tháng tương lai — không sinh giao dịch ghi ngày chưa tới.
 */
export function monthAdjustDate({ rangeEndISO, todayISO }: MonthAdjustDateInput): string {
  const lastDay = addDaysISO(rangeEndISO, -1)
  return lastDay > todayISO ? todayISO : lastDay
}

export interface MonthAdjustPlan {
  /** entered − charged. Dương → app đang thiếu tiền, cần giao dịch CHI. */
  diff: number
  type: 'income' | 'expense'
}

/** Chênh lệch giữa tổng thật trên sao kê và tổng app đang tính. */
export function monthAdjustPlan({
  charged,
  entered,
}: {
  charged: number
  entered: number
}): MonthAdjustPlan {
  const diff = entered - charged
  return { diff, type: diff > 0 ? 'expense' : 'income' }
}
