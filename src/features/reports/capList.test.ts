import { describe, expect, it } from 'vitest'
import { capList } from './capList'

const n = (v: number) => ({ v })
const list = (...vals: number[]) => vals.map(n)
const val = (x: { v: number }) => x.v

describe('capList', () => {
  it('ngắn hơn trần thì giữ nguyên, không gộp gì', () => {
    const r = capList(list(5, 4, 3), 6, val)
    expect(r.head).toHaveLength(3)
    expect(r.tail).toEqual([])
    expect(r.tailTotal).toBe(0)
  })

  it('đuôi đúng MỘT mục thì KHÔNG cắt — "1 mục khác" chiếm đúng chỗ của chính nó', () => {
    const r = capList(list(9, 8, 7, 6), 3, val)
    expect(r.head).toHaveLength(4)
    expect(r.tail).toEqual([])
  })

  it('đuôi từ hai mục trở lên mới cắt', () => {
    const r = capList(list(9, 8, 7, 6, 5), 3, val)
    expect(r.head.map(val)).toEqual([9, 8, 7])
    expect(r.tail.map(val)).toEqual([6, 5])
    expect(r.tailTotal).toBe(11)
  })

  it('TỔNG không đổi sau khi cắt', () => {
    const items = list(...Array.from({ length: 30 }, (_, i) => i + 1))
    const truoc = items.reduce((s, x) => s + x.v, 0)
    const r = capList(items, 8, val)
    const sau = r.head.reduce((s, x) => s + x.v, 0) + r.tailTotal
    expect(sau).toBe(truoc)
  })

  it('KHÔNG tự sắp lại — nơi gọi đã sắp theo tiêu chí của nó', () => {
    const r = capList(list(1, 9, 5, 3, 7), 2, val)
    expect(r.head.map(val)).toEqual([1, 9])
  })

  it('trần 0 hoặc âm = không cắt, thay vì gộp sạch thành một dòng vô nghĩa', () => {
    expect(capList(list(3, 2, 1), 0, val).tail).toEqual([])
    expect(capList(list(3, 2, 1), -5, val).head).toHaveLength(3)
  })

  it('danh sách rỗng không nổ', () => {
    const r = capList([], 5, val)
    expect(r.head).toEqual([])
    expect(r.tailTotal).toBe(0)
  })

  it('không sửa mảng gốc', () => {
    const items = list(5, 4, 3, 2, 1)
    capList(items, 2, val)
    expect(items.map(val)).toEqual([5, 4, 3, 2, 1])
  })
})
