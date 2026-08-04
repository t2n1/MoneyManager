// Tự động trả thẻ tín dụng — toán ngày + engine catch-up (thuần I/O qua interface).
// Mỗi thẻ có payment_account_id (tài khoản nguồn, cùng currency) + statement_day +
// payment_due_day. Vào mỗi ngày đến hạn, sinh 1 chuyển khoản nguồn→thẻ với số tiền =
// dư nợ tại ngày chốt sao kê. card_autopay_through là con trỏ kỳ đã sinh (chống trùng).
// KHÔNG import data/repo hay database.types để tránh vòng import (giống recurring.ts).

import type { AccountType } from '../types/database.types'
import { txBalanceDelta, type BalanceTxLike } from './cardBalance'
import { addDaysISO, addMonths, shiftWeekendToMonday } from './dates'

const pad = (n: number) => String(n).padStart(2, '0')
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate()

/** Ngày trong tháng, clamp về cuối tháng khi tháng ngắn hơn. month: 1–12. */
function dayOfMonth(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(Math.min(day, daysInMonth(year, month)))}`
}

/**
 * Các ngày đến hạn (hằng tháng vào `dueDay`) CẦN SINH: sau `throughISO` (con trỏ
 * kỳ đã sinh) đến hết `todayISO` (inclusive). Kết quả tăng dần theo thời gian.
 *
 * Ngày đến hạn đã DỜI Thứ 7/CN sang Thứ 2 (`shiftWeekendToMonday`) — khớp ngày
 * ngân hàng thực rút tiền và khớp hiển thị "ngày trả" ở trang Tài sản. Vì vậy
 * `throughISO` (con trỏ) cũng là ngày ĐÃ DỜI của kỳ trước; so sánh đều theo ngày dời.
 */
export function dueDatesToGenerate(dueDay: number, throughISO: string, todayISO: string): string[] {
  const out: string[] = []
  const [ty, tm] = throughISO.split('-').map(Number)
  let key = { year: ty, month: tm }
  // Chặn vòng lặp: tối đa ~50 năm kỳ tháng.
  for (let i = 0; i < 600; i++) {
    const due = shiftWeekendToMonday(dayOfMonth(key.year, key.month, dueDay))
    if (due > todayISO) break
    if (due > throughISO) out.push(due)
    key = addMonths(key, 1)
  }
  return out
}

/**
 * Ngày chốt sao kê áp cho kỳ đến hạn `dueISO`: ngày `statementDay` GẦN NHẤT TRƯỚC
 * `dueISO`. Ví dụ chốt 27, đến hạn 10 → chốt là ngày 27 tháng trước.
 */
export function statementCloseFor(dueISO: string, statementDay: number): string {
  const [y, m] = dueISO.split('-').map(Number)
  const sameMonth = dayOfMonth(y, m, statementDay)
  if (sameMonth < dueISO) return sameMonth
  const prev = addMonths({ year: y, month: m }, -1)
  return dayOfMonth(prev.year, prev.month, statementDay)
}

// --- Engine catch-up ---
// Types cấu trúc; Repo thật của app thỏa CardAutopayRepo về mặt cấu trúc.

/** Phần tài khoản engine cần đọc (AccountRow thỏa type này). */
export interface AccountLike {
  id: string
  type: AccountType
  currency: string
  initial_balance: number
  is_archived: boolean
  payment_account_id: string | null
  statement_day: number | null
  payment_due_day: number | null
  card_autopay_through: string | null
}

/** Phần giao dịch engine cần để tính số dư (TransactionRow thỏa type này). */
export type TxLike = BalanceTxLike

/** Subset của Repo mà engine cần — test dùng fake, app truyền repo thật. */
export interface CardAutopayRepo {
  getAccounts(): Promise<AccountLike[]>
  searchTransactions(filter: {
    start: string
    end: string
    accountIds?: string[]
  }): Promise<TxLike[]>
  /**
   * Ghi 1 lần tự trả thẻ. Trả về false khi thiết bị khác đã sinh đúng kỳ này
   * (partial unique index bắt trùng) — caller KHÔNG đếm là đã tạo.
   */
  insertCardAutopay(input: {
    type: 'transfer'
    amount: number
    to_amount: number | null
    category_id: string | null
    account_id: string
    to_account_id: string | null
    occurred_on: string
    note: string
  }): Promise<boolean>
  updateAccount(id: string, patch: { card_autopay_through: string }): Promise<unknown>
}

/** Ghi chú gắn cho giao dịch tự động trả thẻ (để người dùng nhận ra). */
export const AUTOPAY_NOTE = 'Tự động trả thẻ'

/** Số dư thẻ tính đến hết ngày `closeISO` (âm = đang nợ). */
async function cardBalanceThrough(
  repo: CardAutopayRepo,
  card: AccountLike,
  closeISO: string,
): Promise<number> {
  const txs = await repo.searchTransactions({
    start: '0001-01-01',
    end: addDaysISO(closeISO, 1), // end LOẠI TRỪ → +1 ngày để bao gồm closeISO
    accountIds: [card.id],
  })
  let bal = card.initial_balance
  for (const t of txs) bal += txBalanceDelta(t, card.id)
  return bal
}

/**
 * Catch-up khi mở app: với mỗi thẻ có tài khoản nguồn + đủ ngày chốt/đến hạn, sinh
 * giao dịch trả cho MỌI kỳ đến hạn sau card_autopay_through đến hôm nay. Số tiền =
 * dư nợ tại ngày chốt sao kê của kỳ đó (đã trừ các lần trả trước vì occurred_on nằm
 * trước mốc chốt kế tiếp → không trùng). owed ≤ 0 thì bỏ qua nhưng vẫn tiến con trỏ.
 * Con trỏ null (mới bật) → khởi tạo = hôm nay, KHÔNG sinh bù quá khứ. Trả về số GD đã tạo.
 *
 * Con trỏ CHỈ chống trùng trong một lượt chạy: hai thiết bị mở app cùng lúc đều đọc
 * con trỏ cũ trước khi bên nào kịp ghi con trỏ mới. Chốt chặn thật nằm ở partial
 * unique index (to_account_id, occurred_on) — `insertCardAutopay` trả false khi trùng.
 */
export async function runCardAutopayCatchUp(
  repo: CardAutopayRepo,
  todayISO: string,
): Promise<number> {
  const accounts = await repo.getAccounts()
  const byId = new Map(accounts.map((a) => [a.id, a]))
  let created = 0

  for (const card of accounts) {
    if (card.type !== 'card' || card.is_archived) continue
    if (!card.payment_account_id || card.statement_day == null || card.payment_due_day == null)
      continue
    const source = byId.get(card.payment_account_id)
    if (!source || source.is_archived) continue

    const through = card.card_autopay_through ?? todayISO
    const dues = dueDatesToGenerate(card.payment_due_day, through, todayISO)

    let cursor = through
    for (const due of dues) {
      const closeISO = statementCloseFor(due, card.statement_day)
      const bal = await cardBalanceThrough(repo, card, closeISO)
      const owed = bal < 0 ? -bal : 0
      if (owed > 0) {
        const ok = await repo.insertCardAutopay({
          type: 'transfer',
          amount: owed,
          to_amount: null, // nguồn cùng currency với thẻ → không cần to_amount
          category_id: null,
          account_id: source.id,
          to_account_id: card.id,
          occurred_on: due,
          note: AUTOPAY_NOTE,
        })
        if (ok) created++
      }
      cursor = due
    }

    if (cursor !== card.card_autopay_through) {
      await repo.updateAccount(card.id, { card_autopay_through: cursor })
    }
  }

  return created
}
