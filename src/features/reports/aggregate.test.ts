import { describe, expect, it } from 'vitest'
import type { CurrencyCode } from '../../lib/money'
import type { MonthKey } from '../../lib/dates'
import type { Rates } from '../../lib/rates'
import type { CategoryRow, TransactionRow } from '../../types/database.types'
import {
  categoryBreakdown,
  categoryComparison,
  categoryMonthlySeries,
  classificationBreakdown,
  cumulativeDailyBalance,
  dailyExpenseTotals,
  foldUncategorized,
  groupByParent,
  monthlySeries,
  sumIncomeExpense,
} from './aggregate'

// base = JPY: 1 ¥ = 165 ₫ = 0.0065 $
const RATES: Rates = { JPY: 1, VND: 165, USD: 0.0065 }

// account 'jpy' dùng JPY, 'vnd' dùng VND
const currencyOf = (id: string): CurrencyCode => (id === 'vnd' ? 'VND' : 'JPY')

let seq = 0
function tx(p: Partial<TransactionRow> & Pick<TransactionRow, 'type' | 'amount'>): TransactionRow {
  return {
    id: `t${seq++}`,
    user_id: 'u',
    category_id: null,
    account_id: 'jpy',
    to_account_id: null,
    to_amount: null,
    recurring_rule_id: null,
    occurred_on: '2026-07-10',
    note: '',
    created_at: '',
    updated_at: '',
    ...p,
  }
}

function cat(p: Partial<CategoryRow> & Pick<CategoryRow, 'id'>): CategoryRow {
  return {
    id: p.id,
    user_id: 'u',
    name: p.name ?? p.id,
    type: p.type ?? 'expense',
    icon: p.icon ?? '📦',
    parent_id: p.parent_id ?? null,
    sort_order: p.sort_order ?? 0,
    is_archived: p.is_archived ?? false,
    created_at: '',
    need_level: p.need_level ?? null,
    cost_type: p.cost_type ?? null,
  }
}

describe('is_debt_flow bị loại khỏi mọi báo cáo', () => {
  it('categoryBreakdown bỏ qua giao dịch dòng tiền nợ/cho vay', () => {
    const txs = [
      tx({ type: 'expense', amount: 1_500, category_id: 'food' }),
      tx({ type: 'expense', amount: 1_500, category_id: 'food', is_debt_flow: true }), // trả hộ → bỏ
    ]
    const r = categoryBreakdown(txs, 'expense', currencyOf, 'JPY', RATES)
    expect(r.slices).toEqual([{ categoryId: 'food', amount: 1_500 }])
    expect(r.total).toBe(1_500)
  })

  it('exclude_from_stats bị loại khỏi báo cáo (mục AM)', () => {
    const txs = [
      tx({ type: 'expense', amount: 2_000, category_id: 'food' }),
      tx({ type: 'expense', amount: 9_999, category_id: 'food', exclude_from_stats: true }), // hoàn tiền → bỏ
    ]
    const r = categoryBreakdown(txs, 'expense', currencyOf, 'JPY', RATES)
    expect(r.total).toBe(2_000)
    const s = sumIncomeExpense(txs, currencyOf, 'JPY', RATES)
    expect(s.expense).toBe(2_000)
  })

  it('sumIncomeExpense bỏ qua cả chiều thu (thu nợ) lẫn chi (cho vay)', () => {
    const txs = [
      tx({ type: 'expense', amount: 1_500 }),
      tx({ type: 'expense', amount: 1_500, is_debt_flow: true }), // cho vay → bỏ
      tx({ type: 'income', amount: 1_500, is_debt_flow: true }), // thu nợ → bỏ
    ]
    const r = sumIncomeExpense(txs, currencyOf, 'JPY', RATES)
    expect(r).toEqual({ income: 0, expense: 1_500, hasForeign: false, hasMissingRate: false })
  })

  it('monthlySeries & cumulativeDailyBalance bỏ qua dòng tiền nợ/cho vay', () => {
    const months = [{ year: 2026, month: 7 }]
    const txs = [
      tx({ type: 'expense', amount: 1_500, occurred_on: '2026-07-10' }),
      tx({ type: 'expense', amount: 1_500, occurred_on: '2026-07-10', is_debt_flow: true }), // bỏ
    ]
    const ms = monthlySeries(txs, months, 1, currencyOf, 'JPY', RATES)
    expect(ms.points[0]).toEqual({ key: { year: 2026, month: 7 }, income: 0, expense: 1_500 })
    const cf = cumulativeDailyBalance(txs, '2026-07-10', '2026-07-10', currencyOf, 'JPY', RATES)
    expect(cf.points).toEqual([{ date: '2026-07-10', balance: -1_500 }])
  })

  it('categoryComparison bỏ qua dòng tiền nợ/cho vay', () => {
    const active = { year: 2026, month: 7 }
    const txs = [
      tx({ type: 'expense', amount: 1_500, category_id: 'food', occurred_on: '2026-07-05' }),
      tx({ type: 'expense', amount: 1_500, category_id: 'food', occurred_on: '2026-07-05', is_debt_flow: true }),
    ]
    const r = categoryComparison(txs, active, 1, currencyOf, 'JPY', RATES)
    expect(r.rows[0]).toMatchObject({ categoryId: 'food', thisMonth: 1_500 })
  })
})

