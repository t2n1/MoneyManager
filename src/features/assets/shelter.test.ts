import { describe, expect, it } from 'vitest'
import type { TransactionRow } from '../../types/database.types'
import { shelterUsage } from './shelter'

let seq = 0
function tx(
  p: Partial<TransactionRow> & Pick<TransactionRow, 'type' | 'amount' | 'occurred_on'>,
): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    to_amount: null,
    category_id: null,
    account_id: 'bank',
    to_account_id: null,
    recurring_rule_id: null,
    note: '',
    created_at: '',
    updated_at: '',
    ...p,
  }
}

const nisa = 'nisa-acc'

describe('shelterUsage', () => {
  it('cộng các lần chuyển vào tài khoản trong năm', () => {
    const r = shelterUsage(
      nisa,
      [
        tx({ type: 'transfer', amount: 100_000, occurred_on: '2026-01-10', to_account_id: nisa }),
        tx({ type: 'transfer', amount: 100_000, occurred_on: '2026-06-10', to_account_id: nisa }),
      ],
      2026,
      1_200_000,
    )
    expect(r.used).toBe(200_000)
    expect(r.remaining).toBe(1_000_000)
    expect(r.count).toBe(2)
    expect(r.ratio).toBeCloseTo(1 / 6)
  })

  it('bỏ giao dịch của năm khác và của tài khoản khác', () => {
    const r = shelterUsage(
      nisa,
      [
        tx({ type: 'transfer', amount: 999_000, occurred_on: '2025-12-31', to_account_id: nisa }),
        tx({ type: 'transfer', amount: 999_000, occurred_on: '2026-03-01', to_account_id: 'khac' }),
        tx({ type: 'transfer', amount: 50_000, occurred_on: '2026-03-02', to_account_id: nisa }),
      ],
      2026,
      1_200_000,
    )
    expect(r.used).toBe(50_000)
  })

  it('rút tiền ra KHÔNG hoàn lại hạn mức', () => {
    const r = shelterUsage(
      nisa,
      [
        tx({ type: 'transfer', amount: 300_000, occurred_on: '2026-02-01', to_account_id: nisa }),
        // bán ra, chuyển ngược về ngân hàng
        tx({ type: 'transfer', amount: 300_000, occurred_on: '2026-05-01', account_id: nisa, to_account_id: 'bank' }),
      ],
      2026,
      1_200_000,
    )
    expect(r.used).toBe(300_000)
  })

  it('chuyển xuyên tệ lấy số THỰC NHẬN ở tài khoản đích', () => {
    const r = shelterUsage(
      nisa,
      [
        tx({
          type: 'transfer',
          amount: 1_000_000,
          to_amount: 6_500,
          occurred_on: '2026-02-01',
          to_account_id: nisa,
        }),
      ],
      2026,
      null,
    )
    expect(r.used).toBe(6_500)
  })

  it('vượt hạn mức → còn lại 0, không âm', () => {
    const r = shelterUsage(
      nisa,
      [tx({ type: 'transfer', amount: 1_500_000, occurred_on: '2026-02-01', to_account_id: nisa })],
      2026,
      1_200_000,
    )
    expect(r.remaining).toBe(0)
    expect(r.ratio).toBeCloseTo(1.25)
  })

  it('chưa đặt hạn mức → chỉ báo số đã nạp', () => {
    const r = shelterUsage(
      nisa,
      [tx({ type: 'transfer', amount: 10_000, occurred_on: '2026-02-01', to_account_id: nisa })],
      2026,
      null,
    )
    expect(r.used).toBe(10_000)
    expect(r.remaining).toBeNull()
    expect(r.ratio).toBeNull()
  })
})
