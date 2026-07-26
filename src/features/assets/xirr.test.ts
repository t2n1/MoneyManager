import { describe, expect, it } from 'vitest'
import { investmentPerformance, xirr } from './xirr'

describe('xirr', () => {
  it('bỏ 100 lấy về 110 sau đúng 1 năm → 10%/năm', () => {
    const r = xirr([
      { date: '2025-01-01', amount: -100_000 },
      { date: '2026-01-01', amount: 110_000 },
    ])
    expect(r).toBeCloseTo(0.1, 3)
  })

  it('gấp đôi sau 2 năm → khoảng 41%/năm (không phải 50%)', () => {
    const r = xirr([
      { date: '2024-01-01', amount: -100_000 },
      { date: '2026-01-01', amount: 200_000 },
    ])
    expect(r).toBeCloseTo(Math.SQRT2 - 1, 2)
  })

  it('lỗ → lợi nhuận âm', () => {
    const r = xirr([
      { date: '2025-01-01', amount: -100_000 },
      { date: '2026-01-01', amount: 80_000 },
    ])
    expect(r).toBeCloseTo(-0.2, 2)
  })

  it('nạp nhiều đợt: tiền vào muộn được tính đúng thời gian nắm giữ', () => {
    // 100k đầu năm + 100k giữa năm, cuối năm còn 210k
    const r = xirr([
      { date: '2025-01-01', amount: -100_000 },
      { date: '2025-07-01', amount: -100_000 },
      { date: '2026-01-01', amount: 210_000 },
    ])
    // Nếu tính thô thì là 5%; vì nửa số tiền chỉ nằm 6 tháng nên thực tế cao hơn
    expect(r).toBeGreaterThan(0.06)
    expect(r).toBeLessThan(0.08)
  })

  it('hòa vốn → 0%', () => {
    const r = xirr([
      { date: '2025-01-01', amount: -100_000 },
      { date: '2026-01-01', amount: 100_000 },
    ])
    expect(r).toBeCloseTo(0, 6)
  })

  it('thiếu dữ liệu hoặc không có chiều ngược lại → null', () => {
    expect(xirr([{ date: '2025-01-01', amount: -100 }])).toBeNull()
    expect(
      xirr([
        { date: '2025-01-01', amount: -100 },
        { date: '2026-01-01', amount: -100 },
      ]),
    ).toBeNull()
    expect(
      xirr([
        { date: '2025-01-01', amount: -100 },
        { date: '2025-01-01', amount: 200 },
      ]),
    ).toBeNull()
  })
})

describe('investmentPerformance', () => {
  const base = {
    todayISO: '2026-01-01',
    capitalGainsTaxBps: 2032,
    annualInflationBps: null,
  }

  it('tách rõ tiền mình bỏ vào và phần thị trường cho thêm', () => {
    const p = investmentPerformance({
      ...base,
      flows: [
        { date: '2024-01-01', amount: -500_000 },
        { date: '2025-01-01', amount: -300_000 },
      ],
      currentValue: 1_000_000,
    })
    expect(p.contributed).toBe(800_000)
    expect(p.withdrawn).toBe(0)
    expect(p.netContributed).toBe(800_000)
    expect(p.growth).toBe(200_000)
  })

  it('tiền đã rút ra vẫn được tính vào phần lời', () => {
    const p = investmentPerformance({
      ...base,
      flows: [
        { date: '2024-01-01', amount: -1_000_000 },
        { date: '2025-06-01', amount: 400_000 },
      ],
      currentValue: 900_000,
    })
    expect(p.withdrawn).toBe(400_000)
    expect(p.netContributed).toBe(600_000)
    expect(p.growth).toBe(300_000) // 900k còn lại + 400k đã rút − 1tr bỏ vào
  })

  it('thuế chỉ ăn vào phần lời nên lợi nhuận sau thuế thấp hơn', () => {
    const p = investmentPerformance({
      ...base,
      flows: [{ date: '2025-01-01', amount: -100_000 }],
      currentValue: 110_000,
    })
    expect(p.annualReturn).toBeCloseTo(0.1, 3)
    // lời 10.000, thuế 20,32% = 2.032 → còn 107.968 → ~7,97%/năm
    expect(p.afterTaxReturn).toBeCloseTo(0.0797, 3)
  })

  it('đang lỗ thì không bị đánh thuế', () => {
    const p = investmentPerformance({
      ...base,
      flows: [{ date: '2025-01-01', amount: -100_000 }],
      currentValue: 90_000,
    })
    expect(p.afterTaxReturn).toBe(p.annualReturn)
  })

  it('lợi nhuận thực dùng công thức Fisher, không phải phép trừ', () => {
    const p = investmentPerformance({
      ...base,
      annualInflationBps: 250, // 2,5%
      flows: [{ date: '2025-01-01', amount: -100_000 }],
      currentValue: 110_000,
    })
    // (1 + 0,0797) / 1,025 − 1 ≈ 5,34% — thấp hơn phép trừ thô (7,97 − 2,5 = 5,47)
    expect(p.realReturn).toBeCloseTo(0.0534, 3)
    expect(p.realReturn!).toBeLessThan(p.afterTaxReturn! - 0.025 + 0.001)
  })

  it('chưa khai lạm phát → không bịa ra lợi nhuận thực', () => {
    const p = investmentPerformance({
      ...base,
      flows: [{ date: '2025-01-01', amount: -100_000 }],
      currentValue: 110_000,
    })
    expect(p.realReturn).toBeNull()
  })

  it('chưa có dòng tiền nào → mọi tỷ suất là null nhưng số tuyệt đối vẫn đúng', () => {
    const p = investmentPerformance({ ...base, flows: [], currentValue: 50_000 })
    expect(p.annualReturn).toBeNull()
    expect(p.afterTaxReturn).toBeNull()
    expect(p.growth).toBe(50_000)
  })
})
