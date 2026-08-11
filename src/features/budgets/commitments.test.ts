import { describe, expect, it } from 'vitest'
import type { PlannedExpenseRow, RecurringRuleRow } from '../../types/database.types'
import type { CurrencyCode } from '../../lib/money'
import { collectCommitments, coverageGaps } from './commitments'

/** Tháng 9/2026 theo quy ước nửa mở [start, end). */
const SEP = { start: '2026-09-01', end: '2026-10-01' }

function rule(p: Partial<RecurringRuleRow> & Pick<RecurringRuleRow, 'id'>): RecurringRuleRow {
  return {
    id: p.id,
    user_id: 'u',
    type: p.type ?? 'expense',
    amount: p.amount ?? 1000,
    to_amount: p.to_amount ?? null,
    category_id: p.category_id ?? null,
    account_id: p.account_id ?? 'acc-jpy',
    to_account_id: p.to_account_id ?? null,
    note: p.note ?? '',
    frequency: p.frequency ?? 'monthly',
    start_on: p.start_on ?? '2026-01-10',
    end_on: p.end_on ?? null,
    is_paused: p.is_paused ?? false,
    last_generated_on: p.last_generated_on ?? null,
    mode: p.mode ?? 'auto',
    remind_days_before: p.remind_days_before ?? 3,
  } as RecurringRuleRow
}

function plan(p: Partial<PlannedExpenseRow> & Pick<PlannedExpenseRow, 'id'>): PlannedExpenseRow {
  return {
    id: p.id,
    user_id: 'u',
    title: p.title ?? 'Khoản',
    amount: p.amount ?? 5000,
    currency: p.currency ?? 'JPY',
    due_on: p.due_on ?? '2026-09-15',
    due_precision: p.due_precision ?? 'day',
    remind_days_before: p.remind_days_before ?? null,
    category_id: p.category_id ?? null,
    account_id: p.account_id ?? null,
    status: p.status ?? 'planned',
    transaction_id: p.transaction_id ?? null,
    note: p.note ?? '',
    created_at: '',
    updated_at: '',
  } as PlannedExpenseRow
}

const currencyOf = (id: string): CurrencyCode =>
  id === 'acc-usd' ? 'USD' : id === 'acc-vnd' ? 'VND' : 'JPY'
/** USD × 150; loại tiền lạ = chưa có tỷ giá. */
const convert = (amount: number, c: CurrencyCode): number | null =>
  c === 'JPY' ? amount : c === 'USD' ? amount * 150 : null

const collect = (rules: RecurringRuleRow[], planned: PlannedExpenseRow[], range = SEP) =>
  collectCommitments(rules, planned, range, currencyOf, convert)

describe('collectCommitments — khoản định kỳ', () => {
  it('khoản tháng rơi đúng một kỳ vào tháng', () => {
    const r = collect([rule({ id: 'r1', amount: 85_000, note: 'Tiền nhà' })], [])
    expect(r.items).toHaveLength(1)
    expect(r.items[0]).toMatchObject({ title: 'Tiền nhà', amount: 85_000, times: 1, dueISO: '2026-09-10' })
    expect(r.total).toBe(85_000)
  })

  it('khoản tuần cộng đủ số kỳ rơi vào tháng', () => {
    // 2026-09-02 là thứ Tư; các kỳ: 2, 9, 16, 23, 30 → 5 kỳ.
    const r = collect([rule({ id: 'r1', amount: 2000, frequency: 'weekly', start_on: '2026-09-02' })], [])
    expect(r.items[0].times).toBe(5)
    expect(r.items[0].amount).toBe(10_000)
  })

  it('khoản năm không rơi vào tháng thì không có mặt', () => {
    const r = collect([rule({ id: 'r1', frequency: 'yearly', start_on: '2026-03-05' })], [])
    expect(r.items).toEqual([])
    expect(r.total).toBe(0)
  })

  it('rule tạm dừng không tính', () => {
    expect(collect([rule({ id: 'r1', is_paused: true })], []).items).toEqual([])
  })

  it('rule đã hết hạn (end_on trước tháng) không tính', () => {
    expect(collect([rule({ id: 'r1', end_on: '2026-06-30' })], []).items).toEqual([])
  })

  it('rule bắt đầu SAU tháng đang lập thì chưa phải lo', () => {
    expect(collect([rule({ id: 'r1', start_on: '2026-12-01' })], []).items).toEqual([])
  })

  it('kỳ đã sinh giao dịch rồi thì không còn là tiền sắp ra', () => {
    const r = collect([rule({ id: 'r1', last_generated_on: '2026-09-30' })], [])
    expect(r.items).toEqual([])
  })

  it('chuyển khoản và thu định kỳ KHÔNG phải cam kết chi', () => {
    const r = collect(
      [
        rule({ id: 'r1', type: 'transfer', amount: 50_000 }),
        rule({ id: 'r2', type: 'income', amount: 300_000 }),
        rule({ id: 'r3', type: 'expense', amount: 7000 }),
      ],
      [],
    )
    expect(r.items.map((i) => i.key)).toEqual(['rule:r3'])
    expect(r.total).toBe(7000)
  })

  it('khoản kiểu NHẮC vẫn là tiền sẽ ra — chỉ khác ai gõ', () => {
    const r = collect([rule({ id: 'r1', mode: 'remind', amount: 12_000 })], [])
    expect(r.total).toBe(12_000)
  })

  it('quy đổi ngoại tệ theo tiền của tài khoản nguồn', () => {
    const r = collect([rule({ id: 'r1', amount: 100, account_id: 'acc-usd' })], [])
    expect(r.items[0].amount).toBe(15_000)
  })

  it('rule không có ghi chú vẫn có tên đọc được', () => {
    expect(collect([rule({ id: 'r1', note: '   ' })], []).items[0].title).toBe('Khoản định kỳ')
  })
})

