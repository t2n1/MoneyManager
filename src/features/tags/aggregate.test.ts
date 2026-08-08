import { describe, expect, it } from 'vitest'
import type { TagRow, TransactionRow, TransactionTagRow } from '../../types/database.types'
import type { Rates } from '../../lib/rates'
import { filterByTags, pickerTags, tagBreakdown, tagsByTransaction } from './aggregate'

const RATES: Rates = { JPY: 1, VND: 165 }
const currencyOf = () => 'JPY' as const

const tag = (id: string, name: string, p: Partial<TagRow> = {}): TagRow => ({
  id,
  user_id: 'u',
  name,
  color: 'sky',
  sort_order: 0,
  group_id: null,
  is_archived: false,
  budget_amount: null,
  budget_period: 'total',
  created_at: '',
  ...p,
})

let seq = 0
function tx(
  p: Partial<TransactionRow> & Pick<TransactionRow, 'type' | 'amount'>,
): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    to_amount: null,
    category_id: 'c1',
    account_id: 'a1',
    to_account_id: null,
    recurring_rule_id: null,
    occurred_on: '2026-05-01',
    note: '',
    created_at: '',
    updated_at: '',
    ...p,
  }
}

const link = (transaction_id: string, tag_id: string): TransactionTagRow => ({
  transaction_id,
  tag_id,
  user_id: 'u',
})

const TAGS = [tag('ve-vn', 'Về VN 2026'), tag('qua', 'Quà cáp')]

describe('tagBreakdown', () => {
  it('cộng chi theo từng nhãn, sắp giảm dần', () => {
    const a = tx({ id: 'a', type: 'expense', amount: 30_000 })
    const b = tx({ id: 'b', type: 'expense', amount: 50_000 })
    const r = tagBreakdown(
      [a, b],
      [link('a', 've-vn'), link('b', 'qua')],
      TAGS,
      currencyOf,
      'JPY',
      RATES,
    )
    expect(r.slices.map((s) => [s.name, s.amount])).toEqual([
      ['Quà cáp', 50_000],
      ['Về VN 2026', 30_000],
    ])
  })

  it('giao dịch 2 nhãn cộng đủ vào cả hai, nhưng taggedTotal chỉ đếm một lần', () => {
    const a = tx({ id: 'a', type: 'expense', amount: 40_000 })
    const r = tagBreakdown(
      [a],
      [link('a', 've-vn'), link('a', 'qua')],
      TAGS,
      currencyOf,
      'JPY',
      RATES,
    )
    expect(r.slices.map((s) => s.amount)).toEqual([40_000, 40_000])
    expect(r.taggedTotal).toBe(40_000)
    expect(r.total).toBe(40_000)
  })

  it('total gồm cả giao dịch chưa gắn nhãn', () => {
    const a = tx({ id: 'a', type: 'expense', amount: 40_000 })
    const b = tx({ id: 'b', type: 'expense', amount: 60_000 })
    const r = tagBreakdown([a, b], [link('a', 've-vn')], TAGS, currencyOf, 'JPY', RATES)
    expect(r.taggedTotal).toBe(40_000)
    expect(r.total).toBe(100_000)
  })

  it('hoàn tiền trừ khỏi nhãn', () => {
    const a = tx({ id: 'a', type: 'expense', amount: 50_000 })
    const b = tx({ id: 'b', type: 'expense', amount: 20_000, is_refund: true })
    const r = tagBreakdown(
      [a, b],
      [link('a', 've-vn'), link('b', 've-vn')],
      TAGS,
      currencyOf,
      'JPY',
      RATES,
    )
    expect(r.slices[0].amount).toBe(30_000)
  })

  it('bỏ thu nhập, chuyển khoản, dòng tiền nợ, giao dịch ngoài thống kê', () => {
    const rows = [
      tx({ id: 'a', type: 'income', amount: 99_000 }),
      tx({ id: 'b', type: 'transfer', amount: 99_000, category_id: null, to_account_id: 'a2' }),
      tx({ id: 'c', type: 'expense', amount: 99_000, is_debt_flow: true }),
      tx({ id: 'd', type: 'expense', amount: 99_000, exclude_from_stats: true }),
      tx({ id: 'e', type: 'expense', amount: 10_000 }),
    ]
    const r = tagBreakdown(
      rows,
      rows.map((t) => link(t.id, 've-vn')),
      TAGS,
      currencyOf,
      'JPY',
      RATES,
    )
    expect(r.slices[0].amount).toBe(10_000)
    expect(r.total).toBe(10_000)
  })

  it('nhãn đã bị xóa (còn liên kết mồ côi) không tạo lát rác', () => {
    const a = tx({ id: 'a', type: 'expense', amount: 10_000 })
    const r = tagBreakdown([a], [link('a', 'da-xoa')], TAGS, currencyOf, 'JPY', RATES)
    expect(r.slices).toEqual([])
    expect(r.taggedTotal).toBe(10_000)
  })

  it('quy đổi ngoại tệ; thiếu tỷ giá thì đánh dấu', () => {
    const a = tx({ id: 'a', type: 'expense', amount: 1_650_000 })
    const ok = tagBreakdown([a], [link('a', 've-vn')], TAGS, () => 'VND', 'JPY', RATES)
    expect(ok.slices[0].amount).toBe(10_000)

    const missing = tagBreakdown([a], [link('a', 've-vn')], TAGS, () => 'USD', 'JPY', { JPY: 1 })
    expect(missing.hasMissingRate).toBe(true)
    expect(missing.slices).toEqual([])
  })
})

