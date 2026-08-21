import { describe, expect, it } from 'vitest'
import type { CategoryRow } from '../../types/database.types'
import type { BudgetChildRow, BudgetGroupItem } from './budgetDisplay'
import { capOverflowNotice } from './capOverflow'
import { statusOf, type BudgetLine } from './progress'

const money = (v: number) => `¥${v.toLocaleString('en-US')}`

let seq = 0
const cat = (name: string): CategoryRow => ({
  id: `c${++seq}`, user_id: 'u', name, type: 'expense', icon: '📦', parent_id: 'g',
  sort_order: seq, is_archived: false, created_at: '', need_level: null,
  cost_type: null, kind: 'expense',
})
const marker = (budgeted: number): BudgetLine => ({
  categoryId: 'x', budgeted, carried: 0, spent: 0, ratio: 0, status: statusOf(0), isMarker: true,
})
const child = (name: string, budgeted: number | null): BudgetChildRow => ({
  cat: cat(name), spent: 0, marker: budgeted === null ? null : marker(budgeted),
})
const group = (budgeted: number, children: BudgetChildRow[], capped = true): BudgetGroupItem => ({
  kind: 'group',
  cat: { ...cat('Ngoại hình'), id: 'g', parent_id: null },
  capped,
  budgeted,
  spent: 0,
  carried: 0,
  ratio: 0,
  status: statusOf(0),
  markerTotal: children.reduce((s, k) => s + (k.marker?.budgeted ?? 0), 0),
  children,
})

describe('capOverflowNotice', () => {
  it('một mục con vượt → GỌI TÊN mục đó, không chỉ in tổng', () => {
    // Ca thật đã gặp: trần nhóm 1.800, chỉ Cắt tóc có mốc 2.400. Câu cũ in "mốc các mục
    // con cộng lại ¥2.400" giữa ba mục con — không ai biết đứa nào mang số đó.
    const g = group(1_800, [child('Quần áo', null), child('Phụ kiện', null), child('Cắt tóc', 2_400)])
    expect(capOverflowNotice(g, money)).toBe('Cắt tóc đặt mốc ¥2,400, vượt trần nhóm ¥1,800.')
  })

  it('nhiều mục con → in tổng kèm danh sách, to nhất trước', () => {
    const g = group(1_800, [child('Quần áo', 1_000), child('Cắt tóc', 2_400)])
    expect(capOverflowNotice(g, money)).toBe(
      'Mốc các mục con cộng lại ¥3,400 (Cắt tóc ¥2,400 · Quần áo ¥1,000), vượt trần nhóm ¥1,800.',
    )
  })

  it('quá 3 mục thì nói rõ còn mấy mục nữa, không cắt im lặng', () => {
    const g = group(1_000, [
      child('A', 500), child('B', 400), child('C', 300), child('D', 200), child('E', 100),
    ])
    expect(capOverflowNotice(g, money)).toBe(
      'Mốc các mục con cộng lại ¥1,500 (A ¥500 · B ¥400 · C ¥300 · …và 2 mục nữa), vượt trần nhóm ¥1,000.',
    )
  })

  it('cộng lại vừa đúng trần → im', () => {
    expect(capOverflowNotice(group(1_800, [child('Cắt tóc', 1_800)]), money)).toBeNull()
  })

  it('nhóm tổng-con (chưa có trần cha) → im, vì mốc con CHÍNH LÀ trần', () => {
    const g = group(1_800, [child('Cắt tóc', 2_400)], false)
    expect(capOverflowNotice(g, money)).toBeNull()
  })

  it('chưa mục con nào đặt mốc → im', () => {
    expect(capOverflowNotice(group(1_800, [child('Cắt tóc', null)]), money)).toBeNull()
  })
})