describe('collectCommitments — khoản sắp chi', () => {
  it('khoản đến hạn trong tháng được tính', () => {
    const r = collect([], [plan({ id: 'p1', title: 'Sửa xe', amount: 45_000 })])
    expect(r.items[0]).toMatchObject({ title: 'Sửa xe', amount: 45_000, kind: 'planned' })
  })

  it('khoản ngoài tháng không tính', () => {
    const r = collect([], [
      plan({ id: 'p1', due_on: '2026-08-31' }),
      plan({ id: 'p2', due_on: '2026-10-01' }),
    ])
    expect(r.items).toEqual([])
  })

  it('đã chi hoặc đã bỏ thì hết phải lo', () => {
    const r = collect([], [
      plan({ id: 'p1', status: 'done' }),
      plan({ id: 'p2', status: 'dropped' }),
    ])
    expect(r.items).toEqual([])
  })

  it('số tiền 0 nghĩa là CHƯA BIẾT, không phải miễn phí', () => {
    const r = collect([], [plan({ id: 'p1', title: 'Sửa nhà', amount: 0 })])
    expect(r.items[0].unknownAmount).toBe(true)
    // Không cộng bừa một con số vào tổng, nhưng vẫn phải hiện ra để người ta nhớ.
    expect(r.total).toBe(0)
    expect(r.items).toHaveLength(1)
  })

  it('khoản chưa biết giá xếp xuống cuối, không lẫn với khoản rẻ', () => {
    const r = collect([], [
      plan({ id: 'p1', title: 'Chưa biết', amount: 0 }),
      plan({ id: 'p2', title: 'Rẻ', amount: 500 }),
    ])
    expect(r.items.map((i) => i.title)).toEqual(['Rẻ', 'Chưa biết'])
  })
})

describe('collectCommitments — gộp chung', () => {
  it('xếp giảm dần theo tiền', () => {
    const r = collect(
      [rule({ id: 'r1', amount: 4500, note: 'Điện thoại' }), rule({ id: 'r2', amount: 85_000, note: 'Nhà' })],
      [plan({ id: 'p1', title: 'Sửa xe', amount: 45_000 })],
    )
    expect(r.items.map((i) => i.title)).toEqual(['Nhà', 'Sửa xe', 'Điện thoại'])
    expect(r.total).toBe(134_500)
  })

  it('gộp theo danh mục để đối chiếu với hạn mức', () => {
    const r = collect(
      [rule({ id: 'r1', amount: 20_000, category_id: 'transport' })],
      [plan({ id: 'p1', amount: 45_000, category_id: 'transport' })],
    )
    expect(r.byCategory.get('transport')).toBe(65_000)
  })

  it('khoản không gắn danh mục vẫn vào tổng nhưng không vào bản đồ danh mục', () => {
    const r = collect([rule({ id: 'r1', amount: 3000, category_id: null })], [])
    expect(r.total).toBe(3000)
    expect(r.byCategory.size).toBe(0)
  })

  it('thiếu tỷ giá thì bật cờ và KHÔNG cộng bừa vào tổng', () => {
    const r = collect(
      [rule({ id: 'r1', amount: 100, account_id: 'acc-vnd' })],
      [plan({ id: 'p1', amount: 900, currency: 'EUR' as CurrencyCode })],
    )
    expect(r.hasMissingRate).toBe(true)
    expect(r.total).toBe(0)
  })
})

