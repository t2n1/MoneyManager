import { describe, expect, it } from 'vitest'
import {
  assetValueInYear,
  hasAsset,
  homeCashOutInYear,
  loanBalanceInYear,
  yearlyLoanPayment,
  type HomeAsset,
} from './homeAsset'
import { monthlyPayment } from '../debts/amortization'

const h = (over: Partial<HomeAsset> = {}): HomeAsset => ({
  startYear: 2031,
  assetValueMinor: 40_000_000,
  assetChangeBps: 100,
  loanMinor: 32_000_000,
  loanRateBps: 150,
  loanYears: 35,
  ...over,
})

describe('hasAsset', () => {
  it('0 = mốc thường, không mua gì', () => {
    expect(hasAsset(h({ assetValueMinor: 0 }))).toBe(false)
    expect(hasAsset(h())).toBe(true)
  })
})

describe('yearlyLoanPayment', () => {
  it('KHỚP công thức niên kim tháng của features/debts', () => {
    // Hai chỗ tính cùng một thứ (file này cố ý không import buildSchedule — xem đầu
    // homeAsset.ts). Phép thử này là chỗ duy nhất buộc chúng không trôi khỏi nhau.
    const x = h()
    expect(yearlyLoanPayment(x)).toBe(monthlyPayment(32_000_000, 150, 35 * 12) * 12)
  })

  it('lãi 0 thì chia đều gốc', () => {
    const x = h({ loanRateBps: 0, loanMinor: 12_000_000, loanYears: 10 })
    expect(yearlyLoanPayment(x)).toBe(1_200_000)
  })

  it('không vay thì bằng 0', () => {
    expect(yearlyLoanPayment(h({ loanMinor: 0 }))).toBe(0)
    expect(yearlyLoanPayment(h({ loanYears: 0 }))).toBe(0)
  })

  it('vay nhiều hơn giá tài sản thì kẹp ở giá — không vay hộ thêm', () => {
    const x = h({ assetValueMinor: 10_000_000, loanMinor: 99_000_000, loanRateBps: 0, loanYears: 10 })
    expect(yearlyLoanPayment(x)).toBe(1_000_000)
  })
})

describe('loanBalanceInYear', () => {
  it('trước năm mua thì không có nợ', () => {
    expect(loanBalanceInYear(h(), 2030)).toBe(0)
  })

  it('teo dần và về ĐÚNG 0 ở năm cuối kỳ hạn', () => {
    const x = h({ loanRateBps: 0, loanMinor: 12_000_000, loanYears: 10, startYear: 2031 })
    expect(loanBalanceInYear(x, 2031)).toBe(10_800_000)
    expect(loanBalanceInYear(x, 2035)).toBe(6_000_000)
    expect(loanBalanceInYear(x, 2039)).toBe(1_200_000)
    // Năm thứ 10 (2040) là năm trả nốt → 0, và mọi năm sau cũng 0.
    expect(loanBalanceInYear(x, 2040)).toBe(0)
    expect(loanBalanceInYear(x, 2070)).toBe(0)
  })

  it('có lãi: năm đầu trả được ÍT gốc hơn phần chia đều', () => {
    // Đây là toàn bộ lý do phải dùng niên kim: kỳ đầu phần lớn tiền đi vào lãi.
    const x = h()
    const chiaDeu = 32_000_000 - 32_000_000 / 35
    expect(loanBalanceInYear(x, 2031)).toBeGreaterThan(chiaDeu)
    expect(loanBalanceInYear(x, 2031)).toBeLessThan(32_000_000)
  })

  it('không bao giờ trả về số âm', () => {
    const x = h({ loanRateBps: 0, loanMinor: 1000, loanYears: 1 })
    for (const y of [2031, 2032, 2100]) expect(loanBalanceInYear(x, y)).toBeGreaterThanOrEqual(0)
  })
})

describe('assetValueInYear', () => {
  it('trước năm mua thì chưa có tài sản', () => {
    expect(assetValueInYear(h(), 2030)).toBe(0)
  })

  it('nhà lên giá 1%/năm', () => {
    const x = h({ assetChangeBps: 100 })
    expect(assetValueInYear(x, 2031)).toBe(40_000_000)
    expect(assetValueInYear(x, 2032)).toBe(40_400_000)
    expect(assetValueInYear(x, 2041)).toBe(Math.round(40_000_000 * 1.01 ** 10))
  })

  it('xe mất giá 15%/năm — KHÔNG kẹp ở một "giá còn lại" bịa ra', () => {
    const x = h({ assetValueMinor: 3_000_000, assetChangeBps: -1500, startYear: 2027 })
    expect(assetValueInYear(x, 2028)).toBe(2_550_000)
    expect(assetValueInYear(x, 2057)).toBeLessThan(30_000)
  })

  it('bps 0 = giữ nguyên giá', () => {
    const x = h({ assetChangeBps: 0 })
    expect(assetValueInYear(x, 2060)).toBe(40_000_000)
  })
})

describe('homeCashOutInYear', () => {
  it('năm mua: TRẢ TRƯỚC + tiền trả nợ, hai dòng riêng', () => {
    // Gộp thành một con số thì người dùng không biết vì sao năm đó tụt sâu thế.
    const out = homeCashOutInYear(h(), 2031)
    expect(out.downMinor).toBe(8_000_000)
    expect(out.loanMinor).toBe(yearlyLoanPayment(h()))
  })

  it('năm sau: chỉ còn tiền trả nợ', () => {
    const out = homeCashOutInYear(h(), 2032)
    expect(out.downMinor).toBe(0)
    expect(out.loanMinor).toBe(yearlyLoanPayment(h()))
  })

  it('trả xong thì hết chi', () => {
    const out = homeCashOutInYear(h(), 2031 + 35)
    expect(out).toEqual({ downMinor: 0, loanMinor: 0 })
  })

  it('trả thẳng (không vay): CẢ GIÁ ra trong năm mua, không có tiền trả nợ', () => {
    const out = homeCashOutInYear(h({ loanMinor: 0, loanYears: 0 }), 2031)
    expect(out).toEqual({ downMinor: 40_000_000, loanMinor: 0 })
  })

  it('trước năm mua thì chưa ra đồng nào', () => {
    expect(homeCashOutInYear(h(), 2030)).toEqual({ downMinor: 0, loanMinor: 0 })
  })

  it('mốc không mua tài sản thì mọi thứ bằng 0', () => {
    expect(homeCashOutInYear(h({ assetValueMinor: 0 }), 2031)).toEqual({
      downMinor: 0,
      loanMinor: 0,
    })
  })
})
