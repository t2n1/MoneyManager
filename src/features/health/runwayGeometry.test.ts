import { describe, expect, it } from 'vitest'
import { MIN_WIDTH_PCT, runwayBandGeometry } from './runwayGeometry'

describe('runwayBandGeometry — trục tự co', () => {
  it('dải ngắn nằm trên trục 12 tháng, không phải trần 60', () => {
    const g = runwayBandGeometry({ p10: 3, p50: 5, p90: 8, horizon: 60 })
    expect(g.axisMax).toBe(12)
    expect(g.ticks).toEqual([0, 3, 6, 9, 12])
  })

  it('dải trung bình lên trục 24 — đúng trục của bản vẽ', () => {
    const g = runwayBandGeometry({ p10: 5, p50: 9, p90: 17, horizon: 60 })
    expect(g.axisMax).toBe(24)
    expect(g.ticks).toEqual([0, 6, 12, 18, 24])
    expect(g.medianPct).toBeCloseTo((9 / 24) * 100, 5)
  })

  it('vượt hết mốc thì dùng chính trần mô phỏng', () => {
    const g = runwayBandGeometry({ p10: 40, p50: 55, p90: 60, horizon: 60 })
    expect(g.axisMax).toBe(60)
  })

  // Trần mô phỏng thấp hơn mốc trục thì không được chọn mốc lớn hơn trần: trục sẽ có
  // một khoảng cuối mà mô phỏng chưa từng chạy tới.
  it('không chọn mốc trục lớn hơn trần mô phỏng', () => {
    const g = runwayBandGeometry({ p10: 2, p50: 4, p90: 6, horizon: 6 })
    expect(g.axisMax).toBe(6)
  })
})

describe('runwayBandGeometry — dải không được tàng hình', () => {
  it('mọi kịch bản ra cùng một số → vẫn còn bề rộng nhìn thấy', () => {
    const g = runwayBandGeometry({ p10: 9, p50: 9, p90: 9, horizon: 60 })
    expect(g.widthPct).toBe(MIN_WIDTH_PCT)
  })

  it('nới bề rộng thì kẹp từ bên PHẢI, không để dải tràn khung', () => {
    // p10 = p90 = axisMax → nếu nới sang phải thì left+width = 100 + MIN
    const g = runwayBandGeometry({ p10: 12, p50: 12, p90: 12, horizon: 12 })
    expect(g.leftPct + g.widthPct).toBeLessThanOrEqual(100)
  })

  it('dải rộng thật thì giữ đúng bề rộng thật', () => {
    const g = runwayBandGeometry({ p10: 6, p50: 12, p90: 24, horizon: 60 })
    expect(g.widthPct).toBeCloseTo(((24 - 6) / 24) * 100, 5)
    expect(g.leftPct).toBeCloseTo((6 / 24) * 100, 5)
  })
})

describe('runwayBandGeometry — chạm trần là "không cạn tiền", không phải "cạn ở tháng 60"', () => {
  it('trung vị bằng trần → medianAtHorizon', () => {
    expect(runwayBandGeometry({ p10: 30, p50: 60, p90: 60, horizon: 60 }).medianAtHorizon).toBe(
      true,
    )
  })

  it('trung vị dưới trần → không phải', () => {
    expect(runwayBandGeometry({ p10: 5, p50: 9, p90: 17, horizon: 60 }).medianAtHorizon).toBe(
      false,
    )
  })
})

describe('runwayBandGeometry — mọi phần trăm nằm trong khung', () => {
  it('không bao giờ âm hay vượt 100', () => {
    const cases = [
      { p10: 0, p50: 0, p90: 0, horizon: 60 },
      { p10: 0, p50: 60, p90: 60, horizon: 60 },
      { p10: 59, p50: 60, p90: 60, horizon: 60 },
    ]
    for (const c of cases) {
      const g = runwayBandGeometry(c)
      for (const v of [g.leftPct, g.widthPct, g.medianPct]) {
        expect(v, JSON.stringify(c)).toBeGreaterThanOrEqual(0)
        expect(v, JSON.stringify(c)).toBeLessThanOrEqual(100)
      }
      expect(g.leftPct + g.widthPct, JSON.stringify(c)).toBeLessThanOrEqual(100)
    }
  })
})
