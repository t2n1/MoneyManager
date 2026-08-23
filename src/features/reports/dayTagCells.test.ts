import { describe, expect, it } from 'vitest'
import type { CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { TagGroupRow, TagRow, TagSpendRow } from '../../types/database.types'
import type { DaySpend } from './dailySpike'
import { dayTagCells } from './dayTagCells'

const RATES: Rates = { JPY: 1, VND: 165 }
const currencyOf = (id: string): CurrencyCode => (id === 'vnd' ? 'VND' : 'JPY')

/** 01/08 → 05/08 cho gọn; `cells` luôn thẳng chỉ số với mảng này. */
const DAYS: DaySpend[] = ['01', '02', '03', '04', '05'].map((d) => ({
  date: `2026-08-${d}`,
  total: 0,
  top: [],
}))

const tag = (over: Partial<TagRow> & { id: string }): TagRow => ({
  user_id: 'u',
  name: `#${over.id}`,
  color: 'green',
  sort_order: 0,
  group_id: null,
  is_archived: false,
  budget_amount: null,
  budget_period: 'total',
  created_at: '',
  ...over,
})

const group = (id: string, name: string, sort = 0): TagGroupRow => ({
  id,
  user_id: 'u',
  name,
  sort_order: sort,
  created_at: '',
})

let seq = 0
const row = (over: Partial<TagSpendRow> & { tag_id: string }): TagSpendRow => ({
  transaction_id: `tx${seq++}`,
  amount: 1_000,
  account_id: 'jpy',
  occurred_on: '2026-08-02',
  is_refund: false,
  category_id: null,
  ...over,
})

const build = (
  rows: TagSpendRow[],
  tags: TagRow[],
  groups: TagGroupRow[] = [],
  extra: Partial<Parameters<typeof dayTagCells>[0]> = {},
) =>
  dayTagCells({
    days: DAYS,
    rows,
    tags,
    groups,
    currencyOf,
    base: 'JPY',
    rates: RATES,
    transferIds: new Set(),
    ...extra,
  })

describe('dayTagCells — ô vuông theo ngày', () => {
  it('đặt tiền vào ĐÚNG chỉ số ngày, ngày không có là 0', () => {
    const r = build(
      [row({ tag_id: 'osaka', amount: 4_000, occurred_on: '2026-08-03' })],
      [tag({ id: 'osaka' })],
    )
    expect(r.groups[0].rows[0].cells).toEqual([0, 0, 4_000, 0, 0])
    expect(r.groups[0].rows[0].firstISO).toBe('2026-08-03')
    expect(r.groups[0].rows[0].lastISO).toBe('2026-08-03')
  })

  it('nhãn KHÔNG có ngày nào trong khoảng thì không vẽ hàng', () => {
    // Một chuyến đã xong tháng trước vẫn còn dòng chi, nhưng nó không giải thích được cột
    // nào ở tháng này — một hàng trống chiếm đúng chỗ của một hàng có nội dung.
    const r = build(
      [row({ tag_id: 'cu', occurred_on: '2026-07-15' })],
      [tag({ id: 'cu' }), tag({ id: 'nay' })],
    )
    expect(r.groups).toEqual([])
    expect(r.taggedTotal).toBe(0)
  })

  it('hoàn tiền là ô ÂM, không phải ô bị bỏ', () => {
    const r = build(
      [
        row({ tag_id: 'tau', amount: 3_000, occurred_on: '2026-08-01' }),
        row({ tag_id: 'tau', amount: 1_800, occurred_on: '2026-08-02', is_refund: true }),
      ],
      [tag({ id: 'tau' })],
    )
    expect(r.groups[0].rows[0].cells).toEqual([3_000, -1_800, 0, 0, 0])
    expect(r.groups[0].rows[0].total).toBe(1_200)
  })

  it('thiếu tỷ giá thì loại khoản đó và bật cờ, KHÔNG quy 1:1', () => {
    const r = dayTagCells({
      days: DAYS,
      rows: [
        row({ tag_id: 'a', amount: 999, account_id: 'usd' }),
        row({ tag_id: 'a', amount: 600 }),
      ],
      tags: [tag({ id: 'a' })],
      groups: [],
      currencyOf: (id) => (id === 'usd' ? 'USD' : 'JPY'),
      base: 'JPY',
      rates: RATES, // không có USD
      transferIds: new Set(),
    })
    expect(r.hasMissingRate).toBe(true)
    expect(r.taggedTotal).toBe(600)
  })

  it('bỏ danh mục chuyển tài sản — getTagSpend() không tự lọc chúng', () => {
    const r = build(
      [
        row({ tag_id: 'a', amount: 30_000, category_id: 'gui-ve-vn' }),
        row({ tag_id: 'a', amount: 800, category_id: 'food' }),
      ],
      [tag({ id: 'a' })],
      [],
      { transferIds: new Set(['gui-ve-vn']) },
    )
    expect(r.taggedTotal).toBe(800)
  })

  it('công tắc "bỏ cố định" cũng áp cho dải nhãn, cùng tập với biểu đồ', () => {
    const r = build(
      [
        row({ tag_id: 'a', amount: 112_760, category_id: 'nha' }),
        row({ tag_id: 'a', amount: 900, category_id: 'an' }),
      ],
      [tag({ id: 'a' })],
      [],
      { excludeCategoryIds: new Set(['nha']) },
    )
    expect(r.taggedTotal).toBe(900)
  })
})

describe('dayTagCells — LUẬT CHẶN B44.1: hai nhãn trên một khoản', () => {
  // `#Osaka` ∩ `#Người yêu` là ca thật ngày 09–11. Cùng ¥40.600 phải hiện ở CẢ HAI hàng —
  // đó là nghĩa của nhãn — nhưng chỉ được đếm MỘT lần vào `taggedTotal`.
  const rows = [
    { tag_id: 'osaka', transaction_id: 'tx-chung', amount: 40_600, occurred_on: '2026-08-03' },
    { tag_id: 'yeu', transaction_id: 'tx-chung', amount: 40_600, occurred_on: '2026-08-03' },
    { tag_id: 'yeu', transaction_id: 'tx-rieng', amount: 700, occurred_on: '2026-08-01' },
  ].map((r) => row(r))
  const tags = [tag({ id: 'osaka' }), tag({ id: 'yeu' })]

  it('khoản hai nhãn hiện ở CẢ HAI hàng', () => {
    const r = build(rows, tags)
    const byId = new Map(r.groups[0].rows.map((x) => [x.tagId, x]))
    expect(byId.get('osaka')!.cells[2]).toBe(40_600)
    expect(byId.get('yeu')!.cells[2]).toBe(40_600)
  })

  it('nhưng taggedTotal chỉ đếm nó MỘT lần', () => {
    const r = build(rows, tags)
    expect(r.taggedTotal).toBe(41_300)
    expect(r.taggedCount).toBe(2)
  })

  it('rowsTotal LỚN HƠN taggedTotal đúng bằng phần giao nhau (B44.2)', () => {
    // Hai con số này phải cùng ra khỏi hàm: in một mà giấu số kia là để người đọc tự phát
    // hiện ra một "lỗi tính" không có thật.
    const r = build(rows, tags)
    expect(r.rowsTotal).toBe(81_900)
    expect(r.rowsTotal - r.taggedTotal).toBe(40_600)
  })

  it('nhãn trùng trên CÙNG giao dịch (dữ liệu lỗi) chỉ tính một lần', () => {
    const r = build(
      [
        row({ tag_id: 'a', transaction_id: 'tx1', amount: 500 }),
        row({ tag_id: 'a', transaction_id: 'tx1', amount: 500 }),
      ],
      [tag({ id: 'a' })],
    )
    expect(r.groups[0].rows[0].total).toBe(500)
  })
})

describe('dayTagCells — nhóm làm tiêu đề, nhãn làm hàng (B44.4/B44.5)', () => {
  it('theo thứ tự groups, mục Khác ở CUỐI, nhóm rỗng không có tiêu đề', () => {
    const r = build(
      [
        row({ tag_id: 'yeu', amount: 9_000 }),
        row({ tag_id: 'osaka', amount: 8_000 }),
        row({ tag_id: 'le', amount: 7_000 }),
      ],
      [
        tag({ id: 'yeu', group_id: 'ai' }),
        tag({ id: 'osaka', group_id: 'odau' }),
        tag({ id: 'le' }),
      ],
      [group('ai', 'Ai?', 0), group('odau', 'Ở đâu?', 1), group('trong', 'Trống', 2)],
    )
    expect(r.groups.map((g) => g.title)).toEqual(['Ai?', 'Ở đâu?', 'Khác'])
  })

  it('nhãn trỏ tới nhóm đã XOÁ rơi về mục Khác, không biến mất', () => {
    const r = build([row({ tag_id: 'a', amount: 500 })], [tag({ id: 'a', group_id: 'da-xoa' })], [])
    expect(r.groups.map((g) => g.title)).toEqual(['Khác'])
  })

  it('trong một nhóm thì hàng TO nằm trên', () => {
    const r = build(
      [row({ tag_id: 'be', amount: 100 }), row({ tag_id: 'to', amount: 9_000 })],
      [tag({ id: 'be', group_id: 'ai' }), tag({ id: 'to', group_id: 'ai' })],
      [group('ai', 'Ai?')],
    )
    expect(r.groups[0].rows.map((x) => x.tagId)).toEqual(['to', 'be'])
  })

  it('quá 6 nhãn thì cắt ở 6 hàng và đếm phần còn lại', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, amount: (9 - i) * 1_000 }))
    const r = build(
      many.map((m) => row({ tag_id: m.id, amount: m.amount })),
      many.map((m) => tag({ id: m.id })),
    )
    expect(r.groups[0].rows).toHaveLength(6)
    expect(r.hidden).toBe(3)
    // Cắt theo TIỀN giảm dần: sáu hàng đầu là sáu nhãn to nhất.
    expect(r.groups[0].rows.map((x) => x.tagId)).toEqual(['t0', 't1', 't2', 't3', 't4', 't5'])
  })

  it('rowsTotal chỉ cộng hàng ĐANG HIỆN — số ở chân khối phải cộng ra được từ màn hình', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, amount: 1_000 }))
    const r = build(
      many.map((m) => row({ tag_id: m.id, amount: m.amount })),
      many.map((m) => tag({ id: m.id })),
    )
    expect(r.rowsTotal).toBe(6_000)
    expect(r.taggedTotal).toBe(8_000)
  })
})
