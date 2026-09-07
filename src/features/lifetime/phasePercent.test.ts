import { describe, expect, it } from 'vitest'
import { resolvePhasePercents } from './phasePercent'
import type { LifetimePhase } from './project'

const p = (over: Partial<LifetimePhase> & Pick<LifetimePhase, 'startYear'>): LifetimePhase => ({
  label: 'Chặng',
  country: 'JP',
  currency: 'JPY',
  annualIncomeMinor: 7_200_000,
  annualExpenseMinor: 4_200_000,
  fxToDisplay: 1,
  ...over,
})

describe('resolvePhasePercents', () => {
  it('không khai phần trăm thì trả về NGUYÊN đối tượng cũ', () => {
    const ps = [p({ startYear: 2026 }), p({ startYear: 2040 })]
    const out = resolvePhasePercents(ps, 'JPY')
    expect(out[0]).toBe(ps[0])
    expect(out[1]).toBe(ps[1])
  })

  it('80% chi của chặng trước', () => {
    const out = resolvePhasePercents(
      [p({ startYear: 2026 }), p({ startYear: 2056, expensePctOfPrev: 80 })],
      'JPY',
    )
    expect(out[1].annualExpenseMinor).toBe(3_360_000)
    // Thu không khai phần trăm → giữ nguyên số tuyệt đối.
    expect(out[1].annualIncomeMinor).toBe(7_200_000)
  })

  it('0% = chặng này không thu gì (nghỉ hưu hoàn toàn) — KHÔNG bị coi là "bỏ trống"', () => {
    const out = resolvePhasePercents(
      [p({ startYear: 2026 }), p({ startYear: 2056, incomePctOfPrev: 0 })],
      'JPY',
    )
    expect(out[1].annualIncomeMinor).toBe(0)
  })

  it('DÂY CHUYỀN: chặng 3 lấy phần trăm của chặng 2 ĐÃ GIẢI, không của chặng 1', () => {
    // "Về VN sống 50%, rồi nghỉ hưu còn 80% của mức đó" = 40% chặng đầu.
    const out = resolvePhasePercents(
      [
        p({ startYear: 2026, annualExpenseMinor: 5_000_000 }),
        p({ startYear: 2035, expensePctOfPrev: 50 }),
        p({ startYear: 2056, expensePctOfPrev: 80 }),
      ],
      'JPY',
    )
    expect(out[1].annualExpenseMinor).toBe(2_500_000)
    expect(out[2].annualExpenseMinor).toBe(2_000_000)
  })

  it('chặng ĐẦU khai phần trăm thì bỏ qua cờ, dùng số tuyệt đối — KHÔNG trả 0', () => {
    // Trả 0 ở đây nghĩa là "chặng đầu đời không thu không chi", một câu sai hẳn mà
    // không có gì trên màn hình nói ra.
    const out = resolvePhasePercents(
      [p({ startYear: 2026, expensePctOfPrev: 80, incomePctOfPrev: 0 })],
      'JPY',
    )
    expect(out[0].annualExpenseMinor).toBe(4_200_000)
    expect(out[0].annualIncomeMinor).toBe(7_200_000)
  })

  it('KHÁC ĐỒNG TIỀN: quy về cùng đơn vị trước khi nhân', () => {
    // Chặng Nhật ¥5.000.000/năm, chặng VN khai 60%. Tỷ giá: 1¥ = 165₫ → display JPY.
    // 60% của ¥5.000.000 = ¥3.000.000 = ₫495.000.000.
    // Nhân thẳng 5.000.000 × 0,6 rồi coi là ₫ sẽ ra ₫3.000.000 — sai 165 lần, và cả
    // hai số đều "hợp lệ" nên không guard nào bắt được.
    const out = resolvePhasePercents(
      [
        p({ startYear: 2026, currency: 'JPY', fxToDisplay: 1, annualExpenseMinor: 5_000_000 }),
        p({
          startYear: 2040,
          currency: 'VND',
          fxToDisplay: 1 / 165,
          annualExpenseMinor: 0,
          expensePctOfPrev: 60,
        }),
      ],
      'JPY',
    )
    expect(out[1].annualExpenseMinor).toBe(495_000_000)
  })

  it('tỷ giá 0 (dữ liệu hỏng) thì giữ số tuyệt đối, không cho ra 0', () => {
    const out = resolvePhasePercents(
      [
        p({ startYear: 2026 }),
        p({ startYear: 2040, fxToDisplay: 0, annualExpenseMinor: 999, expensePctOfPrev: 50 }),
      ],
      'JPY',
    )
    expect(out[1].annualExpenseMinor).toBe(999)
  })

  it('phần trăm âm hoặc không phải số thì bỏ qua', () => {
    const out = resolvePhasePercents(
      [
        p({ startYear: 2026 }),
        p({ startYear: 2040, annualExpenseMinor: 111, expensePctOfPrev: -5 }),
      ],
      'JPY',
    )
    expect(out[1].annualExpenseMinor).toBe(111)
  })

  it('mảng rỗng thì trả mảng rỗng', () => {
    expect(resolvePhasePercents([], 'JPY')).toEqual([])
  })
})
