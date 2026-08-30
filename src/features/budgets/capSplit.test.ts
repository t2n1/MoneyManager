import { describe, expect, it } from 'vitest'
import {
  parentsToResync,
  splitCapToChildren,
  sumChildLimits,
  type SplitChild,
} from './capSplit'

const kid = (categoryId: string, limit: number | null, average = 0): SplitChild => ({
  categoryId,
  limit,
  average,
})

const total = (parts: { amount: number }[]) => parts.reduce((s, p) => s + p.amount, 0)

describe('splitCapToChildren', () => {
  it('có con đã đặt hạn mức thì chia theo TỈ LỆ HẠN MỨC CŨ', () => {
    // Giữ hình dạng người dùng đã đặt tay: 3:1 vẫn là 3:1 sau khi trần cha đổi.
    const parts = splitCapToChildren(40_000, [kid('a', 30_000, 999), kid('b', 10_000, 1)])
    expect(parts).toEqual([
      { categoryId: 'a', amount: 30_000 },
      { categoryId: 'b', amount: 10_000 },
    ])
  })

  it('con ĐÃ khai thì giữ nguyên số, chỉ chia phần CÒN LẠI cho con chưa khai', () => {
    // Ca thật ở demo: nhóm Ăn uống ¥40.000, sáu mục con mà chỉ Bữa trưa có mốc ¥15.000.
    // Câu nhắc nói "còn ¥25.000 chưa chia", nên nút phải chia đúng ¥25.000 đó. Chia lại
    // cả ¥40.000 theo tỉ lệ là viết đè lên con số người dùng đã tự tay khai.
    const parts = splitCapToChildren(40_000, [
      kid('a', 15_000, 20_000),
      kid('b', null, 30_000),
      kid('c', null, 10_000),
    ])
    expect(parts).toEqual([
      { categoryId: 'a', amount: 15_000 },
      { categoryId: 'b', amount: 18_700 },
      { categoryId: 'c', amount: 6_300 },
    ])
    expect(total(parts)).toBe(40_000)
  })

  it('con đã khai cộng lại VƯỢT trần thì mới hạ tất cả xuống theo tỉ lệ', () => {
    // Không còn phần nào để chia thì giữ nguyên lời khai là bất khả — tổng phải bằng
    // trần. Lúc đó hạ đều theo tỉ lệ, ai to giảm nhiều.
    const parts = splitCapToChildren(20_000, [kid('a', 30_000), kid('b', 10_000)])
    expect(parts).toEqual([
      { categoryId: 'a', amount: 15_000 },
      { categoryId: 'b', amount: 5_000 },
    ])
  })

  it('chưa con nào đặt thì chia theo TB 6 THÁNG đã chi', () => {
    // Ca thật: Ăn uống ¥50.000 — Cơm ngoài / Đi chợ / Ăn vặt & Cafe.
    const parts = splitCapToChildren(50_000, [
      kid('comngoai', null, 82_863),
      kid('dicho', null, 10_952),
      kid('anvat', null, 3_656),
    ])
    expect(parts).toEqual([
      { categoryId: 'comngoai', amount: 42_500 },
      { categoryId: 'dicho', amount: 5_600 },
      { categoryId: 'anvat', amount: 1_900 },
    ])
    expect(total(parts)).toBe(50_000)
  })

  it('không có hạn mức lẫn lịch sử thì chia ĐỀU', () => {
    const parts = splitCapToChildren(30_000, [kid('a', null), kid('b', null), kid('c', null)])
    expect(parts.map((p) => p.amount)).toEqual([10_000, 10_000, 10_000])
  })

  it('tổng khớp cha TỪNG ĐỒNG, phần lẻ dồn vào con lớn nhất', () => {
    // ¥1.234 theo tỉ lệ 2:1 → ¥822,67 và ¥411,33; làm tròn trăm còn ¥800 và ¥400,
    // hụt ¥34. Con lớn nhất ôm phần lẻ, nếu không thì cha ¥1.234 mà con cộng lại
    // ¥1.200 — đúng cái lệch mà cả tính năng này sinh ra để chặn.
    const parts = splitCapToChildren(1_234, [kid('a', null, 200), kid('b', null, 100)])
    expect(total(parts)).toBe(1_234)
    expect(parts).toEqual([
      { categoryId: 'a', amount: 834 },
      { categoryId: 'b', amount: 400 },
    ])
  })

  it('trần cha ¥0 là một lời khai, không phải chưa đặt — mọi con về 0', () => {
    const parts = splitCapToChildren(0, [kid('a', 30_000), kid('b', 10_000)])
    expect(parts.map((p) => p.amount)).toEqual([0, 0])
  })

  it('không có con nào thì không chia gì', () => {
    expect(splitCapToChildren(50_000, [])).toEqual([])
  })

  it('con đã đặt ¥0 KHÔNG kéo cả nhóm về chia đều', () => {
    // ¥0 là hạn mức thật ("tháng này không tiêu ở đây"), nhưng nó không phải trọng số:
    // nhóm vẫn còn con khác có số để chia theo.
    const parts = splitCapToChildren(20_000, [kid('a', 0, 5_000), kid('b', 10_000, 5_000)])
    expect(parts).toEqual([
      { categoryId: 'a', amount: 0 },
      { categoryId: 'b', amount: 20_000 },
    ])
  })
})

