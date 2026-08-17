import { describe, expect, it } from 'vitest'
import {
  applyOverride,
  currentPhaseIndex,
  hasOverride,
  moneySliderMax,
  moneySliderStep,
  NO_OVERRIDE,
} from './assumptions'
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

describe('currentPhaseIndex', () => {
  it('chặng bắt đầu gần nhất tính đến năm nay', () => {
    const i = input([
      phase({ startYear: 2020 }),
      phase({ startYear: 2025 }),
      phase({ startYear: 2040 }),
    ])
    expect(currentPhaseIndex(i)).toBe(1)
  })

  it('KHÔNG giả định mảng đã sắp xếp', () => {
    const i = input([
      phase({ startYear: 2040 }),
      phase({ startYear: 2025 }),
      phase({ startYear: 2020 }),
    ])
    expect(currentPhaseIndex(i)).toBe(1)
  })

  it('mọi chặng đều ở tương lai → lấy chặng sớm nhất', () => {
    const i = input([phase({ startYear: 2050 }), phase({ startYear: 2030 })])
    expect(currentPhaseIndex(i)).toBe(1)
  })

  it('không có chặng nào → -1', () => {
    expect(currentPhaseIndex(input([]))).toBe(-1)
  })
})

describe('applyOverride', () => {
  const goc = input([phase({ startYear: 2020 }), phase({ startYear: 2025 })])

  it('không đè gì thì trả về CHÍNH object cũ (giữ tham chiếu cho useMemo)', () => {
    expect(applyOverride(goc, NO_OVERRIDE)).toBe(goc)
  })

  it('chỉ đổi chặng đang chạy, không đụng chặng khác', () => {
    const r = applyOverride(goc, { ...NO_OVERRIDE, annualExpenseMinor: 9_000_000 })
    expect(r.phases[1].annualExpenseMinor).toBe(9_000_000)
    expect(r.phases[0].annualExpenseMinor).toBe(3_000_000)
    // Thu của chính chặng đó cũng phải nguyên: null = giữ nguyên.
    expect(r.phases[1].annualIncomeMinor).toBe(4_000_000)
  })

  it('không sửa tại chỗ — input gốc phải nguyên vẹn', () => {
    applyOverride(goc, { ...NO_OVERRIDE, annualExpenseMinor: 9_000_000, realReturnBps: 700 })
    expect(goc.phases[1].annualExpenseMinor).toBe(3_000_000)
    expect(goc.realReturnBps).toBe(300)
  })

  it('lợi suất là của cả kịch bản, không phải của chặng', () => {
    const r = applyOverride(goc, { ...NO_OVERRIDE, realReturnBps: 700 })
    expect(r.realReturnBps).toBe(700)
    expect(r.phases).toBe(goc.phases) // không đụng tới mảng chặng
  })

  it('không có chặng nào thì vẫn đè được lợi suất', () => {
    const trong = input([])
    const r = applyOverride(trong, { ...NO_OVERRIDE, realReturnBps: 500 })
    expect(r.realReturnBps).toBe(500)
  })

  // Điều thật sự quan trọng: đè xong thì BẢN CHIẾU phải đổi theo.
  it('bản chiếu đổi theo giá trị đè', () => {
    const truoc = projectLifetime(goc)
    const sau = projectLifetime(applyOverride(goc, { ...NO_OVERRIDE, annualExpenseMinor: 9_000_000 }))
    const cuoiTruoc = truoc[truoc.length - 1].assetsEndMinor
    const cuoiSau = sau[sau.length - 1].assetsEndMinor
    expect(cuoiSau).toBeLessThan(cuoiTruoc)
  })
})

describe('hasOverride', () => {
  it('phân biệt 0 với "không đè"', () => {
    expect(hasOverride(NO_OVERRIDE)).toBe(false)
    // 0 là một giá trị THẬT (nghỉ hưu: thu 0), không phải "chưa đặt".
    expect(hasOverride({ ...NO_OVERRIDE, annualIncomeMinor: 0 })).toBe(true)
  })
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
    for (let k = 0; k < N; k++) projectLifetime(applyOverride(i, { ...NO_OVERRIDE, realReturnBps: 300 + k }))
    const moiLan = (performance.now() - t0) / N
    expect(moiLan).toBeLessThan(16)
  })
})
