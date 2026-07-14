import { describe, expect, it } from 'vitest'
import type { CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { BudgetRow, TransactionRow } from '../../types/database.types'
import { buildBudgetReport } from './progress'

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
      { categoryId: 'trans', budgeted: 5_000, spent: 6_000, ratio: 1.2, status: 'over' },
      { categoryId: 'food', budgeted: 10_000, spent: 8_000, ratio: 0.8, status: 'warn' },
    ])
    expect(r.totalBudgeted).toBe(15_000)
    expect(r.totalSpent).toBe(14_000)
    expect(r.totalStatus).toBe('ok') // 14000/15000 = 0.933 < 1
    expect(r.overCount).toBe(1)
    expect(r.hasMissingRate).toBe(false)
  })

  it('danh mục có hạn mức nhưng chưa chi → spent 0, status ok', () => {
    const r = buildBudgetReport([budget('food', 10_000)], [], currencyOf, 'JPY', RATES)
    expect(r.lines).toEqual([
      { categoryId: 'food', budgeted: 10_000, spent: 0, ratio: 0, status: 'ok' },
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
