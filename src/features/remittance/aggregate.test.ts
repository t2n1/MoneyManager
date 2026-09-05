import { describe, expect, it } from 'vitest'
import type { TransactionRow } from '../../types/database.types'
import { remitTrueCost, remittanceShareOfIncome, remittanceStats, remittanceTiming } from './aggregate'

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

describe('remitTrueCost', () => {
  const fx = [
    { on_date: '2026-08-10', rates: { VND: 164.759769, USD: 0.006334 } },
    { on_date: '2026-08-25', rates: { VND: 163.948132 } },
  ]

  it('chi phí thật = phí + phần ẩn trong tỷ giá, so với thị trường CÙNG NGÀY', () => {
    // Gửi gốc 29.570¥, nhận 4.800.000₫ → tỷ giá thực nhận 162,33 < thị trường 164,76:
    // hụt (164,76 − 162,33) × 29.570 ÷ 164,76 ≈ 437¥, cộng phí 430¥.
    const r = remitTrueCost(
      [
        tx({
          is_remittance: true,
          occurred_on: '2026-08-10',
          amount: 30_000,
          remit_fee_jpy: 430,
          remit_received_vnd: 4_800_000,
        }),
      ],
      fx,
    )
    expect(r.items).toHaveLength(1)
    const i = r.items[0]
    expect(i.sentJpy).toBe(29_570)
    expect(i.fxLossJpy).toBe(437)
    expect(i.totalCostJpy).toBe(867)
    expect(i.costPct).toBeCloseTo(867 / 29_570, 6)
    expect(r.totalCostJpy).toBe(867)
  })

  it('đổi ĐƯỢC GIÁ hơn thị trường → phần hụt âm, không bị kẹp về 0', () => {
    // Thực nhận 165,20 > thị trường 164,76 (ca thật 10/08: số nhận do người dùng gõ tay).
    const r = remitTrueCost(
      [
        tx({
          is_remittance: true,
          occurred_on: '2026-08-10',
          amount: 30_000,
          remit_fee_jpy: 430,
          remit_received_vnd: 4_884_964,
        }),
      ],
      fx,
    )
    expect(r.items[0].fxLossJpy).toBeLessThan(0)
    // Tổng chi phí vẫn dương vì phí lớn hơn phần được giá.
    expect(r.items[0].totalCostJpy).toBe(430 + r.items[0].fxLossJpy)
  })

  it('không có tỷ giá thị trường quanh ngày gửi (±3 ngày) → đếm missing, không đoán', () => {
    const r = remitTrueCost(
      [
        tx({
          is_remittance: true,
          occurred_on: '2026-06-01', // trước khi fx_history tồn tại
          amount: 30_000,
          remit_fee_jpy: 430,
          remit_received_vnd: 4_800_000,
        }),
      ],
      fx,
    )
    expect(r.items).toHaveLength(0)
    expect(r.missingRateCount).toBe(1)
  })

  it('tỷ giá được lệch tối đa 3 ngày so với ngày gửi', () => {
    const r = remitTrueCost(
      [
        tx({
          is_remittance: true,
          occurred_on: '2026-08-23', // fx gần nhất là 25/08, cách 2 ngày
          amount: 10_000,
          remit_fee_jpy: 0,
          remit_received_vnd: 1_600_000,
        }),
      ],
      fx,
    )
    expect(r.items).toHaveLength(1)
    expect(r.items[0].marketRate).toBeCloseTo(163.948132, 6)
  })

  it('bỏ qua giao dịch thường và lần gửi thiếu số nhận', () => {
    const r = remitTrueCost(
      [
        tx({ amount: 30_000 }),
        tx({ is_remittance: true, occurred_on: '2026-08-10', amount: 30_000, remit_fee_jpy: 430 }),
      ],
      fx,
    )
    expect(r.items).toHaveLength(0)
    expect(r.missingRateCount).toBe(0)
  })
})
