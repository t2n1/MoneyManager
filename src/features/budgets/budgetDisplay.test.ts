import { describe, expect, it } from 'vitest'
import type { CategoryRow } from '../../types/database.types'
import { buildBudgetDisplay } from './budgetDisplay'
import { statusOf, type BudgetLine, type BudgetReport } from './progress'

let seq = 0
function cat(p: Partial<CategoryRow> & Pick<CategoryRow, 'id'>): CategoryRow {
  seq += 1
  return {
    id: p.id,
    user_id: 'u',
    name: p.name ?? p.id,
    type: 'expense',
    icon: '📦',
    parent_id: null,
    sort_order: seq,
    is_archived: false,
    created_at: '',
    ...p,
  }
}

function line(categoryId: string, budgeted: number, spent: number, isMarker = false): BudgetLine {
  const ratio = budgeted > 0 ? spent / budgeted : 0
  return { categoryId, budgeted, carried: 0, spent, ratio, status: statusOf(ratio), isMarker }
}

function report(lines: BudgetLine[], spent: Record<string, number> = {}): BudgetReport {
  return {
    lines,
    totalBudgeted: 0,
    totalSpent: 0,
    totalStatus: 'ok',
    overCount: 0,
    warnCount: 0,
    hasMissingRate: false,
    spentByCategory: new Map(Object.entries(spent)),
  }
}

// Cây dùng chung: food (cha) → restaurant, grocery
const food = cat({ id: 'food', name: 'Ăn uống' })
const restaurant = cat({ id: 'restaurant', name: 'Ăn ngoài', parent_id: 'food' })
const grocery = cat({ id: 'grocery', name: 'Đi chợ', parent_id: 'food' })

describe('buildBudgetDisplay', () => {
  it('cha có trần, con chưa đặt → nhóm capped, con hiện chi, marker null', () => {
    const r = report([line('food', 10_000, 7_000)], { restaurant: 4_000, grocery: 3_000 })
    const d = buildBudgetDisplay([food, restaurant, grocery], r)
    expect(d.unbudgeted).toEqual([])
    expect(d.items).toHaveLength(1)
    const g = d.items[0]
    expect(g.kind).toBe('group')
    if (g.kind !== 'group') return
    expect(g).toMatchObject({ cat: food, capped: true, budgeted: 10_000, spent: 7_000 })
    expect(g.children.map((c) => ({ id: c.cat.id, spent: c.spent, marker: c.marker }))).toEqual([
      { id: 'restaurant', spent: 4_000, marker: null },
      { id: 'grocery', spent: 3_000, marker: null },
    ])
  })

  it('cha có trần + con có mốc → con hiện marker', () => {
    const marker = line('restaurant', 5_000, 4_000, true)
    const r = report([line('food', 10_000, 7_000), marker], { restaurant: 4_000, grocery: 3_000 })
    const d = buildBudgetDisplay([food, restaurant, grocery], r)
    const g = d.items[0]
    if (g.kind !== 'group') throw new Error('phải là group')
    expect(g.capped).toBe(true)
    expect(g.children.find((c) => c.cat.id === 'restaurant')!.marker).toEqual(marker)
    expect(g.children.find((c) => c.cat.id === 'grocery')!.marker).toBeNull()
  })

  it('cha KHÔNG trần + con có hạn mức → nhóm tổng-con (capped false)', () => {
    const r = report(
      [line('restaurant', 5_000, 4_000), line('grocery', 10_000, 3_000)],
      { restaurant: 4_000, grocery: 3_000 },
    )
    const d = buildBudgetDisplay([food, restaurant, grocery], r)
    expect(d.unbudgeted).toEqual([])
    const g = d.items[0]
    if (g.kind !== 'group') throw new Error('phải là group')
    expect(g).toMatchObject({ capped: false, budgeted: 15_000, spent: 7_000 })
    expect(g.children).toHaveLength(2)
  })

  it('cha không trần, con cũng không hạn mức → vào danh sách chưa đặt', () => {
    const r = report([], { restaurant: 4_000 })
    const d = buildBudgetDisplay([food, restaurant, grocery], r)
    expect(d.items).toEqual([])
    expect(d.unbudgeted).toEqual([food])
  })

  it('lá độc lập có hạn mức → item leaf', () => {
    const other = cat({ id: 'other', name: 'Khác' })
    const r = report([line('other', 8_000, 2_000)], { other: 2_000 })
    const d = buildBudgetDisplay([other], r)
    expect(d.items).toHaveLength(1)
    expect(d.items[0].kind).toBe('leaf')
    if (d.items[0].kind !== 'leaf') return
    expect(d.items[0].cat).toEqual(other)
  })

  it('lá độc lập chưa có hạn mức → vào danh sách chưa đặt', () => {
    const other = cat({ id: 'other2', name: 'Khác' })
    const d = buildBudgetDisplay([other], report([]))
    expect(d.items).toEqual([])
    expect(d.unbudgeted).toEqual([other])
  })

  it('items sắp theo ratio giảm dần', () => {
    const a = cat({ id: 'a' })
    const b = cat({ id: 'b' })
    const r = report([line('a', 100, 50), line('b', 100, 90)]) // a 50%, b 90%
    const d = buildBudgetDisplay([a, b], r)
    expect(d.items.map((i) => (i.kind === 'leaf' ? i.cat.id : i.cat.id))).toEqual(['b', 'a'])
  })
})