describe('tagsByTransaction', () => {
  it('gom nhãn theo từng giao dịch', () => {
    const m = tagsByTransaction([link('a', 've-vn'), link('b', 'qua')], TAGS)
    expect(m.get('a')?.map((t) => t.name)).toEqual(['Về VN 2026'])
    expect(m.get('b')?.map((t) => t.name)).toEqual(['Quà cáp'])
  })

  it('giao dịch nhiều nhãn: xếp theo thứ tự của danh sách nhãn, không theo thứ tự link', () => {
    // link trả về "qua" trước, nhưng TAGS xếp "ve-vn" trước → chip hiện ổn định
    const m = tagsByTransaction([link('a', 'qua'), link('a', 've-vn')], TAGS)
    expect(m.get('a')?.map((t) => t.id)).toEqual(['ve-vn', 'qua'])
  })

  it('bỏ nhãn đã xóa (link mồ côi)', () => {
    const m = tagsByTransaction([link('a', 'da-xoa'), link('a', 've-vn')], TAGS)
    expect(m.get('a')?.map((t) => t.id)).toEqual(['ve-vn'])
  })

  it('link trùng chỉ hiện một chip', () => {
    const m = tagsByTransaction([link('a', 've-vn'), link('a', 've-vn')], TAGS)
    expect(m.get('a')).toHaveLength(1)
  })

  it('giao dịch không nhãn thì không có khóa trong map', () => {
    const m = tagsByTransaction([link('a', 've-vn')], TAGS)
    expect(m.has('b')).toBe(false)
  })

  it('chỉ còn link mồ côi thì không tạo mảng rỗng cho giao dịch đó', () => {
    const m = tagsByTransaction([link('a', 'da-xoa')], TAGS)
    expect(m.has('a')).toBe(false)
  })
})

