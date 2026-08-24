import { describe, expect, it } from 'vitest'
import {
  bandPath,
  linePath,
  logYTicks,
  makeXScale,
  makeYScale,
  niceStep,
  niceYTicks,
  packRows,
  symlog,
  symlogUnit,
  xTickStep,
  xToYear,
} from './chartGeom'

describe('symlog', () => {
  it('qua 0 liên tục và đối xứng hai chiều', () => {
    expect(symlog(0, 1_000_000)).toBe(0)
    expect(symlog(-5_000_000, 1_000_000)).toBeCloseTo(-symlog(5_000_000, 1_000_000), 12)
  })

  it('gần tuyến tính khi |v| nhỏ hơn unit — đoạn quanh 0 không bị kéo giãn', () => {
    const a = symlog(10_000, 1_000_000)
    const b = symlog(20_000, 1_000_000)
    expect(b / a).toBeGreaterThan(1.9)
    expect(b / a).toBeLessThan(2.1)
  })

  it('unit 0 hoặc âm không làm ra NaN', () => {
    expect(Number.isFinite(symlog(1000, 0))).toBe(true)
  })
})

describe('symlogUnit', () => {
  it('suy theo độ lớn dữ liệu, không gõ cứng', () => {
    expect(symlogUnit(0, 100_000_000)).toBe(1_000_000)
    // Cùng đồ thị đó nhưng bằng ₫ (lớn hơn ~170 lần) phải cho unit lớn tương ứng.
    expect(symlogUnit(0, 17_000_000_000)).toBe(100_000_000)
  })

  it('dữ liệu toàn 0 vẫn trả một unit dùng được', () => {
    expect(symlogUnit(0, 0)).toBe(1)
  })
})

describe('makeYScale', () => {
  it('tuyến tính: max ở mép trên, min ở mép dưới', () => {
    const ys = makeYScale({ min: -100, max: 300, log: false, unit: 1, plotTop: 20, plotBottom: 220 })
    expect(ys(300)).toBeCloseTo(20)
    expect(ys(-100)).toBeCloseTo(220)
    expect(ys(100)).toBeCloseTo(120)
  })

  it('min bằng max không ra NaN', () => {
    const ys = makeYScale({ min: 5, max: 5, log: false, unit: 1, plotTop: 0, plotBottom: 100 })
    expect(Number.isFinite(ys(5))).toBe(true)
  })

  it('log: giữ đúng thứ tự và hai đầu mút', () => {
    const ys = makeYScale({
      min: -10_000_000,
      max: 100_000_000,
      log: true,
      unit: 1_000_000,
      plotTop: 0,
      plotBottom: 200,
    })
    expect(ys(100_000_000)).toBeCloseTo(0)
    expect(ys(-10_000_000)).toBeCloseTo(200)
    expect(ys(10_000_000)).toBeLessThan(ys(1_000_000))
  })
})

describe('makeXScale', () => {
  it('trải đều hai đầu mút', () => {
    const xs = makeXScale(2026, 2086, 44, 844)
    expect(xs(2026)).toBeCloseTo(44)
    expect(xs(2086)).toBeCloseTo(844)
    expect(xs(2056)).toBeCloseTo(444)
  })

  it('một năm duy nhất không chia cho 0', () => {
    const xs = makeXScale(2026, 2026, 0, 100)
    expect(Number.isFinite(xs(2026))).toBe(true)
  })
})

describe('niceStep / niceYTicks', () => {
  it('chọn bậc 1 · 2 · 2,5 · 5 nhân luỹ thừa 10', () => {
    expect(niceStep(100, 5)).toBe(20)
    expect(niceStep(1000, 5)).toBe(200)
    expect(niceStep(120, 5)).toBe(25)
    expect(niceStep(45, 5)).toBe(10)
  })

  it('không sinh số lẻ do cộng dồn ở bậc 2,5', () => {
    const ticks = niceYTicks(0, 100_000_000, 4)
    expect(ticks.every((t) => Number.isInteger(t))).toBe(true)
    expect(ticks.length).toBeGreaterThanOrEqual(3)
    expect(ticks.length).toBeLessThanOrEqual(6)
  })

  it('gồm cả 0 khi khoảng bắc qua 0', () => {
    expect(niceYTicks(-40, 100, 5)).toContain(0)
  })

  it('mọi vạch nằm trong khoảng', () => {
    const ticks = niceYTicks(-37, 213, 5)
    expect(Math.min(...ticks)).toBeGreaterThanOrEqual(-37)
    expect(Math.max(...ticks)).toBeLessThanOrEqual(213)
  })
})

