import { describe, expect, it } from 'vitest'
import type { CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'
import { categoryBreakdown, categoryComparison, monthlySeries, sumIncomeExpense } from './aggregate'

// base = JPY: 1 ¥ = 165 ₫ = 0.0065 $
const RATES: Rates = { JPY: 1, VND: 165, USD: 0.0065 }

// account 'jpy' dùng JPY, 'vnd' dùng VND
const currencyOf = (id: string): CurrencyCode => (id === 'vnd' ? 'VND' : 'JPY')

let seq = 0
function tx(p: Partial<TransactionRow> & Pick<TransactionRow, 'type' | 'amount'>): TransactionRow {
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

describe('categoryBreakdown (base = JPY)', () => {
  it('gộp theo danh mục, quy đổi base, sắp xếp giảm dần', () => {
    const txs = [
      tx({ type: 'expense', amount: 850, category_id: 'food' }),
      tx({ type: 'expense', amount: 3_280, category_id: 'food' }),
      tx({ type: 'expense', amount: 1_650_000, category_id: 'shop', account_id: 'vnd' }), // → ¥10.000
      tx({ type: 'income', amount: 280_000, category_id: 'salary', account_id: 'jpy' }), // bỏ qua
      tx({ type: 'transfer', amount: 5_000, to_account_id: 'vnd' }), // bỏ qua
    ]
    const r = categoryBreakdown(txs, 'expense', currencyOf, 'JPY', RATES)
    expect(r.slices).toEqual([
      { categoryId: 'shop', amount: 10_000 },
      { categoryId: 'food', amount: 4_130 },
    ])
    expect(r.total).toBe(14_130)
    expect(r.hasForeign).toBe(true)
    expect(r.hasMissingRate).toBe(false)
  })

  it('thiếu tỷ giá → đánh dấu hasMissingRate, bỏ giao dịch đó', () => {
    const txs = [
      tx({ type: 'expense', amount: 850, category_id: 'food' }),
      tx({ type: 'expense', amount: 1_650_000, category_id: 'shop', account_id: 'vnd' }),
    ]
    const r = categoryBreakdown(txs, 'expense', currencyOf, 'JPY', { JPY: 1 })
    expect(r.slices).toEqual([{ categoryId: 'food', amount: 850 }])
    expect(r.total).toBe(850)
    expect(r.hasMissingRate).toBe(true)
  })
})

describe('monthlySeries (base = JPY)', () => {
  it('gom thu/chi theo từng tháng, chuyển khoản không tính', () => {
    const months = [
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ]
    const txs = [
      tx({ type: 'income', amount: 280_000, occurred_on: '2026-06-25' }),
      tx({ type: 'expense', amount: 6_700, occurred_on: '2026-06-28' }),
      tx({ type: 'expense', amount: 850, occurred_on: '2026-07-10' }),
      tx({ type: 'expense', amount: 1_650_000, occurred_on: '2026-07-11', account_id: 'vnd' }), // ¥10.000
      tx({ type: 'transfer', amount: 30_000, occurred_on: '2026-07-05', to_account_id: 'vnd' }), // bỏ qua
    ]
    const r = monthlySeries(txs, months, 1, currencyOf, 'JPY', RATES)
    expect(r.points).toEqual([
      { key: { year: 2026, month: 6 }, income: 280_000, expense: 6_700 },
      { key: { year: 2026, month: 7 }, income: 0, expense: 10_850 },
    ])
    expect(r.hasMissingRate).toBe(false)
  })

  it('month_start_day dời ngày sang tháng trước', () => {
    const months = [
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ]
    // month_start_day = 25 → ngày 2026-07-10 (< 25) thuộc "tháng 6"
    const txs = [tx({ type: 'expense', amount: 500, occurred_on: '2026-07-10' })]
    const r = monthlySeries(txs, months, 25, currencyOf, 'JPY', RATES)
    expect(r.points).toEqual([
      { key: { year: 2026, month: 6 }, income: 0, expense: 500 },
      { key: { year: 2026, month: 7 }, income: 0, expense: 0 },
    ])
  })
})

describe('sumIncomeExpense (base = JPY)', () => {
  it('cộng thu/chi quy đổi base, bỏ qua chuyển khoản', () => {
    const txs = [
      tx({ type: 'income', amount: 280_000 }),
      tx({ type: 'expense', amount: 850 }),
      tx({ type: 'expense', amount: 1_650_000, account_id: 'vnd' }), // → ¥10.000
      tx({ type: 'transfer', amount: 30_000, to_account_id: 'vnd' }), // bỏ qua
    ]
    const r = sumIncomeExpense(txs, currencyOf, 'JPY', RATES)
    expect(r.income).toBe(280_000)
    expect(r.expense).toBe(10_850)
    expect(r.hasForeign).toBe(true)
    expect(r.hasMissingRate).toBe(false)
  })

  it('thiếu tỷ giá → bỏ giao dịch đó, đánh dấu hasMissingRate', () => {
    const txs = [
      tx({ type: 'expense', amount: 850 }),
      tx({ type: 'expense', amount: 1_650_000, account_id: 'vnd' }),
    ]
    const r = sumIncomeExpense(txs, currencyOf, 'JPY', { JPY: 1 })
    expect(r.expense).toBe(850)
    expect(r.income).toBe(0)
    expect(r.hasMissingRate).toBe(true)
  })

  it('cùng tiền gốc thì không đánh dấu ngoại tệ', () => {
    const txs = [tx({ type: 'income', amount: 100 }), tx({ type: 'expense', amount: 40 })]
    const r = sumIncomeExpense(txs, currencyOf, 'JPY', RATES)
    expect(r).toEqual({ income: 100, expense: 40, hasForeign: false, hasMissingRate: false })
  })
})

describe('categoryComparison (base = JPY)', () => {
  const active = { year: 2026, month: 7 }
  it('gom theo tháng/danh mục, avg3 chia 3 kể cả tháng thiếu, delta đúng dấu', () => {
    const txs = [
      tx({ type: 'expense', amount: 1200, category_id: 'food', occurred_on: '2026-07-05' }),
      tx({ type: 'expense', amount: 1000, category_id: 'food', occurred_on: '2026-06-05' }),
      tx({ type: 'expense', amount: 800, category_id: 'food', occurred_on: '2026-05-05' }),
      tx({ type: 'income', amount: 999, category_id: 'x', occurred_on: '2026-07-05' }), // bỏ (income)
    ]
    const r = categoryComparison(txs, active, 1, currencyOf, 'JPY', RATES)
    // avg3 = (T6 1000 + T5 800 + T4 0) / 3 = 600 ; delta = (1200-1000)/1000 = 20%
    expect(r.rows).toEqual([
      { categoryId: 'food', thisMonth: 1200, prevMonth: 1000, avg3: 600, deltaPct: 20, isNew: false },
    ])
    expect(r.hasMissingRate).toBe(false)
  })
  it('danh mục mới (tháng trước = 0) → isNew, deltaPct null', () => {
    const txs = [tx({ type: 'expense', amount: 500, category_id: 'new', occurred_on: '2026-07-05' })]
    const r = categoryComparison(txs, active, 1, currencyOf, 'JPY', RATES)
    expect(r.rows[0]).toMatchObject({ categoryId: 'new', prevMonth: 0, deltaPct: null, isNew: true })
  })
  it('sắp theo thisMonth giảm dần', () => {
    const txs = [
      tx({ type: 'expense', amount: 300, category_id: 'a', occurred_on: '2026-07-05' }),
      tx({ type: 'expense', amount: 900, category_id: 'b', occurred_on: '2026-07-05' }),
    ]
    const r = categoryComparison(txs, active, 1, currencyOf, 'JPY', RATES)
    expect(r.rows.map((x) => x.categoryId)).toEqual(['b', 'a'])
  })
  it('thiếu tỷ giá → cờ hasMissingRate', () => {
    const txs = [tx({ type: 'expense', amount: 1_650_000, category_id: 'x', occurred_on: '2026-07-05', account_id: 'vnd' })]
    const r = categoryComparison(txs, active, 1, currencyOf, 'JPY', { JPY: 1 })
    expect(r.hasMissingRate).toBe(true)
  })
})
