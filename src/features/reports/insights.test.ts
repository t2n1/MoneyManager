import { describe, expect, it } from 'vitest'
import { buildInsights, forecastMonthEnd, noSpendStreak, savingsRate } from './insights'
import type { TransactionRow } from '../../types/database.types'

const tx = (occurred_on: string, type: TransactionRow['type']): TransactionRow => ({
  id: occurred_on + type,
  user_id: 'u',
  type,
  amount: 100,
  to_amount: null,
  category_id: type === 'transfer' ? null : 'c',
  account_id: 'a',
  to_account_id: null,
  occurred_on,
  note: '',
  created_at: '',
  updated_at: '',
})

describe('savingsRate', () => {
  it('thu > chi → dương', () => expect(savingsRate(1000, 400)).toBeCloseTo(0.6))
  it('chi > thu → âm', () => expect(savingsRate(400, 1000)).toBeCloseTo(-1.5))
  it('income = 0 → null', () => expect(savingsRate(0, 100)).toBeNull())
  it('income âm → null', () => expect(savingsRate(-10, 100)).toBeNull())
})

describe('noSpendStreak', () => {
  it('hôm nay có chi → 0', () => {
    expect(noSpendStreak([tx('2026-07-17', 'expense')], '2026-07-17', 1)).toBe(0)
  })
  it('2 ngày cuối không chi (chi ngày 15) → 2', () => {
    expect(noSpendStreak([tx('2026-07-15', 'expense')], '2026-07-17', 1)).toBe(2)
  })
  it('chỉ có thu (không chi) → tính tới đầu tháng tài chính', () => {
    // month_start_day=1, today 2026-07-03 → ngày 1,2,3 không chi = 3
    expect(noSpendStreak([tx('2026-07-02', 'income')], '2026-07-03', 1)).toBe(3)
  })
  it('tôn trọng month_start_day (kỳ bắt đầu ngày 25)', () => {
    // month_start_day=25, today 2026-07-27 → kỳ bắt đầu 2026-07-25 → ngày 25,26,27 = 3
    expect(noSpendStreak([], '2026-07-27', 25)).toBe(3)
  })
})

describe('buildInsights', () => {
  const fmt = (m: number) => `¥${m}`
  it('có tháng trước → câu so sánh đúng dấu + câu tỷ trọng', () => {
    const out = buildInsights(
      {
        expenseThis: 1200,
        expensePrev: 1000,
        topCategoryName: 'Ăn uống',
        topCategoryAmount: 600,
        expenseTotal: 1200,
      },
      fmt,
    )
    expect(out.some((i) => i.text.includes('+20%'))).toBe(true)
    expect(out.some((i) => i.text.includes('Ăn uống') && i.text.includes('50%'))).toBe(true)
  })
  it('chi giảm → dấu trừ', () => {
    const out = buildInsights(
      { expenseThis: 800, expensePrev: 1000, topCategoryName: null, topCategoryAmount: 0, expenseTotal: 0 },
      fmt,
    )
    expect(out.some((i) => i.text.includes('-20%'))).toBe(true)
  })
  it('tháng trước = 0 → bỏ câu so sánh', () => {
    const out = buildInsights(
      {
        expenseThis: 1200,
        expensePrev: 0,
        topCategoryName: 'Ăn uống',
        topCategoryAmount: 600,
        expenseTotal: 1200,
      },
      fmt,
    )
    expect(out.some((i) => i.text.includes('so với tháng trước'))).toBe(false)
  })
  it('không chi → mảng rỗng', () => {
    const out = buildInsights(
      { expenseThis: 0, expensePrev: 0, topCategoryName: null, topCategoryAmount: 0, expenseTotal: 0 },
      fmt,
    )
    expect(out).toEqual([])
  })
})

describe('forecastMonthEnd', () => {
  it('nội suy giữa tháng: chi 10.000 sau 10/30 ngày → 30.000', () => {
    expect(forecastMonthEnd(10_000, 10, 30)?.projected).toBe(30_000)
  })
  it('daysElapsed = 0 → null', () => expect(forecastMonthEnd(5_000, 0, 30)).toBeNull())
  it('daysInMonth = 0 → null', () => expect(forecastMonthEnd(5_000, 5, 0)).toBeNull())
  it('hết tháng → projected ≈ spentSoFar', () => {
    expect(forecastMonthEnd(30_000, 30, 30)?.projected).toBe(30_000)
  })
})
