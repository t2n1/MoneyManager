import { describe, expect, it } from 'vitest'
import type { TransactionRow } from '../../types/database.types'
import { remittanceStats } from './aggregate'

let seq = 0
function tx(p: Partial<TransactionRow>): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    type: 'transfer',
    amount: 0,
    to_amount: null,
    category_id: null,
    account_id: 'a',
    to_account_id: null,
    recurring_rule_id: null,
    occurred_on: '2026-07-01',
    note: '',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...p,
  }
}

describe('remittanceStats', () => {
  it('rỗng → tất cả 0, avgRate null', () => {
    const s = remittanceStats([])
    expect(s).toEqual({ totalSentJpy: 0, totalFeeJpy: 0, totalReceivedVnd: 0, avgRate: null, count: 0 })
  })

  it('bỏ qua giao dịch không phải remittance', () => {
    const s = remittanceStats([
      tx({ type: 'expense', amount: 5_000 }), // không có is_remittance
      tx({ is_remittance: true, amount: 100_000, remit_fee_jpy: 2_000, remit_received_vnd: 16_000_000 }),
    ])
    expect(s.count).toBe(1)
    expect(s.totalSentJpy).toBe(98_000) // 100.000 − 2.000
    expect(s.totalFeeJpy).toBe(2_000)
    expect(s.totalReceivedVnd).toBe(16_000_000)
  })

  it('cộng dồn nhiều lần gửi + tỷ giá thực nhận TB = ΣVND / Σ(số gửi gốc)', () => {
    const s = remittanceStats([
      tx({ is_remittance: true, amount: 102_000, remit_fee_jpy: 2_000, remit_received_vnd: 16_000_000 }), // gốc 100.000
      tx({ is_remittance: true, amount: 51_000, remit_fee_jpy: 1_000, remit_received_vnd: 8_000_000 }), // gốc 50.000
    ])
    expect(s.totalSentJpy).toBe(150_000)
    expect(s.totalFeeJpy).toBe(3_000)
    expect(s.totalReceivedVnd).toBe(24_000_000)
    expect(s.avgRate).toBeCloseTo(24_000_000 / 150_000) // 160 ₫/¥
    expect(s.count).toBe(2)
  })

  it('phí/VND thiếu (null/undefined) coi như 0', () => {
    const s = remittanceStats([tx({ is_remittance: true, amount: 30_000 })])
    expect(s.totalFeeJpy).toBe(0)
    expect(s.totalReceivedVnd).toBe(0)
    expect(s.totalSentJpy).toBe(30_000)
    expect(s.avgRate).toBe(0) // 0 VND / 30.000 JPY
  })
})
