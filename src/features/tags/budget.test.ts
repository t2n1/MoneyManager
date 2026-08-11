import { describe, expect, it } from 'vitest'
import type { Rates } from '../../lib/rates'
import type { TagRow, TagSpendRow } from '../../types/database.types'
import { buildTagBudgetReport, tagPlanLines, tagSpendTotals, type TagBudgetLine } from './budget'

const MONTH_START = '2026-08-01'
const MONTH_END = '2026-09-01'

const tag = (over: Partial<TagRow> & { id: string }): TagRow => ({
  user_id: 'u',
  name: `Nhãn ${over.id}`,
  color: 'green',
  sort_order: 0,
  group_id: null,
  is_archived: false,
  budget_amount: null,
  budget_period: 'total',
  created_at: '',
  ...over,
})

const row = (over: Partial<TagSpendRow> & { tag_id: string }): TagSpendRow => ({
  transaction_id: `tx-${over.tag_id}`,
  amount: 0,
  account_id: 'jpy',
  occurred_on: '2026-08-10',
  is_refund: false,
  ...over,
})

// Tài khoản 'jpy' cùng loại tiền với base; 'vnd' để thử quy đổi và thiếu tỷ giá.
const currencyOf = (id: string) => (id === 'vnd' ? ('VND' as const) : ('JPY' as const))
// Rates = "1 base đổi được bao nhiêu đơn vị tiền kia" → 1.000.000 ₫ = ¥6.000
const RATES = { VND: 1_000_000 / 6_000 }

const build = (tags: TagRow[], rows: TagSpendRow[], rates: Rates = RATES) =>
  buildTagBudgetReport({
    tags,
    rows,
    currencyOf,
    base: 'JPY',
    rates,
    monthStart: MONTH_START,
    monthEnd: MONTH_END,
  })

describe('tagSpendTotals', () => {
  it('cộng theo nhãn, hoàn tiền trả lại phần đã tiêu', () => {
    const { byTag } = tagSpendTotals(
      [
        row({ tag_id: 'a', transaction_id: 't1', amount: 10_000 }),
        row({ tag_id: 'a', transaction_id: 't2', amount: 4_000, is_refund: true }),
      ],
      currencyOf,
      'JPY',
      RATES,
    )
    expect(byTag.get('a')).toBe(6_000)
  })

  it('một giao dịch mang hai nhãn được cộng đủ vào CẢ HAI', () => {
    // "Về VN 2026" ∩ "Quà cáp": cùng 10.000 đó thuộc về cả hai câu hỏi
    const { byTag } = tagSpendTotals(
      [
        row({ tag_id: 'a', transaction_id: 't1', amount: 10_000 }),
        row({ tag_id: 'b', transaction_id: 't1', amount: 10_000 }),
      ],
      currencyOf,
      'JPY',
      RATES,
    )
    expect(byTag.get('a')).toBe(10_000)
    expect(byTag.get('b')).toBe(10_000)
  })

  it('cùng một cặp (nhãn, giao dịch) lặp lại chỉ tính một lần', () => {
    const { byTag } = tagSpendTotals(
      [
        row({ tag_id: 'a', transaction_id: 't1', amount: 10_000 }),
        row({ tag_id: 'a', transaction_id: 't1', amount: 10_000 }),
      ],
      currencyOf,
      'JPY',
      RATES,
    )
    expect(byTag.get('a')).toBe(10_000)
  })

  it('quy đổi ngoại tệ về base', () => {
    const { byTag } = tagSpendTotals(
      [row({ tag_id: 'a', amount: 1_000_000, account_id: 'vnd' })],
      currencyOf,
      'JPY',
      RATES,
    )
    expect(byTag.get('a')).toBe(6_000)
  })

  it('thiếu tỷ giá thì bỏ khoản đó VÀ nói ra, không cộng bừa', () => {
    const r = tagSpendTotals(
      [
        row({ tag_id: 'a', transaction_id: 't1', amount: 5_000 }),
        row({ tag_id: 'a', transaction_id: 't2', amount: 1_000_000, account_id: 'vnd' }),
      ],
      currencyOf,
      'JPY',
      {},
    )
    expect(r.byTag.get('a')).toBe(5_000)
    expect(r.hasMissingRate).toBe(true)
  })

  it('bộ lọc ngày cắt đúng khoảng', () => {
    const { byTag } = tagSpendTotals(
      [
        row({ tag_id: 'a', transaction_id: 't1', amount: 1_000, occurred_on: '2026-07-31' }),
        row({ tag_id: 'a', transaction_id: 't2', amount: 2_000, occurred_on: '2026-08-01' }),
        row({ tag_id: 'a', transaction_id: 't3', amount: 4_000, occurred_on: '2026-09-01' }),
      ],
      currencyOf,
      'JPY',
      RATES,
      (iso) => iso >= MONTH_START && iso < MONTH_END,
    )
    // Chỉ 1/8 lọt: 31/7 trước khoảng, 1/9 là mốc LOẠI TRỪ
    expect(byTag.get('a')).toBe(2_000)
  })
})

