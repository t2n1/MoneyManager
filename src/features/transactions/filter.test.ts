import { describe, expect, it } from 'vitest'
import type { TransactionRow } from '../../types/database.types'
import { filterTransactions, matchesFilter, normalizeText } from './filter'

let seq = 0
function tx(p: Partial<TransactionRow> & Pick<TransactionRow, 'type'>): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    amount: 1000,
    to_amount: null,
    category_id: null,
    account_id: 'a1',
    to_account_id: null,
    recurring_rule_id: null,
    occurred_on: '2026-07-10',
    note: '',
    created_at: '',
    updated_at: '',
    ...p,
  }
}

const RANGE = { start: '2026-01-01', end: '2027-01-01' }

describe('normalizeText', () => {
  it('bỏ dấu, đ→d, viết thường', () => {
    expect(normalizeText('Ăn Uống')).toBe('an uong')
    expect(normalizeText('Đầu tư')).toBe('dau tu')
  })
})

describe('matchesFilter', () => {
  it('tìm text không phân biệt dấu', () => {
    const t = tx({ type: 'expense', note: 'Cơm trưa văn phòng' })
    expect(matchesFilter(t, { ...RANGE, text: 'com trua' })).toBe(true)
    expect(matchesFilter(t, { ...RANGE, text: 'tối' })).toBe(false)
  })

  it('lọc theo loại, danh mục, tài khoản (kể cả to_account_id)', () => {
    const t = tx({ type: 'transfer', account_id: 'a1', to_account_id: 'a2' })
    expect(matchesFilter(t, { ...RANGE, types: ['expense'] })).toBe(false)
    expect(matchesFilter(t, { ...RANGE, types: ['transfer'] })).toBe(true)
    expect(matchesFilter(t, { ...RANGE, accountIds: ['a2'] })).toBe(true)
    expect(matchesFilter(t, { ...RANGE, accountIds: ['a3'] })).toBe(false)
    const e = tx({ type: 'expense', category_id: 'food' })
    expect(matchesFilter(e, { ...RANGE, categoryIds: ['food'] })).toBe(true)
    expect(matchesFilter(e, { ...RANGE, categoryIds: ['shop'] })).toBe(false)
  })

  it('bộ lọc rỗng khớp tất cả', () => {
    expect(matchesFilter(tx({ type: 'income' }), RANGE)).toBe(true)
  })
})

describe('filterTransactions', () => {
  it('loại ngoài khoảng ngày, sắp xếp giảm dần', () => {
    const txs = [
      tx({ type: 'expense', occurred_on: '2026-07-01', note: 'a' }),
      tx({ type: 'expense', occurred_on: '2026-07-20', note: 'b' }),
      tx({ type: 'expense', occurred_on: '2025-12-31', note: 'ngoài' }),
    ]
    const r = filterTransactions(txs, { start: '2026-07-01', end: '2026-08-01' })
    expect(r.map((t) => t.note)).toEqual(['b', 'a'])
  })
})
