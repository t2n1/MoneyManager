import { describe, expect, it } from 'vitest'
import { expenseMedian, expenseMedianForCurrency, isUnusuallyLarge } from './anomaly'
import type { CurrencyCode } from '../../lib/money'
import type { TransactionRow } from '../../types/database.types'

function tx(amount: number, occurred_on = '2026-07-01', account_id = 'a'): TransactionRow {
  return {
    id: String(Math.random()),
    user_id: 'u',
    type: 'expense',
    amount,
    to_amount: null,
    category_id: 'c',
    account_id,
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

describe('expenseMedianForCurrency', () => {
  // currencyOf giả lập: 'jpy-acc' -> JPY, 'vnd-acc' -> VND, id khác -> undefined
  // (chưa tra được loại tiền).
  const currencyOf = (id: string): CurrencyCode | undefined => {
    if (id === 'jpy-acc') return 'JPY'
    if (id === 'vnd-acc') return 'VND'
    return undefined
  }

  it('trung vị JPY không bị kéo lệch bởi VND dù VND nhiều và lớn hơn hẳn (đúng con lỗi cũ)', () => {
    // VND đông hơn (30 dòng) và số tiền lớn hơn hẳn (500.000) — nếu KHÔNG lọc
    // theo loại tiền, trung vị gộp sẽ rơi vào mức Đồng, làm ngưỡng vô nghĩa
    // với sao kê Nhật. Test này phải FAIL nếu ai đó bỏ bộ lọc currency đi.
    const jpyTxs = Array.from({ length: 20 }, () => tx(3_000, '2026-07-01', 'jpy-acc'))
    const vndTxs = Array.from({ length: 30 }, () => tx(500_000, '2026-07-01', 'vnd-acc'))
    const median = expenseMedianForCurrency([...jpyTxs, ...vndTxs], currencyOf, 'JPY', '2026-05-01')
    expect(median).toBe(3_000)
  })

  it('tài khoản không tra được loại tiền thì bị loại khỏi mẫu, không tính nhầm vào loại tiền nào', () => {
    const jpyTxs = Array.from({ length: 20 }, () => tx(3_000, '2026-07-01', 'jpy-acc'))
    const unknownTxs = Array.from({ length: 30 }, () => tx(999_999, '2026-07-01', 'unknown-acc'))
    const median = expenseMedianForCurrency(
      [...jpyTxs, ...unknownTxs],
      currencyOf,
      'JPY',
      '2026-05-01',
    )
    expect(median).toBe(3_000)
  })

  it('đủ 20 giao dịch tổng nhưng chưa đủ 20 giao dịch ĐÚNG loại tiền thì vẫn trả null', () => {
    const jpyTxs = Array.from({ length: 15 }, () => tx(3_000, '2026-07-01', 'jpy-acc'))
    const vndTxs = Array.from({ length: 30 }, () => tx(500_000, '2026-07-01', 'vnd-acc'))
    const median = expenseMedianForCurrency([...jpyTxs, ...vndTxs], currencyOf, 'JPY', '2026-05-01')
    expect(median).toBeNull()
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
