import { describe, expect, it } from 'vitest'
import { moneySliderMax, moneySliderStep } from './assumptions'
import { projectLifetime, type LifetimeInput, type LifetimePhase } from './project'

const phase = (p: Partial<LifetimePhase> = {}): LifetimePhase => ({
  startYear: 2020,
  label: 'Đi làm',
  country: null,
  currency: 'JPY',
  annualIncomeMinor: 4_000_000,
  annualExpenseMinor: 3_000_000,
  fxToDisplay: 1,
  ...p,
})

const input = (phases: LifetimePhase[]): LifetimeInput => ({
  currentYear: 2026,
  birthYear: 1990,
  endAge: 90,
  displayCurrency: 'JPY',
  startingAssetsMinor: 10_000_000,
  realReturnBps: 300,
  bandSpreadBps: 0,
  inflationBps: 200,
  nominalTerms: false,
  phases,
  events: [],
})
describe('biên và bước của thanh trượt', () => {
  it('gấp đôi giá trị nền, làm tròn lên bậc đọc được', () => {
    expect(moneySliderMax(4_000_000, 1)).toBe(8_000_000)
    expect(moneySliderMax(4_937_281, 1)).toBe(9_900_000)
  })

  it('nền 0 thì rơi về fallback — nếu không thanh trượt kẹt cứng', () => {
    expect(moneySliderMax(0, 5_000_000)).toBe(5_000_000)
  })

  it('nền âm vẫn ra biên dương', () => {
    expect(moneySliderMax(-4_000_000, 1)).toBe(8_000_000)
  })

  it('bước luôn ≥ 1 và không bao giờ 0 (bước 0 làm thanh trượt đứng im)', () => {
    for (const max of [0, 1, 50, 8_000_000, 900_000_000]) {
      expect(moneySliderStep(max)).toBeGreaterThanOrEqual(1)
    }
  })
})

// Cổng R6: §4.4/13b cho phép vẽ lại NGAY trong lúc kéo chỉ khi phép chiếu chạy dưới
// ~16 ms. Đo lại ở đây thay vì tin con số đã đo một lần — nếu ai đó làm projectLifetime
// nặng lên gấp trăm lần, chính phép thử này phải là chỗ báo.
describe('cổng hiệu năng (R6)', () => {
  it('projectLifetime dưới 16ms mỗi lần chiếu', () => {
    const i = input([phase({ startYear: 2020 })])
    const N = 50
    const t0 = performance.now()
    for (let k = 0; k < N; k++) projectLifetime({ ...i, realReturnBps: 300 + k })
    const moiLan = (performance.now() - t0) / N
    expect(moiLan).toBeLessThan(16)
  })
})
