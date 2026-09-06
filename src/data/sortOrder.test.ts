import { describe, expect, it } from 'vitest'
import { applyOrder } from './sortOrder'

interface Row {
  id: string
  sort_order: number
}
const rows = (...pairs: [string, number][]): Row[] =>
  pairs.map(([id, sort_order]) => ({ id, sort_order }))
const key = (r: Row) => r.id

describe('applyOrder', () => {
  it('ghi sort_order bằng chỉ số và sắp lại mảng khi phủ hết', () => {
    const out = applyOrder(rows(['a', 0], ['b', 1], ['c', 2]), ['c', 'a', 'b'], key)
    expect(out.map((r) => r.id)).toEqual(['c', 'a', 'b'])
    expect(out.map((r) => r.sort_order)).toEqual([0, 1, 2])
  })

  it('không sắp lại khi thứ tự truyền vào thiếu dòng — hai thang số sẽ trộn lẫn', () => {
    // 'z' không nằm trong `ordered` nên giữ sort_order 9. Sắp lại thì z rơi xuống cuối
    // dù thang số của nó không so được với 0..1 vừa gán.
    const out = applyOrder(rows(['a', 0], ['b', 1], ['z', 9]), ['b', 'a'], key)
    expect(out.map((r) => r.id)).toEqual(['a', 'b', 'z'])
    expect(out.map((r) => r.sort_order)).toEqual([1, 0, 9])
  })

  it('bỏ qua id lạ trong ordered mà không hỏng', () => {
    const out = applyOrder(rows(['a', 0], ['b', 1]), ['b', 'ma', 'a'], key)
    expect(out.map((r) => r.id)).toEqual(['b', 'a'])
    expect(out.map((r) => r.sort_order)).toEqual([0, 2])
  })

  it('không sửa mảng gốc', () => {
    const src = rows(['a', 0], ['b', 1])
    applyOrder(src, ['b', 'a'], key)
    expect(src.map((r) => r.id)).toEqual(['a', 'b'])
    expect(src[0].sort_order).toBe(0)
  })

  it('mảng rỗng trả về mảng rỗng', () => {
    expect(applyOrder([] as Row[], ['a'], key)).toEqual([])
  })
})
