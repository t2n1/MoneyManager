import { describe, expect, it } from 'vitest'
import {
  annualVolPct,
  betaOf,
  pairedReturns,
  portfolioRisk,
  riskClassOf,
  RISK_FREE_ANNUAL_PCT,
  sharpeOf,
  stdev,
} from './riskMetrics'

/** Chuỗi lợi suất ngày giả, đủ dài để phương sai có nghĩa. */
const thiTruong = [0.01, -0.005, 0.008, -0.012, 0.004, 0.006, -0.003, 0.011, -0.007, 0.002]

describe('stdev', () => {
  it('chuỗi hằng thì độ lệch bằng 0', () => {
    expect(stdev([0.01, 0.01, 0.01])).toBe(0)
  })

  it('dưới hai điểm thì trả null — một điểm không có độ lệch', () => {
    expect(stdev([0.01])).toBeNull()
    expect(stdev([])).toBeNull()
  })

  it('dùng mẫu (n−1), không phải tổng thể', () => {
    // [0, 2]: trung bình 1, phương sai mẫu = ((−1)² + 1²)/1 = 2 → sd = √2
    expect(stdev([0, 2])).toBeCloseTo(Math.SQRT2, 10)
  })
})

describe('annualVolPct', () => {
  it('nhân √252 rồi ra phần trăm', () => {
    // sd ngày 0,01 → 0,01 × √252 × 100 ≈ 15,87%
    const many = Array.from({ length: 50 }, (_, i) => (i % 2 === 0 ? 0.01 : -0.01))
    const v = annualVolPct(many)!
    expect(v).toBeCloseTo(0.0101 * Math.sqrt(252) * 100, 0)
  })

  it('chuỗi quá ngắn thì null', () => {
    expect(annualVolPct([0.01])).toBeNull()
  })
})

describe('betaOf', () => {
  it('beta của chỉ số với CHÍNH NÓ bằng 1 — phép kiểm bắt buộc của cả file', () => {
    expect(betaOf(thiTruong, thiTruong)).toBeCloseTo(1, 10)
  })

  it('nhân đôi mọi lợi suất thì beta bằng 2', () => {
    expect(betaOf(thiTruong.map((r) => r * 2), thiTruong)).toBeCloseTo(2, 10)
  })

  it('đi NGƯỢC thị trường thì beta âm', () => {
    expect(betaOf(thiTruong.map((r) => -r), thiTruong)).toBeCloseTo(-1, 10)
  })

  it('thị trường không dao động thì beta là null, không phải Infinity', () => {
    expect(betaOf([0.01, 0.02, 0.03], [0.005, 0.005, 0.005])).toBeNull()
  })

  it('hai chuỗi lệch độ dài thì null — ghép sai cặp là ra một con số trông rất thật', () => {
    expect(betaOf([0.01, 0.02], thiTruong)).toBeNull()
  })

  it('dưới ba cặp thì null — beta trên hai điểm là bịa', () => {
    expect(betaOf([0.01, 0.02], [0.01, 0.03])).toBeNull()
  })
})

describe('riskClassOf', () => {
  it('từ 20% trở lên là CAO', () => {
    expect(riskClassOf(20)).toBe('high')
    expect(riskClassOf(45.2)).toBe('high')
  })

  it('trên 10% tới dưới 20% là TRUNG BÌNH', () => {
    expect(riskClassOf(10.1)).toBe('mid')
    expect(riskClassOf(19.9)).toBe('mid')
  })

  it('từ 10% trở xuống là THẤP', () => {
    expect(riskClassOf(10)).toBe('low')
    expect(riskClassOf(0)).toBe('low')
  })
})

describe('sharpeOf', () => {
  it('(lợi nhuận năm − lãi suất không rủi ro) chia biến động', () => {
    expect(sharpeOf(20, 30, 5)).toBeCloseTo(0.5, 10)
  })

  it('mặc định dùng hằng số lãi suất không rủi ro của app', () => {
    expect(sharpeOf(RISK_FREE_ANNUAL_PCT, 20)).toBe(0)
  })

  it('biến động 0 hoặc thiếu thì null, không chia cho 0', () => {
    expect(sharpeOf(20, 0)).toBeNull()
    expect(sharpeOf(20, null)).toBeNull()
    expect(sharpeOf(null, 20)).toBeNull()
  })
})

