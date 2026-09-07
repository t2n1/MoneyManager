import { describe, expect, it } from 'vitest'
import { evenSplit, planSplit, splitTotal, type SplitPart } from './splitTransaction'

const p = (amount: number, categoryId: string | null = 'c1', note = ''): SplitPart => ({
  amount,
  categoryId,
  note,
})

describe('planSplit — bất biến: tổng các phần = số gốc', () => {
  it('hai phần gõ khít nhau', () => {
    const plan = planSplit(8_400, [p(3_000), p(5_400)])
    expect(plan.error).toBeNull()
    expect(splitTotal(plan)).toBe(8_400)
  })

  it('PHẦN CUỐI lấy số dư, không lấy số đã gõ — một đồng lẻ không được biến mất', () => {
    // Người dùng gõ 3.333 ba lần cho 10.000 → 9.999, thiếu 1.
    const plan = planSplit(10_000, [p(3_333), p(3_333), p(3_333)])
    expect(splitTotal(plan)).toBe(10_000)
    expect(plan.parts[2].amount).toBe(3_334)
  })

  it('gõ thiếu thì phần cuối phình ra cho đủ', () => {
    const plan = planSplit(8_400, [p(1_000), p(1)])
    expect(plan.parts[1].amount).toBe(7_400)
    expect(splitTotal(plan)).toBe(8_400)
  })

  it('làm tròn số lẻ trước khi cộng, không rò số thực vào tổng', () => {
    const plan = planSplit(1_000, [p(333.4), p(0)])
    expect(Number.isInteger(splitTotal(plan))).toBe(true)
    expect(splitTotal(plan)).toBe(1_000)
  })

  it('bất biến giữ cả khi có nhiều phần', () => {
    const plan = planSplit(7_777, [p(1_111), p(2_222), p(3_333), p(0)])
    expect(splitTotal(plan)).toBe(7_777)
  })
})

describe('planSplit — từ chối khi không chia được', () => {
  it('một phần thì không phải là chia', () => {
    expect(planSplit(1_000, [p(1_000)]).error).toContain('ít nhất')
  })

  it('các phần đầu đã dùng HẾT số gốc → phần cuối bằng 0, báo lỗi', () => {
    const plan = planSplit(5_000, [p(5_000), p(0)])
    expect(plan.error).not.toBeNull()
    expect(plan.remainder).toBe(0)
  })

  it('gõ QUÁ số gốc → số dư âm, báo lỗi', () => {
    const plan = planSplit(5_000, [p(6_000), p(0)])
    expect(plan.remainder).toBeLessThan(0)
    expect(plan.error).not.toBeNull()
  })

  it('một phần giữa bằng 0 cũng là lỗi — dòng ¥0 không có nghĩa gì trong sổ', () => {
    expect(planSplit(5_000, [p(0), p(5_000)]).error).not.toBeNull()
  })

  it('số gốc ≤ 0 thì không chia', () => {
    expect(planSplit(0, [p(1), p(1)]).error).toContain('dương')
    expect(planSplit(-100, [p(1), p(1)]).error).not.toBeNull()
  })
})

describe('planSplit — giữ nguyên phần không phải số tiền', () => {
  it('danh mục và ghi chú của từng phần đi qua nguyên vẹn', () => {
    const plan = planSplit(3_000, [p(1_000, 'an', 'đồ ăn'), p(0, 'nha', 'giấy')])
    expect(plan.parts[0].categoryId).toBe('an')
    expect(plan.parts[0].note).toBe('đồ ăn')
    expect(plan.parts[1].categoryId).toBe('nha')
    expect(plan.parts[1].note).toBe('giấy')
  })

  it('không sửa mảng đầu vào', () => {
    const inputs = [p(1_000), p(0)]
    planSplit(3_000, inputs)
    expect(inputs[1].amount).toBe(0)
  })
})

describe('evenSplit', () => {
  it('chia hết thì mọi phần bằng nhau', () => {
    expect(evenSplit(900, 3)).toEqual([300, 300, 300])
  })

  it('chia không hết thì phần CUỐI gánh số dư — tổng vẫn đúng', () => {
    const parts = evenSplit(10_000, 3)
    expect(parts).toEqual([3_333, 3_333, 3_334])
    expect(parts.reduce((s, x) => s + x, 0)).toBe(10_000)
  })

  it('chia làm 2 của số lẻ', () => {
    expect(evenSplit(7, 2)).toEqual([3, 4])
  })

  it('tham số vô nghĩa trả mảng rỗng thay vì NaN', () => {
    expect(evenSplit(0, 3)).toEqual([])
    expect(evenSplit(100, 0)).toEqual([])
  })
})