describe('categoryBreakdown (base = JPY)', () => {
  it('gộp theo danh mục, quy đổi base, sắp xếp giảm dần', () => {
    const txs = [
      tx({ type: 'expense', amount: 850, category_id: 'food' }),
      tx({ type: 'expense', amount: 3_280, category_id: 'food' }),
      tx({ type: 'expense', amount: 1_650_000, category_id: 'shop', account_id: 'vnd' }), // → ¥10.000
      tx({ type: 'income', amount: 280_000, category_id: 'salary', account_id: 'jpy' }), // bỏ qua
      tx({ type: 'transfer', amount: 5_000, to_account_id: 'vnd' }), // bỏ qua
    ]
    const r = categoryBreakdown(txs, 'expense', currencyOf, 'JPY', RATES)
    expect(r.slices).toEqual([
      { categoryId: 'shop', amount: 10_000 },
      { categoryId: 'food', amount: 4_130 },
    ])
    expect(r.total).toBe(14_130)
    expect(r.hasForeign).toBe(true)
    expect(r.hasMissingRate).toBe(false)
  })

  it('thiếu tỷ giá → đánh dấu hasMissingRate, bỏ giao dịch đó', () => {
    const txs = [
      tx({ type: 'expense', amount: 850, category_id: 'food' }),
      tx({ type: 'expense', amount: 1_650_000, category_id: 'shop', account_id: 'vnd' }),
    ]
    const r = categoryBreakdown(txs, 'expense', currencyOf, 'JPY', { JPY: 1 })
    expect(r.slices).toEqual([{ categoryId: 'food', amount: 850 }])
    expect(r.total).toBe(850)
    expect(r.hasMissingRate).toBe(true)
  })
})

describe('monthlySeries (base = JPY)', () => {
  it('gom thu/chi theo từng tháng, chuyển khoản không tính', () => {
    const months = [
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ]
    const txs = [
      tx({ type: 'income', amount: 280_000, occurred_on: '2026-06-25' }),
      tx({ type: 'expense', amount: 6_700, occurred_on: '2026-06-28' }),
      tx({ type: 'expense', amount: 850, occurred_on: '2026-07-10' }),
      tx({ type: 'expense', amount: 1_650_000, occurred_on: '2026-07-11', account_id: 'vnd' }), // ¥10.000
      tx({ type: 'transfer', amount: 30_000, occurred_on: '2026-07-05', to_account_id: 'vnd' }), // bỏ qua
    ]
    const r = monthlySeries(txs, months, 1, currencyOf, 'JPY', RATES)
    expect(r.points).toEqual([
      { key: { year: 2026, month: 6 }, income: 280_000, expense: 6_700 },
      { key: { year: 2026, month: 7 }, income: 0, expense: 10_850 },
    ])
    expect(r.hasMissingRate).toBe(false)
  })

  it('month_start_day dời ngày sang tháng trước', () => {
    const months = [
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
    ]
    // month_start_day = 25 → ngày 2026-07-10 (< 25) thuộc "tháng 6"
    const txs = [tx({ type: 'expense', amount: 500, occurred_on: '2026-07-10' })]
    const r = monthlySeries(txs, months, 25, currencyOf, 'JPY', RATES)
    expect(r.points).toEqual([
      { key: { year: 2026, month: 6 }, income: 0, expense: 500 },
      { key: { year: 2026, month: 7 }, income: 0, expense: 0 },
    ])
  })
})

