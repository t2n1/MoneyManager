import { describe, expect, it } from 'vitest'
import { isOffAverage, suggestLimits, type MonthSlices } from './suggest'

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

describe('isOffAverage', () => {
  it('lệch tỉ lệ NHƯNG số tiền bé thì im', () => {
    // Ca thật: Gas TB ¥58, hạn mức ¥1,500 — "gấp 26 lần" nghe như báo động, thực ra là
    // một khoản bé có một tháng nhảy. Thiếu ngưỡng tiền thì Gas, Điện thoại, Cây & Cá đều
    // bị tô, và một cảnh báo lúc nào cũng kêu thì mất luôn cả lần nó đúng.
    expect(isOffAverage(1_500, 58)).toBe(false)
    expect(isOffAverage(1_300, 1_021)).toBe(false)
  })

  it('lệch cả tỉ lệ lẫn tiền thì nói ra', () => {
    // Điện: TB ¥13,070, hạn mức ¥3,000 → thấp hơn nửa trung bình, chênh ¥10,070.
    expect(isOffAverage(3_000, 13_070)).toBe(true)
    // Hỗ trợ gia đình: TB ¥3,333, hạn mức ¥30,000 → gấp 9 lần, chênh ¥26,667.
    expect(isOffAverage(30_000, 3_333)).toBe(true)
  })

  it('trong khoảng [0,5 ; 1,5] thì im dù tiền lớn', () => {
    expect(isOffAverage(112_760, 104_427)).toBe(false)
  })

  it('chưa có lịch sử hoặc chưa đặt hạn mức → không có gì để so', () => {
    expect(isOffAverage(5_000, 0)).toBe(false)
    expect(isOffAverage(0, 5_000)).toBe(false)
  })
})
