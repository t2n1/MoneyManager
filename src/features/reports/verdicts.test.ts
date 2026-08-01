import { describe, expect, it } from 'vitest'
import type { MonthlyPoint } from './aggregate'
import {
  completedPoints,
  expenseTrend,
  netFlowVerdict,
  paretoTone,
  savingsRateVerdict,
} from './verdicts'

/** Tháng 2026-`m` với thu/chi cho sẵn. */
const p = (m: number, income: number, expense: number): MonthlyPoint => ({
  key: { year: 2026, month: m },
  income,
  expense,
})

const AUG: { year: number; month: number } = { year: 2026, month: 8 }

describe('completedPoints', () => {
  it('bỏ tháng đang chạy dở và mọi tháng sau nó', () => {
    const points = [p(6, 300, 200), p(7, 300, 200), p(8, 300, 30), p(9, 0, 0)]
    expect(completedPoints(points, AUG).map((x) => x.key.month)).toEqual([6, 7])
  })

  it('currentKey null → giữ hết (đang xem một năm đã qua)', () => {
    const points = [p(11, 300, 200), p(12, 300, 200)]
    expect(completedPoints(points, null)).toHaveLength(2)
  })

  it('bỏ tháng rỗng ở hai đầu nhưng GIỮ tháng rỗng ở giữa', () => {
    const points = [p(1, 0, 0), p(2, 300, 200), p(3, 0, 0), p(4, 300, 200), p(5, 0, 0)]
    expect(completedPoints(points, AUG).map((x) => x.key.month)).toEqual([2, 3, 4])
  })

  it('chuỗi rỗng hoàn toàn → rỗng', () => {
    expect(completedPoints([p(1, 0, 0), p(2, 0, 0)], AUG)).toEqual([])
  })

  it('tháng dở nằm giữa chuỗi thì cắt luôn phần sau nó', () => {
    // Không xảy ra ở UI hiện tại, nhưng luật phải là "trước mốc", không phải "bỏ phần tử cuối"
    const points = [p(7, 300, 200), p(8, 300, 30), p(9, 500, 400)]
    expect(completedPoints(points, AUG).map((x) => x.key.month)).toEqual([7])
  })
})

describe('expenseTrend', () => {
  it('chi vọt hơn 25% so với nền → bad, kèm đúng con số', () => {
    const r = expenseTrend([p(5, 0, 100), p(6, 0, 100), p(7, 0, 140)], AUG)!
    expect(r.tone).toBe('bad')
    expect(r.last).toBe(140)
    expect(r.avgPrior).toBe(100)
    expect(r.delta).toBeCloseTo(0.4)
    expect(r.priorMonths).toBe(2)
  })

  it('tăng 10–25% → warn, dưới 10% → coi là ổn định', () => {
    expect(expenseTrend([p(5, 0, 100), p(6, 0, 100), p(7, 0, 120)], AUG)!.tone).toBe('warn')
    expect(expenseTrend([p(5, 0, 100), p(6, 0, 100), p(7, 0, 105)], AUG)!.tone).toBe('info')
    expect(expenseTrend([p(5, 0, 100), p(6, 0, 100), p(7, 0, 95)], AUG)!.tone).toBe('info')
  })

  it('chi giảm hơn 10% → good', () => {
    expect(expenseTrend([p(5, 0, 100), p(6, 0, 100), p(7, 0, 80)], AUG)!.tone).toBe('good')
  })

  it('KHÔNG lấy tháng đang dở làm tháng gần nhất', () => {
    // Tháng 8 mới qua vài ngày (chi 20). Nếu tính vào, delta = −80% → khen "chi giảm".
    const r = expenseTrend([p(6, 0, 100), p(7, 0, 130), p(8, 0, 20)], AUG)!
    expect(r.last).toBe(130)
    expect(r.tone).toBe('bad')
  })

  it('dưới 2 tháng hoàn tất hoặc nền bằng 0 → null', () => {
    expect(expenseTrend([p(7, 0, 100), p(8, 0, 20)], AUG)).toBeNull()
    expect(expenseTrend([p(6, 500, 0), p(7, 0, 100)], AUG)).toBeNull()
    expect(expenseTrend([], AUG)).toBeNull()
  })
})

describe('paretoTone', () => {
  it('ít danh mục nuốt phần lớn tiền → good (dễ nhắm khi cần cắt)', () => {
    expect(paretoTone(3, 20)).toBe('good')
    expect(paretoTone(5, 15)).toBe('good')
  })

  it('phải gọi tên hơn 2/3 danh mục mới đủ 80% → warn (cắt lẻ vô ích)', () => {
    expect(paretoTone(15, 20)).toBe('warn')
  })

  it('ở giữa thì không kết luận', () => {
    expect(paretoTone(10, 20)).toBe('info')
  })

  it('không có danh mục nào → info, không chia cho 0', () => {
    expect(paretoTone(0, 0)).toBe('info')
  })
})

