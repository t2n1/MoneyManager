import { describe, expect, it } from 'vitest'
import {
  assetsAtAge,
  compareAtEnd,
  fireYear,
  firstNegativeYear,
  minimumReturnBps,
} from './insights'
import { projectLifetime, type LifetimeInput, type YearRow } from './project'

function rowsOf(over: Partial<LifetimeInput> = {}): YearRow[] {
  return projectLifetime({
    currentYear: 2026,
    birthYear: 1994,
    endAge: 90,
    displayCurrency: 'JPY',
    startingAssetsMinor: 10_000_000,
    realReturnBps: 200,
    bandSpreadBps: 150,
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
    ...over,
  })
}

describe('firstNegativeYear', () => {
  it('trả null khi không năm nào âm', () => {
    expect(firstNegativeYear(rowsOf(), 'center')).toBeNull()
  })

  it('trả năm đầu tiên tài sản xuống dưới 0', () => {
    const rows = rowsOf({
      startingAssetsMinor: 0,
      realReturnBps: 0,
      bandSpreadBps: 0,
      phases: [
        {
          startYear: 2026,
          label: 'Nhật',
          country: 'JP',
          currency: 'JPY',
          annualIncomeMinor: 1_000_000,
          annualExpenseMinor: 2_000_000,
          fxToDisplay: 1,
        },
      ],
    })
    expect(firstNegativeYear(rows, 'center')).toBe(2026)
  })

  it('biên dưới của dải âm sớm hơn nhánh trung tâm', () => {
    // Nghỉ hưu ngay: không thu, chi đều, tài sản tụt dần. Biên dưới tụt nhanh hơn.
    const rows = rowsOf({
      startingAssetsMinor: 50_000_000,
      realReturnBps: 200,
      bandSpreadBps: 400,
      phases: [
        {
          startYear: 2026,
          label: 'Nghỉ',
          country: 'JP',
          currency: 'JPY',
          annualIncomeMinor: 0,
          annualExpenseMinor: 3_000_000,
          fxToDisplay: 1,
        },
      ],
    })
    const low = firstNegativeYear(rows, 'low')
    const center = firstNegativeYear(rows, 'center')
    expect(low).not.toBeNull()
    expect(center).not.toBeNull()
    expect(low!).toBeLessThan(center!)
  })
})

describe('fireYear', () => {
  it('trả năm đầu tiên tài sản × 4% đủ trả chi phí năm', () => {
    // chi 4.000.000/năm → cần 100.000.000 tài sản
    const rows = rowsOf()
    const y = fireYear(rows)
    expect(y).not.toBeNull()
    const row = rows.find((r) => r.year === y)!
    expect(row.assetsEndMinor * 0.04).toBeGreaterThanOrEqual(row.expenseMinor)
    const prev = rows.find((r) => r.year === y! - 1)
    if (prev) expect(prev.assetsEndMinor * 0.04).toBeLessThan(prev.expenseMinor)
  })

  it('trả null khi không bao giờ đạt', () => {
    const rows = rowsOf({
      startingAssetsMinor: 0,
      realReturnBps: 0,
      bandSpreadBps: 0,
      phases: [
        {
          startYear: 2026,
          label: 'Nhật',
          country: 'JP',
          currency: 'JPY',
          annualIncomeMinor: 4_000_000,
          annualExpenseMinor: 4_000_000,
          fxToDisplay: 1,
        },
      ],
    })
    expect(fireYear(rows)).toBeNull()
  })
})

describe('assetsAtAge', () => {
  it('trả cả ba nhánh tại đúng tuổi', () => {
    const rows = rowsOf()
    const at65 = assetsAtAge(rows, 65)
    expect(at65).not.toBeNull()
    expect(at65!.low).toBeLessThan(at65!.center)
    expect(at65!.center).toBeLessThan(at65!.high)
  })

  it('trả null khi tuổi nằm ngoài bản chiếu', () => {
    expect(assetsAtAge(rowsOf(), 200)).toBeNull()
  })
})

describe('minimumReturnBps', () => {
  it('trả 0 khi kịch bản không âm dù lợi suất bằng 0', () => {
    const input: LifetimeInput = {
      currentYear: 2026,
      birthYear: 1994,
      endAge: 90,
      displayCurrency: 'JPY',
      startingAssetsMinor: 10_000_000,
      realReturnBps: 200,
      bandSpreadBps: 0,
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
    }
    expect(minimumReturnBps(input)).toBe(0)
  })

  it('trả null khi lợi suất cao nhất cũng không cứu được', () => {
    const input: LifetimeInput = {
      currentYear: 2026,
      birthYear: 1994,
      endAge: 90,
      displayCurrency: 'JPY',
      startingAssetsMinor: 0,
      realReturnBps: 200,
      bandSpreadBps: 0,
      inflationBps: 200,
      nominalTerms: false,
      phases: [
        {
          startYear: 2026,
          label: 'Nhật',
          country: 'JP',
          currency: 'JPY',
          annualIncomeMinor: 0,
          annualExpenseMinor: 4_000_000,
          fxToDisplay: 1,
        },
      ],
      events: [],
    }
    // Tài sản khởi điểm 0 thì nhân bao nhiêu cũng bằng 0 → năm đầu đã âm.
    expect(minimumReturnBps(input)).toBeNull()
  })
})

describe('compareAtEnd', () => {
  it('trả hiệu tài sản cuối của hai bản chiếu', () => {
    const a = rowsOf()
    const b = rowsOf({ startingAssetsMinor: 20_000_000 })
    const diff = compareAtEnd(a, b)
    expect(diff).not.toBeNull()
    expect(diff!).toBeLessThan(0)
  })

  it('trả null nếu một bên rỗng', () => {
    expect(compareAtEnd(rowsOf(), [])).toBeNull()
  })
})
