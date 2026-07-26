import { describe, expect, it } from 'vitest'
import type { CategoryRow } from '../../types/database.types'
import { expenseLeaves, hasActiveChildren, isExpenseLeaf } from './leaf'

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

describe('isExpenseLeaf', () => {
  it('danh mục Chi đứng riêng (không con) là lá', () => {
    const c = cat({ id: 'an-uong' })
    expect(isExpenseLeaf(c, [c])).toBe(true)
  })

  it('danh mục con của một cha vẫn là lá', () => {
    const parent = cat({ id: 'so-thich' })
    const child = cat({ id: 'gym', parent_id: 'so-thich' })
    expect(isExpenseLeaf(child, [parent, child])).toBe(true)
  })

  it('cha đang có con chưa lưu trữ KHÔNG phải lá', () => {
    const parent = cat({ id: 'so-thich' })
    const child = cat({ id: 'gym', parent_id: 'so-thich' })
    expect(isExpenseLeaf(parent, [parent, child])).toBe(false)
  })

  it('cha mà con duy nhất đã lưu trữ thì THÀNH lá', () => {
    const parent = cat({ id: 'so-thich' })
    const child = cat({ id: 'gym', parent_id: 'so-thich', is_archived: true })
    expect(isExpenseLeaf(parent, [parent, child])).toBe(true)
  })

  it('cha còn ít nhất một con chưa lưu trữ vẫn không phải lá', () => {
    const parent = cat({ id: 'so-thich' })
    const gone = cat({ id: 'gym', parent_id: 'so-thich', is_archived: true })
    const alive = cat({ id: 'phim', parent_id: 'so-thich' })
    expect(isExpenseLeaf(parent, [parent, gone, alive])).toBe(false)
  })

  it('danh mục đã lưu trữ không phải lá (không cần phân loại)', () => {
    const c = cat({ id: 'cu', is_archived: true })
    expect(isExpenseLeaf(c, [c])).toBe(false)
  })

  it('danh mục Thu không phải lá Chi', () => {
    const c = cat({ id: 'luong', type: 'income' })
    expect(isExpenseLeaf(c, [c])).toBe(false)
  })
})

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
