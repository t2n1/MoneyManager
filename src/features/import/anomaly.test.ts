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

  it('bỏ giao dịch nợ/cho vay, loại khỏi thống kê, và hoàn tiền khỏi trung vị', () => {
    // 20 dòng chi bình thường (100…2.000) — trung vị đúng của riêng 20 dòng
    // này là 1.050 (trung bình cộng của dòng thứ 10 và 11: 1.000 và 1.100).
    const normal = Array.from({ length: 20 }, (_, i) => tx((i + 1) * 100))
    // 3 dòng bị gắn cờ, số tiền cố tình rất lớn (500.000) để nếu lọt vào mẫu
    // thì trung vị chắc chắn nhảy sang giá trị khác — hàm phải loại cả ba.
    const debt = { ...tx(500_000), is_debt_flow: true }
    const excluded = { ...tx(500_000), exclude_from_stats: true }
    const refund = { ...tx(500_000), is_refund: true }
    // Có lọc (đúng): trung vị = 1.050 (chỉ tính 20 dòng bình thường).
    // Không lọc (sai): 23 dòng, trung vị = dòng thứ 12 sau khi sắp xếp = 1.200.
    expect(expenseMedian([...normal, debt, excluded, refund], '2026-05-01')).toBe(1_050)
  })
})

describe('expenseMedianForCurrency', () => {
  // currencyOf giả lập: 'jpy-acc' và 'jpy-acc-2' -> JPY (hai thẻ Yên khác
  // nhau, CÙNG loại tiền), 'vnd-acc' -> VND, id khác -> undefined (chưa tra
  // được loại tiền). Cố tình chia dòng JPY ra hai tài khoản: hàm phải lọc
  // theo LOẠI TIỀN chứ không phải theo từng account_id — nếu ai đó viết
  // nhầm thành lọc theo account_id, mỗi tài khoản chỉ còn 10 dòng (dưới
  // ngưỡng 20), test bên dưới sẽ rớt.
  const currencyOf = (id: string): CurrencyCode | undefined => {
    if (id === 'jpy-acc' || id === 'jpy-acc-2') return 'JPY'
    if (id === 'vnd-acc') return 'VND'
    return undefined
  }

  it('trung vị JPY không bị kéo lệch bởi VND dù VND nhiều và lớn hơn hẳn (đúng con lỗi cũ)', () => {
    // VND đông hơn (30 dòng) và số tiền lớn hơn hẳn (500.000) — nếu KHÔNG lọc
    // theo loại tiền, trung vị gộp sẽ rơi vào mức Đồng, làm ngưỡng vô nghĩa
    // với sao kê Nhật. Test này phải FAIL nếu ai đó bỏ bộ lọc currency đi.
    const jpyTxs = [
      ...Array.from({ length: 10 }, () => tx(3_000, '2026-07-01', 'jpy-acc')),
      ...Array.from({ length: 10 }, () => tx(3_000, '2026-07-01', 'jpy-acc-2')),
    ]
    const vndTxs = Array.from({ length: 30 }, () => tx(500_000, '2026-07-01', 'vnd-acc'))
    const median = expenseMedianForCurrency([...jpyTxs, ...vndTxs], currencyOf, 'JPY', '2026-05-01')
    expect(median).toBe(3_000)
  })

  it('tài khoản không tra được loại tiền thì bị loại khỏi mẫu, không tính nhầm vào loại tiền nào', () => {
    const jpyTxs = [
      ...Array.from({ length: 10 }, () => tx(3_000, '2026-07-01', 'jpy-acc')),
      ...Array.from({ length: 10 }, () => tx(3_000, '2026-07-01', 'jpy-acc-2')),
    ]
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
    const jpyTxs = [
      ...Array.from({ length: 8 }, () => tx(3_000, '2026-07-01', 'jpy-acc')),
      ...Array.from({ length: 7 }, () => tx(3_000, '2026-07-01', 'jpy-acc-2')),
    ]
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