describe('sumIncomeExpense (base = JPY)', () => {
  it('cộng thu/chi quy đổi base, bỏ qua chuyển khoản', () => {
    const txs = [
      tx({ type: 'income', amount: 280_000 }),
      tx({ type: 'expense', amount: 850 }),
      tx({ type: 'expense', amount: 1_650_000, account_id: 'vnd' }), // → ¥10.000
      tx({ type: 'transfer', amount: 30_000, to_account_id: 'vnd' }), // bỏ qua
    ]
    const r = sumIncomeExpense(txs, currencyOf, 'JPY', RATES)
    expect(r.income).toBe(280_000)
    expect(r.expense).toBe(10_850)
    expect(r.hasForeign).toBe(true)
    expect(r.hasMissingRate).toBe(false)
  })

  it('thiếu tỷ giá → bỏ giao dịch đó, đánh dấu hasMissingRate', () => {
    const txs = [
      tx({ type: 'expense', amount: 850 }),
      tx({ type: 'expense', amount: 1_650_000, account_id: 'vnd' }),
    ]
    const r = sumIncomeExpense(txs, currencyOf, 'JPY', { JPY: 1 })
    expect(r.expense).toBe(850)
    expect(r.income).toBe(0)
    expect(r.hasMissingRate).toBe(true)
  })

  it('cùng tiền gốc thì không đánh dấu ngoại tệ', () => {
    const txs = [tx({ type: 'income', amount: 100 }), tx({ type: 'expense', amount: 40 })]
    const r = sumIncomeExpense(txs, currencyOf, 'JPY', RATES)
    expect(r).toEqual({ income: 100, expense: 40, hasForeign: false, hasMissingRate: false })
  })
})

describe('categoryComparison (base = JPY)', () => {
  const active = { year: 2026, month: 7 }
  it('gom theo tháng/danh mục, avg3 chia 3 kể cả tháng thiếu, delta đúng dấu', () => {
    const txs = [
      tx({ type: 'expense', amount: 1200, category_id: 'food', occurred_on: '2026-07-05' }),
      tx({ type: 'expense', amount: 1000, category_id: 'food', occurred_on: '2026-06-05' }),
      tx({ type: 'expense', amount: 800, category_id: 'food', occurred_on: '2026-05-05' }),
      tx({ type: 'income', amount: 999, category_id: 'x', occurred_on: '2026-07-05' }), // bỏ (income)
    ]
    const r = categoryComparison(txs, active, 1, currencyOf, 'JPY', RATES)
    // avg3 = (T6 1000 + T5 800 + T4 0) / 3 = 600 ; delta = (1200-1000)/1000 = 20%
    expect(r.rows).toEqual([
      { categoryId: 'food', thisMonth: 1200, prevMonth: 1000, avg3: 600, deltaPct: 20, isNew: false },
    ])
    expect(r.hasMissingRate).toBe(false)
  })
  it('danh mục mới (tháng trước = 0) → isNew, deltaPct null', () => {
    const txs = [tx({ type: 'expense', amount: 500, category_id: 'new', occurred_on: '2026-07-05' })]
    const r = categoryComparison(txs, active, 1, currencyOf, 'JPY', RATES)
    expect(r.rows[0]).toMatchObject({ categoryId: 'new', prevMonth: 0, deltaPct: null, isNew: true })
  })
  it('sắp theo thisMonth giảm dần', () => {
    const txs = [
      tx({ type: 'expense', amount: 300, category_id: 'a', occurred_on: '2026-07-05' }),
      tx({ type: 'expense', amount: 900, category_id: 'b', occurred_on: '2026-07-05' }),
    ]
    const r = categoryComparison(txs, active, 1, currencyOf, 'JPY', RATES)
    expect(r.rows.map((x) => x.categoryId)).toEqual(['b', 'a'])
  })
  it('thiếu tỷ giá → cờ hasMissingRate', () => {
    const txs = [tx({ type: 'expense', amount: 1_650_000, category_id: 'x', occurred_on: '2026-07-05', account_id: 'vnd' })]
    const r = categoryComparison(txs, active, 1, currencyOf, 'JPY', { JPY: 1 })
    expect(r.hasMissingRate).toBe(true)
  })
})

