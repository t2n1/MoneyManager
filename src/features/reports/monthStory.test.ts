import { describe, expect, it } from 'vitest'
import { monthStory, type MonthStoryInput } from './monthStory'
import type { CategoryRow, TransactionRow } from '../../types/database.types'
import type { Rates } from '../../lib/rates'
import type { CurrencyCode } from '../../lib/money'
import type { MonthKey } from '../../lib/dates'

const RATES: Rates = { JPY: 1, VND: 165 }
const currencyOf = (id: string): CurrencyCode => (id === 'vnd' ? 'VND' : 'JPY')

// Sáu tháng: 2026-02 … 2026-07, tháng đang xem là phần tử CUỐI (đúng thứ tự MonthView dựng).
const MONTHS: MonthKey[] = [2, 3, 4, 5, 6, 7].map((month) => ({ year: 2026, month }))
const NOW = { year: 2026, month: 7 }
const iso = (key: MonthKey, day = 10) =>
  `${key.year}-${String(key.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

let seq = 0
const tx = (
  amount: number,
  category_id: string,
  key: MonthKey,
  extra: Partial<TransactionRow> = {},
): TransactionRow => ({
  id: `t${seq++}`,
  user_id: 'u',
  type: 'expense',
  amount,
  to_amount: null,
  category_id,
  account_id: 'jpy',
  to_account_id: null,
  recurring_rule_id: null,
  occurred_on: iso(key),
  note: '',
  created_at: '',
  updated_at: '',
  ...extra,
})

/** n giao dịch bằng nhau trong một tháng — dựng "mức thường" của một nhóm. */
const flat = (n: number, amount: number, category_id: string, key: MonthKey) =>
  Array.from({ length: n }, () => tx(amount, category_id, key))

const cat = (id: string, name: string, extra: Partial<CategoryRow> = {}): CategoryRow => ({
  id,
  user_id: 'u',
  name,
  type: 'expense',
  icon: '',
  parent_id: null,
  sort_order: 0,
  is_archived: false,
  created_at: '',
  need_level: null,
  cost_type: null,
  kind: 'expense',
  ...extra,
})

const CATEGORIES: CategoryRow[] = [
  cat('look', 'Ngoại hình'),
  cat('shop', 'Phụ kiện', { parent_id: 'look', cost_type: 'variable' }),
  cat('food', 'Ăn uống'),
  cat('eatout', 'Cơm ngoài', { parent_id: 'food', cost_type: 'variable' }),
  cat('home', 'Nhà ở'),
  cat('rent', 'Tiền nhà', { parent_id: 'home', cost_type: 'fixed' }),
  cat('power', 'Điện', { parent_id: 'home', cost_type: 'variable' }),
  cat('fun', 'Sở thích', { cost_type: 'variable' }),
]

const input = (txs: TransactionRow[], extra: Partial<MonthStoryInput> = {}): MonthStoryInput => ({
  txs,
  months: MONTHS,
  monthStartDay: 1,
  categories: CATEGORIES,
  currencyOf,
  base: 'JPY',
  rates: RATES,
  ...extra,
})

// Năm tháng trước, mỗi tháng `per` khoản `amount` cho một danh mục.
const history = (category_id: string, per: number, amount: number) =>
  MONTHS.slice(0, -1).flatMap((key) => flat(per, amount, category_id, key))

describe('monthStory — nhóm lệch với chính nó', () => {
  it('nhóm chi gấp ≥2 lần trung vị các tháng trước → kêu, kèm mức thường', () => {
    const txs = [...history('shop', 1, 20_000), tx(80_000, 'shop', NOW)]
    const r = monthStory(input(txs))
    const f = r.findings.find((x) => x.kind === 'categorySpike')
    expect(f).toBeDefined()
    expect(f).toMatchObject({ name: 'Ngoại hình', amount: 80_000, usual: 20_000 })
    expect(f?.kind === 'categorySpike' && f.ratio).toBeCloseTo(4)
  })

  it('dưới 2 lần mức thường → im, không bịa phát hiện', () => {
    const txs = [...history('shop', 1, 20_000), tx(30_000, 'shop', NOW)]
    expect(monthStory(input(txs)).findings).toEqual([])
  })

  it('chưa đủ 3 tháng lịch sử → im, vì "mức thường" dựng từ 2 điểm là số bịa', () => {
    const early = MONTHS.slice(-3, -1) // chỉ 2 tháng trước
    const txs = [...early.flatMap((k) => flat(1, 20_000, 'shop', k)), tx(80_000, 'shop', NOW)]
    expect(monthStory(input(txs)).findings).toEqual([])
  })

  it('một khoản chiếm phần lớn mức chi của nhóm → kèm vế "một lần mua duy nhất"', () => {
    const txs = [
      ...history('shop', 2, 10_000),
      tx(67_000, 'shop', NOW),
      ...flat(4, 5_000, 'shop', NOW),
    ]
    const f = monthStory(input(txs)).findings[0]
    expect(f.kind).toBe('categorySpike')
    expect(f.kind === 'categorySpike' && f.biggest).toMatchObject({ amount: 67_000 })
    expect(f.kind === 'categorySpike' && Math.round(f.biggest!.share * 100)).toBe(77)
  })

  it('nhóm tăng đều tay, không khoản nào trội → biggest = null', () => {
    const txs = [...history('shop', 4, 5_000), ...flat(10, 6_000, 'shop', NOW)]
    const f = monthStory(input(txs)).findings[0]
    expect(f.kind === 'categorySpike' && f.biggest).toBeNull()
  })
})

describe('monthStory — nghìn nhát dao nhỏ', () => {
  it('nhiều khoản lẻ dồn lại xấp xỉ nhóm cố định lớn nhất → kêu, kèm mốc so', () => {
    const txs = [
      ...flat(72, 1_500, 'eatout', NOW), // ¥108.000, 72 lần
      tx(112_000, 'rent', NOW), // nhóm cố định lớn nhất tháng
    ]
    const f = monthStory(input(txs)).findings.find((x) => x.kind === 'manySmall')
    expect(f).toMatchObject({
      name: 'Ăn uống',
      amount: 108_000,
      count: 72,
      anchorName: 'Nhà ở',
      anchorAmount: 112_000,
    })
  })

  it('ít lần thì không phải "nghìn nhát dao nhỏ", dù tổng to', () => {
    const txs = [...flat(3, 36_000, 'eatout', NOW), tx(112_000, 'rent', NOW)]
    expect(monthStory(input(txs)).findings.some((x) => x.kind === 'manySmall')).toBe(false)
  })

  it('tổng còn xa mốc cố định → im', () => {
    const txs = [...flat(40, 500, 'eatout', NOW), tx(112_000, 'rent', NOW)]
    expect(monthStory(input(txs)).findings.some((x) => x.kind === 'manySmall')).toBe(false)
  })

  it('tháng không có khoản cố định nào → không có mốc để so, im', () => {
    const txs = flat(72, 1_500, 'eatout', NOW)
    expect(monthStory(input(txs)).findings.some((x) => x.kind === 'manySmall')).toBe(false)
  })
})

describe('monthStory — giá mỗi lần', () => {
  it('giá mỗi lần ngang mức thường → im (bộ dò không bịa chữ để lấp chỗ)', () => {
    const txs = [...history('eatout', 20, 1_500), ...flat(20, 1_520, 'eatout', NOW)]
    expect(monthStory(input(txs)).findings.some((x) => x.kind === 'pricePerVisit')).toBe(false)
  })

  it('cùng số lần mà mỗi lần đắt hơn 1/3 → kêu, kèm cả hai giá', () => {
    const txs = [...history('eatout', 20, 1_500), ...flat(20, 2_100, 'eatout', NOW)]
    const f = monthStory(input(txs)).findings.find((x) => x.kind === 'pricePerVisit')
    expect(f).toMatchObject({ name: 'Ăn uống', perNow: 2_100, perUsual: 1_500, count: 20 })
  })

  it('quá ít lần thì trung bình mỗi lần không có nghĩa → im', () => {
    const txs = [...history('eatout', 3, 1_500), ...flat(3, 4_000, 'eatout', NOW)]
    expect(monthStory(input(txs)).findings.some((x) => x.kind === 'pricePerVisit')).toBe(false)
  })
})

describe('monthStory — một khoản nuốt cả nhóm (không lệch mức thường)', () => {
  it('nhóm đúng mức thường nhưng gần hết nằm ở một khoản → kêu kiểu lump', () => {
    const txs = [...history('fun', 6, 5_000), tx(24_000, 'fun', NOW), ...flat(3, 2_000, 'fun', NOW)]
    const f = monthStory(input(txs)).findings.find((x) => x.kind === 'lump')
    expect(f).toMatchObject({ name: 'Sở thích', amount: 30_000, biggest: 24_000 })
  })

  // Cùng cái bẫy `dailyHeadline` đã gỡ: ngày trả tiền nhà thì TẤT NHIÊN gấp 41 lần ngày
  // thường. Ở đây là "tiền nhà chiếm 85% nhóm Nhà ở" — đúng, và không nói được gì.
  it('khoản to nhất là chi CỐ ĐỊNH → im, vì đó là chuyện của lịch trả tiền', () => {
    const txs = [
      ...MONTHS.flatMap((k) => [tx(68_000, 'rent', k), tx(12_400, 'power', k)]),
    ]
    expect(monthStory(input(txs)).findings.some((x) => x.kind === 'lump')).toBe(false)
  })

  it('nhóm chỉ có đúng một khoản → im: "một khoản chiếm 100%" là câu hiển nhiên', () => {
    const txs = [...history('fun', 1, 30_000), tx(30_000, 'fun', NOW)]
    expect(monthStory(input(txs)).findings.some((x) => x.kind === 'lump')).toBe(false)
  })
})

describe('monthStory — sàn tỷ trọng', () => {
  // Bắt được khi chạy thật trên dữ liệu demo: "Ăn uống ¥4.130 — 79% nằm ở một khoản
  // ¥3.280" đúng từng chữ, nhưng ¥4.130 là 4% chi cả tháng. Câu tóm của THÁNG phải nói
  // về tháng.
  it('nhóm quá nhỏ so với chi cả tháng → im, dù lệch gấp mấy lần', () => {
    const small = [...history('fun', 1, 1_000), tx(9_000, 'fun', NOW)] // gấp 9 lần
    expect(monthStory(input(small)).findings).toHaveLength(1)
    // Cùng nhóm đó, khi tháng có thêm ¥200.000 chi khác → nó tụt xuống 4% và im.
    expect(monthStory(input([...small, tx(200_000, 'rent', NOW)])).findings).toEqual([])
  })
})

describe('monthStory — chọn và xếp phát hiện', () => {
  it('nhiều phát hiện → tối đa 2, nhóm lệch đứng trước nghìn nhát dao nhỏ', () => {
    const txs = [
      ...history('shop', 1, 20_000),
      tx(80_000, 'shop', NOW),
      ...flat(72, 1_500, 'eatout', NOW),
      tx(112_000, 'rent', NOW),
    ]
    const kinds = monthStory(input(txs)).findings.map((f) => f.kind)
    expect(kinds).toEqual(['categorySpike', 'manySmall'])
  })

  it('hai nhóm cùng lệch → nhóm dôi ra nhiều tiền hơn đứng trước', () => {
    const txs = [
      ...history('shop', 1, 20_000),
      tx(80_000, 'shop', NOW), // dôi ¥60.000
      ...history('fun', 1, 1_000),
      tx(9_000, 'fun', NOW), // gấp 9 lần nhưng chỉ dôi ¥8.000
    ]
    const names = monthStory(input(txs)).findings.map((f) => f.name)
    expect(names).toEqual(['Ngoại hình', 'Sở thích'])
  })

  it('một nhóm chỉ được nói MỘT lần, dù dính nhiều bộ dò', () => {
    const txs = [
      ...history('eatout', 20, 1_500),
      ...flat(72, 3_000, 'eatout', NOW), // vừa lệch mức thường, vừa nhiều lần, vừa đắt hơn/lần
      tx(112_000, 'rent', NOW),
    ]
    const ids = monthStory(input(txs)).findings.map((f) => f.groupId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('tháng không có gì bất thường → rỗng, không bịa', () => {
    const txs = [...history('shop', 2, 10_000), ...flat(2, 10_000, 'shop', NOW)]
    expect(monthStory(input(txs)).findings).toEqual([])
  })
})

describe('monthStory — quy ước chung của repo', () => {
  it('thiếu tỷ giá → cờ hasMissingRate, khoản đó bị loại chứ không quy 1:1', () => {
    const txs = [
      ...history('shop', 1, 20_000),
      tx(80_000, 'shop', NOW),
      tx(1_000_000, 'shop', NOW, { account_id: 'vnd' }),
    ]
    const r = monthStory(input(txs, { rates: { JPY: 1 } }))
    expect(r.hasMissingRate).toBe(true)
    const f = r.findings[0]
    expect(f.kind === 'categorySpike' && f.amount).toBe(80_000)
  })

  it('bỏ dòng tiền nợ và khoản đã đánh dấu loại khỏi thống kê', () => {
    const txs = [
      ...history('shop', 1, 20_000),
      tx(80_000, 'shop', NOW, { is_debt_flow: true }),
      tx(80_000, 'shop', NOW, { exclude_from_stats: true }),
      tx(20_000, 'shop', NOW),
    ]
    expect(monthStory(input(txs)).findings).toEqual([])
  })

  it('bỏ danh mục chuyển tài sản — gửi tiền về VN không phải khoản chi lệch', () => {
    const txs = [...history('send', 1, 20_000), tx(80_000, 'send', NOW)]
    // Không lọc thì nó KÊU — nên phép lọc mới là thứ tạo ra khác biệt, không phải may rủi.
    expect(monthStory(input(txs)).findings).toHaveLength(1)
    expect(monthStory(input(txs, { transferIds: new Set(['send']) })).findings).toEqual([])
  })

  it('hoàn tiền là chi ÂM — trừ khỏi chính nhóm đó', () => {
    const txs = [
      ...history('shop', 1, 20_000),
      tx(80_000, 'shop', NOW),
      tx(60_000, 'shop', NOW, { is_refund: true }),
    ]
    expect(monthStory(input(txs)).findings).toEqual([])
  })

  it('chỉ xét khoản CHI — khoản thu không dựng nên mức thường', () => {
    const txs = [
      ...history('shop', 1, 20_000),
      tx(80_000, 'shop', NOW, { type: 'income' }),
      tx(20_000, 'shop', NOW),
    ]
    expect(monthStory(input(txs)).findings).toEqual([])
  })
})
