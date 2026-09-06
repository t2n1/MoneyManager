import { describe, it, expect } from 'vitest'
import { PAGE_SIZE, fetchAllPages } from './paging'

/** Nguồn giả: trả về đúng lát [from, to] của một mảng n phần tử, và đếm số lần gọi. */
function source(n: number, delayOf?: (from: number) => number) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i }))
  const calls: [number, number][] = []
  return {
    calls,
    page: async (from: number, to: number) => {
      calls.push([from, to])
      if (delayOf) await new Promise((r) => setTimeout(r, delayOf(from)))
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

  it('trang sau tải SONG SONG nhưng dòng vẫn theo đúng thứ tự chỉ số', async () => {
    // Trang 1 (from=1000) cố tình về CHẬM hơn trang 2: nếu ghép theo thứ tự hoàn thành
    // thay vì thứ tự chỉ số thì id 2000.. sẽ đứng trước id 1000...
    const s = source(3200, (from) => (from === PAGE_SIZE ? 30 : 1))
    const rows = await fetchAllPages(s.page)
    expect(rows).toHaveLength(3200)
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 3200 }, (_, i) => i))
  })

  it('đúng bội số của trang -> vẫn lấy đủ rồi dừng (lô sau toàn trang rỗng)', async () => {
    const s = source(2 * PAGE_SIZE)
    expect(await fetchAllPages(s.page)).toHaveLength(2 * PAGE_SIZE)
    // 1 trang đầu + một lô 4 trang (trang 2 rỗng báo hết; trang 3-4 xin thừa nhưng rỗng).
    expect(s.calls).toHaveLength(5)
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
