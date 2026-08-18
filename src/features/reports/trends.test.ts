import { describe, expect, it } from 'vitest'
import {
  BASKET_COST_CAVEAT,
  basketCost,
  detectChangePoints,
  halfPeriodShift,
  rollingAverage,
  yearOverYear,
  seasonalOutlook,
} from './trends'

describe('rollingAverage', () => {
  it('trả null cho tới khi đủ cửa sổ, rồi trung bình 3 phần tử gần nhất', () => {
    expect(rollingAverage([3, 6, 9, 12], 3)).toEqual([null, null, 6, 9])
  })

  it('cửa sổ 1 = chính dãy đó', () => {
    expect(rollingAverage([5, 7], 1)).toEqual([5, 7])
  })

  it('dãy ngắn hơn cửa sổ → toàn null', () => {
    expect(rollingAverage([1, 2], 5)).toEqual([null, null])
  })

  it('cửa sổ không hợp lệ → toàn null thay vì chia cho 0', () => {
    expect(rollingAverage([1, 2, 3], 0)).toEqual([null, null, null])
  })
})

describe('yearOverYear', () => {
  const pts = [
    { key: { year: 2025, month: 11 }, value: 100 },
    { key: { year: 2025, month: 12 }, value: 200 },
    { key: { year: 2026, month: 11 }, value: 150 },
    { key: { year: 2026, month: 12 }, value: 200 },
  ]

  it('ghép đúng cùng tháng năm trước và tính %', () => {
    const r = yearOverYear(pts)
    expect(r[2]).toEqual({
      key: { year: 2026, month: 11 },
      current: 150,
      yearAgo: 100,
      deltaPct: 50,
    })
    expect(r[3].deltaPct).toBe(0)
  })

  it('tháng chưa có dữ liệu năm ngoái → yearAgo null, không tính %', () => {
    const r = yearOverYear(pts)
    expect(r[0].yearAgo).toBeNull()
    expect(r[0].deltaPct).toBeNull()
  })

  it('năm ngoái bằng 0 → không chia cho 0', () => {
    const r = yearOverYear([
      { key: { year: 2025, month: 3 }, value: 0 },
      { key: { year: 2026, month: 3 }, value: 500 },
    ])
    expect(r[1].deltaPct).toBeNull()
  })
})

describe('detectChangePoints', () => {
  it('tìm đúng chỗ mức chi nhảy bậc', () => {
    // 6 tháng quanh 100, rồi 6 tháng quanh 300
    const v = [100, 105, 95, 102, 98, 100, 300, 305, 295, 302, 298, 300]
    const cps = detectChangePoints(v)
    expect(cps).toHaveLength(1)
    expect(cps[0].index).toBe(6)
    expect(cps[0].before).toBeCloseTo(100, 0)
    expect(cps[0].after).toBeCloseTo(300, 0)
  })

  it('dãy chỉ dao động vặt → không báo gãy', () => {
    expect(detectChangePoints([100, 103, 98, 101, 99, 102, 100, 97])).toEqual([])
  })

  it('hai bậc liên tiếp → hai điểm gãy theo thứ tự thời gian', () => {
    const v = [
      100, 102, 98, 101, // mức 1
      200, 203, 197, 201, // mức 2
      400, 402, 398, 401, // mức 3
    ]
    const cps = detectChangePoints(v)
    expect(cps.map((c) => c.index)).toEqual([4, 8])
  })

  it('tôn trọng maxPoints và minSegment', () => {
    const v = [10, 12, 8, 11, 100, 102, 98, 101, 200, 202, 198, 201]
    expect(detectChangePoints(v)).toHaveLength(2)
    expect(detectChangePoints(v, { maxPoints: 1 })).toHaveLength(1)
    // đoạn tối thiểu 8 tháng → không đủ chỗ để cắt dãy 12 phần tử thành 2 đoạn
    expect(detectChangePoints(v, { minSegment: 8 })).toEqual([])
  })

  it('dãy lên xuống đều đặn không phải "đổi mức" → không báo gãy', () => {
    const v = [10, 90, 10, 90, 10, 90, 10, 90, 10, 90, 10, 90]
    expect(detectChangePoints(v)).toEqual([])
  })

  it('dãy quá ngắn → mảng rỗng', () => {
    expect(detectChangePoints([1, 5])).toEqual([])
  })
})

describe('basketCost', () => {
  it('chỉ so những danh mục có mặt ở CẢ hai kỳ', () => {
    const cur = new Map([
      ['an', 220],
      ['nha', 110],
      ['hocphi', 500], // mới phát sinh năm nay → không nằm trong rổ
    ])
    const prev = new Map([
      ['an', 200],
      ['nha', 100],
      ['dulich', 300], // năm nay không chi → không nằm trong rổ
    ])
    const r = basketCost(cur, prev)
    expect(r?.basketSize).toBe(2)
    expect(r?.rate).toBeCloseTo(0.1) // 330/300 − 1
    expect(r?.currentTotal).toBe(330)
    expect(r?.previousTotal).toBe(300)
  })

  it('coverage cho biết rổ chung chiếm bao nhiêu phần tổng chi hiện tại', () => {
    const r = basketCost(new Map([['an', 100], ['moi', 300]]), new Map([['an', 100]]))
    expect(r?.coverage).toBeCloseTo(0.25)
  })

  it('không có danh mục chung → null', () => {
    expect(basketCost(new Map([['a', 100]]), new Map([['b', 100]]))).toBeNull()
  })

  it('kỳ trước bằng 0 → null', () => {
    expect(basketCost(new Map([['a', 100]]), new Map([['a', 0]]))).toBeNull()
  })

  it('mua ít hơn ra số ÂM y như giá giảm — nên câu chú thích là bắt buộc', () => {
    // Cùng một rổ, kỳ này tốn ít hơn. Không cách nào biết vì giá hay vì mua ít.
    const r = basketCost(new Map([['an', 70]]), new Map([['an', 100]]))
    expect(r?.rate).toBeCloseTo(-0.3)
    expect(BASKET_COST_CAVEAT).toContain('không phải chỉ số giá')
  })
})

