import { describe, expect, it } from 'vitest'
import { realityCheck, withRealNumbers } from './realityCheck'
import type { LifetimeInput } from './project'

/** 1 chặng, lợi suất 0, tự do tài chính đạt được trong tầm chiếu: để dành 5M/năm,
 *  chi 1M → cần 25M; khởi điểm 10M → chạm ở cuối 2028. */
function baseInput(over: Partial<LifetimeInput> = {}): LifetimeInput {
  return {
    currentYear: 2026,
    birthYear: 1994,
    endAge: 40,
    displayCurrency: 'JPY',
    startingAssetsMinor: 10_000_000,
    realReturnBps: 0,
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
        annualExpenseMinor: 1_000_000,
        fxToDisplay: 1,
      },
    ],
    events: [],
    ...over,
  }
}

describe('withRealNumbers', () => {
  it('chỉ thay thu chi của chặng ĐANG CHẠY, chặng tương lai giữ nguyên', () => {
    const input = baseInput({
      phases: [
        ...baseInput().phases,
        {
          startYear: 2030,
          label: 'Mỹ',
          country: 'US',
          currency: 'USD',
          annualIncomeMinor: 26_000_00,
          annualExpenseMinor: 15_000_00,
          fxToDisplay: 150,
        },
      ],
    })
    const out = withRealNumbers(input, { annualIncomeMinor: 4_800_000, annualExpenseMinor: 4_900_000 })
    expect(out?.phases[0].annualIncomeMinor).toBe(4_800_000)
    expect(out?.phases[0].annualExpenseMinor).toBe(4_900_000)
    expect(out?.phases[1]).toEqual(input.phases[1])
    // Không sửa đầu vào.
    expect(input.phases[0].annualIncomeMinor).toBe(6_000_000)
  })

  it('không có chặng nào thì trả null', () => {
    expect(withRealNumbers(baseInput({ phases: [] }), { annualIncomeMinor: 1, annualExpenseMinor: 1 })).toBeNull()
  })
})

describe('realityCheck', () => {
  it('số thật để dành ít hơn hẳn: đáng nói, và năm FIRE lùi (ở đây là mất hẳn)', () => {
    const r = realityCheck(baseInput(), { annualIncomeMinor: 6_000_000, annualExpenseMinor: 3_500_000 })
    expect(r).not.toBeNull()
    expect(r!.currency).toBe('JPY')
    expect(r!.planSavingMinor).toBe(5_000_000)
    expect(r!.realSavingMinor).toBe(2_500_000)
    expect(r!.meaningful).toBe(true)
    expect(r!.fireYearPlan).toBe(2028)
    expect(r!.fireYearReal).toBeNull()
  })

  it('lệch dưới 10% thu nhập thì KHÔNG đáng nói — không cằn nhằn vì vài phần trăm', () => {
    // Lệch 500.000 trên thu 6.000.000 = 8,3%.
    const r = realityCheck(baseInput(), { annualIncomeMinor: 6_000_000, annualExpenseMinor: 1_500_000 })
    expect(r!.meaningful).toBe(false)
    // Đúng 10% thì đáng nói.
    const r2 = realityCheck(baseInput(), { annualIncomeMinor: 6_000_000, annualExpenseMinor: 1_600_000 })
    expect(r2!.meaningful).toBe(true)
  })

  it('để dành NHIỀU hơn kế hoạch cũng là lệch — chiều nào cũng đáng nói', () => {
    const r = realityCheck(baseInput(), { annualIncomeMinor: 7_000_000, annualExpenseMinor: 1_000_000 })
    expect(r!.realSavingMinor).toBe(6_000_000)
    expect(r!.meaningful).toBe(true)
  })

  it('số thật âm thì nhánh bi quan có năm âm', () => {
    // Thu 0, chi 3M/năm, khởi điểm 10M: cuối 2028 còn 1M, cuối 2029 âm.
    const r = realityCheck(baseInput(), { annualIncomeMinor: 0, annualExpenseMinor: 3_000_000 })
    expect(r!.realSavingMinor).toBe(-3_000_000)
    expect(r!.negativeYearReal).toBe(2029)
  })

  it('không có chặng nào thì trả null', () => {
    expect(realityCheck(baseInput({ phases: [] }), { annualIncomeMinor: 1, annualExpenseMinor: 1 })).toBeNull()
  })
})
