import { describe, expect, it } from 'vitest'
import { buildInsights, detectAnomalies, forecastMonthEnd, median, savingsRate } from './insights'
import type { TransactionRow } from '../../types/database.types'
import type { Rates } from '../../lib/rates'
import type { CurrencyCode } from '../../lib/money'

describe('savingsRate', () => {
  it('thu > chi → dương', () => expect(savingsRate(1000, 400)).toBeCloseTo(0.6))
  it('chi > thu → âm', () => expect(savingsRate(400, 1000)).toBeCloseTo(-1.5))
  it('income = 0 → null', () => expect(savingsRate(0, 100)).toBeNull())
  it('income âm → null', () => expect(savingsRate(-10, 100)).toBeNull())
})

describe('buildInsights', () => {
  const fmt = (m: number) => `¥${m}`
  it('có tháng trước → câu so sánh đúng chiều + câu tỷ trọng', () => {
    const out = buildInsights(
      {
        expenseThis: 1200,
        expensePrev: 1000,
        topCategoryName: 'Ăn uống',
        topCategoryAmount: 600,
        expenseTotal: 1200,
      },
      fmt,
    )
    expect(out.some((i) => i.text.includes('nhiều hơn tháng trước 20%'))).toBe(true)
    expect(out.some((i) => i.text.includes('Ăn uống') && i.text.includes('50%'))).toBe(true)
  })
  it('chi giảm → "ít hơn"', () => {
    const out = buildInsights(
      { expenseThis: 800, expensePrev: 1000, topCategoryName: null, topCategoryAmount: 0, expenseTotal: 0 },
      fmt,
    )
    expect(out.some((i) => i.text.includes('ít hơn tháng trước 20%'))).toBe(true)
  })
  // Cùng quy tắc với câu tổng trang Báo cáo (headline.ts): từ 200% trở lên thì đọc
  // theo SỐ LẦN — "+970%" đúng số học nhưng não không quy được ra cái gì.
  it('tăng từ 200% trở lên → đọc "gấp X lần", không đọc phần trăm', () => {
    const out = buildInsights(
      { expenseThis: 10_700, expensePrev: 1000, topCategoryName: null, topCategoryAmount: 0, expenseTotal: 0 },
      fmt,
    )
    expect(out.some((i) => i.text.includes('gấp 10,7 lần tháng trước'))).toBe(true)
    expect(out.some((i) => i.text.includes('%'))).toBe(false)
  })
  it('bằng đúng tháng trước → "ngang tháng trước", không phải "+0%"', () => {
    const out = buildInsights(
      { expenseThis: 1000, expensePrev: 1000, topCategoryName: null, topCategoryAmount: 0, expenseTotal: 0 },
      fmt,
    )
    expect(out.some((i) => i.text.includes('ngang tháng trước'))).toBe(true)
  })
  it('tháng trước = 0 → bỏ câu so sánh', () => {
    const out = buildInsights(
      {
        expenseThis: 1200,
        expensePrev: 0,
        topCategoryName: 'Ăn uống',
        topCategoryAmount: 600,
        expenseTotal: 1200,
      },
      fmt,
    )
    expect(out.some((i) => i.text.includes('so với tháng trước'))).toBe(false)
  })
  it('không chi → mảng rỗng', () => {
    const out = buildInsights(
      { expenseThis: 0, expensePrev: 0, topCategoryName: null, topCategoryAmount: 0, expenseTotal: 0 },
      fmt,
    )
    expect(out).toEqual([])
  })
})

