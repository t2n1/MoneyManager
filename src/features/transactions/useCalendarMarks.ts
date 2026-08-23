// Dấu trong ô ngày của tab Lịch: cam kết chưa ra · thẻ tới hạn · ngày lương.
//
// Ba nguồn, ba lý do khác nhau để có mặt:
//
//   cam kết   `useCommitments` — CÙNG một đường với tab Ngân sách. Không gom lại ở đây:
//             hai màn in hai tổng khác nhau cho cùng một tháng là lỗi tệ nhất mà khối
//             "còn được tiêu" có thể mắc.
//   thẻ       `useCardStatements` — engine tự-trả thẻ tự ghi giao dịch vào ngày rút, nên
//             khoản này KHÔNG nằm trong `useCommitments`. Nó có mặt vì lịch là màn của
//             NGÀY, và "ngày nào thẻ bị rút" là câu chỉ lịch trả lời được.
//   lương     `detectPaydays` — suy từ chính khoản thu lớn, người dùng không phải khai gì.
//
// Thẻ tới hạn CỐ Ý không cộng vào "Cam kết còn lại": xem ghi chú ở `cardDues` bên dưới.
import { useMemo } from 'react'
import { useAccountBalances, usePlannedExpenses, useRecurringRules } from '../../hooks/queries'
import { getMonthRange, toISODate, type MonthKey } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'
import { useCardStatements } from '../assets/useCardStatements'
import { classifyCommitments, collectCommitments } from '../budgets/commitments'
import type { CommitmentReport, CommitmentSchedule } from '../budgets/commitments'
import { detectPaydays } from '../reports/behavior'
import type { CurrencyOf } from '../reports/aggregate'
import type { DayMarkInput } from './calendarMonth'

export interface CalendarMarks {
  /** Gộp cả ba nguồn — thứ tự không quan trọng, `pickMark` tự xếp. */
  marks: DayMarkInput[]
  /** Cam kết chưa ra (KHÔNG gồm thẻ) — nguồn của khối "Sắp tới trong tháng". */
  commitments: CommitmentReport
  /** Chia cam kết thành quá hạn chưa ghi / còn phải trả. */
  schedule: CommitmentSchedule
  /** Thẻ tới hạn trong kỳ, để liệt kê riêng. */
  cardDues: DayMarkInput[]
}

const EMPTY_SCHEDULE: CommitmentSchedule = {
  overdue: [],
  upcoming: [],
  overdueTotal: 0,
  upcomingTotal: 0,
}

export interface CalendarMarksArgs {
  monthKey: MonthKey
  monthStartDay: number
  /** Giao dịch của kỳ — chỉ dùng để suy ngày lương. */
  transactions: TransactionRow[]
  currencyOf: CurrencyOf
  base: CurrencyCode
  rates: Rates | undefined
}

export function useCalendarMarks(args: CalendarMarksArgs): CalendarMarks {
  const { monthKey, monthStartDay, transactions, currencyOf, base, rates } = args
  const { data: rules = [] } = useRecurringRules()
  const { data: planned = [] } = usePlannedExpenses()
  const { data: balances = [] } = useAccountBalances()

  const range = useMemo(() => getMonthRange(monthKey, monthStartDay), [monthKey, monthStartDay])
  const todayISO = toISODate(new Date())

  // Thẻ CHƯA lưu trữ và có đủ hai mốc (chốt + trả) mới có kỳ để tính. Thẻ thiếu mốc
  // thì `cardStatementSplit` trả billed = null và không có ngày nào để đánh dấu.
  const cards = useMemo(
    () =>
      balances
        .filter((b) => b.type === 'card' && !b.is_archived && b.payment_due_day != null)
        .map((b) => ({
          id: b.id,
          name: b.name,
          currency: b.currency,
          balance: b.balance,
          statementDay: b.statement_day,
          paymentDueDay: b.payment_due_day,
        })),
    [balances],
  )
  const statements = useCardStatements(cards, todayISO)

  const commitments = useMemo(() => {
    const r = rates ?? {}
    const currencyOfAccount = (id: string): CurrencyCode =>
      balances.find((b) => b.id === id)?.currency ?? base
    return collectCommitments(rules, planned, range, currencyOfAccount, (amount, c) =>
      convertToBase(amount, c, base, r),
    )
  }, [rules, planned, range, balances, base, rates])

  const schedule = useMemo(
    () => (commitments.items.length === 0 ? EMPTY_SCHEDULE : classifyCommitments(commitments.items, todayISO)),
    [commitments.items, todayISO],
  )

  /**
   * Thẻ tới hạn RƠI VÀO KỲ ĐANG XEM.
   *
   * `nextStatementPeriod` chỉ biết kỳ đến hạn KẾ TIẾP tính từ hôm nay, nên tháng đã qua
   * và tháng tương lai không có dấu nào — đúng: số bị rút của một kỳ chưa chốt thì chưa
   * tồn tại, mà của kỳ đã qua thì đã thành giao dịch thật trong sổ.
   *
   * Số tiền lấy `billed` (nợ ĐÃ CHỐT) chứ không phải cả dư nợ: phần quẹt sau ngày chốt
   * kỳ sau mới đòi, cộng vào đây là báo cao hơn số thật sẽ bị rút.
   */
  const cardDues = useMemo(() => {
    const r = rates ?? {}
    const out: DayMarkInput[] = []
    for (const c of cards) {
      const s = statements.get(c.id)
      if (!s?.dueISO || s.billed == null || s.billed <= 0) continue
      if (s.dueISO < range.start || s.dueISO >= range.end) continue
      const v = convertToBase(s.billed, c.currency, base, r)
      if (v === null) continue
      out.push({
        iso: s.dueISO,
        kind: 'card',
        title: c.name,
        amount: v,
        unknownAmount: false,
      })
    }
    return out
  }, [cards, statements, range.start, range.end, base, rates])

  const paydays = useMemo(
    () => detectPaydays(transactions, currencyOf, base, rates ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, base, rates],
  )

  const marks = useMemo(
    () => [
      ...commitments.items.map(
        (it): DayMarkInput => ({
          iso: it.dueISO,
          kind: it.kind,
          title: it.title,
          amount: it.amount,
          unknownAmount: it.unknownAmount,
        }),
      ),
      ...cardDues,
      // `amount: 0` là cách ngày lương nói "tôi không mang tiền phải trả" — `pickMark`
      // và tổng cam kết theo tuần đều dựa vào đó, đừng đặt số thu vào đây.
      ...paydays.map(
        (iso): DayMarkInput => ({
          iso,
          kind: 'payday',
          title: 'Lương',
          amount: 0,
          unknownAmount: false,
        }),
      ),
    ],
    [commitments.items, cardDues, paydays],
  )

  return { marks, commitments, schedule, cardDues }
}