describe('pairedReturns', () => {
  const ngay = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08']

  it('ghép lợi suất theo ĐÚNG cặp ngày liền nhau', () => {
    const a = new Map([
      ['2026-01-05', 100],
      ['2026-01-06', 110],
      ['2026-01-07', 121],
    ])
    const b = new Map([
      ['2026-01-05', 200],
      ['2026-01-06', 210],
      ['2026-01-07', 220.5],
    ])
    const r = pairedReturns(a, b, ngay)
    expect(r.asset.map((x) => Math.round(x * 1000) / 1000)).toEqual([0.1, 0.1])
    expect(r.market.map((x) => Math.round(x * 1000) / 1000)).toEqual([0.05, 0.05])
  })

  it('phiên mà MỘT bên thiếu bar thì nhảy qua, và cặp sau nối từ phiên có thật', () => {
    const a = new Map([
      ['2026-01-05', 100],
      // 06 mã tạm ngừng giao dịch
      ['2026-01-07', 121],
    ])
    const b = new Map([
      ['2026-01-05', 200],
      ['2026-01-06', 210],
      ['2026-01-07', 220.5],
    ])
    const r = pairedReturns(a, b, ngay)
    // Một cặp duy nhất: 05 → 07, và thị trường cũng phải đo trên đúng 05 → 07
    expect(r.asset).toHaveLength(1)
    expect(r.asset[0]).toBeCloseTo(0.21, 10)
    expect(r.market[0]).toBeCloseTo(0.1025, 10)
  })

  it('luôn trả hai chuỗi CÙNG độ dài — đây là điều kiện để beta có nghĩa', () => {
    const a = new Map([['2026-01-05', 100], ['2026-01-08', 120]])
    const b = new Map([['2026-01-05', 200], ['2026-01-06', 210], ['2026-01-08', 230]])
    const r = pairedReturns(a, b, ngay)
    expect(r.asset.length).toBe(r.market.length)
  })

  it('giá 0 hoặc âm thì bỏ cặp đó, không chia cho 0', () => {
    const a = new Map([['2026-01-05', 0], ['2026-01-06', 110]])
    const b = new Map([['2026-01-05', 200], ['2026-01-06', 210]])
    expect(pairedReturns(a, b, ngay).asset).toEqual([])
  })
})

describe('portfolioRisk', () => {
  /** Sinh chuỗi giá từ chuỗi lợi suất, bắt đầu ở 100. */
  const chuoiGia = (dates: string[], rs: number[]) => {
    const m = new Map<string, number>()
    let v = 100
    m.set(dates[0], v)
    rs.forEach((r, i) => {
      v = v * (1 + r)
      m.set(dates[i + 1], v)
    })
    return m
  }

  const ngay = Array.from({ length: 11 }, (_, i) => `2026-01-${String(i + 5).padStart(2, '0')}`)
  const chiSo = chuoiGia(ngay, thiTruong)

  const chay = (over: Partial<Parameters<typeof portfolioRisk>[0]> = {}) =>
    portfolioRisk({
      positions: [{ symbol: 'A', weight: 1 }],
      prices: new Map([['A', chuoiGia(ngay, thiTruong.map((r) => r * 2))]]),
      index: chiSo,
      sessions: ngay,
      annualReturnPct: 20,
      portfolioReturns: thiTruong.map((r) => r * 2),
      ...over,
    })

  it('beta từng mã tính được, và mã đi gấp đôi thị trường ra beta 2', () => {
    const r = chay()
    expect(r.bySymbol[0].beta).toBeCloseTo(2, 6)
  })

  it('beta danh mục là TRUNG BÌNH GIA QUYỀN theo tỷ trọng, không phải trung bình trơn', () => {
    const r = chay({
      positions: [
        { symbol: 'A', weight: 0.75 },
        { symbol: 'B', weight: 0.25 },
      ],
      prices: new Map([
        ['A', chuoiGia(ngay, thiTruong.map((x) => x * 2))],
        ['B', chuoiGia(ngay, thiTruong.map((x) => x * 0.5))],
      ]),
    })
    // 0,75 × 2 + 0,25 × 0,5 = 1,625
    expect(r.beta).toBeCloseTo(1.625, 6)
  })

  it('mã thiếu lịch sử giá bị loại khỏi beta danh mục, và cờ partial bật', () => {
    const r = chay({
      positions: [
        { symbol: 'A', weight: 0.5 },
        { symbol: 'KHONGCO', weight: 0.5 },
      ],
    })
    expect(r.bySymbol.find((s) => s.symbol === 'KHONGCO')?.beta).toBeNull()
    expect(r.beta).toBeCloseTo(2, 6) // chỉ còn A, chuẩn hoá lại theo tỷ trọng còn lại
    expect(r.partial).toBe(true)
  })

  it('phân loại rủi ro cộng lại đúng 100% phần đã phân loại được', () => {
    const r = chay()
    const tong = r.breakdown.low + r.breakdown.mid + r.breakdown.high
    expect(tong).toBeCloseTo(1, 10)
  })

  it('Sharpe dùng biến động của CHÍNH danh mục, không phải của một mã', () => {
    const r = chay()
    expect(r.volPct).toBeCloseTo(annualVolPct(thiTruong.map((x) => x * 2))!, 10)
    expect(r.sharpe).toBeCloseTo(sharpeOf(20, r.volPct)!, 10)
  })

  it('danh mục rỗng thì mọi con số là null, không phải 0', () => {
    const r = chay({ positions: [], prices: new Map(), portfolioReturns: [] })
    expect([r.beta, r.volPct, r.sharpe]).toEqual([null, null, null])
    expect(r.bySymbol).toEqual([])
  })

  it('không có chỉ số thì không có beta nào — nhưng biến động vẫn tính được', () => {
    const r = chay({ index: new Map() })
    expect(r.beta).toBeNull()
    expect(r.volPct).not.toBeNull()
  })

  it('sắp theo beta GIẢM DẦN, mã chưa tính được xuống cuối', () => {
    const r = chay({
      positions: [
        { symbol: 'KHONGCO', weight: 0.2 },
        { symbol: 'A', weight: 0.4 },
        { symbol: 'B', weight: 0.4 },
      ],
      prices: new Map([
        ['A', chuoiGia(ngay, thiTruong.map((x) => x * 0.5))],
        ['B', chuoiGia(ngay, thiTruong.map((x) => x * 2))],
      ]),
    })
    expect(r.bySymbol.map((s) => s.symbol)).toEqual(['B', 'A', 'KHONGCO'])
  })
})