describe('pickerTags', () => {
  // 5 nhãn, sort_order tăng dần theo thứ tự khai báo (repo trả về đã sắp)
  const FIVE = [
    tag('t0', 'Cũ ít dùng', { sort_order: 0 }),
    tag('t1', 'Cà phê', { sort_order: 1 }),
    tag('t2', 'Quà cáp', { sort_order: 2 }),
    tag('t3', 'Về VN', { sort_order: 3 }),
    tag('t4', 'Mới tinh', { sort_order: 4 }),
  ]
  /** n liên kết cho một nhãn (chỉ số lượng mới ảnh hưởng xếp hạng) */
  const uses = (tagId: string, n: number) =>
    Array.from({ length: n }, (_, i) => link(`tx-${tagId}-${i}`, tagId))
  const LINKS = [...uses('t3', 5), ...uses('t1', 3), ...uses('t2', 1)]

  it('xếp theo mức dùng giảm dần, không theo thứ tự tạo', () => {
    const r = pickerTags(FIVE, LINKS, [], 5)
    // t3 (5 lần) > t1 (3) > t2 (1) > t0, t4 (0 lần, hòa thì theo sort_order)
    expect(r.shown.map((t) => t.id)).toEqual(['t3', 't1', 't2', 't0', 't4'])
    expect(r.rest).toEqual([])
  })

  it('cắt đúng limit, phần dư nằm ở rest', () => {
    const r = pickerTags(FIVE, LINKS, [], 2)
    expect(r.shown.map((t) => t.id)).toEqual(['t3', 't1'])
    expect(r.rest.map((t) => t.id)).toEqual(['t2', 't0', 't4'])
  })

  it('nhãn đang chọn nằm ngoài top vẫn hiện, và ở CUỐI để chip khác không nhảy chỗ', () => {
    const r = pickerTags(FIVE, LINKS, ['t4'], 2)
    expect(r.shown.map((t) => t.id)).toEqual(['t3', 't1', 't4'])
    // đã lên shown thì không được lặp lại trong rest
    expect(r.rest.map((t) => t.id)).toEqual(['t2', 't0'])
  })

  it('chọn một nhãn đang hiện thì thứ tự shown không đổi', () => {
    const before = pickerTags(FIVE, LINKS, [], 2).shown.map((t) => t.id)
    const after = pickerTags(FIVE, LINKS, ['t1'], 2).shown.map((t) => t.id)
    expect(after).toEqual(before)
  })

  it('chọn nhiều hơn limit thì hiện hết, không cắt mất nhãn đã chọn', () => {
    const r = pickerTags(FIVE, LINKS, ['t0', 't2', 't4'], 1)
    expect(r.shown.map((t) => t.id)).toEqual(['t3', 't2', 't0', 't4'])
    expect(r.rest.map((t) => t.id)).toEqual(['t1'])
  })

  it('nhãn đã lưu trữ biến mất khỏi cả shown và rest', () => {
    const tags = [...FIVE.slice(0, 3), tag('t3', 'Về VN', { sort_order: 3, is_archived: true })]
    const r = pickerTags(tags, LINKS, [], 2)
    expect(r.shown.map((t) => t.id)).toEqual(['t1', 't2'])
    expect(r.rest.map((t) => t.id)).toEqual(['t0'])
  })

  it('nhãn đã lưu trữ NHƯNG đang chọn thì vẫn hiện (sửa giao dịch cũ phải bỏ được nhãn)', () => {
    const tags = [...FIVE.slice(0, 3), tag('t3', 'Về VN', { sort_order: 3, is_archived: true })]
    const r = pickerTags(tags, LINKS, ['t3'], 2)
    expect(r.shown.map((t) => t.id)).toEqual(['t3', 't1'])
  })

  it('chưa có nhãn nào thì rỗng cả hai', () => {
    expect(pickerTags([], [], [], 8)).toEqual({ shown: [], rest: [] })
  })
})

