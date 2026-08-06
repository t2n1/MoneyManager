import { describe, expect, it } from 'vitest'
import { spendHistogram } from './histogram'

describe('spendHistogram', () => {
  it('chia đều khoảng và đếm đúng', () => {
    const bins = spendHistogram([0, 10, 20, 30], 2)
    expect(bins).toHaveLength(2)
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(4)
  })

  it('giá trị lớn nhất rơi vào cột cuối, không tràn ra ngoài', () => {
    const bins = spendHistogram([0, 100], 4)
    expect(bins[bins.length - 1].count).toBe(1)
  })

  it('mọi khoản bằng nhau → một cột duy nhất chứa hết', () => {
    const bins = spendHistogram([50, 50, 50], 4)
    expect(bins).toHaveLength(1)
    expect(bins[0].count).toBe(3)
  })

  it('mảng rỗng → không có cột nào', () => {
    expect(spendHistogram([], 4)).toEqual([])
  })

  it('số cột không vượt số khoản chi', () => {
    expect(spendHistogram([10, 20], 12).length).toBeLessThanOrEqual(2)
  })

  it('biên các cột nối liền nhau, không hở không chồng', () => {
    const bins = spendHistogram([0, 100], 4)
    for (let i = 1; i < bins.length; i++) {
      expect(bins[i].from).toBeCloseTo(bins[i - 1].to, 6)
    }
    expect(bins[0].from).toBe(0)
    expect(bins[bins.length - 1].to).toBe(100)
  })

  it('không mất khoản nào dù giá trị lệch mạnh', () => {
    const amounts = [100, 200, 300, 50_000]
    const bins = spendHistogram(amounts, 12)
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(amounts.length)
  })
})
