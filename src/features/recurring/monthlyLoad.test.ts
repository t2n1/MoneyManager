import { describe, expect, it } from 'vitest'
import { monthlyLoad, type MonthlyLoadRule } from './monthlyLoad'

const TODAY = '2026-08-18'
/** Quy đổi giả: JPY giữ nguyên, USD ×150, VND không có tỷ giá. */
const convert = (minor: number, from: string) =>
  from === 'JPY' ? minor : from === 'USD' ? minor * 150 : null

const r = (p: Partial<MonthlyLoadRule> = {}): MonthlyLoadRule => ({
  amount: 85_000,
  currency: 'JPY',
  type: 'expense',
  frequency: 'monthly',
  mode: 'auto',
  isPaused: false,
  endOn: null,
  isRefund: false,
  ...p,
})

describe('monthlyLoad — quy đổi tần suất', () => {
  it('hàng tháng cộng nguyên', () => {
    expect(monthlyLoad([r()], TODAY, convert).perMonth).toBe(85_000)
  })

  // 4 kỳ/tháng là con số dễ viết mà sai: một quy tắc hàng tuần bị tính thiếu gần một kỳ.
  it('hàng tuần là 52/12 kỳ mỗi tháng, KHÔNG phải 4', () => {
    const v = monthlyLoad([r({ amount: 3_000, frequency: 'weekly' })], TODAY, convert).perMonth
    expect(v).toBe(Math.round(3_000 * (52 / 12)))
    expect(v).toBeGreaterThan(3_000 * 4)
  })

  it('hàng năm chia 12', () => {
    expect(monthlyLoad([r({ amount: 120_000, frequency: 'yearly' })], TODAY, convert).perMonth).toBe(
      10_000,
    )
  })
})

describe('monthlyLoad — bốn phép lọc', () => {
  it('bỏ quy tắc CHỈ NHẮC: nó không tự trừ tiền, và số tiền mỗi lần một khác', () => {
    expect(monthlyLoad([r({ mode: 'remind' })], TODAY, convert)).toEqual({
      perMonth: 0,
      counted: 0,
      hasMissingRate: false,
    })
  })

  it('bỏ quy tắc đang tạm dừng', () => {
    expect(monthlyLoad([r({ isPaused: true })], TODAY, convert).counted).toBe(0)
  })

  it('bỏ quy tắc đã hết hạn, giữ quy tắc hết hạn trong tương lai', () => {
    expect(monthlyLoad([r({ endOn: '2026-08-17' })], TODAY, convert).counted).toBe(0)
    expect(monthlyLoad([r({ endOn: '2026-08-18' })], TODAY, convert).counted).toBe(1)
    expect(monthlyLoad([r({ endOn: '2027-01-01' })], TODAY, convert).counted).toBe(1)
  })

  // Trộn lương vào thì con số ròng thành dương và nhãn "/tháng" nói ngược hẳn.
  it('KHÔNG trừ thu định kỳ, và bỏ chuyển khoản', () => {
    const v = monthlyLoad(
      [r(), r({ type: 'income', amount: 480_000 }), r({ type: 'transfer', amount: 50_000 })],
      TODAY,
      convert,
    )
    expect(v.perMonth).toBe(85_000)
    expect(v.counted).toBe(1)
  })

  it('hoàn tiền lặp lại thì TRỪ ra, dù vẫn là expense trong DB', () => {
    const v = monthlyLoad([r({ amount: 10_000 }), r({ amount: 3_000, isRefund: true })], TODAY, convert)
    expect(v.perMonth).toBe(7_000)
  })
})

describe('monthlyLoad — thiếu tỷ giá', () => {
  it('bỏ khỏi tổng và BẬT CỜ, không lặng lẽ cộng thiếu', () => {
    const v = monthlyLoad([r(), r({ currency: 'VND', amount: 1_000_000 })], TODAY, convert)
    expect(v.perMonth).toBe(85_000)
    expect(v.counted).toBe(1)
    expect(v.hasMissingRate).toBe(true)
  })

  it('quy đổi được thì cộng theo base', () => {
    const v = monthlyLoad([r({ currency: 'USD', amount: 100 })], TODAY, convert)
    expect(v.perMonth).toBe(15_000)
    expect(v.hasMissingRate).toBe(false)
  })
})

describe('monthlyLoad — rỗng', () => {
  it('không quy tắc nào → 0, để nơi hiển thị tự ẩn', () => {
    expect(monthlyLoad([], TODAY, convert)).toEqual({
      perMonth: 0,
      counted: 0,
      hasMissingRate: false,
    })
  })
})
