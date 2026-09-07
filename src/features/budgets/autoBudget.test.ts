import { describe, expect, it } from 'vitest'
import { planAutoBudget, roundLimit, type AutoBudgetInput } from './autoBudget'

const input = (over: Partial<AutoBudgetInput> = {}): AutoBudgetInput => ({
  averages: new Map([
    ['an', 42_300],
    ['nha', 68_000],
    ['xe', 1_240],
  ]),
  current: new Map(),
  eligible: ['an', 'nha', 'xe'],
  ...over,
})

describe('roundLimit — số tròn để nhớ được và sửa được', () => {
  it('dưới 1.000 làm tròn trăm, có sàn 100', () => {
    expect(roundLimit(430)).toBe(400)
    expect(roundLimit(12)).toBe(100)
  })

  it('1.000–10.000 làm tròn 500', () => {
    expect(roundLimit(4_240)).toBe(4_000)
    expect(roundLimit(4_260)).toBe(4_500)
  })

  it('10.000–100.000 làm tròn nghìn', () => {
    expect(roundLimit(42_300)).toBe(42_000)
  })

  it('trên 100.000 làm tròn vạn', () => {
    expect(roundLimit(683_000)).toBe(680_000)
  })

  it('0 hoặc âm trả 0 — không sinh hạn mức từ hư không', () => {
    expect(roundLimit(0)).toBe(0)
    expect(roundLimit(-500)).toBe(0)
  })
})

describe('planAutoBudget', () => {
  it('sinh một dòng cho mỗi danh mục có lịch sử, sắp giảm dần', () => {
    const p = planAutoBudget(input())
    expect(p.lines.map((l) => l.categoryId)).toEqual(['nha', 'an', 'xe'])
    expect(p.lines[0].amount).toBe(68_000)
  })

  it('danh mục KHÔNG có lịch sử bị bỏ hẳn, không đặt hạn mức 0', () => {
    const p = planAutoBudget(input({ eligible: ['an', 'nha', 'xe', 'moi'] }))
    expect(p.lines.some((l) => l.categoryId === 'moi')).toBe(false)
  })

  it('chỉ đụng danh mục trong danh sách được phép', () => {
    const p = planAutoBudget(input({ eligible: ['an'] }))
    expect(p.lines).toHaveLength(1)
  })

  it('ngưỡng minAverage loại danh mục quá nhỏ — hạn mức chỉ có nghĩa khi vượt nó là tin', () => {
    const p = planAutoBudget(input({ minAverage: 2_000 }))
    expect(p.lines.map((l) => l.categoryId)).toEqual(['nha', 'an'])
  })

  it('ĐẾM đúng số dòng sẽ đè lên hạn mức đang có', () => {
    const p = planAutoBudget(input({ current: new Map([['nha', 60_000]]) }))
    expect(p.overwrite).toBe(1)
    expect(p.lines.find((l) => l.categoryId === 'nha')!.current).toBe(60_000)
  })

  it('keepExisting giữ nguyên hạn mức đã đặt, chỉ điền chỗ trống', () => {
    const p = planAutoBudget(input({ current: new Map([['nha', 60_000]]), keepExisting: true }))
    expect(p.lines.map((l) => l.categoryId)).toEqual(['an', 'xe'])
    expect(p.overwrite).toBe(0)
  })

  it('làm tròn xong TRÙNG hạn mức đang có thì không phải một thay đổi', () => {
    const p = planAutoBudget(input({ current: new Map([['nha', 68_000]]) }))
    expect(p.lines.some((l) => l.categoryId === 'nha')).toBe(false)
    expect(p.overwrite).toBe(0)
  })

  it('tổng cộng đúng bằng tổng các dòng', () => {
    const p = planAutoBudget(input())
    expect(p.total).toBe(p.lines.reduce((s, l) => s + l.amount, 0))
  })

  it('không có gì để đề xuất thì trả kế hoạch rỗng, không NaN', () => {
    const p = planAutoBudget(input({ averages: new Map(), eligible: [] }))
    expect(p).toEqual({ lines: [], overwrite: 0, total: 0 })
  })

  it('trung bình âm (hoàn tiền nhiều hơn chi) không sinh hạn mức', () => {
    const p = planAutoBudget(input({ averages: new Map([['an', -5_000]]), eligible: ['an'] }))
    expect(p.lines).toEqual([])
  })
})
