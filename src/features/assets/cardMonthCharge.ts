// Kỳ sao kê của thẻ tín dụng và số tiền QUẸT trong kỳ đó — để đối chiếu 1-1 với
// app thẻ thật (PayPay Card, Rakuten Card).
//
// App thẻ đánh số kỳ theo THÁNG BỊ RÚT TIỀN, không phải tháng quẹt: bấm "tháng 9"
// ra các khoản quẹt tháng 8, vì chúng bị rút ngày 27/9. `cardBillingRange` dựng
// đúng khoảng đó để hai bên chọn cùng một số tháng là thấy cùng một danh sách.
//
// Khác với `cardStatement.ts`: tệp kia chia dư nợ HÔM NAY thành "đã chốt / chưa
// chốt". Tệp này nhìn theo kỳ người dùng đang chọn, dùng đúng rổ giao dịch mà
// trang chi tiết đã tải — nên con số luôn bằng tổng những dòng hiện trên màn hình.
//
// Thuần, không phụ thuộc React, để unit-test được.

import { dayOfMonth, statementCloseFor } from '../../lib/cardAutopay'
import { addDaysISO, addMonths, type MonthKey } from '../../lib/dates'
import { shiftToBusinessDay } from '../../lib/jpHolidays'
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

export interface BillingRangeInput {
  /** Tháng BỊ RÚT TIỀN — đúng số tháng mà app thẻ hiển thị. */
  monthKey: MonthKey
  statementDay: number | null
  paymentDueDay: number | null
}

export interface CardBillingRange {
  /** Ngày quẹt sớm nhất thuộc kỳ này (hôm sau ngày chốt kỳ trước). */
  start: string
  /** Mốc loại trừ cho truy vấn: hôm sau ngày chốt. */
  end: string
  /** Ngày chốt sao kê của kỳ = ngày quẹt cuối cùng còn được tính. */
  closeISO: string
  /** Ngày tiền rời tài khoản, đã dời T7/CN sang T2. */
  dueISO: string
}

/**
 * Kỳ sao kê bị rút trong tháng `monthKey`.
 *
 * Chốt 31 + trả 27, tháng 9/2026 → quẹt 1/8–31/8, rút 28/9 (27/9 rơi CN).
 * Chốt 15 + trả 10, tháng 9/2026 → quẹt 16/7–15/8, rút 10/9.
 *
 * Mốc chốt lấy từ NGÀY TRẢ CHƯA DỜI cuối tuần: dời rồi mới suy ngược thì thẻ trả
 * ngày 31 có lần bị đẩy sang tháng sau, kéo cả kỳ lệch đi một tháng.
 *
 * Thiếu ngày chốt hoặc ngày trả thì không dựng được kỳ → null, nơi gọi rơi về
 * tháng lịch như tài khoản thường.
 */
export function cardBillingRange({
  monthKey,
  statementDay,
  paymentDueDay,
}: BillingRangeInput): CardBillingRange | null {
  if (statementDay == null || paymentDueDay == null) return null
  const dueRaw = dayOfMonth(monthKey.year, monthKey.month, paymentDueDay)
  const closeISO = statementCloseFor(dueRaw, statementDay)
  const prev = addMonths(monthKey, -1)
  const prevClose = statementCloseFor(
    dayOfMonth(prev.year, prev.month, paymentDueDay),
    statementDay,
  )
  return {
    start: addDaysISO(prevClose, 1),
    end: addDaysISO(closeISO, 1),
    closeISO,
    dueISO: shiftToBusinessDay(dueRaw),
  }
}

export interface MonthAdjustDateInput {
  /** Ngày đầu khoảng đang xem (`getMonthRange().start`). */
  rangeStartISO: string
  rangeEndISO: string
  todayISO: string
}

/**
 * Ngày ghi giao dịch bù — LUÔN nằm trong tháng đang xem.
 *
 * Phải nằm trong kỳ thì máy tự-trả-thẻ (`runCardAutopayCatchUp`, tính theo số dư
 * tại ngày chốt) mới thấy khoản bù, và tổng "quẹt trong tháng N" mới khớp lại.
 *
 * Hôm nay rơi vào giữa kỳ thì lấy hôm nay, khỏi ghi ngày chưa tới một cách vô cớ.
 * Hôm nay nằm NGOÀI kỳ — tháng đã qua hoặc tháng chưa tới — thì lấy ngày cuối kỳ.
 * Bản đầu kẹp cả tháng tương lai về hôm nay, thành ra bù tháng 9 lại ghi vào tháng
 * 8: sai tháng, mà tháng 9 vẫn lệch y như cũ.
 */
export function monthAdjustDate({
  rangeStartISO,
  rangeEndISO,
  todayISO,
}: MonthAdjustDateInput): string {
  const lastDay = addDaysISO(rangeEndISO, -1)
  return todayISO >= rangeStartISO && todayISO <= lastDay ? todayISO : lastDay
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
