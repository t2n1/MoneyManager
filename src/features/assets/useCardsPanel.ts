// Ba phép tính của khối thẻ tín dụng, gom về MỘT hook vì nay có HAI chỗ cần chúng:
// bảng thẻ (CardsSection) và huy hiệu "nguồn trả N thẻ" ở dòng tài khoản nguồn trong
// bảng tài khoản (bản vẽ 2a).
//
// Gọi `useCardStatements` hai lần không tốn request nào (react-query dùng chung cache),
// nhưng `cardFunding` thì sẽ chạy hai lượt trên hai bản sao dữ liệu — và hai bản sao của
// một phép phân bổ tuần tự là cách chắc chắn nhất để hai chỗ nói hai con số khác nhau
// sau vài lượt sửa. Nên phép tính ở đây, kết quả chảy xuống bằng prop.
import { useMemo } from 'react'
import type { CurrencyCode } from '../../lib/currencies'
import type { Rates } from '../../lib/rates'
import type { AccountBalanceRow } from '../../types/database.types'
import { cardFunding, type CardFundingResult, type CardLiability } from './aggregate'
import { cardsSummary, type CardsSummary } from './cardsSummary'
import type { CardStatementSplit } from './cardStatement'
import { useCardStatements } from './useCardStatements'

export interface CardsPanel {
  statements: Map<string, CardStatementSplit>
  funding: CardFundingResult
  summary: CardsSummary
}

export function useCardsPanel(input: {
  /** Thẻ đã lọc bỏ thẻ ẩn. */
  cards: CardLiability[]
  balances: AccountBalanceRow[]
  base: CurrencyCode
  rates: Rates
  todayISO: string
}): CardsPanel {
  const { cards, balances, base, rates, todayISO } = input
  const statements = useCardStatements(cards, todayISO)

  return useMemo(() => {
    const sourceById = new Map(
      balances.map((b) => [
        b.id,
        { id: b.id, name: b.name, currency: b.currency, balance: b.balance },
      ]),
    )
    // "Đủ trả" phải đo theo số RÚT VÀO NGÀY ĐẾN HẠN, không phải nợ gộp — xem cardFunding.
    const billedByCard = new Map(
      [...statements].flatMap(([id, s]) => (s.billed == null ? [] : [[id, s.billed] as const])),
    )
    const funding = cardFunding(cards, sourceById, billedByCard)
    return {
      statements,
      funding,
      summary: cardsSummary(cards, statements, funding, base, rates),
    }
  }, [cards, balances, base, rates, statements])
}