describe('filterByTags', () => {
  const a = tx({ type: 'expense', amount: 100, id: 'a' })
  const b = tx({ type: 'expense', amount: 200, id: 'b' })
  const c = tx({ type: 'income', amount: 300, id: 'c' })
  const LINKS = [link('a', 've-vn'), link('b', 'qua'), link('c', 've-vn')]
  // Nhãn ngoài nhóm (mục Khác) — giữ đúng hành vi cũ.
  const FLAT = [tag('ve-vn', 'Về VN 2026'), tag('qua', 'Quà cáp')]

  it('danh sách nhãn rỗng = không lọc', () => {
    expect(filterByTags([a, b, c], LINKS, [], FLAT)).toEqual([a, b, c])
  })

  it('lọc đúng một nhãn, giữ nguyên thứ tự đầu vào', () => {
    expect(filterByTags([a, b, c], LINKS, ['ve-vn'], FLAT)).toEqual([a, c])
  })

  it('nhiều nhãn CÙNG mục = khớp BẤT KỲ (OR)', () => {
    expect(filterByTags([a, b, c], LINKS, ['ve-vn', 'qua'], FLAT)).toEqual([a, b, c])
  })

  it('giao dịch mang 2 nhãn chỉ xuất hiện một lần', () => {
    const both = [...LINKS, link('a', 'qua')]
    expect(filterByTags([a, b], both, ['ve-vn', 'qua'], FLAT)).toEqual([a, b])
  })

  it('nhãn không có giao dịch nào → rỗng', () => {
    expect(filterByTags([a, b, c], LINKS, ['khong-ton-tai'], FLAT)).toEqual([])
  })

  it('bỏ qua link trỏ tới giao dịch ngoài tập đang xét', () => {
    expect(filterByTags([b], LINKS, ['ve-vn'], FLAT)).toEqual([])
  })

  describe('hai nhóm khác nhau = VÀ', () => {
    const TAGS = [
      tag('nguoi-yeu', 'Người yêu', { group_id: 'g-who' }),
      tag('ban-be', 'Bạn bè', { group_id: 'g-who' }),
      tag('tokyo', 'Tokyo', { group_id: 'g-where' }),
      tag('osaka', 'Osaka', { group_id: 'g-where' }),
    ]
    // x: người yêu + Tokyo · y: người yêu + Osaka · z: bạn bè + Tokyo · w: chỉ Tokyo
    const x = tx({ type: 'expense', amount: 1, id: 'x' })
    const y = tx({ type: 'expense', amount: 1, id: 'y' })
    const z = tx({ type: 'expense', amount: 1, id: 'z' })
    const w = tx({ type: 'expense', amount: 1, id: 'w' })
    const L = [
      link('x', 'nguoi-yeu'),
      link('x', 'tokyo'),
      link('y', 'nguoi-yeu'),
      link('y', 'osaka'),
      link('z', 'ban-be'),
      link('z', 'tokyo'),
      link('w', 'tokyo'),
    ]
    const ALL = [x, y, z, w]

    it('người yêu + Tokyo = khoản có ĐỦ CẢ HAI', () => {
      expect(filterByTags(ALL, L, ['nguoi-yeu', 'tokyo'], TAGS)).toEqual([x])
    })

    it('trong cùng nhóm vẫn là HOẶC: Tokyo + Osaka = cả hai nơi', () => {
      expect(filterByTags(ALL, L, ['tokyo', 'osaka'], TAGS)).toEqual([x, y, z, w])
    })

    it('kết hợp: (người yêu HOẶC bạn bè) VÀ Tokyo', () => {
      expect(filterByTags(ALL, L, ['nguoi-yeu', 'ban-be', 'tokyo'], TAGS)).toEqual([x, z])
    })

    it('nhãn ở mục Khác gộp thành MỘT nhóm ảo, OR với nhau', () => {
      const tags2 = [...TAGS, tag('ve-vn', 'Về VN 2026'), tag('dam-cuoi', 'Đám cưới')]
      const l2 = [...L, link('w', 've-vn'), link('y', 'dam-cuoi')]
      expect(filterByTags(ALL, l2, ['ve-vn', 'dam-cuoi'], tags2)).toEqual([y, w])
    })

    it('nhãn mục Khác VÀ nhãn có nhóm: vẫn giao nhau', () => {
      const tags2 = [...TAGS, tag('ve-vn', 'Về VN 2026')]
      const l2 = [...L, link('w', 've-vn'), link('x', 've-vn')]
      expect(filterByTags(ALL, l2, ['ve-vn', 'nguoi-yeu'], tags2)).toEqual([x])
    })

    it('nhãn không có trong danh sách tags rơi vào nhóm ảo mục Khác', () => {
      expect(filterByTags(ALL, L, ['tokyo', 'la-hoac'], TAGS)).toEqual([])
    })

    it('nhãn đã lưu trữ vẫn lọc được (lưu trữ chỉ ẩn khỏi form nhập)', () => {
      const tags2 = [
        tag('cu', 'Nhãn cũ', { group_id: 'g-who', is_archived: true }),
        ...TAGS.filter((t) => t.group_id === 'g-where'),
      ]
      const l2 = [...L, link('w', 'cu')]
      expect(filterByTags(ALL, l2, ['cu', 'tokyo'], tags2)).toEqual([w])
    })
  })
})