describe('buildTagBudgetReport', () => {
  it('nhãn chưa đặt trần thì không có dòng nào', () => {
    const r = build([tag({ id: 'a' })], [row({ tag_id: 'a', amount: 99_000 })])
    expect(r.lines).toEqual([])
  })

  it("kỳ 'total' cộng cả đời nhãn, không cắt theo tháng", () => {
    const r = build(
      [tag({ id: 'a', budget_amount: 300_000, budget_period: 'total' })],
      [
        row({ tag_id: 'a', transaction_id: 't1', amount: 100_000, occurred_on: '2026-03-02' }),
        row({ tag_id: 'a', transaction_id: 't2', amount: 50_000, occurred_on: '2026-08-10' }),
      ],
    )
    expect(r.lines[0].spent).toBe(150_000)
    expect(r.lines[0].remaining).toBe(150_000)
    expect(r.lines[0].status).toBe('ok')
  })

  it("kỳ 'monthly' chỉ tính tháng đang xem", () => {
    const r = build(
      [tag({ id: 'a', budget_amount: 30_000, budget_period: 'monthly' })],
      [
        row({ tag_id: 'a', transaction_id: 't1', amount: 100_000, occurred_on: '2026-03-02' }),
        row({ tag_id: 'a', transaction_id: 't2', amount: 12_000, occurred_on: '2026-08-10' }),
      ],
    )
    expect(r.lines[0].spent).toBe(12_000)
    expect(r.lines[0].remaining).toBe(18_000)
  })

  it('cùng dữ liệu, đổi kiểu kỳ là ra hai con số khác nhau', () => {
    const rows = [
      row({ tag_id: 'a', transaction_id: 't1', amount: 100_000, occurred_on: '2026-03-02' }),
      row({ tag_id: 'a', transaction_id: 't2', amount: 20_000, occurred_on: '2026-08-10' }),
    ]
    const total = build([tag({ id: 'a', budget_amount: 50_000, budget_period: 'total' })], rows)
    const monthly = build([tag({ id: 'a', budget_amount: 50_000, budget_period: 'monthly' })], rows)
    expect(total.lines[0].spent).toBe(120_000)
    expect(total.lines[0].status).toBe('over')
    expect(monthly.lines[0].spent).toBe(20_000)
    expect(monthly.lines[0].status).toBe('ok')
  })

  it('vượt trần → remaining ÂM đúng bằng số vượt', () => {
    const r = build(
      [tag({ id: 'a', budget_amount: 100_000 })],
      [row({ tag_id: 'a', amount: 130_000 })],
    )
    expect(r.lines[0].status).toBe('over')
    expect(r.lines[0].remaining).toBe(-30_000)
  })

  it('từ 80% là cảnh báo sớm', () => {
    const warn = build(
      [tag({ id: 'a', budget_amount: 100_000 })],
      [row({ tag_id: 'a', amount: 80_000 })],
    )
    expect(warn.lines[0].status).toBe('warn')
  })

  it('nhãn đã lưu trữ VẪN có dòng — xong chuyến vẫn cần xem tổng so với dự trù', () => {
    const r = build(
      [tag({ id: 'a', budget_amount: 100_000, is_archived: true })],
      [row({ tag_id: 'a', amount: 90_000 })],
    )
    expect(r.lines).toHaveLength(1)
  })

  it('xếp cái sắp vượt lên đầu', () => {
    const r = build(
      [
        tag({ id: 'thap', budget_amount: 100_000 }),
        tag({ id: 'cao', budget_amount: 100_000 }),
      ],
      [
        row({ tag_id: 'thap', transaction_id: 't1', amount: 10_000 }),
        row({ tag_id: 'cao', transaction_id: 't2', amount: 95_000 }),
      ],
    )
    expect(r.lines.map((l) => l.tagId)).toEqual(['cao', 'thap'])
  })

  it('chưa tiêu đồng nào vẫn có dòng, ở mức 0%', () => {
    const r = build([tag({ id: 'a', budget_amount: 100_000 })], [])
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0].spent).toBe(0)
    expect(r.lines[0].ratio).toBe(0)
  })

  it('thiếu tỷ giá được báo lên báo cáo', () => {
    const r = build(
      [tag({ id: 'a', budget_amount: 100_000 })],
      [row({ tag_id: 'a', amount: 1_000_000, account_id: 'vnd' })],
      {},
    )
    expect(r.hasMissingRate).toBe(true)
  })
})