describe('cumulativeDailyBalance (base = JPY)', () => {
  it('cộng dồn theo ngày, ngày trống giữ số dư, bỏ chuyển khoản', () => {
    const txs = [
      tx({ type: 'income', amount: 1000, occurred_on: '2026-07-01' }),
      tx({ type: 'expense', amount: 300, occurred_on: '2026-07-02' }),
      tx({ type: 'transfer', amount: 500, occurred_on: '2026-07-02', to_account_id: 'vnd' }), // bỏ
      tx({ type: 'expense', amount: 200, occurred_on: '2026-07-04' }),
    ]
    const r = cumulativeDailyBalance(txs, '2026-07-01', '2026-07-04', currencyOf, 'JPY', RATES)
    expect(r.points).toEqual([
      { date: '2026-07-01', balance: 1000 },
      { date: '2026-07-02', balance: 700 },
      { date: '2026-07-03', balance: 700 },
      { date: '2026-07-04', balance: 500 },
    ])
    expect(r.hasMissingRate).toBe(false)
  })
  it('thiếu tỷ giá → cờ hasMissingRate, khoản đó không tính', () => {
    const txs = [
      tx({ type: 'expense', amount: 1_650_000, occurred_on: '2026-07-01', account_id: 'vnd' }),
    ]
    const r = cumulativeDailyBalance(txs, '2026-07-01', '2026-07-01', currencyOf, 'JPY', { JPY: 1 })
    expect(r.hasMissingRate).toBe(true)
    expect(r.points).toEqual([{ date: '2026-07-01', balance: 0 }])
  })
})

describe('dailyExpenseTotals (base = JPY)', () => {
  it('cộng chi theo ngày, ngày trống = 0, bỏ thu/chuyển khoản/nợ', () => {
    const txs = [
      tx({ type: 'expense', amount: 300, occurred_on: '2026-07-01' }),
      tx({ type: 'expense', amount: 200, occurred_on: '2026-07-01' }),
      tx({ type: 'income', amount: 9999, occurred_on: '2026-07-02' }), // bỏ (thu)
      tx({ type: 'transfer', amount: 500, occurred_on: '2026-07-02', to_account_id: 'vnd' }), // bỏ
      tx({ type: 'expense', amount: 400, occurred_on: '2026-07-03', is_debt_flow: true }), // bỏ (nợ)
      tx({ type: 'expense', amount: 1_650_000, occurred_on: '2026-07-03', account_id: 'vnd' }), // ¥10.000
    ]
    const r = dailyExpenseTotals(txs, '2026-07-01', '2026-07-03', currencyOf, 'JPY', RATES)
    expect(r.points).toEqual([
      { date: '2026-07-01', expense: 500 },
      { date: '2026-07-02', expense: 0 },
      { date: '2026-07-03', expense: 10_000 },
    ])
    expect(r.hasMissingRate).toBe(false)
  })

  it('thiếu tỷ giá → cờ hasMissingRate, ngày đó = 0', () => {
    const txs = [tx({ type: 'expense', amount: 1_650_000, occurred_on: '2026-07-01', account_id: 'vnd' })]
    const r = dailyExpenseTotals(txs, '2026-07-01', '2026-07-01', currencyOf, 'JPY', { JPY: 1 })
    expect(r.hasMissingRate).toBe(true)
    expect(r.points).toEqual([{ date: '2026-07-01', expense: 0 }])
  })
})

