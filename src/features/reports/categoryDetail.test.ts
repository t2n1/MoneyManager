import { describe, expect, it } from 'vitest'
import type { TransactionRow } from '../../types/database.types'
import { filterCategoryPeriodTxs } from './categoryDetail'

let seq = 0
function tx(p: Partial<TransactionRow> & Pick<TransactionRow, 'type' | 'amount'>): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    category_id: 'c1',
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

// Kỳ tháng 7/2026: [2026-07-01, 2026-08-01)
const START = '2026-07-01'
const END = '2026-08-01'

describe('filterCategoryPeriodTxs', () => {
  it('chỉ giữ đúng danh mục, đúng loại, trong kỳ', () => {
    const txs = [
      tx({ type: 'expense', amount: 100, category_id: 'c1', occurred_on: '2026-07-10' }),
      tx({ type: 'expense', amount: 200, category_id: 'c2', occurred_on: '2026-07-10' }), // khác danh mục
      tx({ type: 'income', amount: 300, category_id: 'c1', occurred_on: '2026-07-10' }), // khác loại
      tx({ type: 'expense', amount: 400, category_id: 'c1', occurred_on: '2026-06-30' }), // trước kỳ
      tx({ type: 'expense', amount: 500, category_id: 'c1', occurred_on: '2026-08-01' }), // đúng mốc loại trừ
    ]
    const out = filterCategoryPeriodTxs(txs, 'c1', 'expense', START, END)
    expect(out.map((t) => t.amount)).toEqual([100])
  })

  it('bỏ dòng tiền nợ/cho vay và loại-khỏi-thống-kê', () => {
    const txs = [
      tx({ type: 'expense', amount: 100, is_debt_flow: true }),
      tx({ type: 'expense', amount: 200, exclude_from_stats: true }),
      tx({ type: 'expense', amount: 300 }),
    ]
    const out = filterCategoryPeriodTxs(txs, 'c1', 'expense', START, END)
    expect(out.map((t) => t.amount)).toEqual([300])
  })

  it('giữ hoàn tiền (is_refund) vì vẫn là giao dịch của danh mục', () => {
    const txs = [tx({ type: 'expense', amount: 100, is_refund: true })]
    const out = filterCategoryPeriodTxs(txs, 'c1', 'expense', START, END)
    expect(out).toHaveLength(1)
  })

  it('sắp xếp mới nhất trước', () => {
    const txs = [
      tx({ type: 'expense', amount: 1, occurred_on: '2026-07-05' }),
      tx({ type: 'expense', amount: 2, occurred_on: '2026-07-20' }),
      tx({ type: 'expense', amount: 3, occurred_on: '2026-07-12' }),
    ]
    const out = filterCategoryPeriodTxs(txs, 'c1', 'expense', START, END)
    expect(out.map((t) => t.occurred_on)).toEqual(['2026-07-20', '2026-07-12', '2026-07-05'])
  })
})
