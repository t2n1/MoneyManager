import { describe, expect, it } from 'vitest'
import type { TransactionRow } from '../../types/database.types'
import { completedMonthKeys, detectRaise, lifestyleDrift } from './drift'

const TODAY = '2026-09-06'
const BASE = 'JPY' as const
const currencyOf = () => BASE
const rates = { VND: 163 }

let seq = 0
function tx(p: Partial<TransactionRow>): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    type: 'expense',
    amount: 0,
    to_amount: null,
    category_id: null,
    account_id: 'a',
    to_account_id: null,
    recurring_rule_id: null,
    occurred_on: '2026-01-15',
    note: '',
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    is_remittance: false,
    remit_service: null,
    remit_fee_jpy: null,
    remit_received_vnd: null,
    remit_recipient_id: null,
    is_debt_flow: false,
    exclude_from_stats: false,
    stock_trade_id: null,
    is_refund: false,
    ...p,
  } as TransactionRow
}

/** Mỗi tháng trong dãy key một khoản thu + một khoản chi cố định. */
function monthly(
  keys: { year: number; month: number }[],
  income: number,
  expense: number,
  over: Partial<TransactionRow> = {},
): TransactionRow[] {
  return keys.flatMap((k) => {
    const mm = String(k.month).padStart(2, '0')
    return [
      tx({ type: 'income', amount: income, occurred_on: `${k.year}-${mm}-25`, ...over }),
      tx({ type: 'expense', amount: expense, occurred_on: `${k.year}-${mm}-10` }),
    ]
  })
}

const keys12 = completedMonthKeys(TODAY, 1, 12) // 2026-08 → 2025-09
const recent6 = keys12.slice(0, 6)
const prior6 = keys12.slice(6)

describe('lifestyleDrift', () => {
  it('thu +10% mà chi +20% → chi đang dâng theo thu', () => {
    const txs = [
      ...monthly(prior6, 300_000, 200_000),
      ...monthly(recent6, 330_000, 240_000),
    ]
    const d = lifestyleDrift({ txs, currencyOf, base: BASE, rates, todayISO: TODAY, monthStartDay: 1 })!
    expect(d.incomePct).toBeCloseTo(10, 5)
    expect(d.expensePct).toBeCloseTo(20, 5)
    expect(d.verdict).toBe('chi-dang-theo-thu')
  })

  it('thu và chi cùng nhịp → im lặng', () => {
    const txs = [
      ...monthly(prior6, 300_000, 200_000),
      ...monthly(recent6, 315_000, 210_000),
    ]
    const d = lifestyleDrift({ txs, currencyOf, base: BASE, rates, todayISO: TODAY, monthStartDay: 1 })!
    expect(d.verdict).toBeNull()
  })

  it('thu GIẢM nhẹ (luật "chi dâng theo thu" không áp) nhưng tỷ lệ để dành tụt ≥5 điểm → kêu', () => {
    // Thu −5%, chi +20%: để dành 33% → 15,8%, tụt ~17,5 điểm.
    const txs = [
      ...monthly(prior6, 300_000, 200_000),
      ...monthly(recent6, 285_000, 240_000),
    ]
    const d = lifestyleDrift({ txs, currencyOf, base: BASE, rates, todayISO: TODAY, monthStartDay: 1 })!
    expect(d.verdict).toBe('ty-le-de-danh-tut')
  })

  it('sổ chưa đủ 12 tháng → null, không bịa phần trăm', () => {
    const txs = monthly(recent6, 300_000, 200_000)
    expect(
      lifestyleDrift({ txs, currencyOf, base: BASE, rates, todayISO: TODAY, monthStartDay: 1 }),
    ).toBeNull()
  })

  it('khoản thiếu tỷ giá bị loại và bật cờ approx', () => {
    const txs = [
      ...monthly(prior6, 300_000, 200_000),
      ...monthly(recent6, 300_000, 200_000),
      tx({ type: 'expense', amount: 999, occurred_on: '2026-08-10', account_id: 'usd' }),
    ]
    const d = lifestyleDrift({
      txs,
      currencyOf: (id) => (id === 'usd' ? 'USD' : BASE),
      base: BASE,
      rates, // không có USD
      todayISO: TODAY,
      monthStartDay: 1,
    })!
    expect(d.approx).toBe(true)
    expect(d.expensePct).toBeCloseTo(0, 5)
  })
})

describe('detectRaise', () => {
  const luong = (
    keys: { year: number; month: number }[],
    amount: number,
  ): TransactionRow[] =>
    keys.map((k) =>
      tx({
        type: 'income',
        amount,
        recurring_rule_id: 'rule-luong',
        occurred_on: `${k.year}-${String(k.month).padStart(2, '0')}-25`,
      }),
    )

  it('lương nhảy +7% và đứng vững 2 tháng gần nhất → báo, kèm tháng bắt đầu', () => {
    const keys9 = completedMonthKeys(TODAY, 1, 9)
    const txs = [...luong(keys9.slice(2), 300_000), ...luong(keys9.slice(0, 2), 321_000)]
    const r = detectRaise({ txs, currencyOf, base: BASE, rates, todayISO: TODAY, monthStartDay: 1 })!
    expect(r.pct).toBeCloseTo(7, 5)
    expect(r.monthsAgo).toBe(2)
    expect(r.fromKey).toEqual({ year: 2026, month: 7 })
  })

  it('lương đi ngang → null; thu KHÔNG định kỳ tăng cũng không tính', () => {
    const keys9 = completedMonthKeys(TODAY, 1, 9)
    const txs = [
      ...luong(keys9, 300_000),
      tx({ type: 'income', amount: 500_000, occurred_on: '2026-08-05' }), // thưởng một lần
    ]
    expect(
      detectRaise({ txs, currencyOf, base: BASE, rates, todayISO: TODAY, monthStartDay: 1 }),
    ).toBeNull()
  })

  it('tăng đã lâu (mọi tháng nền đều ở mức mới) → null, hết cửa sổ nhắc', () => {
    const keys9 = completedMonthKeys(TODAY, 1, 9)
    const txs = luong(keys9, 321_000)
    expect(
      detectRaise({ txs, currencyOf, base: BASE, rates, todayISO: TODAY, monthStartDay: 1 }),
    ).toBeNull()
  })
})
