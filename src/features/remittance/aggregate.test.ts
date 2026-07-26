import { describe, expect, it } from 'vitest'
import type { TransactionRow } from '../../types/database.types'
import { remittanceShareOfIncome, remittanceStats, remittanceTiming } from './aggregate'

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

describe('remittanceTiming', () => {
  const rows = [
    tx({ id: 'r1', is_remittance: true, amount: 100_000, remit_received_vnd: 17_000_000, occurred_on: '2026-03-01' }), // 170 ₫/¥
    tx({ id: 'r2', is_remittance: true, amount: 100_000, remit_received_vnd: 15_000_000, occurred_on: '2026-06-01' }), // 150 ₫/¥
  ]

  it('so từng lần với tỷ giá trung bình, mới nhất lên đầu', () => {
    const t = remittanceTiming(rows, 160)
    expect(t.map((x) => x.transactionId)).toEqual(['r2', 'r1'])
    expect(t[1].rate).toBe(170)
    expect(t[1].vsAvgPct).toBeCloseTo(6.25)
    expect(t[1].gainVsAvgVnd).toBe(1_000_000) // (170 − 160) × 100.000
    expect(t[0].gainVsAvgVnd).toBe(-1_000_000)
  })

  it('bỏ lần gửi thiếu số VND nhận và giao dịch không phải kiều hối', () => {
    const t = remittanceTiming(
      [...rows, tx({ id: 'r3', is_remittance: true, amount: 50_000 }), tx({ id: 'r4', amount: 9_000 })],
      160,
    )
    expect(t).toHaveLength(2)
  })

  it('chưa có tỷ giá trung bình → không so được', () => {
    expect(remittanceTiming(rows, null)).toEqual([])
    expect(remittanceTiming(rows, 0)).toEqual([])
  })
})

describe('remittanceShareOfIncome', () => {
  it('tính trên tổng tiền rời ví (gửi gốc + phí)', () => {
    const stats = remittanceStats([
      tx({ is_remittance: true, amount: 102_000, remit_fee_jpy: 2_000, remit_received_vnd: 16_000_000 }),
    ])
    expect(remittanceShareOfIncome(stats, 1_020_000)).toBeCloseTo(0.1)
  })

  it('chưa có thu nhập → null', () => {
    expect(remittanceShareOfIncome(remittanceStats([]), 0)).toBeNull()
  })
})
