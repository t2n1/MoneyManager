import { describe, expect, it } from 'vitest'
import type { CategoryRow, NetWorthSnapshotRow } from '../../types/database.types'
import type { AssetGroup } from '../assets/aggregate'
import {
  OTHER_COLOR,
  assetMixRows,
  cashflowRows,
  categoryRows,
  cumulativeRows,
  netWorthRows,
  shortMonth,
} from './boardCharts'

const cat = (id: string, name: string, parent_id: string | null = null) =>
  ({ id, name, parent_id, icon: null }) as unknown as CategoryRow

describe('cashflowRows', () => {
  it('chênh lệch có dấu; tháng chưa có thu → tỷ lệ null, không phải 0', () => {
    const rows = cashflowRows([
      { key: { year: 2026, month: 8 }, income: 1000, expense: 700, transfer: 0 },
      { key: { year: 2026, month: 9 }, income: 0, expense: 300, transfer: 0 },
    ])
    expect(rows[0]).toMatchObject({ label: '8/26', net: 300, rate: 30 })
    expect(rows[1]).toMatchObject({ net: -300, rate: null })
  })
})

describe('categoryRows', () => {
  const cats = [cat('a', 'A'), cat('b', 'B'), cat('c', 'C'), cat('d', 'D'), cat('a1', 'A1', 'a')]

  it('gộp con vào cha, tỷ trọng cộng lại bằng 1', () => {
    const rows = categoryRows(
      { slices: [{ categoryId: 'a1', amount: 300 }, { categoryId: 'a', amount: 100 }, { categoryId: 'b', amount: 600 }], total: 1000, hasForeign: false, hasMissingRate: false },
      cats,
    )
    expect(rows.map((r) => [r.id, r.amount])).toEqual([['b', 600], ['a', 400]])
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1)
  })

  it('đuôi dài gộp thành "Khác"; đuôi một nhóm thì in thẳng nhóm đó', () => {
    const b = {
      slices: [
        { categoryId: 'a', amount: 400 },
        { categoryId: 'b', amount: 300 },
        { categoryId: 'c', amount: 200 },
        { categoryId: 'd', amount: 100 },
      ],
      total: 1000,
      hasForeign: false,
      hasMissingRate: false,
    }
    const two = categoryRows(b, cats, 2)
    expect(two.map((r) => r.id)).toEqual(['a', 'b', '__other'])
    expect(two[2]).toMatchObject({ amount: 300, color: OTHER_COLOR })
    expect(categoryRows(b, cats, 3).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('tháng chưa chi gì → không có lát nào', () => {
    expect(categoryRows({ slices: [], total: 0, hasForeign: false, hasMissingRate: false }, cats)).toEqual([])
  })
})

describe('cumulativeRows', () => {
  const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'].map((date, i) => ({
    date,
    total: (i + 1) * 100,
    top: [],
  }))

  it('cộng dồn tới hôm nay, sau đó null (đường dừng, không kéo phẳng)', () => {
    const rows = cumulativeRows(days, '2026-09-02', 0)
    expect(rows.map((r) => r.cum)).toEqual([100, 300, null, null])
    expect(rows.map((r) => r.daily)).toEqual([100, 200, null, null])
    expect(rows[0].label).toBe('1')
  })

  it('đường hạn mức chia đều theo ngày, chạm đúng hạn mức ở ngày cuối', () => {
    const rows = cumulativeRows(days, '2026-09-30', 1000)
    expect(rows.map((r) => r.pace)).toEqual([250, 500, 750, 1000])
    expect(cumulativeRows(days, '2026-09-30', 0)[0].pace).toBeNull()
  })
})

describe('netWorthRows', () => {
  it('sắp cũ → mới và chỉ giữ `limit` lần chụp cuối', () => {
    const snap = (snapshot_on: string, net_worth: number) => ({ snapshot_on, net_worth }) as NetWorthSnapshotRow
    const rows = netWorthRows([snap('2026-09-01', 3), snap('2026-07-01', 1), snap('2026-08-01', 2)], 2)
    expect(rows.map((r) => r.value)).toEqual([2, 3])
    expect(rows[0].label).toBe(shortMonth({ year: 2026, month: 8 }))
  })
})

describe('assetMixRows', () => {
  it('chỉ nhóm tính vào tổng và có tiền mới thành lát', () => {
    const g = (name: string, total: number, includeInTotals = true) =>
      ({ name, total, includeInTotals }) as AssetGroup
    const rows = assetMixRows([g('A', 700), g('B', 0), g('C', 500, false), g('D', 300)])
    expect(rows.map((r) => r.id)).toEqual(['A', 'D'])
    expect(rows[0].share).toBeCloseTo(0.7)
  })
})
