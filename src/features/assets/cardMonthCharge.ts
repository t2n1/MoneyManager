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
import { CARD_RECONCILE_NOTE } from './reconcile'

export type MonthChargeTx = BalanceTxLike & { note?: string | null }

/** Khoản bù tổng nợ do "Điều chỉnh số nợ" tạo — nhận diện bằng ghi chú. */
const isCardReconcile = (t: MonthChargeTx, cardId: string) =>
  t.account_id === cardId && t.type !== 'transfer' && t.note === CARD_RECONCILE_NOTE

/**
 * Tổng tiền quẹt trong rổ `txs` (đã lọc sẵn theo tháng ở nơi gọi).
 *
 * Đảo dấu `txBalanceDelta` vì quẹt làm số dư thẻ ÂM đi. Khoản TRẢ NỢ thẻ (chuyển
 * tiền vào thẻ) bị loại: sao kê hỏi "tháng này quẹt bao nhiêu", không quan tâm đã
 * trả hay chưa — trừ nó ra sẽ ra số không có ở bất kỳ đâu trên sao kê thật.
 *
 * Chuyển tiền RA KHỎI thẻ (rút tiền mặt) vẫn tính: nó có trên sao kê.
 * Khoản bù của "Chỉnh cho khớp" cũng tính — không tính thì chỉnh xong tổng
 * tháng vẫn lệch y như cũ. Riêng khoản bù TỔNG NỢ ("Điều chỉnh số nợ", thường
 * ghi lùi về ngày chốt nên rơi vào kỳ) thì loại: nó không phải tiền quẹt, cộng
 * vào là tổng ra số âm không có trên sao kê thật nào — hiển thị thành dòng
 * riêng bằng `cardMonthReconcileNet`.
 */
export function cardMonthCharge(cardId: string, txs: MonthChargeTx[]): number {
  let charged = 0
  for (const t of txs) {
    if (t.type === 'transfer' && t.to_account_id === cardId) continue
    if (isCardReconcile(t, cardId)) continue
    charged -= txBalanceDelta(t, cardId)
  }
  return charged
}

/**
 * Tổng ảnh hưởng của các khoản "Điều chỉnh số nợ" trong rổ `txs` lên nợ thẻ:
 * dương = bớt nợ (bù chiều thu), âm = thêm nợ. Trang chi tiết dùng để hiện
 * khoản bù thành dòng riêng dưới tổng "Quẹt trong kỳ".
 */
export function cardMonthReconcileNet(cardId: string, txs: MonthChargeTx[]): number {
  let net = 0
  for (const t of txs) if (isCardReconcile(t, cardId)) net += txBalanceDelta(t, cardId)
  return net
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

/**
 * Số tiền THẬT SỰ bị rút vào ngày đến hạn của kỳ đang xem; null = app không biết.
 *
 * Panel sao kê in tổng QUẸT của kỳ rồi ngay dưới là dòng "Bị rút ngày …". Hai con
 * số đó chỉ bằng nhau khi kỳ trước đã trả sạch: còn nợ cũ, hoặc có khoản "Điều
 * chỉnh số nợ" (bị loại khỏi tổng quẹt nhưng VẪN nằm trong số bị rút), là chúng
 * tách nhau ra — mà trước đây panel chỉ in số quẹt, nên người đọc nối ngày với số
 * quẹt và tưởng đó là số sắp bị trừ khỏi tài khoản nguồn.
 *
 * Chỉ trả số cho ĐÚNG kỳ đến hạn kế tiếp: `cardStatementSplit` lùi số dư HÔM NAY về
 * ngày chốt của riêng kỳ đó. Kỳ đã qua hay kỳ chưa tới không có mốc nào để lùi về
 * — im lặng còn hơn in một số đoán bừa cạnh chữ "bị rút".
 */
export function statementDueAmount(
  viewing: Pick<CardBillingRange, 'closeISO'> | null,
  current: { closeISO: string | null; billed: number | null } | null | undefined,
): number | null {
  if (!viewing || current?.closeISO == null || current.billed == null) return null
  return viewing.closeISO === current.closeISO ? current.billed : null
}

export interface CarriedDebtInput {
  /** `statementDueAmount(...)` — số thật sự bị rút; null khi đang xem kỳ khác. */
  dueAmount: number | null
  /** `cardMonthCharge(...)` — tiền quẹt trong kỳ. */
  charged: number
  /** `cardMonthReconcileNet(...)` — dương = bớt nợ. */
  reconcileNet: number
}

/**
 * Nợ các kỳ TRƯỚC còn dồn lại trong số bị rút kỳ này; null khi chưa biết số bị rút.
 *
 * Có dòng này thì panel TỰ KIỂM được: `quẹt − khoản bù + nợ cũ` cộng đúng ra số bị
 * rút, người đọc cộng tay lại được. Trước đó panel chỉ khẳng định "gồm cả nợ kỳ
 * trước" mà không nói bao nhiêu — một câu không kiểm chứng được.
 *
 * Nợ mọc ngược vào kỳ mà `runCardAutopayCatchUp` đã đòi xong (nhập lùi, khôi phục
 * sao lưu) không mất đi: nó dồn sang `billed` của kỳ kế tiếp và vẫn bị rút, chỉ
 * muộn một kỳ. Đây là chỗ duy nhất nói ra điều đó.
 *
 * ÂM là trạng thái thật (trả dư ở kỳ trước) — KHÔNG kẹp về 0, kẹp là giấu mất một
 * trạng thái có thật và phá luôn bất biến cộng-đúng ở trên.
 */
export function carriedDebt({ dueAmount, charged, reconcileNet }: CarriedDebtInput): number | null {
  if (dueAmount == null) return null
  return dueAmount - charged + reconcileNet
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