describe('logYTicks', () => {
  it('gồm 0 và các bậc mười về hai phía, sắp tăng', () => {
    const t = logYTicks(-20_000_000, 500_000_000, 1_000_000)
    expect(t).toContain(0)
    expect(t).toContain(10_000_000)
    expect(t).toContain(100_000_000)
    expect(t).toContain(-10_000_000)
    expect(t).not.toContain(-100_000_000)
    expect([...t].sort((a, b) => a - b)).toEqual(t)
  })
})

describe('xTickStep', () => {
  it('màn rộng thì chia dày, màn hẹp thì chia thưa', () => {
    expect(xTickStep(60, 800)).toBeLessThan(xTickStep(60, 250))
  })

  it('mỗi nhãn luôn còn đủ chỗ tối thiểu', () => {
    for (const w of [200, 320, 560, 900, 1400]) {
      const step = xTickStep(60, w)
      expect((w / 60) * step).toBeGreaterThanOrEqual(70)
    }
  })

  it('bề ngang 0 (chưa đo được) không chia cho 0', () => {
    expect(Number.isFinite(xTickStep(60, 0))).toBe(true)
  })
})

describe('packRows', () => {
  it('chip rời nhau thì cùng một hàng', () => {
    expect(
      packRows([
        { left: 0, width: 50 },
        { left: 100, width: 50 },
        { left: 200, width: 50 },
      ]),
    ).toEqual([0, 0, 0])
  })

  it('chip đè nhau thì tụt xuống hàng dưới', () => {
    expect(
      packRows([
        { left: 0, width: 80 },
        { left: 20, width: 80 },
        { left: 40, width: 80 },
      ]),
    ).toEqual([0, 1, 2])
  })

  it('quay lại hàng trên ngay khi hàng đó đã hết chip che', () => {
    // Đây là điều mà `i % 3` không làm được: chip thứ tư ở xa nên hàng 0 lại trống.
    expect(
      packRows([
        { left: 0, width: 80 },
        { left: 20, width: 80 },
        { left: 400, width: 80 },
      ]),
    ).toEqual([0, 1, 0])
  })

  it('không có chip nào thì không có hàng nào', () => {
    expect(packRows([])).toEqual([])
  })
})

describe('linePath / bandPath', () => {
  it('rỗng trả chuỗi rỗng', () => {
    expect(linePath([])).toBe('')
    expect(bandPath([], [])).toBe('')
  })

  it('mở bằng M rồi toàn L', () => {
    expect(linePath([[0, 0], [10, 20]])).toBe('M0.0 0.0 L10.0 20.0')
  })

  it('vùng khép kín đi ngược mép dưới rồi đóng bằng Z', () => {
    const d = bandPath([[0, 0], [10, 0]], [[0, 50], [10, 50]])
    expect(d.startsWith('M0.0 0.0')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    // Mép dưới phải đi từ x lớn về x nhỏ, không thì vùng bị xoắn thành nơ.
    expect(d.indexOf('L10.0 50.0')).toBeLessThan(d.indexOf('L0.0 50.0'))
  })
})

describe('xToYear', () => {
  it('là phép chiếu ngược của makeXScale', () => {
    const xs = makeXScale(2026, 2086, 44, 844)
    for (const y of [2026, 2040, 2065, 2086]) {
      expect(xToYear(xs(y), 2026, 2086, 44, 844)).toBe(y)
    }
  })

  it('kẹp trong khoảng khi kéo ra ngoài mép', () => {
    expect(xToYear(-500, 2026, 2086, 44, 844)).toBe(2026)
    expect(xToYear(5000, 2026, 2086, 44, 844)).toBe(2086)
  })
})
