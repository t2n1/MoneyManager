// Sáu cú sốc của khối "Stress test" (`LifetimeInput.stress`).
//
// Mỗi phép thử so bản CÓ sốc với bản KHÔNG sốc trên cùng một input, thay vì ghim số
// tuyệt đối: engine còn làm tròn ở ba chỗ (quy đổi, lạm phát, sinh lời) nên một con số
// ghim cứng sẽ đỏ vì lý do không liên quan tới cú sốc, và lúc đó không ai đọc ra được
// phép thử đang canh cái gì.
import { describe, expect, it } from 'vitest'
import {
  hasStress,
  NO_STRESS,
  projectLifetime,
  STRESS_ILLNESS_EVENT_ID,
  type LifetimeInput,
  type StressConfig,
} from './project'

function inputOf(stress?: StressConfig): LifetimeInput {
  return {
    currentYear: 2026,
    birthYear: 1994,
    endAge: 90,
    displayCurrency: 'JPY',
    startingAssetsMinor: 10_000_000,
    realReturnBps: 300,
    bandSpreadBps: 100,
    inflationBps: 200,
    nominalTerms: false,
    phases: [
      {
        startYear: 2026,
        label: 'Nhật',
        country: 'JP',
        currency: 'JPY',
        annualIncomeMinor: 6_000_000,
        annualExpenseMinor: 4_000_000,
        fxToDisplay: 1,
      },
    ],
    events: [],
    ...(stress ? { stress } : {}),
  }
}

const on = (over: Partial<StressConfig>): StressConfig => ({ ...NO_STRESS, ...over })

const yearOf = (rows: ReturnType<typeof projectLifetime>, year: number) =>
  rows.find((r) => r.year === year)

describe('hasStress', () => {
  it('null / undefined / không cú sốc nào bật đều là không', () => {
    expect(hasStress(null)).toBe(false)
    expect(hasStress(undefined)).toBe(false)
    expect(hasStress(NO_STRESS)).toBe(false)
  })

  it('bật một cái là có', () => {
    expect(hasStress(on({ jobloss: { on: true, year: 2030 } }))).toBe(true)
  })
})

describe('projectLifetime — không cú sốc nào bật', () => {
  it('cho ra ĐÚNG bản chiếu như khi không truyền `stress`', () => {
    // Đây là phép thử quan trọng nhất của cả file: `stress` là field tuỳ chọn thêm vào
    // một hàm mà bộ luật thông báo (và bundle `_rules.js` phía server) đang gọi.
    expect(projectLifetime(inputOf(NO_STRESS))).toEqual(projectLifetime(inputOf()))
  })
})

describe('cú sốc mất việc', () => {
  it('thu về 0 đúng một năm, năm sau trở lại như cũ', () => {
    const rows = projectLifetime(inputOf(on({ jobloss: { on: true, year: 2030 } })))
    expect(yearOf(rows, 2030)?.incomeMinor).toBe(0)
    expect(yearOf(rows, 2031)?.incomeMinor).toBe(6_000_000)
  })
})

describe('cú sốc giảm thu', () => {
  it('cắt vĩnh viễn từ năm đã chọn', () => {
    const rows = projectLifetime(
      inputOf(on({ paycut: { on: true, year: 2030, cutPct: 30 } })),
    )
    expect(yearOf(rows, 2029)?.incomeMinor).toBe(6_000_000)
    expect(yearOf(rows, 2030)?.incomeMinor).toBe(4_200_000)
    expect(yearOf(rows, 2050)?.incomeMinor).toBe(4_200_000)
  })

  it('mất việc thắng giảm thu trong đúng năm mất việc', () => {
    const rows = projectLifetime(
      inputOf(
        on({
          jobloss: { on: true, year: 2030 },
          paycut: { on: true, year: 2028, cutPct: 30 },
        }),
      ),
    )
    expect(yearOf(rows, 2030)?.incomeMinor).toBe(0)
    expect(yearOf(rows, 2031)?.incomeMinor).toBe(4_200_000)
  })
})

