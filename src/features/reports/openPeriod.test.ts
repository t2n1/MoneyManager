import { describe, expect, it } from 'vitest'
import { hasOpenPeriod, splitOpenSeries } from './openPeriod'
import type { MonthKey } from '../../lib/dates'

const k = (year: number, month: number): MonthKey => ({ year, month })
const pts = (...keys: MonthKey[]) => keys.map((key) => ({ key }))

describe('hasOpenPeriod', () => {
  it('điểm cuối đúng là tháng hiện tại', () => {
    expect(hasOpenPeriod(pts(k(2026, 8), k(2026, 9)), k(2026, 9))).toBe(true)
  })

  it('tháng hiện tại nằm GIỮA chuỗi thì không tính — chỉ điểm cuối mới vẽ dở', () => {
    expect(hasOpenPeriod(pts(k(2026, 9), k(2026, 10)), k(2026, 9))).toBe(false)
  })

  it('không truyền tháng hiện tại thì mọi kỳ coi như đã trọn', () => {
    expect(hasOpenPeriod(pts(k(2026, 9)), null)).toBe(false)
  })

  it('chuỗi rỗng không nổ', () => {
    expect(hasOpenPeriod([], k(2026, 9))).toBe(false)
  })

  it('cùng tháng khác NĂM là hai kỳ khác nhau', () => {
    expect(hasOpenPeriod(pts(k(2025, 9)), k(2026, 9))).toBe(false)
  })
})

describe('splitOpenSeries — kỳ cuối đang dở', () => {
  const s = splitOpenSeries([10, 20, 30, 40], true)

  it('nét liền dừng lại TRƯỚC kỳ dở', () => {
    expect(s.solid).toEqual([10, 20, 30, null])
  })

  it('nét đứt có giá trị ở CẢ HAI đầu — thiếu điểm giáp ranh thì không có đoạn để nối', () => {
    expect(s.open).toEqual([null, null, 30, 40])
  })

  it('bản đủ giữ nguyên mọi giá trị cho bảng chú giải', () => {
    expect(s.all).toEqual([10, 20, 30, 40])
  })

  it('điểm giáp ranh CÓ MẶT ở cả hai chuỗi — nơi gọi phải tắt chú giải một bên', () => {
    expect(s.solid[2]).not.toBeNull()
    expect(s.open[2]).not.toBeNull()
  })

  it('giá trị null của dữ liệu (tháng chưa có thu) không bị biến thành số', () => {
    const g = splitOpenSeries([10, null, 30, 40], true)
    expect(g.solid[1]).toBeNull()
    expect(g.all[1]).toBeNull()
  })
})

describe('splitOpenSeries — kỳ cuối đã trọn', () => {
  const s = splitOpenSeries([10, 20, 30], false)

  it('nét liền giữ nguyên cả chuỗi', () => {
    expect(s.solid).toEqual([10, 20, 30])
  })

  it('không sinh đoạn nét đứt nào', () => {
    expect(s.open).toEqual([null, null, null])
  })

  it('nét liền và bản đủ trùng nhau — nơi gọi không cần chuỗi chuyên chở', () => {
    expect(s.solid).toEqual(s.all)
  })
})

describe('splitOpenSeries — biên', () => {
  it('chuỗi MỘT điểm không tách được: không có điểm giáp ranh nào để nối', () => {
    const s = splitOpenSeries([42], true)
    expect(s.solid).toEqual([42])
    expect(s.open).toEqual([null])
  })

  it('chuỗi rỗng trả ba mảng rỗng', () => {
    const s = splitOpenSeries([], true)
    expect(s.solid).toEqual([])
    expect(s.open).toEqual([])
    expect(s.all).toEqual([])
  })

  it('không sửa mảng gốc', () => {
    const src = [1, 2, 3]
    splitOpenSeries(src, true)
    expect(src).toEqual([1, 2, 3])
  })

  it('cả ba mảng luôn cùng độ dài với dữ liệu vào', () => {
    for (const open of [true, false]) {
      const s = splitOpenSeries([1, 2, 3, 4, 5], open)
      expect(s.solid).toHaveLength(5)
      expect(s.open).toHaveLength(5)
      expect(s.all).toHaveLength(5)
    }
  })
})
