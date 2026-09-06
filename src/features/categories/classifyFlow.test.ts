import { describe, expect, it } from 'vitest'
import { isClassified, nextTodo, summaryLabel } from './classifyFlow'
import type { CostType, NeedLevel } from '../../types/database.types'

type S = { need_level: NeedLevel | null; cost_type: CostType | null }
const s = (need_level: NeedLevel | null, cost_type: CostType | null): S => ({
  need_level,
  cost_type,
})

describe('isClassified', () => {
  it('đủ hai trục mới tính là xong', () => {
    expect(isClassified(s('essential', 'fixed'))).toBe(true)
    expect(isClassified(s('essential', null))).toBe(false)
    expect(isClassified(s(null, 'fixed'))).toBe(false)
    expect(isClassified(s(null, null))).toBe(false)
  })
})

describe('summaryLabel', () => {
  it('đủ hai trục → hai nhãn nối bằng dấu chấm giữa', () => {
    expect(summaryLabel(s('essential', 'fixed'))).toBe('Thiết yếu · Cố định')
    expect(summaryLabel(s('giving', 'variable'))).toBe('Cho đi · Biến đổi')
  })
  it('cả hai trống → "Chưa phân loại"', () => {
    expect(summaryLabel(s(null, null))).toBe('Chưa phân loại')
  })
  it('thiếu một trục → trục thiếu ghi "Chưa"', () => {
    expect(summaryLabel(s('flexible', null))).toBe('Linh hoạt · Chưa')
    expect(summaryLabel(s(null, 'fixed'))).toBe('Chưa · Cố định')
  })
})

describe('nextTodo', () => {
  const rows = [
    { id: 'a', ...s('essential', 'fixed') },
    { id: 'b', ...s(null, null) },
    { id: 'c', ...s('flexible', 'variable') },
    { id: 'd', ...s('essential', null) },
  ]

  it('quét XUÔI từ sau mục hiện tại', () => {
    expect(nextTodo(rows, 'b')?.id).toBe('d')
  })
  it('hết phía sau thì vòng lên đầu danh sách', () => {
    expect(nextTodo(rows, 'd')?.id).toBe('b')
  })
  it('không tính chính mục hiện tại dù nó chưa xong', () => {
    const only = [{ id: 'x', ...s(null, null) }]
    expect(nextTodo(only, 'x')).toBeNull()
  })
  it('afterId null → lấy mục chưa xong đầu tiên', () => {
    expect(nextTodo(rows, null)?.id).toBe('b')
  })
  it('afterId không có trong danh sách → như null', () => {
    expect(nextTodo(rows, 'ma')?.id).toBe('b')
  })
  it('mọi mục đã xong → null', () => {
    expect(nextTodo([rows[0], rows[2]], null)).toBeNull()
  })
})
