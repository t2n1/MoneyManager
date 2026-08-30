import { describe, expect, it } from 'vitest'
import { capMismatchNotice, type CapGroup } from './capOverflow'

const money = (v: number) => `¥${v.toLocaleString('en-US')}`

const child = (name: string, marker: number | null) => ({ name, marker })
const group = (
  cap: number,
  children: { name: string; marker: number | null }[],
  capped = true,
): CapGroup => ({
  capped,
  cap,
  markerTotal: children.reduce((s, k) => s + (k.marker ?? 0), 0),
  named: children.filter((k) => k.marker !== null).map((k) => ({ name: k.name, marker: k.marker! })),
  childCount: children.length,
})

describe('capMismatchNotice', () => {
  it('một mục con vượt → GỌI TÊN mục đó, không chỉ in tổng', () => {
    // Ca thật đã gặp: trần nhóm 1.800, chỉ Cắt tóc có mốc 2.400. Câu cũ in "mốc các mục
    // con cộng lại ¥2.400" giữa ba mục con — không ai biết đứa nào mang số đó.
    const g = group(1_800, [child('Quần áo', null), child('Phụ kiện', null), child('Cắt tóc', 2_400)])
    expect(capMismatchNotice(g, money)).toMatchObject({
      kind: 'over',
      text: 'Cắt tóc đặt mốc ¥2,400, vượt trần nhóm ¥1,800.',
    })
  })

  it('nhiều mục con → in tổng kèm danh sách, to nhất trước', () => {
    const g = group(1_800, [child('Quần áo', 1_000), child('Cắt tóc', 2_400)])
    expect(capMismatchNotice(g, money)).toMatchObject({
      kind: 'over',
      text: 'Mốc các mục con cộng lại ¥3,400 (Cắt tóc ¥2,400 · Quần áo ¥1,000), vượt trần nhóm ¥1,800.',
    })
  })

  it('quá 3 mục thì nói rõ còn mấy mục nữa, không cắt im lặng', () => {
    const g = group(1_000, [
      child('A', 500), child('B', 400), child('C', 300), child('D', 200), child('E', 100),
    ])
    expect(capMismatchNotice(g, money)).toMatchObject({
      kind: 'over',
      text: 'Mốc các mục con cộng lại ¥1,500 (A ¥500 · B ¥400 · C ¥300 · …và 2 mục nữa), vượt trần nhóm ¥1,000.',
    })
  })

  it('cộng lại vừa đúng trần → im', () => {
    expect(capMismatchNotice(group(1_800, [child('Cắt tóc', 1_800)]), money)).toBeNull()
  })

  it('nhóm tổng-con (chưa có trần cha) → im, vì mốc con CHÍNH LÀ trần', () => {
    const g = group(1_800, [child('Cắt tóc', 2_400)], false)
    expect(capMismatchNotice(g, money)).toBeNull()
  })

  it('chưa mục con nào chia phần → nói ra, kèm số để bấm chia', () => {
    // Ca thật tháng 8/2026: Ăn uống trần ¥50.000, ba mục con, không đứa nào mang một
    // đồng nào của nó. Bản cũ im — nên nhìn nhóm không ai biết ¥50.000 dành cho đâu.
    const g = group(50_000, [child('Cơm ngoài', null), child('Đi chợ', null), child('Ăn vặt', null)])
    expect(capMismatchNotice(g, money)).toEqual({
      kind: 'under',
      text: 'Chưa mục con nào chia phần trong trần nhóm ¥50,000.',
      cap: 50_000,
      childCount: 3,
    })
  })

  it('mốc con mới chia được một phần → nói còn thiếu bao nhiêu', () => {
    const g = group(50_000, [child('Cơm ngoài', 30_000), child('Đi chợ', null)])
    expect(capMismatchNotice(g, money)).toMatchObject({
      kind: 'under',
      text: 'Mốc các mục con mới cộng được ¥30,000 trong trần nhóm ¥50,000 — còn ¥20,000 chưa chia.',
    })
  })

  it('nhóm tổng-con thì hụt cũng im — mốc con CHÍNH LÀ trần', () => {
    const g = group(50_000, [child('Cơm ngoài', null)], false)
    expect(capMismatchNotice(g, money)).toBeNull()
  })
})
