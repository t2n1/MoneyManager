import { describe, expect, it } from 'vitest'
import { netWorthSeries } from './netWorthSeries'

const snap = (dateISO: string, net: number) => ({ snapshot_on: dateISO, net_worth: net })

describe('netWorthSeries', () => {
  it('loại một đoạn nhảy rồi rơi về chỗ cũ — và nói ra đã loại mấy mốc', () => {
    const s = netWorthSeries(
      [
        snap('2026-07-28', 2_600_000),
        snap('2026-07-31', 42_000_000), // ¥ bị ghi bằng số ₫ → lệch ~164×
        snap('2026-08-03', 43_100_000),
        snap('2026-08-06', 41_500_000),
        snap('2026-08-10', 2_640_000),
        snap('2026-08-20', 2_602_034),
      ],
      null,
    )
    expect(s.points.map((p) => p.dateISO)).toEqual([
      '2026-07-28',
      '2026-08-10',
      '2026-08-20',
    ])
    expect(s.dropped).toEqual([
      { count: 3, fromISO: '2026-07-31', toISO: '2026-08-06' },
    ])
  })

  it('KHÔNG loại một cú tăng thật — cú tăng thật thì ở lại', () => {
    // Cùng biên độ với ca trên, khác đúng một điều: mốc sau không rơi về.
    const s = netWorthSeries(
      [
        snap('2026-01-01', 200_000),
        snap('2026-02-01', 5_000_000),
        snap('2026-03-01', 5_200_000),
        snap('2026-04-01', 5_400_000),
      ],
      null,
    )
    expect(s.dropped).toEqual([])
    expect(s.points).toHaveLength(4)
  })

  it('KHÔNG loại tăng trưởng đều, dù tổng cả kỳ gấp nhiều lần', () => {
    const s = netWorthSeries(
      Array.from({ length: 12 }, (_, i) => snap(`2026-${String(i + 1).padStart(2, '0')}-01`, 100_000 * (i + 1))),
      null,
    )
    expect(s.dropped).toEqual([])
    expect(s.points).toHaveLength(12)
    expect(s.delta).toBe(1_100_000)
  })

  it('đoạn dài hơn trần thì GIỮ — đó là hiện trạng của sổ, không phải nhiễu', () => {
    const s = netWorthSeries(
      [
        snap('2026-01-01', 200_000),
        ...Array.from({ length: 6 }, (_, i) => snap(`2026-02-${String(i + 1).padStart(2, '0')}`, 9_000_000)),
        snap('2026-03-01', 210_000),
      ],
      null,
    )
    expect(s.dropped).toEqual([])
    expect(s.points).toHaveLength(8)
  })

  it('cắt theo khoảng TRƯỚC khi lọc — mốc kẹp phải nằm trong khoảng người dùng thấy', () => {
    const s = netWorthSeries(
      [
        snap('2026-01-01', 100_000),
        snap('2026-06-01', 9_000_000), // sát mép trái của khoảng
        snap('2026-07-01', 120_000),
      ],
      '2026-06-01',
    )
    // Mốc 06-01 là mốc ĐẦU của khoảng nên không có gì kẹp bên trái → không loại.
    expect(s.dropped).toEqual([])
    expect(s.points.map((p) => p.dateISO)).toEqual(['2026-06-01', '2026-07-01'])
  })

  it('mốc đầu ≤ 0 thì bỏ phần trăm, vẫn giữ hiệu tuyệt đối', () => {
    const s = netWorthSeries([snap('2026-01-01', 0), snap('2026-02-01', 50_000)], null)
    expect(s.delta).toBe(50_000)
    expect(s.deltaPct).toBeNull()
  })

  it('dưới hai mốc thì không có hiệu để nói', () => {
    const s = netWorthSeries([snap('2026-01-01', 10_000)], null)
    expect(s.delta).toBeNull()
    expect(s.deltaPct).toBeNull()
  })
})
