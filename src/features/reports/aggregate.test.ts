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
  monthDaysElapsed,
  monthExpenseCompare,
  monthlySeries,
  netFlowSeries,
  netFlowSummary,
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
    kind: p.kind ?? 'expense',
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
    expect(r).toEqual({
      income: 0,
      expense: 1_500,
      transfer: 0,
      hasForeign: false,
      hasMissingRate: false,
    })
  })

  it('monthlySeries & cumulativeDailyBalance bỏ qua dòng tiền nợ/cho vay', () => {
    const months = [{ year: 2026, month: 7 }]
    const txs = [
      tx({ type: 'expense', amount: 1_500, occurred_on: '2026-07-10' }),
      tx({ type: 'expense', amount: 1_500, occurred_on: '2026-07-10', is_debt_flow: true }), // bỏ
    ]
    const ms = monthlySeries(txs, months, 1, currencyOf, 'JPY', RATES)
    expect(ms.points[0]).toEqual({
      key: { year: 2026, month: 7 },
      income: 0,
      expense: 1_500,
      transfer: 0,
    })
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
      { key: { year: 2026, month: 6 }, income: 280_000, expense: 6_700, transfer: 0 },
      { key: { year: 2026, month: 7 }, income: 0, expense: 10_850, transfer: 0 },
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
      { key: { year: 2026, month: 6 }, income: 0, expense: 500, transfer: 0 },
      { key: { year: 2026, month: 7 }, income: 0, expense: 0, transfer: 0 },
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
    expect(r).toEqual({
      income: 100,
      expense: 40,
      transfer: 0,
      hasForeign: false,
      hasMissingRate: false,
    })
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

describe('categories.kind = transfer — chuyển tài sản KHÔNG phải chi', () => {
  const GUI_VN = new Set(['gui-vn'])
  const active = { year: 2026, month: 8 }

  /** Thu ¥409,251 · chi thật ¥222,236 · gửi về VN ¥30,000 (số tháng 8/2026 thật). */
  const thang8 = [
    tx({ type: 'income', amount: 409_251, occurred_on: '2026-08-05' }),
    tx({ type: 'expense', amount: 222_236, category_id: 'nha', occurred_on: '2026-08-10' }),
    tx({ type: 'expense', amount: 30_000, category_id: 'gui-vn', occurred_on: '2026-08-15' }),
  ]

  it('sumIncomeExpense tách sang `transfer`, không cộng vào `expense`', () => {
    const r = sumIncomeExpense(thang8, currencyOf, 'JPY', RATES, GUI_VN)
    expect(r.expense).toBe(222_236)
    expect(r.transfer).toBe(30_000)
  })

  it('tỷ lệ giữ lại đọc ra 46%, không phải 38%', () => {
    const withFlag = sumIncomeExpense(thang8, currencyOf, 'JPY', RATES, GUI_VN)
    const without = sumIncomeExpense(thang8, currencyOf, 'JPY', RATES)
    const rate = (x: { income: number; expense: number }) =>
      Math.round(((x.income - x.expense) / x.income) * 100)
    expect(rate(withFlag)).toBe(46)
    expect(rate(without)).toBe(38) // con số sai của bản trước, giữ lại để thấy khác biệt
  })

  it('ba tầng cộng lại đúng bằng thu — không có đồng nào bị ẩn', () => {
    const r = sumIncomeExpense(thang8, currencyOf, 'JPY', RATES, GUI_VN)
    const conLai = r.income - r.expense - r.transfer
    expect(r.expense + r.transfer + conLai).toBe(r.income)
    expect(conLai).toBe(157_015)
  })

  it('categoryBreakdown bỏ lát chuyển tài sản → mẫu số % không bị phồng', () => {
    const r = categoryBreakdown(thang8, 'expense', currencyOf, 'JPY', RATES, GUI_VN)
    expect(r.slices.map((x) => x.categoryId)).toEqual(['nha'])
    expect(r.total).toBe(222_236)
    // Tiền nhà chiếm 100% của chi THẬT; nếu để gửi về VN trong mẫu số thì còn 88%.
    expect(Math.round((r.slices[0].amount / r.total) * 100)).toBe(100)
  })

  it('monthlySeries có tầng transfer riêng cho từng tháng', () => {
    const r = monthlySeries(thang8, [active], 1, currencyOf, 'JPY', RATES, GUI_VN)
    expect(r.points[0]).toEqual({
      key: active,
      income: 409_251,
      expense: 222_236,
      transfer: 30_000,
    })
  })

  it('dailyExpenseTotals bỏ chuyển tài sản (nhịp chi & dự báo không bị đội lên)', () => {
    const r = dailyExpenseTotals(
      thang8,
      '2026-08-10',
      '2026-08-15',
      currencyOf,
      'JPY',
      RATES,
      GUI_VN,
    )
    expect(r.points.reduce((a, b) => a + b.expense, 0)).toBe(222_236)
  })

  it('categoryComparison không in dòng chuyển tài sản', () => {
    const r = categoryComparison(thang8, active, 1, currencyOf, 'JPY', RATES, null, GUI_VN)
    expect(r.rows.map((x) => x.categoryId)).toEqual(['nha'])
  })

  it('monthExpenseCompare so chi THẬT với chi THẬT', () => {
    const txs = [
      ...thang8,
      tx({ type: 'expense', amount: 200_000, category_id: 'nha', occurred_on: '2026-07-10' }),
      tx({ type: 'expense', amount: 30_000, category_id: 'gui-vn', occurred_on: '2026-07-15' }),
    ]
    const r = monthExpenseCompare(txs, active, 1, '2026-08-31', currencyOf, 'JPY', RATES, GUI_VN)
    expect(r?.spent).toBe(222_236)
    expect(r?.priorSameDays).toBe(200_000)
  })

  it('THU không bị cờ này chạm tới — `kind` chỉ đặt trên danh mục Chi', () => {
    const t = [tx({ type: 'income', amount: 500, category_id: 'gui-vn', occurred_on: '2026-08-01' })]
    const r = categoryBreakdown(t, 'income', currencyOf, 'JPY', RATES, GUI_VN)
    expect(r.total).toBe(500)
  })

  it('hoàn tiền của một danh mục chuyển tài sản trừ vào `transfer`, không vào `expense`', () => {
    const t = [
      tx({ type: 'expense', amount: 30_000, category_id: 'gui-vn', occurred_on: '2026-08-01' }),
      tx({
        type: 'expense',
        amount: 5_000,
        category_id: 'gui-vn',
        occurred_on: '2026-08-02',
        is_refund: true,
      }),
      tx({ type: 'expense', amount: 1_000, category_id: 'nha', occurred_on: '2026-08-03' }),
    ]
    const r = sumIncomeExpense(t, currencyOf, 'JPY', RATES, GUI_VN)
    expect(r.transfer).toBe(25_000)
    expect(r.expense).toBe(1_000)
  })

  it('giao dịch KHÔNG có danh mục vẫn là chi (không thể là chuyển tài sản)', () => {
    const t = [tx({ type: 'expense', amount: 700, occurred_on: '2026-08-01' })]
    expect(sumIncomeExpense(t, currencyOf, 'JPY', RATES, GUI_VN).expense).toBe(700)
  })

  it('tập rỗng = hành vi cũ (mọi test đơn vị hiện có vẫn đúng)', () => {
    const r = sumIncomeExpense(thang8, currencyOf, 'JPY', RATES)
    expect(r.expense).toBe(252_236)
    expect(r.transfer).toBe(0)
  })
})

describe('categoryComparison · cắt cùng số ngày (cutoffDay)', () => {
  const active = { year: 2026, month: 8 }

  /** Tháng 8 chi ngày 1–5; tháng 7 chi ngày 1–5 VÀ ngày 20–25. */
  const txs = [
    ...[1, 2, 3, 4, 5].map((d) =>
      tx({ type: 'expense', amount: 100, category_id: 'an', occurred_on: `2026-08-0${d}` }),
    ),
    ...[1, 2, 3, 4, 5].map((d) =>
      tx({ type: 'expense', amount: 100, category_id: 'an', occurred_on: `2026-07-0${d}` }),
    ),
    ...[20, 21, 22, 23, 24, 25].map((d) =>
      tx({ type: 'expense', amount: 100, category_id: 'an', occurred_on: `2026-07-${d}` }),
    ),
  ]

  it('KHÔNG cắt → cột Δ đọc ra "giảm" dù hai kỳ tiêu y hệt nhau trong 5 ngày đầu', () => {
    const r = categoryComparison(txs, active, 1, currencyOf, 'JPY', RATES)
    expect(r.rows[0].thisMonth).toBe(500)
    expect(r.rows[0].prevMonth).toBe(1100)
    expect(r.rows[0].deltaPct).toBe(-55) // câu sai: nhịp hai kỳ giống nhau
  })

  it('CẮT về 5 ngày → Δ đúng bằng 0', () => {
    const r = categoryComparison(txs, active, 1, currencyOf, 'JPY', RATES, 5)
    expect(r.rows[0].thisMonth).toBe(500)
    expect(r.rows[0].prevMonth).toBe(500)
    expect(r.rows[0].deltaPct).toBe(0)
  })

  it('cắt theo ngày của THÁNG TÀI CHÍNH, không theo ngày dương lịch', () => {
    // month_start_day = 25 → tháng tài chính "8/2026" chạy 25/08 → 24/09 (quy ước của
    // `monthKeyForDate`: ngày ≥ 25 thuộc chính tháng dương lịch đó).
    // 25/08 là ngày thứ 1 của T8; 25/07 là ngày thứ 1 của T7.
    const t = [
      tx({ type: 'expense', amount: 700, category_id: 'an', occurred_on: '2026-08-25' }), // ngày 1 của T8
      tx({ type: 'expense', amount: 900, category_id: 'an', occurred_on: '2026-08-27' }), // ngày 3 của T8
      tx({ type: 'expense', amount: 400, category_id: 'an', occurred_on: '2026-07-25' }), // ngày 1 của T7
      tx({ type: 'expense', amount: 600, category_id: 'an', occurred_on: '2026-07-28' }), // ngày 4 của T7
    ]
    const r = categoryComparison(t, active, 25, currencyOf, 'JPY', RATES, 2)
    expect(r.rows[0].thisMonth).toBe(700) // chỉ ngày 1
    expect(r.rows[0].prevMonth).toBe(400) // chỉ ngày 1
  })

  it('avg3 cũng bị cắt — không so 5 ngày với trung bình ba tháng đầy', () => {
    const t = [
      tx({ type: 'expense', amount: 100, category_id: 'an', occurred_on: '2026-08-01' }),
      tx({ type: 'expense', amount: 100, category_id: 'an', occurred_on: '2026-06-01' }),
      tx({ type: 'expense', amount: 900, category_id: 'an', occurred_on: '2026-06-20' }),
    ]
    const cat = categoryComparison(t, active, 1, currencyOf, 'JPY', RATES, 1)
    // Chỉ ngày 1 của mỗi tháng: T7 = 0, T6 = 100, T5 = 0 → avg3 = 33
    expect(cat.rows[0].avg3).toBe(33)
  })
})

describe('monthExpenseCompare', () => {
  const active = { year: 2026, month: 8 }
  const txs = [
    ...[1, 2, 3].map((d) =>
      tx({ type: 'expense', amount: 120, category_id: 'an', occurred_on: `2026-08-0${d}` }),
    ),
    ...Array.from({ length: 31 }, (_, i) =>
      tx({
        type: 'expense',
        amount: 100,
        category_id: 'an',
        occurred_on: `2026-07-${String(i + 1).padStart(2, '0')}`,
      }),
    ),
  ]

  it('so đúng 3 ngày với 3 ngày, không phải 3 ngày với 31 ngày', () => {
    const r = monthExpenseCompare(txs, active, 1, '2026-08-03', currencyOf, 'JPY', RATES)
    expect(r?.spent).toBe(360)
    expect(r?.priorSameDays).toBe(300)
    expect(r?.deltaPct).toBe(20)
    // Trọn tháng trước vẫn có, nhưng nó KHÔNG phải mẫu số.
    expect(r?.priorFull).toBe(3100)
  })

  it('tháng đã xong → cắt thành không cắt', () => {
    const r = monthExpenseCompare(txs, active, 1, '2026-12-31', currencyOf, 'JPY', RATES)
    expect(r?.partial).toBe(false)
    expect(r?.priorSameDays).toBe(3100)
  })

  it('chuyển khoản và dòng tiền nợ không tính (cùng bộ lọc với monthlySeries)', () => {
    const t = [
      tx({ type: 'expense', amount: 100, category_id: 'an', occurred_on: '2026-08-01' }),
      tx({ type: 'transfer', amount: 9999, occurred_on: '2026-08-01' }),
      tx({ type: 'expense', amount: 9999, is_debt_flow: true, occurred_on: '2026-08-01' }),
      tx({ type: 'expense', amount: 50, category_id: 'an', occurred_on: '2026-07-01' }),
    ]
    const r = monthExpenseCompare(t, active, 1, '2026-08-01', currencyOf, 'JPY', RATES)
    expect(r?.spent).toBe(100)
    expect(r?.priorSameDays).toBe(50)
  })

  it('hoàn tiền là chi ÂM ở cả hai kỳ', () => {
    const t = [
      tx({ type: 'expense', amount: 300, category_id: 'an', occurred_on: '2026-08-01' }),
      tx({ type: 'expense', amount: 100, category_id: 'an', occurred_on: '2026-08-01', is_refund: true }),
      tx({ type: 'expense', amount: 200, category_id: 'an', occurred_on: '2026-07-01' }),
    ]
    const r = monthExpenseCompare(t, active, 1, '2026-08-01', currencyOf, 'JPY', RATES)
    expect(r?.spent).toBe(200)
    expect(r?.deltaPct).toBe(0)
  })
})

describe('monthDaysElapsed', () => {
  it('giữa tháng', () => {
    expect(monthDaysElapsed({ year: 2026, month: 8 }, 1, '2026-08-18')).toEqual({
      daysElapsed: 18,
      daysInPeriod: 31,
    })
  })

  it('tháng đã xong → trọn tháng', () => {
    expect(monthDaysElapsed({ year: 2026, month: 7 }, 1, '2026-08-18')).toEqual({
      daysElapsed: 31,
      daysInPeriod: 31,
    })
  })

  it('tháng chưa bắt đầu → 0 ngày', () => {
    expect(monthDaysElapsed({ year: 2026, month: 9 }, 1, '2026-08-18').daysElapsed).toBe(0)
  })

  it('month_start_day = 25: kỳ 8/2026 chạy 25/08 → 24/09', () => {
    // 18/08 nằm TRƯỚC kỳ → 0 ngày đã trôi (nó thuộc kỳ 7).
    expect(monthDaysElapsed({ year: 2026, month: 8 }, 25, '2026-08-18').daysElapsed).toBe(0)
    // 10/09 là ngày thứ 17 của kỳ (25/08 là ngày 1).
    expect(monthDaysElapsed({ year: 2026, month: 8 }, 25, '2026-09-10')).toEqual({
      daysElapsed: 17,
      daysInPeriod: 31,
    })
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

describe('netFlowSeries & netFlowSummary', () => {
  const key = (m: number): MonthKey => ({ year: 2026, month: m })
  const series = (pts: [number, number, number][]) => ({
    points: pts.map(([m, income, expense]) => ({ key: key(m), income, expense, transfer: 0 })),
    hasMissingRate: false,
  })

  it('net = thu − chi từng tháng, cumulative dồn từ tháng đầu', () => {
    const r = netFlowSeries(series([
      [5, 300_000, 200_000], // +100.000
      [6, 250_000, 400_000], // −150.000 → dồn −50.000
      [7, 300_000, 100_000], // +200.000 → dồn +150.000
    ]))
    expect(r).toEqual([
      { key: key(5), net: 100_000, cumulative: 100_000 },
      { key: key(6), net: -150_000, cumulative: -50_000 },
      { key: key(7), net: 200_000, cumulative: 150_000 },
    ])
  })

  it('tháng trống (thu = chi = 0) cho net 0 và giữ nguyên cumulative', () => {
    const r = netFlowSeries(series([
      [6, 200_000, 50_000],
      [7, 0, 0],
    ]))
    expect(r[1]).toEqual({ key: key(7), net: 0, cumulative: 150_000 })
  })

  it('chuỗi rỗng → mảng rỗng', () => {
    expect(netFlowSeries(series([]))).toEqual([])
  })

  it('summary: tổng, trung bình/tháng, số tháng âm, tháng tệ nhất', () => {
    const pts = netFlowSeries(series([
      [5, 300_000, 200_000], // +100.000
      [6, 250_000, 400_000], // −150.000
      [7, 100_000, 150_000], // −50.000
    ]))
    const s = netFlowSummary(pts)
    expect(s.total).toBe(-100_000) // = cumulative tháng cuối
    expect(s.avg).toBe(-33_333) // làm tròn
    expect(s.negativeMonths).toBe(2)
    expect(s.worst).toEqual({ key: key(6), net: -150_000, cumulative: -50_000 })
  })

  it('summary: không có tháng âm → negativeMonths 0, worst là tháng thấp nhất', () => {
    const pts = netFlowSeries(series([
      [6, 300_000, 100_000], // +200.000
      [7, 300_000, 250_000], // +50.000
    ]))
    const s = netFlowSummary(pts)
    expect(s.negativeMonths).toBe(0)
    expect(s.worst?.net).toBe(50_000)
  })

  it('summary của chuỗi rỗng: 0 và worst null (không chia cho 0)', () => {
    expect(netFlowSummary([])).toEqual({ total: 0, avg: 0, negativeMonths: 0, worst: null })
  })
})
