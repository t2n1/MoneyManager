import { describe, expect, it } from 'vitest'
import { expenseMedian, isUnusuallyLarge } from './anomaly'
import type { TransactionRow } from '../../types/database.types'

function tx(amount: number, occurred_on = '2026-07-01'): TransactionRow {
  return {
    id: String(Math.random()),
    user_id: 'u',
    type: 'expense',
    amount,
    to_amount: null,
    category_id: 'c',
    account_id: 'a',
    to_account_id: null,
    recurring_rule_id: null,
    occurred_on,
    note: '',
    created_at: '',
    updated_at: '',
  }
}

describe('expenseMedian', () => {
  it('chưa đủ 20 giao dịch thì trả null (thiếu dữ liệu thì im, không đoán)', () => {
    const txs = Array.from({ length: 19 }, () => tx(1_000))
    expect(expenseMedian(txs, '2026-05-01')).toBeNull()
  })

  it('đủ 20 giao dịch thì trả trung vị', () => {
    const txs = Array.from({ length: 20 }, (_, i) => tx((i + 1) * 100))
    expect(expenseMedian(txs, '2026-05-01')).toBe(1_050)
  })

  it('bỏ giao dịch cũ hơn mốc', () => {
    const old = Array.from({ length: 20 }, () => tx(999_999, '2026-01-01'))
    const recent = Array.from({ length: 20 }, () => tx(1_000, '2026-07-01'))
    expect(expenseMedian([...old, ...recent], '2026-05-01')).toBe(1_000)
  })

  it('bỏ giao dịch thu và chuyển khoản', () => {
    const txs = Array.from({ length: 20 }, () => tx(1_000))
    const income = { ...tx(500_000), type: 'income' as const }
    const transfer = { ...tx(500_000), type: 'transfer' as const }
    expect(expenseMedian([...txs, income, transfer], '2026-05-01')).toBe(1_000)
  })
})

describe('isUnusuallyLarge', () => {
  it('gấp hơn 3 lần trung vị thì tính là bất thường', () => {
    expect(isUnusuallyLarge(3_001, 1_000)).toBe(true)
  })

  it('đúng 3 lần thì chưa tính', () => {
    expect(isUnusuallyLarge(3_000, 1_000)).toBe(false)
  })

  it('không có trung vị thì không tô gì', () => {
    expect(isUnusuallyLarge(999_999, null)).toBe(false)
  })

  it('trung vị bằng 0 thì không tô gì (tránh chia cho số vô nghĩa)', () => {
    expect(isUnusuallyLarge(5_000, 0)).toBe(false)
  })
})
