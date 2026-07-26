import { describe, expect, it } from 'vitest'
import {
  debtServiceRatio,
  debtToIncome,
  emergencyFundMonths,
  incomeConcentration,
  liquidityRatio,
  monteCarloRunway,
  seededRandom,
  simpleRunway,
  taxBurden,
  verdictFor,
} from './health'

describe('verdictFor', () => {
  it('chấm theo chiều "càng cao càng tốt"', () => {
    expect(verdictFor(7, 3, 6)).toBe('good')
    expect(verdictFor(4, 3, 6)).toBe('warn')
    expect(verdictFor(1, 3, 6)).toBe('bad')
  })

  it('đảo chiều khi càng thấp càng tốt', () => {
    expect(verdictFor(0.2, 1.5, 0.5, false)).toBe('good')
    expect(verdictFor(1.0, 1.5, 0.5, false)).toBe('warn')
    expect(verdictFor(2.0, 1.5, 0.5, false)).toBe('bad')
  })

  it('đúng ngay tại mốc thì tính là đạt mốc đó', () => {
    expect(verdictFor(6, 3, 6)).toBe('good')
    expect(verdictFor(3, 3, 6)).toBe('warn')
    expect(verdictFor(0.5, 1.5, 0.5, false)).toBe('good')
  })

  it('null hoặc số không hữu hạn → unknown', () => {
    expect(verdictFor(null, 3, 6)).toBe('unknown')
    expect(verdictFor(Number.POSITIVE_INFINITY, 3, 6)).toBe('unknown')
  })
})

describe('emergencyFundMonths', () => {
  it('chia tài sản lỏng cho chi cố định tháng', () => {
    expect(emergencyFundMonths(1_200_000, 150_000)).toBe(8)
  })

  it('chưa phân loại chi cố định (= 0) → null chứ không phải vô cực', () => {
    expect(emergencyFundMonths(1_200_000, 0)).toBeNull()
  })
})

describe('liquidityRatio', () => {
  it('tài sản lỏng trên nợ ngắn hạn', () => {
    expect(liquidityRatio(600_000, 300_000)).toBe(2)
  })

  it('không có nợ ngắn hạn → null (không phải điểm xấu)', () => {
    expect(liquidityRatio(600_000, 0)).toBeNull()
  })
})

describe('debtToIncome / debtServiceRatio', () => {
  it('nợ trên thu nhập năm', () => {
    expect(debtToIncome(2_400_000, 6_000_000)).toBeCloseTo(0.4)
  })

  it('gánh nặng trả nợ hằng tháng', () => {
    expect(debtServiceRatio(50_000, 400_000)).toBeCloseTo(0.125)
  })

  it('không có thu nhập → null', () => {
    expect(debtToIncome(100, 0)).toBeNull()
    expect(debtServiceRatio(100, 0)).toBeNull()
  })
})

describe('incomeConcentration', () => {
  it('một nguồn duy nhất → topShare 1, hhi 1', () => {
    const r = incomeConcentration([{ key: 'luong', amount: 400_000 }])
    expect(r).toEqual({ topShare: 1, hhi: 1, sourceCount: 1, topKey: 'luong' })
  })

  it('bốn nguồn đều nhau → hhi 0.25', () => {
    const r = incomeConcentration(
      ['a', 'b', 'c', 'd'].map((key) => ({ key, amount: 100_000 })),
    )
    expect(r?.hhi).toBeCloseTo(0.25)
    expect(r?.topShare).toBeCloseTo(0.25)
    expect(r?.sourceCount).toBe(4)
  })

  it('bỏ qua nguồn 0 đồng và tìm đúng nguồn lớn nhất', () => {
    const r = incomeConcentration([
      { key: 'thuong', amount: 100_000 },
      { key: 'luong', amount: 300_000 },
      { key: 'khac', amount: 0 },
    ])
    expect(r?.sourceCount).toBe(2)
    expect(r?.topKey).toBe('luong')
    expect(r?.topShare).toBeCloseTo(0.75)
  })

  it('không có thu nhập → null', () => {
    expect(incomeConcentration([])).toBeNull()
    expect(incomeConcentration([{ key: 'a', amount: 0 }])).toBeNull()
  })
})

describe('taxBurden', () => {
  it('thuế + an sinh trên lương gộp', () => {
    expect(taxBurden(1_400_000, 5_000_000)).toBeCloseTo(0.28)
  })

  it('chưa khai lương gộp → null', () => {
    expect(taxBurden(1_400_000, 0)).toBeNull()
  })
})

describe('seededRandom', () => {
  it('cùng hạt giống cho cùng chuỗi số', () => {
    const a = seededRandom(42)
    const b = seededRandom(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('mọi giá trị nằm trong [0, 1)', () => {
    const r = seededRandom(7)
    for (let i = 0; i < 500; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('monteCarloRunway', () => {
  it('mỗi tháng âm đều nhau → cạn tiền đúng theo phép chia', () => {
    // 1.000.000 lỏng, tháng nào cũng âm 100.000 → tháng thứ 10 mới thủng
    const r = monteCarloRunway(1_000_000, [-100_000, -100_000, -100_000], { iterations: 200 })
    expect(r?.p50).toBe(10)
    expect(r?.p10).toBe(10)
    expect(r?.survivalRate).toBe(0)
  })

  it('dòng tiền dương → sống hết horizon', () => {
    const r = monteCarloRunway(500_000, [50_000, 80_000, 60_000], {
      iterations: 200,
      horizon: 24,
    })
    expect(r?.survivalRate).toBe(1)
    expect(r?.p50).toBe(24)
  })

  it('dòng tiền lẫn lộn → kịch bản xấu ngắn hơn kịch bản đẹp', () => {
    const r = monteCarloRunway(300_000, [-200_000, -50_000, 20_000, -120_000], {
      iterations: 3000,
    })
    expect(r).not.toBeNull()
    expect(r!.p10).toBeLessThanOrEqual(r!.p50)
    expect(r!.p50).toBeLessThanOrEqual(r!.p90)
  })

  it('cùng hạt giống → kết quả tái lập', () => {
    const flows = [-200_000, -50_000, 20_000, -120_000]
    const a = monteCarloRunway(300_000, flows, { seed: 1, iterations: 500 })
    const b = monteCarloRunway(300_000, flows, { seed: 1, iterations: 500 })
    expect(a).toEqual(b)
  })

  it('dưới 3 tháng lịch sử hoặc hết sạch tiền → null', () => {
    expect(monteCarloRunway(300_000, [-100_000, -50_000], {})).toBeNull()
    expect(monteCarloRunway(0, [-100_000, -50_000, -20_000], {})).toBeNull()
  })
})

describe('simpleRunway', () => {
  it('chia tài sản lỏng cho mức đốt tiền trung bình', () => {
    expect(simpleRunway(600_000, [-100_000, -200_000, -300_000])).toBe(3)
  })

  it('trung bình không âm → null (không có ngày cạn)', () => {
    expect(simpleRunway(600_000, [100_000, -50_000, 10_000])).toBeNull()
  })
})