describe('halfPeriodShift', () => {
  const half = (a: number, b: number) => [a, a, a, b, b, b]

  it('phát biểu ĐÚNG CHIỀU: thu giảm, chi giảm nhiều hơn → giữ lại tăng', () => {
    // thu 500→400 (−20%), chi 340→248 (−27%)
    const r = halfPeriodShift(half(500, 400), half(340, 248))
    expect(r?.incomeChangePct).toBeCloseTo(-20)
    expect(r?.expenseChangePct).toBeCloseTo(-27.06, 1)
    expect(r?.keptRateBefore).toBeCloseTo(0.32)
    expect(r?.keptRateAfter).toBeCloseTo(0.38)
  })

  it('không trả hệ số nào — hai nửa là hai nếp sống, không phải một đường', () => {
    const r = halfPeriodShift(half(200, 300), half(100, 125))
    expect(r).not.toHaveProperty('elasticity')
    expect(r).not.toHaveProperty('marginalSpend')
  })

  it('thu nhập gần như đứng yên vẫn trả số (không còn phép chia nổ)', () => {
    const r = halfPeriodShift(half(200, 202), half(100, 180))
    expect(r?.incomeChangePct).toBeCloseTo(1)
    expect(r?.expenseChangePct).toBeCloseTo(80)
  })

  it('dưới 4 tháng dữ liệu → null', () => {
    expect(halfPeriodShift([100, 200, 300], [50, 60, 70])).toBeNull()
  })

  it('số tháng lẻ: hai nửa không chồng lấn phần tử giữa', () => {
    const r = halfPeriodShift([100, 100, 100, 999, 200, 200, 200], [50, 50, 50, 999, 75, 75, 75])
    expect(r?.incomeBefore).toBe(100)
    expect(r?.incomeAfter).toBe(200)
    expect(r?.monthsPerHalf).toBe(3)
  })

  it('nửa đầu không có thu → null (không có mẫu số)', () => {
    expect(halfPeriodShift(half(0, 300), half(100, 125))).toBeNull()
  })
})

describe('seasonalOutlook', () => {
  /** Hai năm dữ liệu: mọi tháng 100, riêng tháng 12 là 200. */
  const haiNam = () => {
    const p: { month: number; expense: number }[] = []
    for (let y = 0; y < 2; y++)
      for (let m = 1; m <= 12; m++) p.push({ month: m, expense: m === 12 ? 200 : 100 })
    return p
  }

  it('tìm tháng nặng nhất trong các tháng SẮP TỚI', () => {
    const r = seasonalOutlook(haiNam(), 8)!
    expect(r.month).toBe(12)
    expect(r.monthsAway).toBe(4)
    expect(r.occurrences).toBe(2)
  })

  it('nói bằng TIỀN và bằng số cần để thêm mỗi tháng', () => {
    const r = seasonalOutlook(haiNam(), 8)!
    // TB mọi tháng = (11×100 + 200)/12 ≈ 108,33; tháng 12 = 200
    expect(r.avgOverall).toBe(108)
    expect(r.avgForMonth).toBe(200)
    expect(r.heavierPct).toBe(85)
    expect(r.extra).toBe(92)
    expect(r.savePerMonth).toBe(23) // 92 / 4
  })

  // Cả điểm của khối này là CÒN THỜI GIAN để dành thêm.
  it('không nói về tháng hiện tại', () => {
    expect(seasonalOutlook(haiNam(), 12)!.month).toBe(12) // tháng 12 năm SAU, 12 tháng nữa
    expect(seasonalOutlook(haiNam(), 12)!.monthsAway).toBe(12)
  })

  it('đi vòng qua cuối năm', () => {
    const r = seasonalOutlook(haiNam(), 10)!
    expect(r.month).toBe(12)
    expect(r.monthsAway).toBe(2)
  })

  // Ràng buộc quan trọng nhất: một tháng 12 duy nhất không phải mùa vụ.
  it('một lần xuất hiện thì KHÔNG gọi là mùa vụ', () => {
    const motNam = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      expense: i + 1 === 12 ? 200 : 100,
    }))
    expect(seasonalOutlook(motNam, 8)).toBeNull()
  })

  it('dao động dưới ngưỡng thì im', () => {
    const deu = haiNam().map((p) => ({ ...p, expense: p.month === 12 ? 105 : 100 }))
    expect(seasonalOutlook(deu, 8)).toBeNull()
  })

  it('chuỗi phẳng hoặc rỗng → null, không chia cho 0', () => {
    expect(seasonalOutlook([], 8)).toBeNull()
    expect(
      seasonalOutlook(
        Array.from({ length: 24 }, (_, i) => ({ month: (i % 12) + 1, expense: 0 })),
        8,
      ),
    ).toBeNull()
  })

  it('chỉ nhìn trước trong horizon', () => {
    // Tháng 12 còn 4 tháng nữa; horizon 2 thì không thấy.
    expect(seasonalOutlook(haiNam(), 8, { horizon: 2 })).toBeNull()
  })
})
