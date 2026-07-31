import { describe, it, expect } from 'vitest'
import { PAGE_SIZE, fetchAllPages } from './paging'

/** Nguồn giả: trả về đúng lát [from, to] của một mảng n phần tử, và đếm số lần gọi. */
function source(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i }))
  const calls: [number, number][] = []
  return {
    calls,
    page: async (from: number, to: number) => {
      calls.push([from, to])
      return { data: rows.slice(from, to + 1), error: null }
    },
  }
}

describe('fetchAllPages', () => {
  it('ít hơn một trang -> gọi một lần', async () => {
    const s = source(10)
    expect(await fetchAllPages(s.page)).toHaveLength(10)
    expect(s.calls).toHaveLength(1)
  })

  it('nhiều trang -> lấy HẾT, không dừng ở 1000', async () => {
    const s = source(2500)
    const rows = await fetchAllPages(s.page)
    expect(rows).toHaveLength(2500)
    expect(rows[2499]).toEqual({ id: 2499 })
    expect(s.calls[0]).toEqual([0, PAGE_SIZE - 1])
    expect(s.calls[1]).toEqual([PAGE_SIZE, 2 * PAGE_SIZE - 1])
  })

  it('đúng bội số của trang -> vẫn lấy đủ rồi dừng (trang cuối rỗng)', async () => {
    const s = source(2 * PAGE_SIZE)
    expect(await fetchAllPages(s.page)).toHaveLength(2 * PAGE_SIZE)
    expect(s.calls).toHaveLength(3)
  })

  it('bảng rỗng -> mảng rỗng', async () => {
    const s = source(0)
    expect(await fetchAllPages(s.page)).toEqual([])
  })

  it('lỗi ở trang giữa -> ném ra, KHÔNG trả về dữ liệu một nửa', async () => {
    let n = 0
    const page = async () => {
      n++
      if (n === 2) return { data: null, error: { message: 'mạng lỗi' } }
      return { data: Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i })), error: null }
    }
    await expect(fetchAllPages(page)).rejects.toThrow(/mạng lỗi/)
  })

  it('nguồn hỏng trả trang đầy mãi -> có trần, không lặp vô hạn', async () => {
    const page = async () => ({
      data: Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i })),
      error: null,
    })
    await expect(fetchAllPages(page, { maxPages: 3 })).rejects.toThrow(/quá nhiều trang/i)
  })
})
