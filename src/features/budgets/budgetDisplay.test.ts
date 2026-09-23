import { describe, expect, it } from 'vitest'
import type { CategoryRow } from '../../types/database.types'
import { buildBudgetDisplay } from './budgetDisplay'
import { budgetRatio, statusOf, type BudgetLine, type BudgetReport } from './progress'

let seq = 0
function cat(p: Partial<CategoryRow> & Pick<CategoryRow, 'id'>): CategoryRow {
  seq += 1
  return {
    user_id: 'u',
    name: p.name ?? p.id,
    type: 'expense',
    icon: '📦',
    parent_id: null,
    sort_order: seq,
    is_archived: false,
    created_at: '',
    need_level: null,
    cost_type: null,
    kind: 'expense',
    ...p,
  }
}

function line(categoryId: string, budgeted: number, spent: number, isMarker = false): BudgetLine {
  const ratio = budgetRatio(spent, budgeted)
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
    expect(g.markerTotal).toBe(5_000)
  })

  it('tổng mốc con vượt trần cha → markerTotal > budgeted (để UI cảnh báo)', () => {
    const r = report(
      [
        line('food', 10_000, 7_000),
        line('restaurant', 6_000, 4_000, true),
        line('grocery', 7_000, 3_000, true),
      ],
      { restaurant: 4_000, grocery: 3_000 },
    )
    const g = buildBudgetDisplay([food, restaurant, grocery], r).items[0]
    if (g.kind !== 'group') throw new Error('phải là group')
    expect(g).toMatchObject({ capped: true, budgeted: 10_000, markerTotal: 13_000 })
  })

  it('nhóm tổng-con: markerTotal = 0 vì hạn mức con chính là trần', () => {
    const r = report([line('restaurant', 5_000, 4_000)], { restaurant: 4_000 })
    const g = buildBudgetDisplay([food, restaurant, grocery], r).items[0]
    if (g.kind !== 'group') throw new Error('phải là group')
    expect(g).toMatchObject({ capped: false, budgeted: 5_000, markerTotal: 0 })
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

  it('cha không trần, con cũng không hạn mức → chưa đặt, kèm danh sách con', () => {
    const r = report([], { restaurant: 4_000 })
    const d = buildBudgetDisplay([food, restaurant, grocery], r)
    expect(d.items).toEqual([])
    expect(d.unbudgeted).toEqual([{ cat: food, children: [restaurant, grocery] }])
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

  it('lá độc lập chưa có hạn mức → vào danh sách chưa đặt, không có con', () => {
    const other = cat({ id: 'other2', name: 'Khác' })
    const d = buildBudgetDisplay([other], report([]))
    expect(d.items).toEqual([])
    expect(d.unbudgeted).toEqual([{ cat: other, children: [] }])
  })

  // Danh mục dòng chảy (Cho vay / Trả nợ / Điều chỉnh số dư): giao dịch bị loại
  // khỏi báo cáo nên chi luôn 0 — bày ra chỉ mời người dùng đặt trần vô nghĩa.
  it('danh mục dòng chảy không vào danh sách chưa đặt', () => {
    const lend = cat({ id: 'lend', name: 'Cho vay' })
    const repay = cat({ id: 'repay', name: 'Trả nợ' })
    const adjust = cat({ id: 'adjust', name: 'Điều chỉnh số dư' })
    const other = cat({ id: 'other3', name: 'Khác' })
    const d = buildBudgetDisplay([lend, repay, adjust, other], report([]))
    expect(d.unbudgeted).toEqual([{ cat: other, children: [] }])
  })

  it('danh mục dòng chảy lỡ có hạn mức cũ cũng bị ẩn', () => {
    const lend = cat({ id: 'lend2', name: 'Cho vay' })
    const r = report([line('lend2', 5_000, 0)])
    expect(buildBudgetDisplay([lend], r).items).toEqual([])
  })

  it('items sắp theo ratio giảm dần', () => {
    const a = cat({ id: 'a' })
    const b = cat({ id: 'b' })
    const r = report([line('a', 100, 50), line('b', 100, 90)]) // a 50%, b 90%
    const d = buildBudgetDisplay([a, b], r)
    expect(d.items.map((i) => (i.kind === 'leaf' ? i.cat.id : i.cat.id))).toEqual(['b', 'a'])
  })
})

describe('trần ¥0 ở nhóm tổng-con', () => {
  // Ca thật: cha Sức khỏe chưa đặt trần, con Thuốc trần ¥0, đã chi ¥460. Trang Ngân sách
  // từng in "chưa trần" ở cả dòng nhóm lẫn dòng con, còn Bản tin in "460 / 0 — vượt".
  const suc = cat({ id: 'suc', name: 'Sức khỏe' })
  const thuoc = cat({ id: 'thuoc', name: 'Thuốc', parent_id: 'suc' })
  const kham = cat({ id: 'kham', name: 'Khám', parent_id: 'suc' })

  it('con có trần ¥0 mà đã chi → nhóm tổng-con VƯỢT, không phải ok', () => {
    const d = buildBudgetDisplay(
      [suc, thuoc, kham],
      report([line('thuoc', 0, 460)], { thuoc: 460 }),
    )
    const g = d.items[0]
    expect(g.kind).toBe('group')
    if (g.kind !== 'group') return
    expect(g.capped).toBe(false)
    expect(g.budgeted).toBe(0)
    expect(g.spent).toBe(460)
    expect(g.status).toBe('over')
    expect(g.children.find((k) => k.cat.id === 'thuoc')?.marker?.status).toBe('over')
  })

  it('tổng trần ¥0 chưa chi → nhóm có trần, ok; không rơi vào "chưa đặt"', () => {
    const d = buildBudgetDisplay([suc, thuoc, kham], report([line('thuoc', 0, 0)]))
    expect(d.unbudgeted).toEqual([])
    expect(d.items[0].kind === 'group' && d.items[0].status).toBe('ok')
  })

  it('không con nào có dòng ngân sách → "chưa đặt", dù có chi', () => {
    const d = buildBudgetDisplay([suc, thuoc, kham], report([], { thuoc: 460 }))
    expect(d.items).toEqual([])
    expect(d.unbudgeted.map((u) => u.cat.id)).toEqual(['suc'])
  })
})

describe('budgetRatio', () => {
  it('trần ¥0: chi > 0 là 1 (vượt), chưa chi là 0', () => {
    expect(budgetRatio(460, 0)).toBe(1)
    expect(budgetRatio(0, 0)).toBe(0)
    expect(budgetRatio(50, 100)).toBe(0.5)
  })
})