describe('sumChildLimits', () => {
  it('cộng SỐ ĐẶT TAY của các con, bỏ qua dòng của danh mục khác', () => {
    const rows = [
      { category_id: 'a', amount: 30_000 },
      { category_id: 'b', amount: 10_000 },
      { category_id: 'ngoainhom', amount: 99_000 },
    ]
    expect(sumChildLimits(rows, ['a', 'b'])).toBe(40_000)
  })

  it('con chưa có dòng hạn mức thì tính 0, không phải bỏ nhóm', () => {
    expect(sumChildLimits([{ category_id: 'a', amount: 30_000 }], ['a', 'b'])).toBe(30_000)
  })
})

describe('parentsToResync', () => {
  // Nhóm Ăn uống có trần ¥50.000; ba con, mới một đứa có mốc.
  const tree: Record<string, string> = { comngoai: 'anuong', dicho: 'anuong', anvat: 'anuong' }
  const opts = (limits: Record<string, number>, caps: string[] = ['anuong']) => ({
    parentOf: (id: string) => tree[id] ?? null,
    childrenOf: (id: string) =>
      Object.keys(tree).filter((k) => tree[k] === id),
    limits: new Map(Object.entries(limits)),
    hasCap: (id: string) => caps.includes(id),
  })

  it('sửa một con thì trần cha cộng lại theo tổng MỚI', () => {
    const out = parentsToResync(
      [{ categoryId: 'comngoai', amount: 45_000 }],
      opts({ anuong: 50_000, comngoai: 38_100, dicho: 10_000 }),
    )
    expect(out).toEqual([{ categoryId: 'anuong', amount: 55_000 }])
  })

  it('xoá hạn mức một con thì cha trừ đi đúng phần đó', () => {
    const out = parentsToResync(
      [{ categoryId: 'dicho', amount: null }],
      opts({ anuong: 48_100, comngoai: 38_100, dicho: 10_000 }),
    )
    expect(out).toEqual([{ categoryId: 'anuong', amount: 38_100 }])
  })

  it('sửa nhiều con cùng lúc thì cha chỉ ghi MỘT lần', () => {
    const out = parentsToResync(
      [
        { categoryId: 'comngoai', amount: 40_000 },
        { categoryId: 'dicho', amount: 6_000 },
      ],
      opts({ anuong: 50_000, comngoai: 38_100, dicho: 10_000 }),
    )
    expect(out).toEqual([{ categoryId: 'anuong', amount: 46_000 }])
  })

  it('tổng không đổi thì KHÔNG ghi gì', () => {
    const out = parentsToResync(
      [{ categoryId: 'comngoai', amount: 38_100 }],
      opts({ anuong: 48_100, comngoai: 38_100, dicho: 10_000 }),
    )
    expect(out).toEqual([])
  })

  it('nhóm TỔNG-CON (cha chưa đặt trần riêng) thì không đẻ trần mới', () => {
    // Nhà ở là kiểu này: cha không có dòng hạn mức, số của nó LÀ tổng các con. Ghi một
    // dòng cho cha ở đây là lặng lẽ đổi nhóm sang kiểu trần nhóm — lúc đó mốc con thôi
    // không được tính vào kế hoạch nữa, và cả nhóm nhảy sang khối theo `need_level` của
    // cha. Đổi cách tính tiền mà không ai bấm gì cả.
    const out = parentsToResync(
      [{ categoryId: 'comngoai', amount: 45_000 }],
      opts({ comngoai: 38_100 }, []),
    )
    expect(out).toEqual([])
  })

  it('danh mục không có cha thì không có gì để cộng', () => {
    const out = parentsToResync([{ categoryId: 'khac', amount: 5_000 }], opts({}))
    expect(out).toEqual([])
  })
})
