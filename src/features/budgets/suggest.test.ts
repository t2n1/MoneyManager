import { describe, expect, it } from 'vitest'
import { isOffAverage, rollUpParents, suggestLimits, type MonthSlices } from './suggest'

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

describe('rollUpParents', () => {
  // Cây thật rút gọn: Nhà ở > (Tiền nhà, Điện); Ăn uống > Cơm ngoài.
  const parentOf = (id: string) =>
    ({ rent: 'home', power: 'home', eatout: 'food' })[id] ?? null

  it('cộng con theo TỪNG THÁNG rồi mới lấy trung bình và cao nhất', () => {
    // Hai con đạt đỉnh ở hai tháng KHÁC nhau: cộng `max` của từng con ra ¥120.000,
    // một tháng chưa từng xảy ra. Cộng theo tháng ra ¥110.000 — tháng thật sự đắt nhất.
    const r = suggestLimits(
      rollUpParents(
        [
          m('2026-06', ['rent', 100_000], ['power', 5_000]),
          m('2026-07', ['rent', 90_000], ['power', 20_000]),
        ],
        parentOf,
      ),
    )
    expect(r.get('home')).toMatchObject({ average: 107_500, max: 110_000 })
    expect(r.get('home')!.months).toEqual([
      { monthKey: '2026-06', amount: 105_000 },
      { monthKey: '2026-07', amount: 110_000 },
    ])
  })

  it('cha có khoản ghi thẳng vào nó thì CỘNG THÊM, không bị con đè mất', () => {
    const r = suggestLimits(
      rollUpParents([m('2026-06', ['home', 3_000], ['rent', 100_000])], parentOf),
    )
    expect(r.get('home')!.max).toBe(103_000)
  })

  it('con giữ nguyên số của chính nó', () => {
    const r = suggestLimits(
      rollUpParents([m('2026-06', ['rent', 100_000], ['power', 5_000])], parentOf),
    )
    expect(r.get('rent')!.max).toBe(100_000)
    expect(r.get('power')!.max).toBe(5_000)
  })

  it('danh mục không có cha thì không đẻ thêm dòng nào', () => {
    const out = rollUpParents([m('2026-06', ['misc', 500])], () => null)
    expect(out).toEqual([m('2026-06', ['misc', 500])])
  })

  it('cây ba tầng: ông nhận cả cháu', () => {
    const deep = (id: string) => ({ rent: 'home', home: 'living' })[id] ?? null
    const r = suggestLimits(rollUpParents([m('2026-06', ['rent', 100_000])], deep))
    expect(r.get('living')!.max).toBe(100_000)
    expect(r.get('home')!.max).toBe(100_000)
  })

  it('cha trỏ vòng về con thì dừng, không treo máy', () => {
    const loop = (id: string) => (id === 'a' ? 'b' : 'a')
    const r = suggestLimits(rollUpParents([m('2026-06', ['a', 100])], loop))
    expect(r.get('b')!.max).toBe(100)
  })
})
