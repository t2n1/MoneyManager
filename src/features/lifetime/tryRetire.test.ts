import { describe, expect, it } from 'vitest'
import { fxOfRates } from './fxModel'
import type { LifetimeInput } from './project'
import {
  applyRetireTrial,
  buildRetireTrial,
  canOfferRetireTrial,
  RETIRE_TRIAL_MIN_END_AGE,
  retireTrialCtx,
} from './tryRetire'
import type { ScenarioDraft } from './draft'

const fx = fxOfRates('JPY', { JPY: 1, USD: 1 / 150 })

const input: LifetimeInput = {
  currentYear: 2026,
  birthYear: 1994,
  endAge: 70,
  displayCurrency: 'JPY',
  startingAssetsMinor: 1_000_000,
  realReturnBps: 550,
  bandSpreadBps: 150,
  inflationBps: 200,
  nominalTerms: false,
  phases: [
    // Cố ý để LỆCH thứ tự: hàm phải tự sắp, không tin thứ tự mảng.
    {
      startYear: 2030,
      label: 'Mỹ',
      country: 'US',
      currency: 'USD',
      annualIncomeMinor: 26_000_00,
      annualExpenseMinor: 15_000_00,
      fxToDisplay: 1,
    },
    {
      startYear: 2026,
      label: 'Hiện tại',
      country: 'JP',
      currency: 'JPY',
      annualIncomeMinor: 4_691_034,
      annualExpenseMinor: 2_950_554,
      fxToDisplay: 1,
    },
  ],
  events: [],
}

const draft: ScenarioDraft = {
  scenarioId: 'sc1',
  name: 'Đi Mỹ',
  displayCurrency: 'JPY',
  startingAssetsMinor: 1_000_000,
  endAge: 70,
  realReturnBps: 550,
  bandSpreadBps: 150,
  phases: [],
  events: [],
}

describe('retireTrialCtx', () => {
  it('lấy chặng ĐANG HIỆU LỰC ở năm nghỉ, không phải chặng hiện tại', () => {
    const ctx = retireTrialCtx(input, 'sc1', 2045, fx)
    expect(ctx).not.toBeNull()
    expect(ctx!.year).toBe(2045)
    expect(ctx!.birthYear).toBe(1994)
    expect(ctx!.currency).toBe('USD')
    expect(ctx!.country).toBe('US')
    expect(ctx!.currentExpenseMinor).toBe(15_000_00)
    // Tỷ giá HÔM NAY của chặng sang tiền hiển thị, không phải fxToDisplay đã lưu (=1).
    expect(ctx!.fxToDisplay).toBeCloseTo(150, 6)
    expect(ctx!.displayCurrency).toBe('JPY')
    expect(ctx!.fxOf('USD')).toBeCloseTo(150, 6)
    expect(ctx!.fxOf('JPY')).toBe(1)
  })

  it('không có chặng nào thì trả null', () => {
    expect(retireTrialCtx({ ...input, phases: [] }, 'sc1', 2045, fx)).toBeNull()
  })
})

describe('buildRetireTrial', () => {
  it('dựng đúng mẫu Nghỉ hưu: thu 0, chi 80% chặng đó, lương hưu JPY tới hết đời', () => {
    const r = buildRetireTrial(input, 'sc1', 2045, fx)
    expect(r).not.toBeNull()
    expect(r!.phases).toHaveLength(1)
    expect(r!.phases[0].start_year).toBe(2045)
    expect(r!.phases[0].annual_income_minor).toBe(0)
    expect(r!.phases[0].currency).toBe('USD')
    expect(r!.phases[0].annual_expense_minor).toBe(Math.round(15_000_00 * 0.8))
    const pension = r!.events.find((e) => e.kind === 'income')
    expect(pension?.currency).toBe('JPY')
    expect(pension?.end_year).toBeNull()
    // Nghỉ 2045 (51 tuổi) thì lương hưu chỉ từ 2059 (65 tuổi), không phải từ 2045.
    expect(pension?.start_year).toBe(2059)
  })
})

describe('applyRetireTrial', () => {
  it('thêm chặng vào nháp và kéo tuổi chiếu lên tối thiểu 90', () => {
    const r = buildRetireTrial(input, 'sc1', 2045, fx)!
    const out = applyRetireTrial(draft, r, 7)
    expect(out.endAge).toBe(RETIRE_TRIAL_MIN_END_AGE)
    expect(out.phases.map((p) => p.startYear)).toEqual([2045])
    expect(out.events).toHaveLength(1)
    // Không sửa nháp đầu vào.
    expect(draft.endAge).toBe(70)
    expect(draft.phases).toHaveLength(0)
  })

  it('tuổi chiếu đang cao hơn 90 thì giữ nguyên, không kéo xuống', () => {
    const r = buildRetireTrial(input, 'sc1', 2045, fx)!
    expect(applyRetireTrial({ ...draft, endAge: 95 }, r, 8).endAge).toBe(95)
  })
})

describe('canOfferRetireTrial', () => {
  it('có năm FIRE ở tương lai và chưa có chặng năm đó → mời', () => {
    expect(canOfferRetireTrial(input, 2045)).toBe(true)
  })
  it('không có năm FIRE, hoặc FIRE đã qua → không mời', () => {
    expect(canOfferRetireTrial(input, null)).toBe(false)
    expect(canOfferRetireTrial(input, 2026)).toBe(false)
    expect(canOfferRetireTrial(input, 2020)).toBe(false)
  })
  it('đã có chặng bắt đầu đúng năm FIRE (vd vừa bấm thử) → thôi mời', () => {
    const withRetire = {
      ...input,
      phases: [...input.phases, { ...input.phases[0], startYear: 2045, annualIncomeMinor: 0 }],
    }
    expect(canOfferRetireTrial(withRetire, 2045)).toBe(false)
  })
})
