import { describe, expect, it } from 'vitest'
import { parsePctToBps, rebalancePlan } from './rebalance'

const g = (name: string, total: number, includeInTotals = true) => ({
  name,
  total,
  includeInTotals,
})

describe('rebalancePlan', () => {
  it('lệch 10 điểm % → alert, nêu đúng nhóm lệch nhất và số tiền mới cần góp', () => {
    // Đầu tư 40% (mục tiêu 50%), tiền mặt 60% (mục tiêu 50%).
    const r = rebalancePlan(
      [g('Đầu tư', 400_000), g('Tiền mặt', 600_000)],
      new Map([
        ['Đầu tư', 5_000],
        ['Tiền mặt', 5_000],
      ]),
    )
    expect(r).not.toBeNull()
    expect(r!.alert).toBe(true)
    expect(r!.worst!.name).toBe('Đầu tư')
    expect(r!.worst!.driftPp).toBeCloseTo(-10, 6)
    // Góp x vào Đầu tư: (400k + x)/(1M + x) = 50% → x = 200k. Kiểm lại bằng chính đề bài.
    expect(r!.worst!.addToReachMinor).toBe(200_000)
    expect((400_000 + 200_000) / (1_000_000 + 200_000)).toBeCloseTo(0.5, 10)
    // Nhóm đang VƯỢT mục tiêu thì không có "góp thêm" — thứ cần góp là nhóm kia.
    expect(r!.rows.find((x) => x.name === 'Tiền mặt')!.addToReachMinor).toBeNull()
  })

  it('lệch dưới 5 điểm % → không alert', () => {
    const r = rebalancePlan(
      [g('Đầu tư', 480_000), g('Tiền mặt', 520_000)],
      new Map([['Đầu tư', 5_000]]),
    )
    expect(r!.alert).toBe(false)
    expect(r!.maxDriftPp).toBeCloseTo(2, 6)
  })

  it('nhóm ngoài tổng không vào mẫu số; chưa ai khai mục tiêu → null', () => {
    const groups = [g('Đầu tư', 500_000), g('Két riêng', 500_000, false), g('Tiền mặt', 500_000)]
    const r = rebalancePlan(groups, new Map([['Đầu tư', 5_000]]))
    expect(r!.rows[0].actualPct).toBeCloseTo(50, 6) // mẫu số 1M, không phải 1,5M
    expect(rebalancePlan(groups, new Map())).toBeNull()
    expect(rebalancePlan([g('Rỗng', 0)], new Map([['Rỗng', 5_000]]))).toBeNull()
  })

  it('tổng mục tiêu đã khai được cộng lại để UI nhắc khi vượt 100', () => {
    const r = rebalancePlan(
      [g('A', 100), g('B', 100)],
      new Map([
        ['A', 6_000],
        ['B', 6_000],
      ]),
    )
    expect(r!.declaredPct).toBeCloseTo(120, 6)
  })
})

describe('parsePctToBps', () => {
  it('nhận phẩy lẫn chấm, rỗng = xoá, rác/ngoài [0,100] = giữ nguyên', () => {
    expect(parsePctToBps('30')).toBe(3_000)
    expect(parsePctToBps('12,5')).toBe(1_250)
    expect(parsePctToBps('50%')).toBe(5_000)
    expect(parsePctToBps('')).toBeNull()
    expect(parsePctToBps('abc')).toBeUndefined()
    expect(parsePctToBps('120')).toBeUndefined()
  })
})
