// Tóm tắt khối Thẻ tín dụng thành đúng những gì dòng thu gọn cần hiện:
// "kỳ này bị rút bao nhiêu · ngày nào · có thẻ nào thiếu tiền không".
//
// Tách khỏi component vì cộng tiền nhiều loại tiền tệ và chọn ngày sớm nhất là
// chỗ dễ sai lặng lẽ (thiếu tỷ giá thì tổng thiếu mà không ai biết), nên phải
// test được mà không dựng React.
import type { CurrencyCode } from '../../lib/currencies'
import { convertToBase, type Rates } from '../../lib/rates'
import type { CardFundingResult, CardLiability } from './aggregate'
import type { CardStatementSplit } from './cardStatement'

export interface CardsSummary {
  /**
   * Tổng tiền sẽ bị rút ở kỳ tới, quy về base currency (minor units).
   * null = KHÔNG thẻ nào đang nợ. Thẻ nợ mà thiếu tỷ giá vẫn cho ra số (đã cộng
   * phần quy đổi được) kèm `approx` = true, để không nhầm với "chưa phát sinh nợ".
   */
  billedBase: number | null
  /** true = cần in dấu ≈ (có thẻ ngoại tệ hoặc thiếu tỷ giá) */
  approx: boolean
  /** Ngày đến hạn sớm nhất trong các thẻ ĐANG NỢ; null = không có */
  nextDueISO: string | null
  /** Số thẻ đang nợ mà nguồn trả không đủ tiền */
  shortCount: number
  /** Chỉ khi đúng 1 thẻ thiếu — nhiều thẻ thì không cộng được vì có thể khác loại tiền */
  singleShortfall: { amount: number; currency: CurrencyCode } | null
}

/**
 * `cards` phải là danh sách đã lọc thẻ ẩn. Thẻ "ngoài tổng" (`includeInTotals`
 * false) VẪN được cộng: tiền vẫn rời tài khoản vào ngày đến hạn, khác với Tài
 * sản ròng nơi cờ đó quyết định có trừ hay không.
 */
export function cardsSummary(
  cards: CardLiability[],
  statements: Map<string, CardStatementSplit>,
  funding: CardFundingResult,
  base: CurrencyCode,
  rates: Rates,
): CardsSummary {
  let billedBase: number | null = null
  let approx = false
  let nextDueISO: string | null = null
  let shortCount = 0
  let singleShortfall: CardsSummary['singleShortfall'] = null

  for (const c of cards) {
    const st = statements.get(c.id)
    const owed = st?.totalOwed ?? 0
    if (owed <= 0) continue

    // Thẻ đủ ngày chốt/ngày trả mới chia được kỳ; thiếu thì rơi về toàn bộ dư nợ.
    const due = st?.billed ?? owed
    if (c.currency !== base) approx = true
    const inBase = convertToBase(due, c.currency, base, rates)
    billedBase = billedBase ?? 0
    if (inBase == null) approx = true
    else billedBase += inBase

    if (st?.dueISO != null && (nextDueISO == null || st.dueISO < nextDueISO)) {
      nextDueISO = st.dueISO
    }

    const f = funding.byCard.get(c.id)
    if (f && !f.enough) {
      shortCount++
      singleShortfall = shortCount === 1 ? { amount: f.shortfall, currency: c.currency } : null
    }
  }

  return { billedBase, approx, nextDueISO, shortCount, singleShortfall }
}
