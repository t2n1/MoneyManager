import { describe, expect, it } from 'vitest'
import { parsePctToBps, rebalancePlan } from './rebalance'

const g = (name: string, total: number, includeInTotals = true) => ({
  name,
  total,
  includeInTotals,
})

/** Chỉ những nhóm ĐÃ khai mục tiêu, xếp theo |lệch| giảm dần — thứ `worst` lấy ra. */
const declared = (r: NonNullable<ReturnType<typeof rebalancePlan>>) =>
  r.rows.filter((x) => x.targetPct !== null)

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

  it('null chỉ khi không có gì để chia — mẫu số ≤ 0', () => {
    expect(rebalancePlan([], new Map())).toBeNull()
    expect(rebalancePlan([g('Rỗng', 0)], new Map([['Rỗng', 5_000]]))).toBeNull()
    // Chưa ai khai mục tiêu KHÔNG còn là null: thẻ Cơ cấu dùng chính `rows` để vẽ vạch.
    const r = rebalancePlan([g('A', 100), g('B', 300)], new Map())
    expect(r).not.toBeNull()
    expect(r!.worst).toBeNull()
    expect(r!.alert).toBe(false)
    expect(declared(r!)).toEqual([])
  })

  it('rows là MỌI nhóm trong mẫu số, xếp theo số tiền giảm dần', () => {
    const r = rebalancePlan(
      [g('Bé', 100_000), g('To', 900_000)],
      new Map([['Bé', 5_000]]),
    )
    expect(r!.rows.map((x) => x.name)).toEqual(['To', 'Bé'])
    expect(r!.rows[0].targetPct).toBeNull()
    expect(r!.rows[0].driftPp).toBeNull()
    expect(r!.rows[0].actualPct).toBeCloseTo(90, 6)
  })

  describe('mẫu số suy từ chính lời khai', () => {
    const groups = [
      g('Chi tiêu', 188_369),
      g('Dự phòng', 488_917),
      g('Đầu tư', 3_300_000, false),
      g('Tài sản Việt Nam', 0, false),
    ]

    it('chưa khai nhóm nào ngoài tổng → mẫu số y như cũ, nhóm ngoài tổng không có mặt', () => {
      const r = rebalancePlan(
        groups,
        new Map([
          ['Chi tiêu', 3_000],
          ['Dự phòng', 7_000],
        ]),
      )
      expect(r!.basis).toBe('totals')
      expect(r!.denominator).toBe(677_286)
      expect(r!.rows.map((x) => x.name)).toEqual(['Dự phòng', 'Chi tiêu'])
      expect(r!.rows.find((x) => x.name === 'Dự phòng')!.actualPct).toBeCloseTo(72.19, 2)
    })

    it('khai mục tiêu cho một nhóm ngoài tổng → mẫu số nở ra toàn bộ tài sản', () => {
      const r = rebalancePlan(
        groups,
        new Map([
          ['Đầu tư', 8_000],
          ['Dự phòng', 1_500],
          ['Chi tiêu', 500],
        ]),
      )
      expect(r!.basis).toBe('all')
      expect(r!.denominator).toBe(3_977_286)
      expect(r!.rows.map((x) => x.name)).toEqual(['Đầu tư', 'Dự phòng', 'Chi tiêu'])
      expect(r!.rows[0].actualPct).toBeCloseTo(82.97, 2)
      // Nhóm total = 0 không vào mẫu số dù đứng ngoài tổng — nó không có gì để chia.
      expect(r!.rows.some((x) => x.name === 'Tài sản Việt Nam')).toBe(false)
    })

    it('mục tiêu 0% hoặc nhóm ngoài tổng rỗng không đủ để nở mẫu số', () => {
      expect(rebalancePlan(groups, new Map([['Đầu tư', 0]]))!.basis).toBe('totals')
      expect(rebalancePlan(groups, new Map([['Tài sản Việt Nam', 5_000]]))!.basis).toBe(
        'totals',
      )
    })
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
