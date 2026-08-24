import { describe, expect, it } from 'vitest'
import { categoryChips, childCounts, recentCategories } from './recentCategories'

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

describe('categoryChips — danh muc dang chon phai CON THAY DUOC sau khi luoi thu lai', () => {
  const chip = (id: string, name: string) => ({ id, parentId: 'di', name, icon: '🚕' })
  const recent = recentCategories(
    [...tx('com', 18), ...tx('cho', 9), ...tx('di', 5)], CATS, 'expense',
  )

  it('bay gio recent dung la 3 cai — tien de cua ca khoi nay', () => {
    expect(recent.map((r) => r.id)).toEqual(['com', 'cho', 'di'])
  })

  it('chon mot danh muc NGOAI top-3 thi no duoc chen vao DAU hang', () => {
    // Day la ca sinh bug (bao 2026-08-24): mo "Khac" -> vao nhom -> chon con. Truoc day
    // hang chip chi ve `recent`, nen luoi thu lai la tren man khong con chu nao noi minh
    // vua chon gi — `categoryId` van dung, nhung nguoi dung doc man thi thay no mat.
    const out = categoryChips(recent, chip('taxi', 'Taxi'))
    expect(out[0].id).toBe('taxi')
    expect(out.map((r) => r.id)).toContain('taxi')
  })

  it('van CAT o 3 — chip "Khac" phai con cho tren man (do that o 375px)', () => {
    // 4 chip + "Khac" = 427px trong mot hang 351px, tuc "Khac" ra HAN ngoai man.
    expect(categoryChips(recent, chip('taxi', 'Taxi'))).toHaveLength(3)
    // Cai bi day ra la chip GAN DAY it dung nhat, khong phai cai dang chon.
    expect(categoryChips(recent, chip('taxi', 'Taxi')).map((r) => r.id))
      .toEqual(['taxi', 'com', 'cho'])
  })

  it('chon mot danh muc DA co trong top-3 thi khong chen gi — khong hai vien cung mot danh muc', () => {
    const out = categoryChips(recent, { id: 'com', parentId: 'an', name: 'Cơm ngoài', icon: '🍜' })
    expect(out.map((r) => r.id)).toEqual(['com', 'cho', 'di'])
  })

  it('chua chon gi thi hang chip dung la "Gan day"', () => {
    expect(categoryChips(recent, null).map((r) => r.id)).toEqual(['com', 'cho', 'di'])
  })

  it('chua co lich su nao thi hang chip chi con dung chip dang chon', () => {
    expect(categoryChips([], chip('taxi', 'Taxi')).map((r) => r.id)).toEqual(['taxi'])
  })
})
