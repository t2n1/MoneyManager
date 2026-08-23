import { describe, expect, it } from 'vitest'
import type { TagBudgetLine } from '../../tags/budget'
import type { NotificationInput } from '../types'
import { tagRules } from './tagRules'

const line = (over: Partial<TagBudgetLine> & { tagId: string }): TagBudgetLine => ({
  name: `Nhãn ${over.tagId}`,
  color: 'green',
  period: 'total',
  spent: 0,
  budget: 100_000,
  ratio: 0,
  categoryCount: 0,
  remaining: 100_000,
  status: 'ok',
  ...over,
})

/** Dòng đã vượt trần: tự suy ratio/remaining/status cho khỏi khai lệch nhau. */
const overLine = (tagId: string, spent: number, budget: number, p: Partial<TagBudgetLine> = {}) =>
  line({
    tagId,
    spent,
    budget,
    ratio: spent / budget,
    remaining: budget - spent,
    status: spent >= budget ? 'over' : spent / budget >= 0.8 ? 'warn' : 'ok',
    ...p,
  })

function input(
  tagBudgets: TagBudgetLine[] | undefined,
  todayISO = '2026-08-10',
  monthStartDay = 1,
): NotificationInput {
  return {
    todayISO,
    monthStartDay,
    base: 'JPY',
    rates: {},
    formatMoney: (m) => String(m),
    currencyOf: () => 'JPY',
    accounts: [],
    categories: [],
    debts: [],
    recurringRules: [],
    savingsGoals: [],
    networthSnapshots: [],
    recentTxs: [],
    tagBudgets,
    offTypes: [],
  }
}

describe('tag-budget-over', () => {
  it('chưa tải xong (undefined) thì im, không đoán', () => {
    expect(tagRules(input(undefined))).toEqual([])
  })

  it('trong trần thì không báo', () => {
    expect(tagRules(input([overLine('a', 50_000, 100_000)]))).toEqual([])
  })

  it('sắp chạm trần (80%) vẫn chưa báo — chỗ đó đã có thanh tiến độ lo', () => {
    expect(tagRules(input([overLine('a', 85_000, 100_000)]))).toEqual([])
  })

  it('vượt trần → một việc cần làm, kèm số vượt', () => {
    const out = tagRules(input([overLine('a', 130_000, 100_000)]))
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('tag-budget-over')
    expect(out[0].kind).toBe('action')
    expect(out[0].title).toContain('30000')
  })

  it("kỳ 'total' KHÔNG có phần kỳ trong mã — vượt một lần là vượt mãi", () => {
    const out = tagRules(input([overLine('a', 130_000, 100_000, { period: 'total' })]))
    expect(out[0].key).toBe('tag-budget-over:a')
    expect(out[0].detail).toContain('Cả đợt')
  })

  it("kỳ 'monthly' có phần kỳ trong mã để tháng sau báo lại", () => {
    const l = overLine('a', 130_000, 100_000, { period: 'monthly' })
    expect(tagRules(input([l], '2026-08-10'))[0].key).toBe('tag-budget-over:a:2026-08')
    expect(tagRules(input([l], '2026-09-10'))[0].key).toBe('tag-budget-over:a:2026-09')
  })

  it('mã kỳ tôn trọng month_start_day, không phải tháng dương lịch', () => {
    const l = overLine('a', 130_000, 100_000, { period: 'monthly' })
    // month_start_day = 25 → ngày 10/8 vẫn thuộc kỳ bắt đầu 25/7, tức kỳ 2026-07
    expect(tagRules(input([l], '2026-08-10', 25))[0].key).toBe('tag-budget-over:a:2026-07')
    // Ngày 25/8 đã sang kỳ mới
    expect(tagRules(input([l], '2026-08-25', 25))[0].key).toBe('tag-budget-over:a:2026-08')
  })

  it('mã kỳ lùi đúng qua ranh giới năm', () => {
    const l = overLine('a', 130_000, 100_000, { period: 'monthly' })
    expect(tagRules(input([l], '2026-01-10', 25))[0].key).toBe('tag-budget-over:a:2025-12')
  })

  it('nhiều nhãn vượt thì mỗi nhãn một dòng', () => {
    const out = tagRules(
      input([overLine('a', 130_000, 100_000), overLine('b', 200_000, 100_000)]),
    )
    expect(out.map((n) => n.key)).toEqual(['tag-budget-over:a', 'tag-budget-over:b'])
  })

  it('mã ổn định qua hai lần gọi', () => {
    const arg = input([overLine('a', 130_000, 100_000)])
    expect(tagRules(arg).map((n) => n.key)).toEqual(tagRules(arg).map((n) => n.key))
  })
})
