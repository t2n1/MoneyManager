import { describe, expect, it } from 'vitest'
import { cardDebt, reconcilePlan } from './reconcile'

describe('reconcilePlan — ví/tài khoản thường', () => {
  it('số thật nhiều hơn sổ → giao dịch thu bù phần thiếu', () => {
    expect(reconcilePlan({ isCard: false, currentBalance: 80_000, entered: 100_000 })).toEqual({
      target: 100_000,
      diff: 20_000,
      type: 'income',
    })
  })

  it('số thật ít hơn sổ → giao dịch chi', () => {
    expect(reconcilePlan({ isCard: false, currentBalance: 100_000, entered: 80_000 })).toEqual({
      target: 80_000,
      diff: -20_000,
      type: 'expense',
    })
  })
})

describe('reconcilePlan — thẻ tín dụng (ô nhập là số ĐANG NỢ)', () => {
  it('nợ thật nhiều hơn sổ → chi trên thẻ (số dư giảm = nợ tăng)', () => {
    // Sổ ghi nợ 100.000 (số dư −100.000), sao kê thật 120.000
    expect(reconcilePlan({ isCard: true, currentBalance: -100_000, entered: 120_000 })).toEqual({
      target: -120_000,
      diff: -20_000,
      type: 'expense',
    })
  })

  it('nợ thật ít hơn sổ → thu trên thẻ (nợ giảm)', () => {
    expect(reconcilePlan({ isCard: true, currentBalance: -100_000, entered: 80_000 })).toEqual({
      target: -80_000,
      diff: 20_000,
      type: 'income',
    })
  })

  it('nhập số âm vẫn hiểu là số nợ', () => {
    expect(reconcilePlan({ isCard: true, currentBalance: -100_000, entered: -120_000 }).target).toBe(
      -120_000,
    )
  })

  it('hết nợ → thu đúng bằng phần còn lại', () => {
    expect(reconcilePlan({ isCard: true, currentBalance: -50_000, entered: 0 })).toEqual({
      target: 0,
      diff: 50_000,
      type: 'income',
    })
  })

  it('khớp rồi → không chênh', () => {
    expect(reconcilePlan({ isCard: true, currentBalance: -50_000, entered: 50_000 }).diff).toBe(0)
  })
})

describe('cardDebt', () => {
  it('số dư âm → nợ dương', () => {
    expect(cardDebt(-112_760)).toBe(112_760)
  })

  it('trả dư (số dư dương) → coi như hết nợ', () => {
    expect(cardDebt(5_000)).toBe(0)
  })
})
