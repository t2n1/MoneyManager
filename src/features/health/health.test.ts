import { describe, expect, it } from 'vitest'
import {
  debtServiceRatio,
  debtToIncome,
  emergencyFundMonths,
  healthScore,
  HEALTH_ZONES,
  incomeConcentration,
  liquidityRatio,
  monteCarloRunway,
  scoreFromZones,
  seededRandom,
  simpleRunway,
  taxBurden,
  verdictFor,
  verdictFromScore,
  type ScoreItem,
  type Zone,
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

describe('scoreFromZones', () => {
  const fund = HEALTH_ZONES.fund // càng cao càng tốt: bad ≤3, warn ≤6, good ≤12
  const dti = HEALTH_ZONES.dti // càng thấp càng tốt: good ≤0,5, warn ≤1,5, bad ≤3

  it('mốc giữa các vùng ra đúng biên của dải điểm', () => {
    expect(scoreFromZones(0, fund)).toBe(0)
    expect(scoreFromZones(3, fund)).toBe(40)
    expect(scoreFromZones(6, fund)).toBe(70)
    expect(scoreFromZones(12, fund)).toBe(100)
  })

  it('nội suy tuyến tính trong vùng, không nhảy bậc', () => {
    // 4,5 tháng = giữa vùng warn (3→6) = giữa dải 40→70
    expect(scoreFromZones(4.5, fund)).toBe(55)
    // 9 tháng = giữa vùng good (6→12) = giữa dải 70→100
    expect(scoreFromZones(9, fund)).toBe(85)
  })

  it('đảo chiều khi vùng đầu là good (càng thấp càng tốt)', () => {
    expect(scoreFromZones(0, dti)).toBe(100)
    expect(scoreFromZones(0.5, dti)).toBe(70)
    expect(scoreFromZones(1.5, dti)).toBe(40)
    expect(scoreFromZones(3, dti)).toBe(0)
    expect(scoreFromZones(0.25, dti)).toBe(85)
  })

  it('vượt trần thang thì kẹp, không vượt 0–100', () => {
    expect(scoreFromZones(80, HEALTH_ZONES.runway)).toBe(100)
    expect(scoreFromZones(-5, fund)).toBe(0)
    expect(scoreFromZones(9, dti)).toBe(0)
  })

  it('null hoặc số không hữu hạn → null (không phải 0 điểm)', () => {
    expect(scoreFromZones(null, fund)).toBeNull()
    expect(scoreFromZones(Number.POSITIVE_INFINITY, fund)).toBeNull()
    expect(scoreFromZones(Number.NaN, fund)).toBeNull()
  })

  it('đơn điệu trên toàn thang của mọi chỉ số', () => {
    for (const [name, zones] of Object.entries(HEALTH_ZONES)) {
      const max = zones[zones.length - 1].upTo
      const lowerIsBetter = zones[0].tone === 'good'
      let prev = scoreFromZones(0, zones)!
      for (let i = 1; i <= 100; i++) {
        const s = scoreFromZones((max * i) / 100, zones)!
        if (lowerIsBetter) expect(s, `${name} tại ${i}%`).toBeLessThanOrEqual(prev)
        else expect(s, `${name} tại ${i}%`).toBeGreaterThanOrEqual(prev)
        prev = s
      }
    }
  })

  it('không bao giờ chấm khác nhãn màu mà người dùng đang nhìn', () => {
    // Cùng một giá trị: điểm quy ra kết luận phải trùng với verdictFor trên đúng
    // hai mốc của thang. Đây là ràng buộc thật sự của thiết kế — nếu ai đó đổi dải
    // BANDS hoặc ngưỡng verdictFromScore lệch nhau thì thẻ sẽ hiện "Tốt" mà điểm 62.
    const cases: { zones: readonly Zone[]; warnAt: number; goodAt: number; higher: boolean }[] = [
      { zones: HEALTH_ZONES.fund, warnAt: 3, goodAt: 6, higher: true },
      { zones: HEALTH_ZONES.liquidity, warnAt: 1, goodAt: 2, higher: true },
      { zones: HEALTH_ZONES.runway, warnAt: 6, goodAt: 18, higher: true },
      { zones: HEALTH_ZONES.dti, warnAt: 1.5, goodAt: 0.5, higher: false },
      { zones: HEALTH_ZONES.concentration, warnAt: 0.95, goodAt: 0.7, higher: false },
      { zones: HEALTH_ZONES.taxBurden, warnAt: 0.35, goodAt: 0.25, higher: false },
    ]
    for (const { zones, warnAt, goodAt, higher } of cases) {
      const max = zones[zones.length - 1].upTo
      for (let i = 0; i <= 40; i++) {
        const v = (max * i) / 40
        const byScore = verdictFromScore(scoreFromZones(v, zones)!)
        const byThreshold = verdictFor(v, warnAt, goodAt, higher)
        expect(byScore, `giá trị ${v} trên thang ${max}`).toBe(byThreshold)
      }
    }
  })
})

describe('healthScore', () => {
  const item = (key: string, score: number | null, weight: number): ScoreItem => ({
    key,
    label: key,
    score,
    weight,
  })

  it('trung bình CÓ trọng số, không phải trung bình thường', () => {
    const r = healthScore([item('a', 100, 30), item('b', 40, 10)])!
    // (100×30 + 40×10) / 40 = 85 — trung bình thường sẽ ra 70
    expect(r.score).toBe(85)
    expect(r.verdict).toBe('good')
  })

  it('chỉ số thiếu dữ liệu bị loại khỏi CẢ tử và mẫu', () => {
    const r = healthScore([item('a', 80, 25), item('b', null, 25), item('c', 60, 25)])!
    expect(r.score).toBe(70) // chứ không phải (80+0+60)/3 = 47
    expect(r.counted).toBe(2)
    expect(r.total).toBe(3)
    expect(r.missing).toEqual(['b'])
    expect(r.coverage).toBeCloseTo(2 / 3)
  })

  it('coverage = 1 khi chấm được hết', () => {
    const r = healthScore([item('a', 80, 25), item('b', 60, 75)])!
    expect(r.coverage).toBe(1)
    expect(r.missing).toEqual([])
  })

  it('weakest là điểm thấp nhất, hoà thì lấy chỉ số nặng hơn', () => {
    expect(healthScore([item('a', 80, 10), item('b', 30, 10)])!.weakest!.key).toBe('b')
    expect(healthScore([item('nhẹ', 30, 5), item('nặng', 30, 40)])!.weakest!.key).toBe('nặng')
  })

  it('không chỉ số nào chấm được → null (KHÔNG phải 0 điểm)', () => {
    expect(healthScore([item('a', null, 25), item('b', null, 25)])).toBeNull()
    expect(healthScore([])).toBeNull()
  })

  it('chỉ số trọng số 0 không kéo được điểm', () => {
    const r = healthScore([item('a', 100, 20), item('b', 0, 0)])!
    expect(r.score).toBe(100)
  })

  it('ngưỡng verdict khớp dải điểm', () => {
    expect(verdictFromScore(70)).toBe('good')
    expect(verdictFromScore(69)).toBe('warn')
    expect(verdictFromScore(40)).toBe('warn')
    expect(verdictFromScore(39)).toBe('bad')
  })
})
