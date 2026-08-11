import { describe, expect, it } from 'vitest'
import { suggestLimits, type MonthSlices } from './suggest'

const m = (monthKey: string, ...pairs: [string, number][]): MonthSlices => ({
  monthKey,
  slices: pairs.map(([categoryId, amount]) => ({ categoryId, amount })),
})

describe('suggestLimits', () => {
  it('trung bình và cao nhất của các tháng trong cửa sổ', () => {
    const r = suggestLimits([
      m('2026-06', ['food', 42_100]),
      m('2026-07', ['food', 48_300]),
      m('2026-08', ['food', 45_200]),
    ])
    expect(r.get('food')).toMatchObject({ average: 45_200, max: 48_300 })
  })

  it('giữ chuỗi từng tháng theo thứ tự truyền vào (cũ → mới)', () => {
    const r = suggestLimits([m('2026-06', ['food', 100]), m('2026-07', ['food', 300])])
    expect(r.get('food')!.months).toEqual([
      { monthKey: '2026-06', amount: 100 },
      { monthKey: '2026-07', amount: 300 },
    ])
  })

  it('tháng CÓ dữ liệu mà danh mục không phát sinh vẫn tính là 0', () => {
    // "Sửa xe 45.000 mỗi ba tháng" đúng ra là 15.000 một tháng. Bỏ tháng 0 ra khỏi
    // mẫu số là gợi ý 45.000 mỗi tháng — gấp ba lần thực tế.
    const r = suggestLimits([
      m('2026-06', ['food', 40_000], ['car', 45_000]),
      m('2026-07', ['food', 40_000]),
      m('2026-08', ['food', 40_000]),
    ])
    expect(r.get('car')).toMatchObject({ average: 15_000, max: 45_000 })
    expect(r.get('car')!.months.map((x) => x.amount)).toEqual([45_000, 0, 0])
  })

  it('tháng TRỐNG TRƠN là chưa có dữ liệu, không phải tháng tiêu 0 đồng', () => {
    // Mới cài app tháng trước: hai tháng đầu rỗng. Cộng chúng vào là gợi ý tụt còn
    // một phần ba trong khi người ta chẳng đổi thói quen gì.
    const r = suggestLimits([
      m('2026-06'),
      m('2026-07'),
      m('2026-08', ['food', 45_000]),
    ])
    expect(r.get('food')).toMatchObject({ average: 45_000, max: 45_000 })
    expect(r.get('food')!.months).toHaveLength(1)
  })

  it('không tháng nào có dữ liệu → không gợi ý gì', () => {
    expect(suggestLimits([]).size).toBe(0)
    expect(suggestLimits([m('2026-08')]).size).toBe(0)
  })

  it('gợi ý cho mọi danh mục từng phát sinh, không chỉ danh mục của tháng cuối', () => {
    const r = suggestLimits([
      m('2026-06', ['food', 100], ['fun', 50]),
      m('2026-07', ['food', 100]),
    ])
    expect([...r.keys()].sort()).toEqual(['food', 'fun'])
    expect(r.get('fun')).toMatchObject({ average: 25, max: 50 })
  })

  it('trung bình làm tròn, không để lộ số lẻ', () => {
    const r = suggestLimits([m('2026-06', ['food', 100]), m('2026-07', ['food', 101])])
    expect(Number.isInteger(r.get('food')!.average)).toBe(true)
    expect(r.get('food')!.average).toBe(101)
  })
})
