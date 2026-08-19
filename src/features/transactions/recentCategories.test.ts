import { describe, expect, it } from 'vitest'
import { childCounts, recentCategories } from './recentCategories'

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

describe('childCounts — badge so con thay chevron', () => {
  it('dem con cua tung nhom cha', () => {
    expect(childCounts(CATS)).toEqual({ an: 2 })
  })

  it('nhom KHONG co con thi khong co khoa — de component khong ve badge "0"', () => {
    // Tile khong con phai KHONG co badge, khong phai badge so 0.
    expect(childCounts(CATS)).not.toHaveProperty('di')
    expect(childCounts(CATS)).not.toHaveProperty('phi')
  })

  it('bo con da luu tru khoi so dem — badge phai khop so tile bung ra', () => {
    const withArchived = [...CATS,
      { id: 'x', name: 'Cũ', icon: '📦', parent_id: 'an', type: 'expense', is_archived: true },
    ] as never[]
    expect(childCounts(withArchived).an).toBe(2)
  })

  it('rong thi tra ve object rong, khong nem', () => {
    expect(childCounts([])).toEqual({})
  })

  it('nhom co con nhung TAT CA da luu tru thi cung khong co khoa — badge la "con CHON DUOC", khong phai "con TON TAI"', () => {
    // 'di' (Đi lại) không có con nào trong CATS gốc; thêm đúng MỘT con, đã lưu trữ.
    // Khác ca "an" (một con lưu trữ, một con sống) — ở đây KHÔNG còn con sống nào.
    // Đây chính là ca sinh bug round 1: pickableCategories có thể giữ lại một danh mục
    // đã lưu trữ (danh mục của GD đang sửa) làm CON DUY NHẤT của một nhóm cha — badge
    // phải im (0 lựa chọn CHỌN ĐƯỢC), nhưng CategoryRow không được coi cha đó là "không
    // con" (xem `hasChildren` riêng ở CategoryRow.tsx, tách khỏi số này).
    const allArchivedChild = [...CATS,
      { id: 'y', name: 'Cũ', icon: '📦', parent_id: 'di', type: 'expense', is_archived: true },
    ] as never[]
    expect(childCounts(allArchivedChild)).not.toHaveProperty('di')
  })
})
