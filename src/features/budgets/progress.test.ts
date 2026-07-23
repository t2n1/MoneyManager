import { describe, expect, it } from 'vitest'
import type { CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { BudgetRow, TransactionRow } from '../../types/database.types'
import { buildBudgetReport, carryFromPreviousMonth } from './progress'

// base = JPY: 1 ¥ = 165 ₫
const RATES: Rates = { JPY: 1, VND: 165, USD: 0.0065 }
const currencyOf = (id: string): CurrencyCode => (id === 'vnd' ? 'VND' : 'JPY')

let seq = 0
function tx(
  p: Partial<TransactionRow> & Pick<TransactionRow, 'type' | 'amount'>,
): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    category_id: null,
    account_id: 'jpy',
    to_account_id: null,
    to_amount: null,
    recurring_rule_id: null,
    occurred_on: '2026-07-10',
    note: '',
    created_at: '',
    updated_at: '',
    ...p,
  }
}
function budget(category_id: string, amount: number): BudgetRow {
  return {
    id: `b-${category_id}`,
    user_id: 'u',
    category_id,
    month_key: '2026-07',
    amount,
    created_at: '',
    updated_at: '',
  }
}

describe('buildBudgetReport (base = JPY)', () => {
  it('tính spent theo danh mục, ratio, status; sắp theo ratio giảm dần', () => {
    const budgets = [budget('food', 10_000), budget('trans', 5_000)]
    const txs = [
      tx({ type: 'expense', amount: 8_000, category_id: 'food' }), // 80% → warn
      tx({ type: 'expense', amount: 6_000, category_id: 'trans' }), // 120% → over
      tx({ type: 'income', amount: 99_999, category_id: 'salary' }), // bỏ qua (income)
      tx({ type: 'transfer', amount: 1_000, to_account_id: 'vnd' }), // bỏ qua
    ]
    const r = buildBudgetReport(budgets, txs, currencyOf, 'JPY', RATES)
    expect(r.lines).toEqual([
      { categoryId: 'trans', budgeted: 5_000, carried: 0, spent: 6_000, ratio: 1.2, status: 'over' },
      { categoryId: 'food', budgeted: 10_000, carried: 0, spent: 8_000, ratio: 0.8, status: 'warn' },
    ])
    expect(r.totalBudgeted).toBe(15_000)
    expect(r.totalSpent).toBe(14_000)
    expect(r.totalStatus).toBe('warn') // 14000/15000 = 0.933 → ≥80% = warn
    expect(r.overCount).toBe(1)
    expect(r.hasMissingRate).toBe(false)
  })

  it('danh mục có hạn mức nhưng chưa chi → spent 0, status ok', () => {
    const r = buildBudgetReport([budget('food', 10_000)], [], currencyOf, 'JPY', RATES)
    expect(r.lines).toEqual([
      { categoryId: 'food', budgeted: 10_000, carried: 0, spent: 0, ratio: 0, status: 'ok' },
    ])
    expect(r.overCount).toBe(0)
  })

  it('quy đổi chi ngoại tệ về base', () => {
    // 1.650.000 ₫ ÷ 165 = ¥10.000
    const txs = [tx({ type: 'expense', amount: 1_650_000, category_id: 'shop', account_id: 'vnd' })]
    const r = buildBudgetReport([budget('shop', 20_000)], txs, currencyOf, 'JPY', RATES)
    expect(r.lines[0].spent).toBe(10_000)
    expect(r.lines[0].status).toBe('ok') // 50%
  })

  it('thiếu tỷ giá → bỏ giao dịch, bật hasMissingRate', () => {
    const txs = [tx({ type: 'expense', amount: 1_650_000, category_id: 'shop', account_id: 'vnd' })]
    const r = buildBudgetReport([budget('shop', 20_000)], txs, currencyOf, 'JPY', { JPY: 1 })
    expect(r.lines[0].spent).toBe(0)
    expect(r.hasMissingRate).toBe(true)
  })

  it('mô hình 1 cấp: mỗi danh mục con có hạn mức riêng, không gộp lên mẹ', () => {
    // Cây: food (mẹ) → restaurant, grocery (con). Đặt hạn mức ở từng con.
    const txs = [
      tx({ type: 'expense', amount: 4_000, category_id: 'restaurant' }), // 80% → warn
      tx({ type: 'expense', amount: 3_000, category_id: 'grocery' }), // 30% → ok
    ]
    const r = buildBudgetReport(
      [budget('restaurant', 5_000), budget('grocery', 10_000)],
      txs,
      currencyOf,
      'JPY',
      RATES,
    )
    const restaurant = r.lines.find((l) => l.categoryId === 'restaurant')!
    const grocery = r.lines.find((l) => l.categoryId === 'grocery')!
    expect(restaurant).toMatchObject({ budgeted: 5_000, spent: 4_000, ratio: 0.8, status: 'warn' })
    expect(grocery).toMatchObject({ budgeted: 10_000, spent: 3_000, status: 'ok' })
    expect(r.totalBudgeted).toBe(15_000)
    expect(r.totalSpent).toBe(7_000)
  })

  it('mô hình 1 cấp: bỏ qua hạn mức lỡ đặt ở danh mục mẹ', () => {
    // 'food' là mẹ (có con) → hạn mức của nó không thành dòng, không tính vào tổng.
    const isParent = (id: string) => id === 'food'
    const txs = [
      tx({ type: 'expense', amount: 4_000, category_id: 'restaurant' }),
      tx({ type: 'expense', amount: 1_000, category_id: 'food' }), // chi thẳng trên mẹ
    ]
    const r = buildBudgetReport(
      [budget('food', 10_000), budget('restaurant', 5_000)],
      txs,
      currencyOf,
      'JPY',
      RATES,
      isParent,
    )
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0]).toMatchObject({ categoryId: 'restaurant', budgeted: 5_000, spent: 4_000 })
    expect(r.totalBudgeted).toBe(5_000)
    // Chi 1.000 thẳng trên mẹ không thuộc hạn mức nào nên không vào tổng chi.
    expect(r.totalSpent).toBe(4_000)
  })

  it('dồn hạn mức (AH): cộng phần chưa tiêu vào budgeted, chỉ khi rollover bật', () => {
    const withRollover: BudgetRow = { ...budget('food', 10_000), rollover: true }
    const carry = new Map([['food', 3_000]]) // tháng trước dư 3.000
    const txs = [tx({ type: 'expense', amount: 10_000, category_id: 'food' })]
    const r = buildBudgetReport([withRollover], txs, currencyOf, 'JPY', RATES, undefined, carry)
    expect(r.lines[0]).toMatchObject({ budgeted: 13_000, carried: 3_000, status: 'ok' }) // 10000/13000 = 0.77
    // Không bật rollover → không cộng → 10000/10000 = 100% over
    const r2 = buildBudgetReport([budget('food', 10_000)], txs, currencyOf, 'JPY', RATES, undefined, carry)
    expect(r2.lines[0]).toMatchObject({ budgeted: 10_000, carried: 0, status: 'over' })
  })

  it('carryFromPreviousMonth = max(0, hạn mức − đã chi)', () => {
    const prevBudgets = [budget('food', 10_000), budget('trans', 5_000)]
    const prevTxs = [
      tx({ type: 'expense', amount: 4_000, category_id: 'food' }), // dư 6.000
      tx({ type: 'expense', amount: 7_000, category_id: 'trans' }), // vượt → 0
    ]
    const carry = carryFromPreviousMonth(prevBudgets, prevTxs, currencyOf, 'JPY', RATES)
    expect(carry.get('food')).toBe(6_000)
    expect(carry.get('trans')).toBe(0)
  })

  it('warnCount đếm danh mục ≥80% & <100%', () => {
    const r = buildBudgetReport(
      [budget('a', 100), budget('b', 100), budget('c', 100)],
      [
        tx({ type: 'expense', amount: 85, category_id: 'a' }), // warn
        tx({ type: 'expense', amount: 90, category_id: 'b' }), // warn
        tx({ type: 'expense', amount: 120, category_id: 'c' }), // over
      ],
      currencyOf,
      'JPY',
      RATES,
    )
    expect(r.warnCount).toBe(2)
    expect(r.overCount).toBe(1)
  })

  it('biên 100% là over, 99% là warn', () => {
    const r1 = buildBudgetReport(
      [budget('a', 100)],
      [tx({ type: 'expense', amount: 100, category_id: 'a' })],
      currencyOf,
      'JPY',
      RATES,
    )
    expect(r1.lines[0].status).toBe('over')
    const r2 = buildBudgetReport(
      [budget('a', 100)],
      [tx({ type: 'expense', amount: 99, category_id: 'a' })],
      currencyOf,
      'JPY',
      RATES,
    )
    expect(r2.lines[0].status).toBe('warn')
  })
})
