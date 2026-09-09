import { describe, expect, it } from 'vitest'
import type { ScenarioDraft } from './draft'
import {
  bpsText,
  EXPENSE_ADJ_MAX_PCT,
  EXPENSE_ADJ_MIN_PCT,
  RETURN_MAX_BPS,
  RETURN_MIN_BPS,
  RETURN_STEP_BPS,
  scaleExpenses,
  sliderBound,
  SPREAD_MAX_BPS,
  SPREAD_STEP_BPS,
} from './quickTune'

function phase(over: Partial<ScenarioDraft['phases'][number]> = {}) {
  return {
    id: 'p1',
    startYear: 2026,
    label: 'Đi làm ở Nhật',
    country: 'JP',
    currency: 'JPY' as const,
    annualIncomeMinor: 6_000_000,
    annualExpenseMinor: 3_000_000,
    incomePctOfPrev: null,
    expensePctOfPrev: null,
    fxToDisplay: 1,
    color: '',
    icon: '',
    ...over,
  }
}

function draft(phases = [phase()]): ScenarioDraft {
  return {
    scenarioId: 's1',
    name: 'Hiện tại',
    displayCurrency: 'JPY',
    startingAssetsMinor: 10_000_000,
    endAge: 90,
    realReturnBps: 200,
    bandSpreadBps: 150,
    phases,
    events: [],
  }
}

describe('sliderBound', () => {
  it('giữ nguyên biên khi giá trị đã nằm trong khoảng', () => {
    expect(sliderBound(RETURN_MIN_BPS, RETURN_MAX_BPS, 200, RETURN_STEP_BPS)).toEqual({
      min: 0,
      max: 1000,
    })
  })

  // Cái bẫy hàm này tồn tại để chặn: DB cho `real_return_bps` xuống −500, bản vẽ chỉ vẽ
  // từ 0. Không nới thì núm dán ở mép trái và cú kéo đầu tiên NÂNG ngầm con số đã lưu.
  it('nới mép dưới để chứa giá trị âm đã lưu', () => {
    expect(sliderBound(RETURN_MIN_BPS, RETURN_MAX_BPS, -125, RETURN_STEP_BPS)).toEqual({
      min: -130,
      max: 1000,
    })
  })

  it('nới mép trên để chứa giá trị vượt trần bản vẽ', () => {
    expect(sliderBound(RETURN_MIN_BPS, RETURN_MAX_BPS, 1234, RETURN_STEP_BPS)).toEqual({
      min: 0,
      max: 1240,
    })
  })

  it('dải dao động đã lưu 500 (ngoài 0–400 của bản vẽ) vẫn kéo được', () => {
    expect(sliderBound(0, SPREAD_MAX_BPS, 500, SPREAD_STEP_BPS)).toEqual({ min: 0, max: 500 })
  })
})

describe('bpsText', () => {
  it('in phần trăm với dấu phẩy, một chữ số thập phân', () => {
    expect(bpsText(250)).toBe('2,5%')
    expect(bpsText(0)).toBe('0,0%')
    expect(bpsText(1000)).toBe('10,0%')
    expect(bpsText(-130)).toBe('−1,3%')
  })
})

describe('scaleExpenses', () => {
  it('nhân chi của chặng khai số tuyệt đối', () => {
    const d = draft()
    expect(scaleExpenses(d, d, 10).phases[0].annualExpenseMinor).toBe(3_300_000)
    expect(scaleExpenses(d, d, -40).phases[0].annualExpenseMinor).toBe(1_800_000)
  })

  it('không đụng thu, không đụng phần còn lại của nháp', () => {
    const d = draft()
    const out = scaleExpenses(d, d, 25)
    expect(out.phases[0].annualIncomeMinor).toBe(6_000_000)
    expect(out.realReturnBps).toBe(200)
    expect(out.startingAssetsMinor).toBe(10_000_000)
  })

  // Đây là lý do hàm nhận CẢ `saved` lẫn `working`: một nhịp kéo gọi hàng chục lần, và
  // nhân dồn vào giá trị hiện tại thì kéo lên rồi kéo về 0 không trả lại số đã lưu.
  it('không cộng dồn: kéo qua nhiều mức rồi về 0 trả lại đúng số đã lưu', () => {
    const saved = draft()
    let w = saved
    for (const pct of [5, 12, 27, 40, 13, -8, -40, 0]) w = scaleExpenses(saved, w, pct)
    expect(w.phases[0].annualExpenseMinor).toBe(3_000_000)
  })

  it('về 0 trả về CHÍNH đối tượng cũ (không tạo tham chiếu mới)', () => {
    const saved = draft()
    expect(scaleExpenses(saved, saved, 0)).toBe(saved)
  })

  // Chặng khai chi bằng % chặng trước: `resolvePhasePercents` ghi đè con số này lúc
  // chiếu, nên nhân vào đây chỉ sinh một lệnh ghi DB cho một thay đổi vô hiệu lực.
  it('bỏ qua chặng khai chi bằng % chặng trước', () => {
    const saved = draft([
      phase(),
      phase({ id: 'p2', startYear: 2056, label: 'Nghỉ hưu', expensePctOfPrev: 80 }),
    ])
    const out = scaleExpenses(saved, saved, 20)
    expect(out.phases[0].annualExpenseMinor).toBe(3_600_000)
    expect(out.phases[1].annualExpenseMinor).toBe(3_000_000)
    expect(out.phases[1].expensePctOfPrev).toBe(80)
  })

  it('bỏ qua chặng chỉ có trong nháp (chưa có gốc đã lưu)', () => {
    const saved = draft()
    const working = draft([phase(), phase({ id: 'nhap:2', startYear: 2040, label: 'Về VN' })])
    const out = scaleExpenses(saved, working, 50)
    expect(out.phases[0].annualExpenseMinor).toBe(4_500_000)
    expect(out.phases[1].annualExpenseMinor).toBe(3_000_000)
  })

  it('hai mép của bản vẽ đều ra số nguyên minor', () => {
    const saved = draft([phase({ annualExpenseMinor: 3_333_333 })])
    for (const pct of [EXPENSE_ADJ_MIN_PCT, EXPENSE_ADJ_MAX_PCT]) {
      const v = scaleExpenses(saved, saved, pct).phases[0].annualExpenseMinor
      expect(Number.isInteger(v)).toBe(true)
    }
  })
})
