// Tách dư nợ thẻ thành "kỳ này" (đã chốt sao kê, sắp bị rút) và "chưa chốt"
// (quẹt sau ngày chốt, sang kỳ sau mới đòi) — đúng cách app thẻ thật trình bày.
//
// Trước đây trang Tài sản chỉ hiện MỘT số: toàn bộ dư nợ chưa trả. Người dùng đọc
// "Cần trả ¥191.925" rồi tưởng ngày đến hạn bị rút hết ngần ấy, trong khi engine
// tự-trả (`runCardAutopayCatchUp`) chỉ rút số dư TẠI NGÀY CHỐT. Hai con số cách
// nhau cả trăm nghìn yên mà không chỗ nào nói chúng khác nhau.
//
// `billed` ở đây dùng ĐÚNG mốc mà engine dùng (`statementCloseFor` của kỳ đến hạn
// kế tiếp) để số hiển thị và số bị rút không thể lệch nhau.

import { nextStatementPeriod } from '../../lib/cardAutopay'
import { txBalanceDelta, type BalanceTxLike } from '../../lib/cardBalance'
import { addDaysISO, nextCardDueDate } from '../../lib/dates'

export interface CardStatementTx extends BalanceTxLike {
  occurred_on: string
}

export interface CardStatementInput {
  cardId: string
  /** Số dư sổ hiện tại theo view account_balances (âm = đang nợ). */
  balance: number
  statementDay: number | null
  paymentDueDay: number | null
  todayISO: string
  /**
   * Giao dịch dùng để lùi số dư về ngày chốt. Có thể truyền chung cả rổ của mọi
   * thẻ — `txBalanceDelta` trả 0 cho giao dịch không đụng tới `cardId`.
   * PHẢI phủ hết từ sau ngày chốt tới vô hạn (kể cả giao dịch ghi ngày tương lai),
   * vì view account_balances cộng mọi giao dịch bất kể ngày.
   */
  txs: CardStatementTx[]
}

export interface CardStatementSplit {
  /** Toàn bộ dư nợ chưa trả (≥ 0). */
  totalOwed: number
  /** Ngày đến hạn kế tiếp, đã dời T7/CN; null khi thẻ chưa đặt ngày trả. */
  dueISO: string | null
  /** Ngày chốt sao kê của kỳ đó; null khi thiếu ngày chốt hoặc ngày trả. */
  closeISO: string | null
  /** Nợ đã chốt — số sẽ bị rút vào `dueISO`. null khi chưa đủ ngày để tính. */
  billed: number | null
  /** Phần quẹt sau ngày chốt, kỳ sau mới đòi. null khi `billed` null. */
  unbilled: number | null
  /**
   * Ngày sẽ bị rút phần `unbilled` — tức lần đến hạn NGAY SAU `dueISO`, đã dời
   * T7/CN. null khi `unbilled` null.
   *
   * Có mặt để dòng "Chưa chốt" nói được nó thuộc khoảng nào: chỉ hai chữ "kỳ sau"
   * thì người đọc không biết phần đó là tiền quẹt tháng nào, và dễ tưởng nó trùng
   * với tháng đang xem ở thanh chuyển tháng bên dưới.
   */
  nextDueISO: string | null
}

/**
 * Thẻ thiếu `statementDay` hoặc `paymentDueDay` thì không có kỳ để chia —
 * trả `billed`/`unbilled` = null và nơi hiển thị rơi về một số tổng như cũ.
 *
 * Trả bớt SAU ngày chốt (trả tay sớm) làm `totalOwed < billed`. Khi đó phần đã
 * chốt còn nợ chỉ còn đúng `totalOwed`, nên kẹp lại để `billed + unbilled` luôn
 * bằng `totalOwed` — hai dòng trên màn hình không bao giờ cộng ra số thứ ba.
 */
export function cardStatementSplit({
  cardId,
  balance,
  statementDay,
  paymentDueDay,
  todayISO,
  txs,
}: CardStatementInput): CardStatementSplit {
  const totalOwed = balance < 0 ? -balance : 0

  // `nextStatementPeriod` nằm cạnh engine tự-trả một cách cố ý: nó suy mốc chốt từ
  // ngày trả DANH NGHĨA, nên số hiển thị ở đây không thể lệch số engine sẽ rút.
  const period = nextStatementPeriod(statementDay, paymentDueDay, todayISO)
  if (!period) {
    const dueISO = paymentDueDay != null ? nextCardDueDate(paymentDueDay, todayISO) : null
    return { totalOwed, dueISO, closeISO: null, billed: null, unbilled: null, nextDueISO: null }
  }
  const { closeISO, dueISO } = period

  let after = 0
  for (const t of txs) {
    if (t.occurred_on > closeISO) after += txBalanceDelta(t, cardId)
  }
  const balanceAtClose = balance - after
  const billedRaw = balanceAtClose < 0 ? -balanceAtClose : 0

  const billed = Math.min(billedRaw, totalOwed)
  // Lần đến hạn kế tiếp tính từ hôm sau `dueISO` — `dueISO` đã dời cuối tuần nên
  // đếm từ chính nó có thể ra lại đúng ngày đó. Đi qua `nextStatementPeriod` chứ
  // không gọi thẳng `nextCardDueDate`: cùng một nguồn mốc kỳ cho cả tệp.
  const nextDueISO = nextStatementPeriod(statementDay, paymentDueDay, addDaysISO(dueISO, 1))!.dueISO
  return { totalOwed, dueISO, closeISO, billed, unbilled: totalOwed - billed, nextDueISO }
}
