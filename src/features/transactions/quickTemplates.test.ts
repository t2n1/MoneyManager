import { beforeEach, describe, expect, it } from 'vitest'
import {
  addQuickTemplate,
  deleteQuickTemplate,
  getQuickTemplates,
} from './quickTemplates'

function base(label: string) {
  return {
    label,
    type: 'expense' as const,
    amountMinor: 850,
    categoryId: 'c1',
    accountId: 'a1',
    note: '',
  }
}

describe('quickTemplates store', () => {
  beforeEach(() => {
    // Dọn sạch giữa các test (store là state cấp module)
    for (const t of getQuickTemplates()) deleteQuickTemplate(t.id)
  })

  it('thêm mẫu mới lên đầu danh sách', () => {
    addQuickTemplate(base('A'))
    addQuickTemplate(base('B'))
    expect(getQuickTemplates().map((t) => t.label)).toEqual(['B', 'A'])
  })

  it('mỗi mẫu có id riêng', () => {
    const a = addQuickTemplate(base('A'))
    const b = addQuickTemplate(base('B'))
    expect(a.id).not.toBe(b.id)
  })

  it('cắt bớt khi vượt trần 12 mẫu, giữ mẫu mới nhất', () => {
    for (let i = 0; i < 15; i++) addQuickTemplate(base('T' + i))
    const list = getQuickTemplates()
    expect(list).toHaveLength(12)
    expect(list[0].label).toBe('T14')
    expect(list.some((t) => t.label === 'T2')).toBe(false)
  })

  it('xóa theo id', () => {
    const a = addQuickTemplate(base('A'))
    addQuickTemplate(base('B'))
    deleteQuickTemplate(a.id)
    expect(getQuickTemplates().map((t) => t.label)).toEqual(['B'])
  })
})
