import { describe, expect, it } from 'vitest'
import type { CategoryRow } from '../../types/database.types'
import { expenseLeaves, groupLeavesByParent, hasActiveChildren } from './leaf'

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

describe('groupLeavesByParent', () => {
  it('gom các lá cùng cha vào một nhóm, giữ đúng thứ tự lá đã truyền vào', () => {
    const parent = cat({ id: 'an-uong', sort_order: 0 })
    const b1 = cat({ id: 'bua-sang', parent_id: 'an-uong', sort_order: 1 })
    const b2 = cat({ id: 'bua-trua', parent_id: 'an-uong', sort_order: 2 })
    const leaves = [b1, b2]
    const groups = groupLeavesByParent(leaves, [parent, b1, b2])
    expect(groups).toEqual([{ parent, leaves: [b1, b2] }])
  })

  it('lá không cha (danh mục chính không có con) đứng riêng, parent: null', () => {
    const soloA = cat({ id: 'tai-chinh', sort_order: 0 })
    const soloB = cat({ id: 'khac', sort_order: 1 })
    const leaves = [soloA, soloB]
    const groups = groupLeavesByParent(leaves, leaves)
    expect(groups).toEqual([
      { parent: null, leaves: [soloA] },
      { parent: null, leaves: [soloB] },
    ])
  })

  it('thứ tự nhóm theo sort_order: cha dùng sort_order của cha, lá không cha dùng sort_order của chính nó', () => {
    // Thứ tự sort_order thực tế: parent(0) < con(5) nhưng lá đơn(1) < parent(0)?
    // Ở đây dựng tình huống lá đơn xen giữa hai nhóm có cha để kiểm tra nhóm được
    // sắp theo sort_order đại diện (cha) chứ không theo vị trí gặp trong mảng.
    const parentA = cat({ id: 'a', sort_order: 0 })
    const childA = cat({ id: 'a1', parent_id: 'a', sort_order: 10 })
    const solo = cat({ id: 'solo', sort_order: 5 })
    const parentB = cat({ id: 'b', sort_order: 20 })
    const childB = cat({ id: 'b1', parent_id: 'b', sort_order: 21 })
    // Truyền vào không theo đúng thứ tự sort_order để chứng minh hàm tự sắp lại.
    const leaves = [childB, solo, childA]
    const groups = groupLeavesByParent(leaves, [parentA, childA, solo, parentB, childB])
    expect(groups.map((g) => g.parent?.id ?? g.leaves[0].id)).toEqual(['a', 'solo', 'b'])
  })

  it('lá có cha đã lưu trữ vẫn gom theo cha đó (cha vẫn hiện làm tiêu đề nhóm)', () => {
    const parent = cat({ id: 'p', sort_order: 0, is_archived: true })
    const child = cat({ id: 'c', parent_id: 'p', sort_order: 1 })
    // Trường hợp hiếm (bình thường lưu trữ cha kéo theo lưu trữ con), nhưng hàm
    // vẫn cần cư xử hợp lý: hiện tên/icon cha thật thay vì coi lá là không cha.
    const groups = groupLeavesByParent([child], [parent, child])
    expect(groups).toEqual([{ parent, leaves: [child] }])
  })

  it('cha có con đã lưu trữ hết (cha tự thành lá) hiện như lá không cha', () => {
    const parent = cat({ id: 'so-thich', sort_order: 0 })
    const archivedChild = cat({ id: 'gym', parent_id: 'so-thich', sort_order: 1, is_archived: true })
    const categories = [parent, archivedChild]
    const leaves = expenseLeaves(categories) // -> [so-thich] (đã có test riêng ở trên)
    const groups = groupLeavesByParent(leaves, categories)
    expect(groups).toEqual([{ parent: null, leaves: [parent] }])
  })

  it('cha không có trong danh sách categories (dữ liệu mồ côi) → coi như lá không cha', () => {
    const orphan = cat({ id: 'c', parent_id: 'khong-ton-tai', sort_order: 0 })
    const groups = groupLeavesByParent([orphan], [orphan])
    expect(groups).toEqual([{ parent: null, leaves: [orphan] }])
  })

  it('mảng rỗng trả về mảng nhóm rỗng', () => {
    expect(groupLeavesByParent([], [])).toEqual([])
  })
})
