import { describe, expect, it } from 'vitest'
import { investmentStats } from './investment'

describe('investmentStats', () => {
  it('chưa cập nhật giá (marketValue null) → lãi/lỗ chưa xác định', () => {
    const s = investmentStats(1_000_000, null)
    expect(s).toEqual({
      costBasis: 1_000_000,
      marketValue: null,
      unrealizedPnl: null,
      pnlPercent: null,
    })
  })

  it('lãi: giá thị trường > vốn gốc', () => {
    const s = investmentStats(1_000_000, 1_250_000)
    expect(s.unrealizedPnl).toBe(250_000)
    expect(s.pnlPercent).toBeCloseTo(0.25)
  })

  it('lỗ: giá thị trường < vốn gốc', () => {
    const s = investmentStats(1_000_000, 800_000)
    expect(s.unrealizedPnl).toBe(-200_000)
    expect(s.pnlPercent).toBeCloseTo(-0.2)
  })

  it('hòa vốn', () => {
    const s = investmentStats(500_000, 500_000)
    expect(s.unrealizedPnl).toBe(0)
    expect(s.pnlPercent).toBe(0)
  })

  it('vốn gốc ≤ 0 (đã rút/bán quá số nạp): tính được lãi/lỗ tuyệt đối nhưng không tính %', () => {
    const s = investmentStats(0, 300_000)
    expect(s.unrealizedPnl).toBe(300_000)
    expect(s.pnlPercent).toBeNull()

    const neg = investmentStats(-50_000, 100_000)
    expect(neg.unrealizedPnl).toBe(150_000)
    expect(neg.pnlPercent).toBeNull()
  })
})