describe('forecastMonthEnd', () => {
  it('nội suy giữa tháng: chi 10.000 sau 10/30 ngày → 30.000', () => {
    expect(forecastMonthEnd(10_000, 10, 30)?.projected).toBe(30_000)
  })
  it('daysElapsed = 0 → null', () => expect(forecastMonthEnd(5_000, 0, 30)).toBeNull())
  it('daysInMonth = 0 → null', () => expect(forecastMonthEnd(5_000, 5, 0)).toBeNull())
  it('hết tháng → projected ≈ spentSoFar', () => {
    expect(forecastMonthEnd(30_000, 30, 30)?.projected).toBe(30_000)
  })

  describe('khoảng dự báo', () => {
    it('không truyền chi từng ngày → khoảng thu về đúng một điểm', () => {
      const f = forecastMonthEnd(10_000, 10, 30)
      expect(f?.low).toBe(f?.projected)
      expect(f?.high).toBe(f?.projected)
      expect(f?.hasRange).toBe(false)
    })

    it('chi giống hệt nhau mọi ngày → không có gì để nói về độ chênh, thu về một điểm', () => {
      const yHet = Array.from({ length: 10 }, () => 1_000)
      const f = forecastMonthEnd(10_000, 10, 30, yHet)
      expect(f?.hasRange).toBe(false)
      expect(f?.low).toBe(f?.projected)
    })

    it('chi gần đều → có khoảng nhưng hẹp', () => {
      const ganDeu = [980, 1_020, 1_000, 990, 1_010, 1_000, 995, 1_005, 1_000, 1_000]
      const f = forecastMonthEnd(10_000, 10, 30, ganDeu)
      expect(f?.hasRange).toBe(true)
      expect(f!.high - f!.low).toBeLessThan(f!.projected * 0.05)
    })

    it('chi lúc nhiều lúc ít → khoảng rộng hẳn ra', () => {
      const lechNhau = [0, 0, 9_000, 0, 0, 9_000, 0, 0, 0, 2_000]
      const deu = Array.from({ length: 10 }, () => 2_000)
      const fLech = forecastMonthEnd(20_000, 10, 30, lechNhau)
      const fDeu = forecastMonthEnd(20_000, 10, 30, deu)
      expect(fLech!.high - fLech!.low).toBeGreaterThan(fDeu!.high - fDeu!.low)
    })

    it('khoảng luôn ôm lấy con số dự báo', () => {
      const f = forecastMonthEnd(20_000, 10, 30, [0, 0, 9_000, 0, 0, 9_000, 0, 0, 0, 2_000])
      expect(f!.low).toBeLessThanOrEqual(f!.projected)
      expect(f!.high).toBeGreaterThanOrEqual(f!.projected)
    })

    it('cận dưới không bao giờ thấp hơn số ĐÃ chi — tiền tiêu rồi không lấy lại được', () => {
      const f = forecastMonthEnd(20_000, 10, 30, [20_000, 0, 0, 0, 0, 0, 0, 0, 0, 0])
      expect(f!.low).toBeGreaterThanOrEqual(20_000)
    })

    it('ngày cuối tháng → hết ngày để đoán, khoảng đóng lại', () => {
      const f = forecastMonthEnd(30_000, 30, 30, Array.from({ length: 30 }, () => 1_000))
      expect(f?.low).toBe(f?.high)
      expect(f?.hasRange).toBe(false)
    })

    it('số ngày truyền vào lệch với daysElapsed → vẫn tính, không ném lỗi', () => {
      expect(forecastMonthEnd(10_000, 10, 30, [1_000, 1_000])?.projected).toBe(30_000)
    })
  })

  describe('tách khoản cố định (fixedSoFar)', () => {
    it('tiền nhà trả đầu tháng không bị nhân theo ngày — chỉ nội suy phần biến đổi', () => {
      // 74.000 sau 6/30 ngày, trong đó 68.000 là tiền nhà (cố định)
      // → 68.000 + (6.000/6)×30 = 98.000, KHÔNG phải 370.000 như nội suy trơn
      expect(forecastMonthEnd(74_000, 6, 30, undefined, 68_000)?.projected).toBe(98_000)
    })
    it('không truyền fixedSoFar → nguyên hành vi cũ', () => {
      expect(forecastMonthEnd(74_000, 6, 30)?.projected).toBe(370_000)
    })
    it('toàn bộ là cố định → dự báo đúng bằng số đã chi', () => {
      expect(forecastMonthEnd(68_000, 6, 30, undefined, 68_000)?.projected).toBe(68_000)
    })
    it('fixedSoFar lớn hơn spentSoFar (dữ liệu lệch) → kẹp lại, dự báo = số đã chi', () => {
      expect(forecastMonthEnd(50_000, 5, 30, undefined, 60_000)?.projected).toBe(50_000)
    })
    it('cận dưới của khoảng vẫn không thấp hơn số đã chi', () => {
      const f = forecastMonthEnd(74_000, 6, 30, [1_000, 1_000, 1_000, 1_000, 1_000, 1_000], 68_000)
      expect(f!.low).toBeGreaterThanOrEqual(74_000)
    })
  })
})

const RATES: Rates = { JPY: 1, VND: 165, USD: 0.0065 }
const currencyOf = (id: string): CurrencyCode => (id === 'vnd' ? 'VND' : 'JPY')
let aseq = 0
const etx = (amount: number, category_id: string | null, extra: Partial<TransactionRow> = {}): TransactionRow => ({
  id: `a${aseq++}`,
  user_id: 'u',
  type: 'expense',
  amount,
  to_amount: null,
  category_id,
  account_id: 'jpy',
  to_account_id: null,
  recurring_rule_id: null,
  occurred_on: '2026-07-10',
  note: '',
  created_at: '',
  updated_at: '',
  ...extra,
})

describe('median', () => {
  it('lẻ', () => expect(median([3, 1, 2])).toBe(2))
  it('chẵn', () => expect(median([1, 2, 3, 4])).toBe(2.5))
  it('rỗng → 0', () => expect(median([])).toBe(0))
})

describe('detectAnomalies (base = JPY)', () => {
  it('khoản ≥3× trung vị bị gắn cờ; danh mục < minSamples bị bỏ', () => {
    const history = [
      etx(1000, 'shop'), etx(1000, 'shop'), etx(1000, 'shop'), etx(1000, 'shop'), etx(1000, 'shop'),
      etx(500, 'food'), etx(500, 'food'), etx(500, 'food'), // chỉ 3 mẫu
    ]
    const current = [
      etx(5000, 'shop'), // 5× median 1000 → bất thường
      etx(1200, 'shop'), // 1.2× → không
      etx(9000, 'food'), // food < 5 mẫu → bỏ qua
    ]
    const r = detectAnomalies(current, history, currencyOf, 'JPY', RATES)
    expect(r.anomalies.map((a) => a.transactionId)).toEqual([current[0].id])
    expect(r.anomalies[0].ratio).toBeCloseTo(5)
    expect(r.hasMissingRate).toBe(false)
  })
  it('sắp theo ratio giảm dần', () => {
    const history = Array.from({ length: 5 }, () => etx(1000, 'shop'))
    const current = [etx(3000, 'shop'), etx(6000, 'shop')]
    const r = detectAnomalies(current, history, currencyOf, 'JPY', RATES)
    expect(r.anomalies.map((a) => Math.round(a.ratio))).toEqual([6, 3])
  })
  it('thiếu tỷ giá ở khoản hiện tại → cờ hasMissingRate, không gắn bất thường', () => {
    const history = Array.from({ length: 5 }, () => etx(1000, 'shop'))
    const current = [etx(1_000_000, 'shop', { account_id: 'vnd' })]
    const r = detectAnomalies(current, history, currencyOf, 'JPY', { JPY: 1 })
    expect(r.hasMissingRate).toBe(true)
    expect(r.anomalies).toEqual([])
  })
})
