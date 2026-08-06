import { describe, expect, it } from 'vitest'
import { uncategorizedByMonth } from './uncategorized'

const tx = (occurred_on: string, category_id: string | null, type = 'expense') => ({
  occurred_on,
  category_id,
  type,
})

describe('uncategorizedByMonth', () => {
  it('gom theo tháng và đếm số khoản chưa gắn', () => {
    const r = uncategorizedByMonth([
      tx('2026-08-01', null),
      tx('2026-08-02', 'c1'),
      tx('2026-08-03', null),
    ])
    expect(r).toEqual([{ monthKey: '2026-08', pending: 2, total: 3, doneRatio: 1 / 3 }])
  })

  it('tháng cũ nhất lên trước', () => {
    const r = uncategorizedByMonth([tx('2026-08-01', null), tx('2026-06-01', null)])
    expect(r.map((x) => x.monthKey)).toEqual(['2026-06', '2026-08'])
  })

  it('tháng đã gắn đủ thì không hiện', () => {
    const r = uncategorizedByMonth([tx('2026-08-01', 'c1'), tx('2026-07-01', null)])
    expect(r.map((x) => x.monthKey)).toEqual(['2026-07'])
  })

  it('bỏ qua chuyển khoản — chuyển khoản vốn không có danh mục', () => {
    expect(uncategorizedByMonth([tx('2026-08-01', null, 'transfer')])).toEqual([])
  })

  it('chuyển khoản không làm phồng mẫu số của tháng', () => {
    const r = uncategorizedByMonth([
      tx('2026-08-01', null),
      tx('2026-08-02', 'c1'),
      tx('2026-08-03', null, 'transfer'),
    ])
    expect(r[0].total).toBe(2)
    expect(r[0].doneRatio).toBe(0.5)
  })

  it('không có gì → mảng rỗng', () => {
    expect(uncategorizedByMonth([])).toEqual([])
  })

  it('cả tháng chưa gắn gì → doneRatio 0', () => {
    const r = uncategorizedByMonth([tx('2026-08-01', null), tx('2026-08-02', null)])
    expect(r[0]).toEqual({ monthKey: '2026-08', pending: 2, total: 2, doneRatio: 0 })
  })
})
