import { describe, expect, it } from 'vitest'
import { detectRecurring, ruleKey } from './recurringRadar'
import type { TransactionRow } from '../types/database.types'

let seq = 0
function tx(p: Partial<TransactionRow> & Pick<TransactionRow, 'occurred_on'>): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    type: 'expense',
    amount: 9_800,
    to_amount: null,
    category_id: 'rent',
    account_id: 'bank',
    to_account_id: null,
    recurring_rule_id: null,
    note: 'Tiền nhà',
    created_at: '',
    updated_at: '',
    ...p,
  }
}

const today = '2026-07-20'

describe('detectRecurring', () => {
  it('phát hiện khoản lặp hàng tháng', () => {
    const txs = [
      tx({ occurred_on: '2026-05-01' }),
      tx({ occurred_on: '2026-06-01' }),
      tx({ occurred_on: '2026-07-01' }),
    ]
    const s = detectRecurring(txs, new Set(), today)
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ frequency: 'monthly', occurrences: 3, amount: 9_800, note: 'Tiền nhà' })
  })

  it('bỏ qua nếu đã có quy tắc', () => {
    const txs = [
      tx({ occurred_on: '2026-05-01' }),
      tx({ occurred_on: '2026-06-01' }),
      tx({ occurred_on: '2026-07-01' }),
    ]
    const existing = new Set([ruleKey('expense', 'bank', 'rent', 9_800)])
    expect(detectRecurring(txs, existing, today)).toHaveLength(0)
  })

  it('bỏ qua khoản đã cũ (không còn sống)', () => {
    const txs = [
      tx({ occurred_on: '2026-01-01' }),
      tx({ occurred_on: '2026-02-01' }),
      tx({ occurred_on: '2026-03-01' }),
    ]
    expect(detectRecurring(txs, new Set(), today)).toHaveLength(0)
  })

  it('bỏ qua nếu < 3 lần hoặc khoảng cách không đều', () => {
    expect(detectRecurring([tx({ occurred_on: '2026-06-01' }), tx({ occurred_on: '2026-07-01' })], new Set(), today)).toHaveLength(0)
    const irregular = [
      tx({ occurred_on: '2026-07-01' }),
      tx({ occurred_on: '2026-07-03' }),
      tx({ occurred_on: '2026-07-19' }),
    ]
    expect(detectRecurring(irregular, new Set(), today)).toHaveLength(0)
  })

  it('phát hiện hàng tuần', () => {
    const txs = [
      tx({ occurred_on: '2026-07-01', amount: 500, category_id: 'coffee', note: 'Cà phê' }),
      tx({ occurred_on: '2026-07-08', amount: 500, category_id: 'coffee', note: 'Cà phê' }),
      tx({ occurred_on: '2026-07-15', amount: 500, category_id: 'coffee', note: 'Cà phê' }),
    ]
    const s = detectRecurring(txs, new Set(), today)
    expect(s[0]?.frequency).toBe('weekly')
  })

  it('bỏ qua dòng nợ/loại trừ thống kê', () => {
    const txs = [
      tx({ occurred_on: '2026-05-01', is_debt_flow: true }),
      tx({ occurred_on: '2026-06-01', is_debt_flow: true }),
      tx({ occurred_on: '2026-07-01', is_debt_flow: true }),
    ]
    expect(detectRecurring(txs, new Set(), today)).toHaveLength(0)
  })
})