describe('groupByParent', () => {
  const cats = [
    cat({ id: 'food' }),
    cat({ id: 'coffee', parent_id: 'food' }),
    cat({ id: 'lunch', parent_id: 'food' }),
    cat({ id: 'transport' }),
  ]

  it('gộp con vào cha; total = trực tiếp + tổng con', () => {
    const slices = [
      { categoryId: 'food', amount: 100 },
      { categoryId: 'coffee', amount: 300 },
      { categoryId: 'lunch', amount: 200 },
      { categoryId: 'transport', amount: 50 },
    ]
    expect(groupByParent(slices, cats)).toEqual([
      {
        parentId: 'food',
        total: 600,
        direct: 100,
        children: [
          { categoryId: 'coffee', amount: 300 },
          { categoryId: 'lunch', amount: 200 },
        ],
      },
      { parentId: 'transport', total: 50, direct: 50, children: [] },
    ])
  })

  it('cha chỉ có con → direct = 0', () => {
    expect(groupByParent([{ categoryId: 'coffee', amount: 300 }], cats)).toEqual([
      { parentId: 'food', total: 300, direct: 0, children: [{ categoryId: 'coffee', amount: 300 }] },
    ])
  })

  it('danh mục mồ côi thành cha riêng', () => {
    expect(groupByParent([{ categoryId: 'ghost', amount: 40 }], cats)).toEqual([
      { parentId: 'ghost', total: 40, direct: 40, children: [] },
    ])
  })

  it('xếp cha theo total, con theo amount (giảm dần)', () => {
    const slices = [
      { categoryId: 'lunch', amount: 200 },
      { categoryId: 'coffee', amount: 300 },
      { categoryId: 'transport', amount: 1000 },
    ]
    const g = groupByParent(slices, cats)
    expect(g.map((x) => x.parentId)).toEqual(['transport', 'food'])
    expect(g[1].children.map((c) => c.categoryId)).toEqual(['coffee', 'lunch'])
  })
})

describe('categoryMonthlySeries', () => {
  const months: MonthKey[] = [
    { year: 2026, month: 6 },
    { year: 2026, month: 7 },
  ]

  it('gom theo tháng, tháng trống = 0, lọc theo ids & kind', () => {
    const txs = [
      tx({ type: 'expense', amount: 100, category_id: 'coffee', occurred_on: '2026-07-05' }),
      tx({ type: 'expense', amount: 50, category_id: 'coffee', occurred_on: '2026-06-20' }),
      tx({ type: 'expense', amount: 999, category_id: 'other', occurred_on: '2026-07-05' }), // ngoài ids
      tx({ type: 'income', amount: 999, category_id: 'coffee', occurred_on: '2026-07-05' }), // sai kind
    ]
    const r = categoryMonthlySeries(txs, months, 'expense', new Set(['coffee']), 1, currencyOf, 'JPY', RATES)
    expect(r.points).toEqual([
      { key: { year: 2026, month: 6 }, amount: 50 },
      { key: { year: 2026, month: 7 }, amount: 100 },
    ])
    expect(r.hasMissingRate).toBe(false)
  })

  it('bỏ is_debt_flow và exclude_from_stats', () => {
    const txs = [
      tx({ type: 'expense', amount: 100, category_id: 'coffee', occurred_on: '2026-07-05' }),
      tx({ type: 'expense', amount: 100, category_id: 'coffee', occurred_on: '2026-07-05', is_debt_flow: true }),
      tx({ type: 'expense', amount: 100, category_id: 'coffee', occurred_on: '2026-07-05', exclude_from_stats: true }),
    ]
    const r = categoryMonthlySeries(txs, months, 'expense', new Set(['coffee']), 1, currencyOf, 'JPY', RATES)
    expect(r.points[1].amount).toBe(100)
  })

  it('hasMissingRate khi thiếu tỷ giá', () => {
    const currencyOfUsd = (id: string): CurrencyCode => (id === 'usd' ? 'USD' : 'JPY')
    const noUsd: Rates = { JPY: 1, VND: 165 } // thiếu USD
    const txs = [tx({ type: 'expense', amount: 100, category_id: 'coffee', account_id: 'usd', occurred_on: '2026-07-05' })]
    const r = categoryMonthlySeries(txs, months, 'expense', new Set(['coffee']), 1, currencyOfUsd, 'JPY', noUsd)
    expect(r.hasMissingRate).toBe(true)
    expect(r.points[1].amount).toBe(0)
  })
})

