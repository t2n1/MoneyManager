import { describe, expect, it } from 'vitest'
import { lifetimeVerdict, phaseRange, phaseSavings } from './summary'
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
    endAge: 90,
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

describe('lifetimeVerdict', () => {
  it('để dành đều thì không năm nào âm và có năm tự do tài chính', () => {
    const v = lifetimeVerdict(projectLifetime(inputOf()), 1994)
    expect(v.negativeYear).toBeNull()
    expect(v.negativeAge).toBeNull()
    expect(v.fireYear).not.toBeNull()
    expect(v.tone).toBe('good')
  })

  it('tuổi suy từ năm sinh, không phải từ dòng đầu bản chiếu', () => {
    const v = lifetimeVerdict(projectLifetime(inputOf()), 1994)
    expect(v.fireAge).toBe((v.fireYear as number) - 1994)
  })

  // Chi vượt thu và không có tài sản nền: nhánh bi quan phải cạn tiền, và một lần cạn
  // tiền thì tone là 'bad' bất kể có đạt FIRE ở đâu đó hay không.
  it('cạn tiền ở nhánh bi quan → tone bad kèm năm và tuổi', () => {
    const rows = projectLifetime(
      inputOf({
        startingAssetsMinor: 0,
        realReturnBps: 0,
        bandSpreadBps: 0,
        phases: [phase({ annualIncomeMinor: 1_000_000, annualExpenseMinor: 2_000_000 })],
      }),
    )
    const v = lifetimeVerdict(rows, 1994)
    expect(v.negativeYear).toBe(2026)
    expect(v.negativeAge).toBe(32)
    expect(v.tone).toBe('bad')
  })

  // Thu vừa đủ chi: không năm nào âm (tin tốt) nhưng tài sản không lớn lên nên không
  // năm nào rút 4% đủ sống. Đây đúng ca ở giữa — không phải 'good', cũng không 'bad'.
  it('không âm nhưng không đạt FIRE → tone warn', () => {
    const rows = projectLifetime(
      inputOf({
        startingAssetsMinor: 0,
        realReturnBps: 0,
        bandSpreadBps: 0,
        phases: [phase({ annualIncomeMinor: 2_000_000, annualExpenseMinor: 2_000_000 })],
      }),
    )
    const v = lifetimeVerdict(rows, 1994)
    expect(v.negativeYear).toBeNull()
    expect(v.fireYear).toBeNull()
    expect(v.tone).toBe('warn')
  })

  it('bản chiếu rỗng không ném, trả về ca không đạt', () => {
    const v = lifetimeVerdict([], 1994)
    expect(v).toEqual({
      negativeYear: null,
      negativeAge: null,
      fireYear: null,
      fireAge: null,
      tone: 'warn',
    })
  })
})

describe('phaseRange', () => {
  it('chặng cuối trả end null — nó chạy tới hết bản chiếu, không có mốc thật', () => {
    const p = phase()
    expect(phaseRange(inputOf({ phases: [p] }), p)).toEqual({ start: 2026, end: null })
  })

  it('chặng giữa dừng ở năm TRƯỚC chặng kế tiếp', () => {
    const a = phase({ startYear: 2026 })
    const b = phase({ startYear: 2031, label: 'Việt Nam' })
    const c = phase({ startYear: 2049, label: 'Hưu' })
    const input = inputOf({ phases: [a, b, c] })
    expect(phaseRange(input, a)).toEqual({ start: 2026, end: 2030 })
    expect(phaseRange(input, b)).toEqual({ start: 2031, end: 2048 })
    expect(phaseRange(input, c)).toEqual({ start: 2049, end: null })
  })

  it('không phụ thuộc thứ tự chặng trong mảng', () => {
    const a = phase({ startYear: 2026 })
    const b = phase({ startYear: 2031, label: 'Việt Nam' })
    expect(phaseRange(inputOf({ phases: [b, a] }), a)).toEqual({ start: 2026, end: 2030 })
  })

  it('chặng lạ (không có trong input) trả khoảng mở thay vì đoán', () => {
    const input = inputOf({ phases: [phase({ startYear: 2026 })] })
    expect(phaseRange(input, phase({ startYear: 2040 }))).toEqual({ start: 2040, end: null })
  })
})

describe('phaseSavings', () => {
  it('để dành = thu − chi, tỷ lệ tính trên thu', () => {
    expect(phaseSavings(phase({ annualIncomeMinor: 4_800_000, annualExpenseMinor: 3_240_000 })))
      .toEqual({ amountMinor: 1_560_000, ratePct: 32.5 })
  })

  it('chi vượt thu ra số ÂM, không kẹp về 0', () => {
    const s = phaseSavings(phase({ annualIncomeMinor: 1_000_000, annualExpenseMinor: 1_500_000 }))
    expect(s.amountMinor).toBe(-500_000)
    expect(s.ratePct).toBe(-50)
  })

  // Thu 0 là ca có thật (nghỉ hưu, hoặc sổ chưa ghi lương) — chia cho 0 ra Infinity.
  it('thu bằng 0 thì KHÔNG có tỷ lệ, không phải 0%', () => {
    const s = phaseSavings(phase({ annualIncomeMinor: 0, annualExpenseMinor: 2_000_000 }))
    expect(s.amountMinor).toBe(-2_000_000)
    expect(s.ratePct).toBeNull()
  })
})