describe('tagPlanLines', () => {
  const line = (over: Partial<TagBudgetLine> & { tagId: string }): TagBudgetLine => ({
    name: `Nhãn ${over.tagId}`,
    color: 'green',
    period: 'total',
    spent: 0,
    budget: 100,
    ratio: 0,
    remaining: 100,
    status: 'ok',
    ...over,
  })

  it("kỳ 'monthly' ở tháng chưa tới có NGUYÊN trần để chia", () => {
    // Báo cáo dựng cho tháng chưa bắt đầu → spent = 0, remaining = trần.
    const r = tagPlanLines([
      line({ tagId: 't', period: 'monthly', budget: 20_000, spent: 0, remaining: 20_000 }),
    ])
    expect(r[0]).toMatchObject({ available: 20_000, exhausted: false })
  })

  it("kỳ 'total' chỉ còn phần chưa tiêu của cả đợt, không phải nguyên trần", () => {
    // Chuyến đi 300k đã tiêu 250k thì tháng sau còn 50k, dù trần vẫn ghi 300k.
    const r = tagPlanLines([
      line({ tagId: 't', period: 'total', budget: 300_000, spent: 250_000, remaining: 50_000 }),
    ])
    expect(r[0]).toMatchObject({ available: 50_000, budget: 300_000, exhausted: false })
  })

  it("kỳ 'total' đã vượt → còn 0 đồng, không phải số âm", () => {
    const r = tagPlanLines([
      line({ tagId: 't', period: 'total', budget: 300_000, spent: 320_000, remaining: -20_000 }),
    ])
    expect(r[0].available).toBe(0)
    expect(r[0].exhausted).toBe(true)
    // Phần vượt vẫn đọc được để hiện ra, chỉ là không đem đi cộng.
    expect(r[0].spent - r[0].budget).toBe(20_000)
  })

  it("tiêu đúng bằng trần cũng là cạn", () => {
    const r = tagPlanLines([
      line({ tagId: 't', period: 'total', budget: 300_000, spent: 300_000, remaining: 0 }),
    ])
    expect(r[0]).toMatchObject({ available: 0, exhausted: true })
  })

  it("kỳ 'monthly' KHÔNG bao giờ bị coi là cạn — nó reset đầu kỳ", () => {
    const r = tagPlanLines([
      line({ tagId: 't', period: 'monthly', budget: 20_000, spent: 20_000, remaining: 0 }),
    ])
    expect(r[0].exhausted).toBe(false)
  })

  it('đợt sắp cạn nằm trên đầu, trần tháng trôi xuống dưới', () => {
    const r = tagPlanLines([
      line({ tagId: 'thang', period: 'monthly', budget: 20_000, spent: 0, remaining: 20_000 }),
      line({ tagId: 'con-nhieu', period: 'total', budget: 100_000, spent: 10_000, remaining: 90_000 }),
      line({ tagId: 'sap-can', period: 'total', budget: 300_000, spent: 280_000, remaining: 20_000 }),
    ])
    expect(r.map((x) => x.tagId)).toEqual(['sap-can', 'con-nhieu', 'thang'])
  })

  it('không có nhãn nào đặt trần → không có dòng nào', () => {
    expect(tagPlanLines([])).toEqual([])
  })
})
