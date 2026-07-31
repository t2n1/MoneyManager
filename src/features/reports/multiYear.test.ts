import { describe, it, expect } from 'vitest'
import { monthKeysOf, seasonality, yearSpan, yearlyTotals, multiYearInsights } from './multiYear'
import type { MonthlySeries } from './aggregate'
import type { TransactionRow } from '../../types/database.types'

/** Chuỗi tháng gọn: mỗi phần tử [năm, tháng, thu, chi]. */
function series(rows: [number, number, number, number][]): MonthlySeries {
  return {
    points: rows.map(([year, month, income, expense]) => ({
      key: { year, month },
      income,
      expense,
    })),
    hasMissingRate: false,
  }
}

/** 12 tháng của một năm với cùng một mức chi (và thu) — nền để lệch đi một tháng. */
function fullYear(year: number, expense: number, income = 0): [number, number, number, number][] {
  return Array.from({ length: 12 }, (_, i) => [year, i + 1, income, expense])
}

describe('yearSpan', () => {
  it('lấy năm nhỏ nhất và lớn nhất có giao dịch', () => {
    expect(yearSpan(['2019-03-05', '2017-11-30', '2026-07-01'])).toEqual({ from: 2017, to: 2026 })
  })

  it('không có giao dịch -> null (không đoán khoảng)', () => {
    expect(yearSpan([])).toBeNull()
  })
})

describe('monthKeysOf', () => {
  const tx = (occurred_on: string) => ({ occurred_on }) as TransactionRow

  it('chỉ trả tháng CÓ giao dịch, sắp tăng dần, không trùng', () => {
    const keys = monthKeysOf([tx('2024-03-05'), tx('2019-11-01'), tx('2024-03-28')], 1)
    expect(keys).toEqual([
      { year: 2019, month: 11 },
      { year: 2024, month: 3 },
    ])
  })

  it('tôn trọng month_start_day: ngày TRƯỚC mốc thuộc tháng trước', () => {
    // Mốc 25 -> "tháng 3" là 25/3–24/4. Ngày 28/3 vẫn là tháng 3; ngày 20/3 là tháng 2.
    expect(monthKeysOf([tx('2024-03-28')], 25)).toEqual([{ year: 2024, month: 3 }])
    expect(monthKeysOf([tx('2024-03-20')], 25)).toEqual([{ year: 2024, month: 2 }])
  })

  it('sổ trống -> mảng rỗng', () => {
    expect(monthKeysOf([], 1)).toEqual([])
  })
})

describe('yearlyTotals', () => {
  it('gộp 12 tháng thành một dòng năm, tính số dư và tỷ lệ tiết kiệm', () => {
    const rows = yearlyTotals(series([...fullYear(2024, 100, 200)]))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      year: 2024,
      income: 2400,
      expense: 1200,
      net: 1200,
      months: 12,
    })
    expect(rows[0].savingsRateBps).toBe(5000) // (2400-1200)/2400 = 50%
  })

  it('thu = 0 -> tỷ lệ tiết kiệm là null, KHÔNG phải 0% hay -Vô cực', () => {
    expect(yearlyTotals(series([[2024, 1, 0, 500]]))[0].savingsRateBps).toBeNull()
  })

  it('đếm số tháng CÓ dữ liệu, để biết năm nào chỉ ghi một phần', () => {
    const rows = yearlyTotals(
      series([
        [2017, 11, 0, 100],
        [2017, 12, 0, 100],
        [2018, 1, 0, 100],
        ...fullYear(2018, 100).slice(1),
      ]),
    )
    expect(rows.find((r) => r.year === 2017)?.months).toBe(2)
    expect(rows.find((r) => r.year === 2018)?.months).toBe(12)
  })

  it('tháng rỗng (0 thu 0 chi) không được tính là tháng có dữ liệu', () => {
    const rows = yearlyTotals(
      series([
        [2024, 1, 0, 500],
        [2024, 2, 0, 0],
      ]),
    )
    expect(rows[0].months).toBe(1)
  })

  it('sắp theo năm tăng dần', () => {
    const rows = yearlyTotals(series([...fullYear(2025, 10), ...fullYear(2019, 10)]))
    expect(rows.map((r) => r.year)).toEqual([2019, 2025])
  })
})

describe('seasonality', () => {
  it('không có năm nào đủ 12 tháng -> không tính, nêu lý do', () => {
    const s = seasonality(series([[2026, 1, 0, 100]]))
    expect(s.months).toHaveLength(0)
    expect(s.yearsUsed).toEqual([])
    expect(s.reason).toMatch(/đủ 12 tháng/i)
  })

  it('chỉ dùng những năm ĐỦ 12 tháng — năm ghi một phần làm lệch trung bình', () => {
    const s = seasonality(
      series([
        ...fullYear(2024, 100),
        [2025, 1, 0, 9999], // năm 2025 mới có 1 tháng
      ]),
    )
    expect(s.yearsUsed).toEqual([2024])
  })

  it('chi đều 12 tháng -> mọi tháng chỉ số 100', () => {
    const s = seasonality(series(fullYear(2024, 100)))
    expect(s.months.map((m) => m.indexPct)).toEqual(Array.from({ length: 12 }, () => 100))
  })

  it('tháng 12 chi gấp đôi -> chỉ số tháng 12 cao nhất và > 100', () => {
    const rows = fullYear(2024, 100)
    rows[11] = [2024, 12, 0, 200]
    const s = seasonality(series(rows))
    const dec = s.months.find((m) => m.month === 12)!
    expect(dec.indexPct).toBeGreaterThan(100)
    expect(s.peak?.month).toBe(12)
    expect(s.trough?.indexPct).toBeLessThan(100)
  })

  it('dùng TỶ TRỌNG trong năm, nên mức chi tăng theo thời gian không làm lệch', () => {
    // 2019 chi 100/tháng, 2024 chi 1000/tháng; cùng hình dạng: tháng 12 gấp đôi.
    const a = fullYear(2019, 100)
    a[11] = [2019, 12, 0, 200]
    const b = fullYear(2024, 1000)
    b[11] = [2024, 12, 0, 2000]
    const s = seasonality(series([...a, ...b]))
    expect(s.yearsUsed).toEqual([2019, 2024])
    const dec = s.months.find((m) => m.month === 12)!
    // Tỷ trọng tháng 12 giống nhau ở cả hai năm -> chỉ số ổn định, không bị 2024 lấn.
    expect(dec.indexPct).toBeCloseTo((200 / 1300) * 12 * 100, 6)
  })

  it('năm chi 0 đồng không được chia cho 0', () => {
    const s = seasonality(series(fullYear(2024, 0)))
    expect(s.yearsUsed).toEqual([])
    expect(s.months).toHaveLength(0)
  })
})

describe('multiYearInsights', () => {
  it('nêu năm chi cao nhất và so năm gần nhất với năm trước', () => {
    const rows = yearlyTotals(series([...fullYear(2023, 100, 300), ...fullYear(2024, 200, 300)]))
    const lines = multiYearInsights(rows)
    expect(lines.join(' ')).toMatch(/2024/)
    expect(lines.join(' ')).toMatch(/tăng/i)
  })

  it('ít hơn 2 năm -> không bịa so sánh', () => {
    expect(multiYearInsights(yearlyTotals(series(fullYear(2024, 100))))).toEqual([])
  })
})
