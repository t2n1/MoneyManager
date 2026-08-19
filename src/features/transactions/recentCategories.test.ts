import { describe, expect, it } from 'vitest'
import { recentCategories } from './recentCategories'

const CATS = [
  { id: 'an', name: 'Ăn uống', icon: '🍜', parent_id: null, type: 'expense', is_archived: false },
  { id: 'com', name: 'Cơm ngoài', icon: '🍜', parent_id: 'an', type: 'expense', is_archived: false },
  { id: 'cho', name: 'Đi chợ', icon: '🍜', parent_id: 'an', type: 'expense', is_archived: false },
  { id: 'di', name: 'Đi lại', icon: '🚃', parent_id: null, type: 'expense', is_archived: false },
  { id: 'cu', name: 'Cũ', icon: '📦', parent_id: null, type: 'expense', is_archived: true },
  { id: 'luong', name: 'Lương', icon: '💰', parent_id: null, type: 'income', is_archived: false },
] as never[]

const tx = (category_id: string, n: number) =>
  Array.from({ length: n }, () => ({ category_id, type: 'expense' })) as never[]

describe('recentCategories', () => {
  it('sap theo so lan dung, nhieu nhat truoc', () => {
    const out = recentCategories([...tx('com', 18), ...tx('di', 5), ...tx('cho', 9)], CATS, 'expense')
    expect(out.map((r) => r.id)).toEqual(['com', 'cho', 'di'])
    expect(out[0].count).toBe(18)
  })

  it('mac dinh tra ve 3', () => {
    expect(recentCategories([...tx('com', 3), ...tx('cho', 2), ...tx('di', 1)], CATS, 'expense'))
      .toHaveLength(3)
  })

  it('mang theo nhom cha, de MOT CHAM dat ca nhom va danh muc con', () => {
    const [r] = recentCategories(tx('com', 5), CATS, 'expense')
    expect(r.parentId).toBe('an')
    expect(r.name).toBe('Cơm ngoài')
    expect(r.icon).toBe('🍜')
  })

  it('bo danh muc da luu tru', () => {
    expect(recentCategories(tx('cu', 99), CATS, 'expense')).toHaveLength(0)
  })

  it('bo giao dich khong co danh muc (chuyen khoan)', () => {
    const out = recentCategories(
      [...([{ category_id: null, type: 'transfer' }] as never[]), ...tx('com', 2)], CATS, 'expense')
    expect(out.map((r) => r.id)).toEqual(['com'])
  })

  it('loc theo loai: huong Thu khong bay danh muc Chi', () => {
    expect(recentCategories(tx('com', 5), CATS, 'income')).toHaveLength(0)
  })

  it('chua co giao dich nao thi tra ve rong, khong nem', () => {
    expect(recentCategories([], CATS, 'expense')).toEqual([])
  })

  it('tie-break: danh muc cung count thi sap theo ten (A-Z)', () => {
    // Tạo 2 danh mục cùng count
    const out = recentCategories([...tx('di', 2), ...tx('com', 2)], CATS, 'expense', 3)
    // 'Cơm ngoài' < 'Đi lại' theo order A-Z
    expect(out.map((r) => r.name)).toEqual(['Cơm ngoài', 'Đi lại'])
  })
})
