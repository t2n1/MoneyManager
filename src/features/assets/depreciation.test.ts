import { describe, expect, it } from 'vitest'
import { depreciate } from './depreciation'

const base = {
  costBasis: 1_200_000,
  salvageValue: 0,
  months: 60,
  fromISO: '2024-01-01',
  todayISO: '2026-01-01',
}

describe('depreciate', () => {
  it('mới mua hôm nay → còn nguyên giá', () => {
    const r = depreciate({ ...base, todayISO: '2024-01-01' })
    expect(r?.currentValue).toBe(1_200_000)
    expect(r?.accumulated).toBe(0)
    expect(r?.elapsedRatio).toBe(0)
  })

  it('đi được 2/5 vòng đời → mất khoảng 40% giá trị', () => {
    const r = depreciate(base)
    expect(r?.elapsedRatio).toBeCloseTo(0.4, 2)
    expect(r?.currentValue).toBeGreaterThan(710_000)
    expect(r?.currentValue).toBeLessThan(730_000)
    expect(r?.monthsLeft).toBe(36)
  })

  it('hết vòng đời → dừng ở giá trị còn lại, không âm', () => {
    const r = depreciate({ ...base, todayISO: '2040-01-01' })
    expect(r?.currentValue).toBe(0)
    expect(r?.accumulated).toBe(1_200_000)
    expect(r?.elapsedRatio).toBe(1)
    expect(r?.monthsLeft).toBe(0)
  })

  it('tôn trọng giá trị còn lại (xe cũ vẫn bán được)', () => {
    const r = depreciate({ ...base, salvageValue: 300_000, todayISO: '2040-01-01' })
    expect(r?.currentValue).toBe(300_000)
    expect(r?.accumulated).toBe(900_000)
  })

  it('ngày mua ở tương lai → chưa khấu hao đồng nào', () => {
    const r = depreciate({ ...base, fromISO: '2030-01-01' })
    expect(r?.currentValue).toBe(1_200_000)
    expect(r?.elapsedRatio).toBe(0)
  })

  it('salvage ≥ giá mua → không có gì để khấu hao', () => {
    const r = depreciate({ ...base, salvageValue: 2_000_000 })
    expect(r?.currentValue).toBe(1_200_000)
    expect(r?.accumulated).toBe(0)
  })

  it('chưa cấu hình đủ (thiếu số tháng hoặc ngày mua) → null', () => {
    expect(depreciate({ ...base, months: null })).toBeNull()
    expect(depreciate({ ...base, months: 0 })).toBeNull()
    expect(depreciate({ ...base, fromISO: null })).toBeNull()
  })
})
