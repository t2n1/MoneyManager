import { describe, expect, it } from 'vitest'
import type { CategoryRow } from '../../types/database.types'
import { expenseLeaves, hasActiveChildren } from './leaf'

function cat(p: Partial<CategoryRow> & Pick<CategoryRow, 'id'>): CategoryRow {
  return {
    id: p.id,
    user_id: 'u',
    name: p.name ?? p.id,
    type: p.type ?? 'expense',
    icon: p.icon ?? '📦',
    parent_id: p.parent_id ?? null,
    sort_order: p.sort_order ?? 0,
    is_archived: p.is_archived ?? false,
    created_at: '',
    need_level: p.need_level ?? null,
    cost_type: p.cost_type ?? null,
  }
}

describe('hasActiveChildren', () => {
  it('true khi còn con chưa lưu trữ', () => {
    const parent = cat({ id: 'p' })
    const child = cat({ id: 'c', parent_id: 'p' })
    expect(hasActiveChildren('p', [parent, child])).toBe(true)
  })

  it('false khi mọi con đều đã lưu trữ', () => {
    const parent = cat({ id: 'p' })
    const child = cat({ id: 'c', parent_id: 'p', is_archived: true })
    expect(hasActiveChildren('p', [parent, child])).toBe(false)
  })

  it('false khi không có con nào', () => {
    const parent = cat({ id: 'p' })
    expect(hasActiveChildren('p', [parent])).toBe(false)
  })
})

describe('expenseLeaves', () => {
  it('chỉ lấy danh mục Chi lá, sắp theo sort_order', () => {
    const cats = [
      cat({ id: 'so-thich', sort_order: 1 }),
      cat({ id: 'gym', parent_id: 'so-thich', sort_order: 2 }),
      cat({ id: 'an-uong', sort_order: 0 }),
      cat({ id: 'luong', type: 'income', sort_order: 3 }),
      cat({ id: 'cu', is_archived: true, sort_order: 4 }),
    ]
    expect(expenseLeaves(cats).map((c) => c.id)).toEqual(['an-uong', 'gym'])
  })

  it('cha có con đã lưu trữ hết được tính là lá', () => {
    const cats = [
      cat({ id: 'so-thich', sort_order: 0 }),
      cat({ id: 'gym', parent_id: 'so-thich', sort_order: 1, is_archived: true }),
    ]
    expect(expenseLeaves(cats).map((c) => c.id)).toEqual(['so-thich'])
  })
})