describe('coverageGaps', () => {
  const budgeted = new Map([['transport', 20_000], ['rent', 90_000]])

  it('cam kết vượt hạn mức → báo thiếu đúng chừng đó', () => {
    const gaps = coverageGaps(new Map([['transport', 65_000]]), budgeted)
    expect(gaps).toEqual([
      { categoryId: 'transport', committed: 65_000, budgeted: 20_000, short: 45_000 },
    ])
  })

  it('hạn mức phủ đủ thì không báo gì', () => {
    expect(coverageGaps(new Map([['rent', 85_000]]), budgeted)).toEqual([])
  })

  it('cam kết bằng ĐÚNG hạn mức là đủ, không phải thiếu', () => {
    expect(coverageGaps(new Map([['rent', 90_000]]), budgeted)).toEqual([])
  })

  it('chưa đặt hạn mức = thiếu toàn bộ', () => {
    const gaps = coverageGaps(new Map([['fun', 12_000]]), budgeted)
    expect(gaps[0]).toMatchObject({ budgeted: 0, short: 12_000 })
  })

  it('thiếu nhiều nhất lên đầu', () => {
    const gaps = coverageGaps(
      new Map([['transport', 30_000], ['fun', 12_000], ['rent', 200_000]]),
      budgeted,
    )
    expect(gaps.map((g) => g.categoryId)).toEqual(['rent', 'fun', 'transport'])
  })
})

describe('coverageGaps — trần đặt ở nhóm cha', () => {
  // "Đi lại" là nhóm có trần chung; "Sửa xe" và "Taxi" là con của nó. "Ăn ngoài" đứng
  // riêng, không thuộc nhóm nào.
  const parentOf = (id: string) =>
    id === 'suaxe' || id === 'taxi' ? 'dilai' : null

  it('cam kết ở con tính vào trần cha, không réo con', () => {
    const gaps = coverageGaps(
      new Map([['suaxe', 45_000]]),
      new Map([['dilai', 50_000]]),
      parentOf,
    )
    expect(gaps).toEqual([])
  })

  it('vượt trần nhóm thì báo Ở NHÓM, kèm đúng số của cả nhóm', () => {
    const gaps = coverageGaps(
      new Map([['suaxe', 45_000]]),
      new Map([['dilai', 20_000]]),
      parentOf,
    )
    expect(gaps).toEqual([
      { categoryId: 'dilai', committed: 45_000, budgeted: 20_000, short: 25_000 },
    ])
  })

  it('nhiều con cộng lại mới vượt — so lẻ từng đứa thì cả hai đều lọt', () => {
    const gaps = coverageGaps(
      new Map([['suaxe', 30_000], ['taxi', 30_000]]),
      new Map([['dilai', 50_000]]),
      parentOf,
    )
    expect(gaps).toEqual([
      { categoryId: 'dilai', committed: 60_000, budgeted: 50_000, short: 10_000 },
    ])
  })

  it('cam kết ghi thẳng vào nhóm cộng chung với cam kết của con', () => {
    const gaps = coverageGaps(
      new Map([['dilai', 20_000], ['taxi', 45_000]]),
      new Map([['dilai', 50_000]]),
      parentOf,
    )
    expect(gaps[0]).toMatchObject({ categoryId: 'dilai', committed: 65_000, short: 15_000 })
  })

  it('cha CHƯA có trần thì không leo — con tự chịu trách nhiệm', () => {
    const gaps = coverageGaps(
      new Map([['suaxe', 45_000]]),
      new Map([['suaxe', 10_000]]),
      parentOf,
    )
    expect(gaps).toEqual([
      { categoryId: 'suaxe', committed: 45_000, budgeted: 10_000, short: 35_000 },
    ])
  })

  it('mốc con KHÔNG phải ràng buộc: vỡ mốc mà trần nhóm còn phủ đủ thì im', () => {
    // Trần nhóm 50.000, mốc con Taxi 10.000, cam kết ở Taxi 30.000. Mốc vỡ nhưng kế
    // hoạch chưa hỏng — đó là chuyện của mặt theo dõi khi tiền ra thật.
    const gaps = coverageGaps(
      new Map([['taxi', 30_000]]),
      new Map([['dilai', 50_000], ['taxi', 10_000]]),
      parentOf,
    )
    expect(gaps).toEqual([])
  })

  it('danh mục ngoài nhóm vẫn so ở chính nó', () => {
    const gaps = coverageGaps(
      new Map([['anngoai', 12_000], ['suaxe', 5_000]]),
      new Map([['dilai', 50_000]]),
      parentOf,
    )
    expect(gaps.map((g) => g.categoryId)).toEqual(['anngoai'])
  })

  it('không truyền parentOf thì giữ nguyên cách cũ (phẳng)', () => {
    const gaps = coverageGaps(new Map([['suaxe', 45_000]]), new Map([['dilai', 50_000]]))
    expect(gaps[0]).toMatchObject({ categoryId: 'suaxe', budgeted: 0, short: 45_000 })
  })
})
