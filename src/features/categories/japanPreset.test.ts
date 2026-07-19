import { describe, expect, it } from 'vitest'
import type { CategoryRow, CategoryType } from '../../types/database.types'
import { JAPAN_PRESET, planJapanPreset } from './japanPreset'

let seq = 0
function cat(name: string, type: CategoryType, parent_id: string | null = null): CategoryRow {
  return {
    id: `c${seq++}`,
    user_id: 'u',
    name,
    type,
    icon: '📦',
    parent_id,
    sort_order: 0,
    is_archived: false,
    created_at: '2026-01-01T00:00:00Z',
  }
}

describe('planJapanPreset', () => {
  it('danh mục rỗng → tạo mọi cha và con của bộ Nhật', () => {
    const plan = planJapanPreset([])
    const expectedParents = JAPAN_PRESET.length
    const expectedChildren = JAPAN_PRESET.reduce((n, p) => n + p.children.length, 0)
    expect(plan.parentsToCreate).toHaveLength(expectedParents)
    expect(plan.childrenToCreate).toHaveLength(expectedChildren)
    expect(plan.childrenToCreate.find((c) => c.name === 'Tiền nhà')?.parentName).toBe('Nhà ở')
  })

  it('tái dùng cha đã tồn tại: không tạo lại cha, vẫn thêm con thiếu', () => {
    const existing = [cat('Ăn uống', 'expense')]
    const plan = planJapanPreset(existing)
    expect(plan.parentsToCreate.find((p) => p.name === 'Ăn uống')).toBeUndefined()
    expect(plan.childrenToCreate.find((c) => c.name === 'Konbini')).toBeDefined()
  })

  it('bỏ qua con đã tồn tại (khớp không phân biệt dấu/hoa thường)', () => {
    const existing = [cat('konbini', 'expense')]
    const plan = planJapanPreset(existing)
    expect(plan.childrenToCreate.find((c) => c.name === 'Konbini')).toBeUndefined()
  })

  it('idempotent: đã có đủ bộ Nhật → kế hoạch rỗng', () => {
    const existing: CategoryRow[] = []
    for (const p of JAPAN_PRESET) {
      existing.push(cat(p.name, p.type))
      for (const ch of p.children) existing.push(cat(ch.name, p.type))
    }
    const plan = planJapanPreset(existing)
    expect(plan.parentsToCreate).toHaveLength(0)
    expect(plan.childrenToCreate).toHaveLength(0)
  })

  it('phân biệt theo loại: "Hoàn thuế" (thu) không bị coi là đã có khi chỉ có mục chi trùng tên', () => {
    const existing = [cat('Hoàn thuế', 'expense')]
    const plan = planJapanPreset(existing)
    expect(plan.parentsToCreate.find((p) => p.name === 'Hoàn thuế' && p.type === 'income')).toBeDefined()
  })
})