describe('classificationBreakdown', () => {
  const cats = [
    cat({ id: 'rent', need_level: 'essential', cost_type: 'fixed' }),
    cat({ id: 'food', need_level: 'essential', cost_type: 'variable' }),
    cat({ id: 'fun', need_level: 'flexible', cost_type: 'variable' }),
    cat({ id: 'sub', need_level: 'flexible', cost_type: 'fixed' }),
    cat({ id: 'other' }),
  ]

  it('gom theo cả hai trục và tính emergencyCut = flexible & variable', () => {
    const r = classificationBreakdown(
      [
        { categoryId: 'rent', amount: 1000 },
        { categoryId: 'food', amount: 400 },
        { categoryId: 'fun', amount: 300 },
        { categoryId: 'sub', amount: 100 },
      ],
      cats,
    )
    expect(r.needEssential).toBe(1400)
    expect(r.needFlexible).toBe(400)
    expect(r.needUnclassified).toBe(0)
    expect(r.costFixed).toBe(1100)
    expect(r.costVariable).toBe(700)
    expect(r.emergencyCut).toBe(300) // chỉ 'fun'
    expect(r.totalExpense).toBe(1800)
  })

  it('slice có danh mục thiếu nhãn hoặc không tra được → vào Unclassified', () => {
    const r = classificationBreakdown(
      [
        { categoryId: 'other', amount: 500 },
        { categoryId: 'ghost', amount: 200 }, // không có trong cats
      ],
      cats,
    )
    expect(r.needUnclassified).toBe(700)
    expect(r.costUnclassified).toBe(700)
    expect(r.emergencyCut).toBe(0)
    expect(r.totalExpense).toBe(700)
  })
})

describe('foldUncategorized', () => {
  const data = {
    needEssential: 1000,
    needFlexible: 400,
    needUnclassified: 100,
    costFixed: 900,
    costVariable: 500,
    costUnclassified: 100,
    emergencyCut: 200,
    totalExpense: 1500,
  }

  it('realExpense = data.totalExpense → không có gì để gộp, giữ nguyên output', () => {
    const r = foldUncategorized(data, 1500)
    expect(r).toEqual(data)
  })

  it('realExpense > data.totalExpense → phần chênh cộng vào cả hai bucket Unclassified', () => {
    const r = foldUncategorized(data, 1800) // chênh 300 (vd chi không có category_id)
    expect(r.needUnclassified).toBe(400) // 100 + 300
    expect(r.costUnclassified).toBe(400) // 100 + 300
    // các nhóm đã phân loại không đổi
    expect(r.needEssential).toBe(1000)
    expect(r.needFlexible).toBe(400)
    expect(r.costFixed).toBe(900)
    expect(r.costVariable).toBe(500)
    expect(r.emergencyCut).toBe(200)
  })

  it('realExpense < data.totalExpense → không tạo bucket âm (clamp về data.totalExpense)', () => {
    const r = foldUncategorized(data, 1000) // nhỏ hơn totalExpense 1500
    expect(r.needUnclassified).toBe(100) // không trừ, giữ nguyên
    expect(r.costUnclassified).toBe(100)
    expect(r).toEqual(data)
  })

  it('bất biến: tổng 2 trục luôn khớp max(realExpense, data.totalExpense)', () => {
    for (const real of [1500, 1800, 1000, 0]) {
      const r = foldUncategorized(data, real)
      const expected = Math.max(real, data.totalExpense)
      expect(r.needEssential + r.needFlexible + r.needUnclassified).toBe(expected)
      expect(r.costFixed + r.costVariable + r.costUnclassified).toBe(expected)
    }
  })
})
