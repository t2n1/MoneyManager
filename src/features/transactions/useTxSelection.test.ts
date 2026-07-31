import { describe, expect, it } from 'vitest'
import { addAll, areAllSelected, toggleId } from './useTxSelection'

describe('toggleId', () => {
  it('thêm khi chưa có, bỏ khi đã có, không sửa tập gốc', () => {
    const a = new Set<string>(['x'])
    const b = toggleId(a, 'y')
    expect([...b].sort()).toEqual(['x', 'y'])
    expect([...a]).toEqual(['x']) // gốc giữ nguyên
    const c = toggleId(b, 'x')
    expect([...c]).toEqual(['y'])
  })
})

describe('addAll', () => {
  it('gộp thêm, không trùng', () => {
    const out = addAll(new Set(['a']), ['a', 'b', 'c'])
    expect([...out].sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('areAllSelected', () => {
  it('true khi mọi id đã chọn, false nếu thiếu hoặc danh sách rỗng', () => {
    expect(areAllSelected(new Set(['a', 'b']), ['a', 'b'])).toBe(true)
    expect(areAllSelected(new Set(['a']), ['a', 'b'])).toBe(false)
    expect(areAllSelected(new Set(), [])).toBe(false)
  })
})
