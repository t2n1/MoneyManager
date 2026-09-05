import { describe, expect, it } from 'vitest'
import { feeShareAfterYears, fundFeePaid } from './fundFees'
import type { FundTrade } from './fundHoldings'

const buy = (on: string, units: number, nav: number, over: Partial<FundTrade> = {}): FundTrade => ({
  assocFundCd: 'X',
  kind: 'buy',
  tradedOn: on,
  units,
  nav,
  amount: Math.round((units * nav) / 10_000),
  ...over,
})

describe('fundFeePaid', () => {
  it('một năm giữ nguyên giá trị: phí ≈ giá trị × ER', () => {
    // 10.000口 × nav 10.000/1万口 = ¥10.000 giữ đúng 366 ngày (2024 nhuận), ER 1%/năm.
    const r = fundFeePaid({
      trades: [buy('2024-01-01', 10_000, 10_000)],
      erPpm: 10_000,
      latestNav: 10_000,
      latestNavDate: '2025-01-01',
    })
    expect(r).not.toBeNull()
    // 10.000 × 1% × 366/365,25 = 100,2 → 100
    expect(r!.feeMinor).toBe(100)
    expect(r!.fromISO).toBe('2024-01-01')
    expect(r!.toISO).toBe('2025-01-01')
  })

  it('mua thêm giữa kỳ: cuối đoạn tính TRƯỚC lệnh của ngày đó (tiền mới không chịu phí quá khứ)', () => {
    // Đoạn 1: ¥10.000 → ¥12.000 (10.000口, nav lên 12.000) trong 100 ngày;
    // đoạn 2 sau khi mua thêm: ¥24.000 đứng yên 100 ngày. ER 1%/năm.
    const r = fundFeePaid({
      trades: [buy('2026-01-01', 10_000, 10_000), buy('2026-04-10', 10_000, 12_000)],
      erPpm: 10_000,
      latestNav: 12_000,
      latestNavDate: '2026-07-19',
    })
    const seg1 = ((10_000 + 12_000) / 2) * 0.01 * (100 / 365.25)
    const seg2 = ((24_000 + 24_000) / 2) * 0.01 * (100 / 365.25)
    expect(r!.feeMinor).toBe(Math.round(seg1 + seg2))
  })

  it('bán sạch: phí chạy tới đúng ngày bán rồi ngừng', () => {
    const r = fundFeePaid({
      trades: [
        buy('2026-01-01', 10_000, 10_000),
        { ...buy('2026-03-01', 10_000, 10_000), kind: 'sell' },
      ],
      erPpm: 10_000,
      latestNav: 10_000,
      latestNavDate: '2026-12-31',
    })
    // 60 ngày giữ trọn ¥10.000 (cuối đoạn tính TRƯỚC lệnh bán); sau đó giá trị 0.
    const seg1 = ((10_000 + 10_000) / 2) * 0.01 * (60 / 365.25)
    expect(r!.feeMinor).toBe(Math.round(seg1))
  })

  it('chưa khai phí hoặc thiếu mốc thứ hai → null', () => {
    expect(
      fundFeePaid({ trades: [buy('2026-01-01', 1, 10_000)], erPpm: 0, latestNav: 10_000, latestNavDate: '2026-06-01' }),
    ).toBeNull()
    expect(
      fundFeePaid({ trades: [buy('2026-01-01', 1, 10_000)], erPpm: 770, latestNav: null, latestNavDate: null }),
    ).toBeNull()
  })
})

describe('feeShareAfterYears', () => {
  it('0,5%/năm giữ 20 năm lấy ~9,5% số cuối (gần đúng không cần lợi suất)', () => {
    expect(feeShareAfterYears(5_000, 20)).toBeCloseTo(1 - Math.pow(0.995, 20), 10)
    expect(feeShareAfterYears(5_000, 20)).toBeCloseTo(0.0954, 3)
  })
  it('không khai thì 0', () => {
    expect(feeShareAfterYears(0, 20)).toBe(0)
  })
})

describe('parsePercentToPpm', () => {
  it('nhận cả dấu phẩy lẫn dấu chấm, rỗng = xoá, rác = giữ nguyên', async () => {
    const { parsePercentToPpm } = await import('./fundFees')
    expect(parsePercentToPpm('0,077')).toBe(770)
    expect(parsePercentToPpm('0.198')).toBe(1_980)
    expect(parsePercentToPpm('')).toBeNull()
    expect(parsePercentToPpm('abc')).toBeUndefined()
    expect(parsePercentToPpm('5')).toBeUndefined() // ngoài trần 3%/năm
  })
})