describe('cú sốc bệnh nặng', () => {
  it('thêm MỘT dòng sự kiện có tên, đúng một năm', () => {
    const rows = projectLifetime(
      inputOf(on({ illness: { on: true, year: 2035, amountDisplayMinor: 3_000_000 } })),
    )
    const hit = yearOf(rows, 2035)
    expect(hit?.events).toHaveLength(1)
    expect(hit?.events[0].id).toBe(STRESS_ILLNESS_EVENT_ID)
    expect(hit?.events[0].amountDisplayMinor).toBe(3_000_000)
    expect(yearOf(rows, 2036)?.events).toHaveLength(0)
  })

  it('KHÔNG cộng vào chi nền — ngưỡng FIRE (25× chi) không được nhảy vọt một năm', () => {
    const rows = projectLifetime(
      inputOf(on({ illness: { on: true, year: 2035, amountDisplayMinor: 3_000_000 } })),
    )
    expect(yearOf(rows, 2035)?.expenseMinor).toBe(4_000_000)
  })

  it('rút tài sản cuối năm xuống đúng khoản đã chi', () => {
    const base = projectLifetime(inputOf())
    const hit = projectLifetime(
      inputOf(on({ illness: { on: true, year: 2035, amountDisplayMinor: 3_000_000 } })),
    )
    const d = (yearOf(base, 2035)?.assetsEndMinor ?? 0) - (yearOf(hit, 2035)?.assetsEndMinor ?? 0)
    expect(d).toBe(3_000_000)
  })
})

describe('cú sốc khủng hoảng', () => {
  it('cắt tài sản TRƯỚC khi sinh lời và trước khi cộng dòng tiền', () => {
    const rows = projectLifetime(
      inputOf(on({ crash: { on: true, year: 2027, dropPct: 20 } })),
    )
    const truoc = yearOf(rows, 2026)?.assetsEndMinor ?? 0
    const sau = yearOf(rows, 2027)?.assetsEndMinor ?? 0
    // (số dư cuối 2026 × 0,8) × 1,03 + 2.000.000 để dành
    expect(sau).toBe(Math.round(Math.round(truoc * 0.8) * 1.03) + 2_000_000)
  })
})

describe('cú sốc suy thoái', () => {
  it('lợi suất về 0 trong đúng số năm đã chọn, cả ba nhánh', () => {
    const rows = projectLifetime(
      inputOf(on({ recession: { on: true, year: 2030, years: 3 } })),
    )
    for (const y of [2030, 2031, 2032]) {
      const truoc = yearOf(rows, y - 1)
      const nay = yearOf(rows, y)
      expect(nay?.assetsEndMinor).toBe((truoc?.assetsEndMinor ?? 0) + 2_000_000)
      // Ba nhánh chạy cùng lợi suất 0 nên dải KHÔNG nở thêm trong cửa sổ này.
      expect((nay?.assetsOptimisticMinor ?? 0) - (nay?.assetsPessimisticMinor ?? 0)).toBe(
        (truoc?.assetsOptimisticMinor ?? 0) - (truoc?.assetsPessimisticMinor ?? 0),
      )
    }
    // Năm liền sau cửa sổ đã sinh lời trở lại.
    expect(yearOf(rows, 2033)?.assetsEndMinor).toBeGreaterThan(
      (yearOf(rows, 2032)?.assetsEndMinor ?? 0) + 2_000_000,
    )
  })
})

describe('cú sốc sống thọ hơn dự tính', () => {
  it('chiếu thêm đúng số năm, không đụng endAge của kịch bản', () => {
    const base = projectLifetime(inputOf())
    const rows = projectLifetime(inputOf(on({ longevity: { on: true, years: 10 } })))
    expect(rows).toHaveLength(base.length + 10)
    expect(rows[rows.length - 1].age).toBe(100)
  })
})
