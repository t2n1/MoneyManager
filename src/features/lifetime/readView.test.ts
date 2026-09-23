import { describe, expect, it } from 'vitest'
import { phaseDigest } from './readView'
import { projectLifetime, type LifetimeInput, type LifetimePhase } from './project'

function phase(over: Partial<LifetimePhase> = {}): LifetimePhase {
  return {
    startYear: 2026,
    label: 'Nhật',
    country: 'JP',
    currency: 'JPY',
    annualIncomeMinor: 6_000_000,
    annualExpenseMinor: 4_000_000,
    fxToDisplay: 1,
    ...over,
  }
}

function inputOf(over: Partial<LifetimeInput> = {}): LifetimeInput {
  return {
    currentYear: 2026,
    birthYear: 1994,
    endAge: 70,
    displayCurrency: 'JPY',
    startingAssetsMinor: 10_000_000,
    realReturnBps: 200,
    bandSpreadBps: 150,
    inflationBps: 200,
    nominalTerms: false,
    phases: [phase()],
    events: [],
    ...over,
  }
}

describe('phaseDigest', () => {
  it('một chặng: chạy từ năm bắt đầu tới hết bản chiếu, thu/chi đọc từ bản chiếu', () => {
    const input = inputOf()
    const out = phaseDigest(input, projectLifetime(input))
    expect(out).toEqual([
      { label: 'Nhật', start: 2026, end: null, incomeMinor: 6_000_000, expenseMinor: 4_000_000 },
    ])
  })

  it('xếp theo năm bắt đầu và cắt khoảng năm theo chặng kế tiếp', () => {
    const input = inputOf({
      phases: [
        phase({ startYear: 2040, label: 'Nghỉ hưu', annualIncomeMinor: 0, annualExpenseMinor: 3_000_000 }),
        phase(),
      ],
    })
    const out = phaseDigest(input, projectLifetime(input))
    expect(out.map((p) => [p.label, p.start, p.end])).toEqual([
      ['Nhật', 2026, 2039],
      ['Nghỉ hưu', 2040, null],
    ])
    // Thu/chi lấy từ dòng bản chiếu của năm đầu chặng — tức số ĐÃ quy đổi và đã áp
    // "% chặng trước" nếu có, không đọc lại số thô của chặng.
    expect(out[1].incomeMinor).toBe(0)
    expect(out[1].expenseMinor).toBe(3_000_000)
  })

  it('chặng "% chặng trước" hiện số đã suy ra, không phải số thô', () => {
    const input = inputOf({
      phases: [
        phase(),
        phase({ startYear: 2040, label: 'Nghỉ hưu', expensePctOfPrev: 50, annualExpenseMinor: 0 }),
      ],
    })
    const rows = projectLifetime(input)
    const out = phaseDigest(input, rows)
    const r2040 = rows.find((r) => r.year === 2040)
    expect(out[1].expenseMinor).toBe(r2040?.expenseMinor)
  })

  it('chặng đã qua (kết thúc trước năm nay) không có dòng bản chiếu → thu/chi null', () => {
    const input = inputOf({
      phases: [phase({ startYear: 2010, label: 'Đi học' }), phase({ startYear: 2020, label: 'Nhật' })],
    })
    const out = phaseDigest(input, projectLifetime(input))
    expect(out[0]).toMatchObject({ label: 'Đi học', end: 2019, incomeMinor: null, expenseMinor: null })
    // Chặng đang chạy bắt đầu trước năm nay: đọc dòng của NĂM NAY.
    expect(out[1].incomeMinor).toBe(6_000_000)
  })

  it('không có dòng bản chiếu nào thì vẫn liệt kê chặng, thu/chi null', () => {
    const out = phaseDigest(inputOf(), [])
    expect(out).toHaveLength(1)
    expect(out[0].incomeMinor).toBeNull()
  })
})
