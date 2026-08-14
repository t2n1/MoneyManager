// Nạp dữ liệu cho phép chia "kỳ này / chưa chốt" của thẻ tín dụng.
//
// Số dư từ view account_balances chỉ là con số HÔM NAY, không lùi được về ngày
// chốt sao kê — nên phải kéo thêm giao dịch phát sinh SAU ngày chốt để trừ ngược.
// Một truy vấn cho mọi thẻ (searchTransactions khớp account_id HOẶC to_account_id
// nên bắt được cả lần trả thẻ), rồi chia theo từng thẻ ở client.

import { useMemo } from 'react'
import { useSearchTransactions } from '../../hooks/queries'
import { nextStatementPeriod } from '../../lib/cardAutopay'
import { addDaysISO } from '../../lib/dates'
import { cardStatementSplit, type CardStatementSplit } from './cardStatement'

/**
 * Phần tối thiểu hook cần — `CardLiability` của trang Tài sản thỏa sẵn, còn trang
 * chi tiết tài khoản ghép tay từ `AccountBalanceRow` mà không phải dựng cả thẻ.
 */
export interface CardStatementCard {
  id: string
  balance: number
  statementDay: number | null
  paymentDueDay: number | null
}

/** Không có mốc trên: view account_balances cộng cả giao dịch ghi ngày tương lai. */
const FAR_FUTURE = '9999-12-31'

export function useCardStatements(
  cards: CardStatementCard[],
  todayISO: string,
): Map<string, CardStatementSplit> {
  // Thẻ đủ ngày chốt + ngày trả mới có kỳ để chia; thẻ khác không cần giao dịch.
  // Dùng chung `nextStatementPeriod` với `cardStatementSplit`: cửa sổ truy vấn phải
  // bắt đầu ĐÚNG sau mốc chốt mà phép chia sẽ lùi về, lệch một ngày là thiếu giao
  // dịch để trừ ngược và số "Kỳ này" sai âm thầm.
  const splittable = useMemo(
    () =>
      cards.flatMap((c) => {
        const period = nextStatementPeriod(c.statementDay, c.paymentDueDay, todayISO)
        return period ? [{ id: c.id, closeISO: period.closeISO }] : []
      }),
    [cards, todayISO],
  )

  // Cửa sổ chung = từ sau ngày chốt SỚM NHẤT trong các thẻ, tới vô hạn.
  const earliestClose = splittable.reduce<string | null>(
    (min, c) => (min == null || c.closeISO < min ? c.closeISO : min),
    null,
  )

  const { data: txs = [] } = useSearchTransactions(
    {
      start: earliestClose ? addDaysISO(earliestClose, 1) : FAR_FUTURE,
      end: FAR_FUTURE,
      accountIds: splittable.map((c) => c.id),
    },
    earliestClose != null,
  )

  return useMemo(() => {
    const out = new Map<string, CardStatementSplit>()
    for (const c of cards) {
      out.set(
        c.id,
        cardStatementSplit({
          cardId: c.id,
          balance: c.balance,
          statementDay: c.statementDay,
          paymentDueDay: c.paymentDueDay,
          todayISO,
          txs,
        }),
      )
    }
    return out
  }, [cards, todayISO, txs])
}