describe('netFlowVerdict', () => {
  it('tổng âm → bad', () => {
    const r = netFlowVerdict([p(6, 100, 150), p(7, 100, 120)], AUG)!
    expect(r.tone).toBe('bad')
    expect(r.total).toBe(-70)
    expect(r.negativeMonths).toBe(2)
    expect(r.months).toBe(2)
  })

  it('tổng dương nhưng quá nửa số tháng thâm hụt → warn', () => {
    // Dư 300 nhưng chỉ nhờ một tháng thu đột biến; 2/3 tháng vẫn âm.
    const r = netFlowVerdict([p(5, 100, 150), p(6, 100, 150), p(7, 500, 100)], AUG)!
    expect(r.tone).toBe('warn')
    expect(r.total).toBe(300)
    expect(r.negativeMonths).toBe(2)
  })

  it('đúng một nửa số tháng thâm hụt vẫn là warn', () => {
    expect(netFlowVerdict([p(6, 100, 150), p(7, 500, 100)], AUG)!.tone).toBe('warn')
  })

  it('dư và phần lớn tháng dương → good', () => {
    const r = netFlowVerdict([p(5, 300, 200), p(6, 300, 200), p(7, 100, 150)], AUG)!
    expect(r.tone).toBe('good')
    expect(r.negativeMonths).toBe(1)
  })

  it('tháng dở không được tính vào tổng', () => {
    const r = netFlowVerdict([p(6, 300, 200), p(7, 300, 200), p(8, 0, 500)], AUG)!
    expect(r.total).toBe(200)
    expect(r.months).toBe(2)
  })

  it('không có tháng hoàn tất nào → null', () => {
    expect(netFlowVerdict([p(8, 300, 200)], AUG)).toBeNull()
  })
})

describe('savingsRateVerdict', () => {
  it('tính trên TỔNG cả kỳ, không phải trung bình các tỷ lệ tháng', () => {
    // Tháng thu 100 giữ 50% và tháng thu 900 giữ 0% → trung bình tỷ lệ là 25%,
    // nhưng thực tế chỉ giữ được 50/1000 = 5%.
    const r = savingsRateVerdict([p(6, 100, 50), p(7, 900, 900)], AUG)!
    expect(r.rate).toBeCloseTo(0.05)
    expect(r.tone).toBe('warn')
  })

  it('từ 20% → good, âm → bad', () => {
    expect(savingsRateVerdict([p(6, 100, 80), p(7, 100, 80)], AUG)!.tone).toBe('good')
    expect(savingsRateVerdict([p(6, 100, 120), p(7, 100, 120)], AUG)!.tone).toBe('bad')
  })

  it('xu hướng so nửa sau với nửa đầu, cần đủ 4 tháng', () => {
    const up = savingsRateVerdict(
      [p(4, 100, 95), p(5, 100, 95), p(6, 100, 70), p(7, 100, 70)],
      AUG,
    )!
    expect(up.trend).toBe('up')
    expect(up.trendDelta).toBeCloseTo(0.25)

    const down = savingsRateVerdict(
      [p(4, 100, 70), p(5, 100, 70), p(6, 100, 95), p(7, 100, 95)],
      AUG,
    )!
    expect(down.trend).toBe('down')

    const flat = savingsRateVerdict(
      [p(4, 100, 80), p(5, 100, 80), p(6, 100, 79), p(7, 100, 79)],
      AUG,
    )!
    expect(flat.trend).toBe('flat')
  })

  it('dưới 4 tháng thì không kết luận xu hướng', () => {
    const r = savingsRateVerdict([p(6, 100, 50), p(7, 100, 90)], AUG)!
    expect(r.trend).toBeNull()
    expect(r.trendDelta).toBeNull()
  })

  it('tháng dở không kéo tỷ lệ lên', () => {
    // Tháng 8 mới qua vài ngày nên trông như tiết kiệm 90%.
    const r = savingsRateVerdict([p(6, 100, 95), p(7, 100, 95), p(8, 100, 10)], AUG)!
    expect(r.rate).toBeCloseTo(0.05)
    expect(r.months).toBe(2)
  })

  it('không có thu nhập → null (không phải 0%)', () => {
    expect(savingsRateVerdict([p(6, 0, 100), p(7, 0, 100)], AUG)).toBeNull()
    expect(savingsRateVerdict([], AUG)).toBeNull()
  })
})
