import { describe, expect, it } from 'vitest'
import type { CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'
import { sumIncomeExpense } from './aggregate'
import {
  budgetCellLabel,
  incomeSplit,
  concentration,
  keptDestinations,
  outflowTiers,
  remainingPlan,
  sortMonthTable,
  spendShape,
  type MonthTableRow,
} from './monthReport'

const RATES: Rates = { JPY: 1, VND: 165 }
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
    occurred_on: '2026-08-01',
    note: '',
    created_at: '',
    updated_at: '',
    is_debt_flow: false,
    exclude_from_stats: false,
    is_refund: false,
    ...p,
  } as TransactionRow
}

describe('outflowTiers', () => {
  it('ba tầng cộng lại ĐÚNG bằng thu', () => {
    const t = outflowTiers(409_251, 222_236, 30_000, 12)
    expect(t.reduce((s, x) => s + x.amount, 0)).toBe(409_251)
    expect(t.map((x) => x.pct)).toEqual([54, 7, 38])
  })

  it('phần để lại ÂM khi chi vượt thu — không kẹp về 0', () => {
    const t = outflowTiers(100_000, 150_000, 0, 3)
    expect(t[2].amount).toBe(-50_000)
    expect(t[2].pct).toBe(-50)
  })

  it('thu = 0 → không in phần trăm nào', () => {
    expect(outflowTiers(0, 5_000, 0, 1).every((x) => x.pct === null)).toBe(true)
  })

  it('tầng chuyển tài sản luôn nói ra nó không phải chi tiêu', () => {
    expect(outflowTiers(100, 50, 10, 1)[1].note).toContain('không phải chi tiêu')
  })
})

describe('spendShape', () => {
  const isVariable = (id: string | null) => id === 'anngoai'
  const txs = [
    tx({ type: 'expense', amount: 1_000, category_id: 'nha', occurred_on: '2026-08-01' }),
    tx({ type: 'expense', amount: 3_000, category_id: 'anngoai', occurred_on: '2026-08-02' }),
    tx({ type: 'expense', amount: 5_000, category_id: 'anngoai', occurred_on: '2026-08-03' }),
    // ngoài cửa sổ
    tx({ type: 'expense', amount: 9_999, category_id: 'nha', occurred_on: '2026-08-20' }),
  ]

  it('tổng · phần biến đổi · số lần · trung vị', () => {
    const r = spendShape(txs, '2026-08-01', '2026-08-03', isVariable, currencyOf, 'JPY', RATES, new Set())
    expect(r.total).toBe(9_000)
    expect(r.variable).toBe(8_000)
    expect(r.count).toBe(3)
    expect(r.median).toBe(3_000)
  })

  it('trung vị của số chẵn phần tử = trung bình hai giữa', () => {
    const t = [1_000, 2_000, 3_000, 5_000].map((a, i) =>
      tx({ type: 'expense', amount: a, category_id: 'nha', occurred_on: `2026-08-0${i + 1}` }),
    )
    const r = spendShape(t, '2026-08-01', '2026-08-04', isVariable, currencyOf, 'JPY', RATES, new Set())
    expect(r.median).toBe(2_500)
  })

  it('hoàn tiền trừ vào tổng nhưng KHÔNG đếm là một lần chi', () => {
    const t = [
      tx({ type: 'expense', amount: 5_000, category_id: 'nha', occurred_on: '2026-08-01' }),
      tx({ type: 'expense', amount: 2_000, category_id: 'nha', occurred_on: '2026-08-02', is_refund: true }),
    ]
    const r = spendShape(t, '2026-08-01', '2026-08-05', isVariable, currencyOf, 'JPY', RATES, new Set())
    expect(r.total).toBe(3_000)
    expect(r.count).toBe(1)
  })

  it('danh mục chuyển tài sản bị loại', () => {
    const t = [
      tx({ type: 'expense', amount: 1_000, category_id: 'nha', occurred_on: '2026-08-01' }),
      tx({ type: 'expense', amount: 30_000, category_id: 'gui-vn', occurred_on: '2026-08-02' }),
    ]
    const r = spendShape(t, '2026-08-01', '2026-08-05', isVariable, currencyOf, 'JPY', RATES, new Set(['gui-vn']))
    expect(r.total).toBe(1_000)
    expect(r.count).toBe(1)
  })

  it('cửa sổ rỗng → trung vị null, không phải 0', () => {
    const r = spendShape([], '2026-08-01', '2026-08-05', isVariable, currencyOf, 'JPY', RATES, new Set())
    expect(r.median).toBeNull()
    expect(r.count).toBe(0)
  })

  it('nhiều lần hơn nhưng mỗi lần nhỏ hơn — đúng kết luận 26a muốn nói', () => {
    const thang7 = Array.from({ length: 4 }, (_, i) =>
      tx({ type: 'expense', amount: 10_000, category_id: 'nha', occurred_on: `2026-07-0${i + 1}` }),
    )
    const thang8 = Array.from({ length: 8 }, (_, i) =>
      tx({ type: 'expense', amount: 6_000, category_id: 'nha', occurred_on: `2026-08-0${i + 1}` }),
    )
    const a = spendShape(thang7, '2026-07-01', '2026-07-08', isVariable, currencyOf, 'JPY', RATES, new Set())
    const b = spendShape(thang8, '2026-08-01', '2026-08-08', isVariable, currencyOf, 'JPY', RATES, new Set())
    expect(b.count).toBeGreaterThan(a.count)
    expect(b.median!).toBeLessThan(a.median!)
    expect(b.total).toBeGreaterThan(a.total)
  })
})

describe('keptDestinations', () => {
  const accounts = [
    { id: 'yucho', currency: 'JPY' as CurrencyCode },
    { id: 'nisa', currency: 'JPY' as CurrencyCode },
    { id: 'vnd', currency: 'VND' as CurrencyCode, include_in_totals: false },
  ]

  it('cộng biến động số dư từng tài khoản, in ĐƠN VỊ GỐC', () => {
    const txs = [
      tx({ type: 'income', amount: 100_000, account_id: 'yucho', occurred_on: '2026-08-05' }),
      tx({ type: 'expense', amount: 9_000, account_id: 'yucho', occurred_on: '2026-08-06' }),
      tx({
        type: 'transfer',
        amount: 30_000,
        account_id: 'yucho',
        to_account_id: 'nisa',
        occurred_on: '2026-08-07',
      }),
    ]
    const r = keptDestinations(txs, accounts, '2026-08-01', '2026-08-31', 'JPY', RATES)
    const yucho = r.rows.find((x) => x.accountId === 'yucho')!
    const nisa = r.rows.find((x) => x.accountId === 'nisa')!
    expect(yucho.delta).toBe(61_000)
    expect(nisa.delta).toBe(30_000)
    expect(r.totalGrowth).toBe(91_000)
    expect(yucho.pct).toBe(67)
    expect(nisa.pct).toBe(33)
  })

  it('tài khoản VND in số VND, quy đổi chỉ để so — không thay số gốc', () => {
    const txs = [
      tx({ type: 'income', amount: 4_950_000, account_id: 'vnd', occurred_on: '2026-08-05' }),
      tx({ type: 'income', amount: 30_000, account_id: 'yucho', occurred_on: '2026-08-05' }),
    ]
    const r = keptDestinations(txs, accounts, '2026-08-01', '2026-08-31', 'JPY', RATES)
    const vnd = r.rows.find((x) => x.accountId === 'vnd')!
    expect(vnd.delta).toBe(4_950_000)
    expect(vnd.currency).toBe('VND')
    expect(vnd.deltaBase).toBe(30_000)
    expect(vnd.includeInTotals).toBe(false)
  })

  it('tài khoản GIẢM vẫn được in, nhưng không vào mẫu số', () => {
    const txs = [
      tx({ type: 'expense', amount: 5_000, account_id: 'yucho', occurred_on: '2026-08-05' }),
      tx({ type: 'income', amount: 10_000, account_id: 'nisa', occurred_on: '2026-08-05' }),
    ]
    const r = keptDestinations(txs, accounts, '2026-08-01', '2026-08-31', 'JPY', RATES)
    expect(r.totalGrowth).toBe(10_000)
    const yucho = r.rows.find((x) => x.accountId === 'yucho')!
    expect(yucho.delta).toBe(-5_000)
    expect(yucho.pct).toBeNull()
    // Dòng giảm xếp cuối.
    expect(r.rows.at(-1)!.accountId).toBe('yucho')
  })

  it('tài khoản không đổi gì thì không in ra (không vẽ dòng ¥0)', () => {
    const r = keptDestinations(
      [tx({ type: 'income', amount: 1_000, account_id: 'yucho', occurred_on: '2026-08-05' })],
      accounts,
      '2026-08-01',
      '2026-08-31',
      'JPY',
      RATES,
    )
    expect(r.rows.map((x) => x.accountId)).toEqual(['yucho'])
  })

  it('thiếu tỷ giá → cờ, không âm thầm coi là 0', () => {
    const r = keptDestinations(
      [tx({ type: 'income', amount: 4_950_000, account_id: 'vnd', occurred_on: '2026-08-05' })],
      accounts,
      '2026-08-01',
      '2026-08-31',
      'JPY',
      { JPY: 1 },
    )
    expect(r.hasMissingRate).toBe(true)
    expect(r.rows[0].deltaBase).toBeNull()
  })

  // Khối 01 lọc `exclude_from_stats` và `is_debt_flow` (sumIncomeExpense, aggregate.ts);
  // khối này thì không, nên "phần để lại ¥385.000" đứng cạnh một bảng cộng ra ¥2.046.218 —
  // và dòng to nhất của bảng là một BÚT TOÁN ĐIỀU CHỈNH SỐ DƯ, tức đúng cái không phải
  // "tiền không tiêu đi đâu". Hai khối cùng một trang thì phải cùng một rổ giao dịch.
  it('bút toán điều chỉnh số dư (exclude_from_stats) KHÔNG tính', () => {
    const txs = [
      tx({ type: 'income', amount: 1_000, account_id: 'yucho', occurred_on: '2026-08-05' }),
      tx({
        type: 'income',
        amount: 1_661_218,
        account_id: 'yucho',
        occurred_on: '2026-08-06',
        exclude_from_stats: true,
      }),
    ]
    const r = keptDestinations(txs, accounts, '2026-08-01', '2026-08-31', 'JPY', RATES)
    expect(r.rows.find((x) => x.accountId === 'yucho')!.delta).toBe(1_000)
  })

  it('dòng tiền nợ / cho vay (is_debt_flow) KHÔNG tính', () => {
    const txs = [
      tx({ type: 'income', amount: 1_000, account_id: 'yucho', occurred_on: '2026-08-05' }),
      tx({
        type: 'expense',
        amount: 50_000,
        account_id: 'yucho',
        occurred_on: '2026-08-06',
        is_debt_flow: true,
      }),
    ]
    const r = keptDestinations(txs, accounts, '2026-08-01', '2026-08-31', 'JPY', RATES)
    expect(r.rows.find((x) => x.accountId === 'yucho')!.delta).toBe(1_000)
  })

  // Tài khoản ĐỨNG NGOÀI TỔNG thì đứng ngoài mọi tổng — cùng luật với assetBreakdown
  // (aggregate.test.ts "tổng của nhóm đứng ngoài tổng"). Cho nó vào mẫu số thì nó vừa in
  // "ngoài tổng" vừa chiếm 23% của tổng, và nó bóp phần trăm của MỌI dòng còn lại.
  it('tài khoản ngoài tổng: không vào mẫu số, không có phần trăm', () => {
    const txs = [
      tx({ type: 'income', amount: 4_950_000, account_id: 'vnd', occurred_on: '2026-08-05' }),
      tx({ type: 'income', amount: 30_000, account_id: 'yucho', occurred_on: '2026-08-05' }),
    ]
    const r = keptDestinations(txs, accounts, '2026-08-01', '2026-08-31', 'JPY', RATES)
    expect(r.totalGrowth).toBe(30_000)
    expect(r.rows.find((x) => x.accountId === 'vnd')!.pct).toBeNull()
    expect(r.rows.find((x) => x.accountId === 'yucho')!.pct).toBe(100)
  })

  // Ràng buộc của cả khối 04, và là phép thử duy nhất bắt được lệch rổ giao dịch:
  // tổng RÒNG mọi dòng (quy đổi base) = "Phần để lại" của khối 01. Chuyển khoản nội bộ
  // triệt tiêu nên vẫn được tính — nó cho biết tiền ĐANG Ở ĐÂU mà không đổi tổng.
  it('tổng ròng mọi dòng = phần để lại của khối 01', () => {
    const txs = [
      tx({ type: 'income', amount: 500_000, account_id: 'yucho', occurred_on: '2026-08-05' }),
      tx({ type: 'expense', amount: 120_000, account_id: 'yucho', occurred_on: '2026-08-06' }),
      tx({
        type: 'expense',
        amount: 5_000,
        account_id: 'yucho',
        occurred_on: '2026-08-07',
        is_refund: true,
      }),
      tx({
        type: 'transfer',
        amount: 200_000,
        account_id: 'yucho',
        to_account_id: 'nisa',
        occurred_on: '2026-08-08',
      }),
      tx({
        type: 'income',
        amount: 1_661_218,
        account_id: 'yucho',
        occurred_on: '2026-08-09',
        exclude_from_stats: true,
      }),
      tx({
        type: 'expense',
        amount: 50_000,
        account_id: 'yucho',
        occurred_on: '2026-08-10',
        is_debt_flow: true,
      }),
    ]
    const sums = sumIncomeExpense(txs, currencyOf, 'JPY', RATES)
    const kept = sums.income - sums.expense - sums.transfer
    const r = keptDestinations(txs, accounts, '2026-08-01', '2026-08-31', 'JPY', RATES)
    const net = r.rows.reduce((s, x) => s + (x.deltaBase ?? 0), 0)
    expect(kept).toBe(385_000)
    expect(net).toBe(kept)
  })

  it('giao dịch ngoài cửa sổ không tính', () => {
    const r = keptDestinations(
      [tx({ type: 'income', amount: 9_999, account_id: 'yucho', occurred_on: '2026-09-05' })],
      accounts,
      '2026-08-01',
      '2026-08-31',
      'JPY',
      RATES,
    )
    expect(r.rows).toEqual([])
  })
})

describe('remainingPlan', () => {
  const base = {
    incomeSoFar: 409_251,
    spentSoFar: 222_236,
    committed: 6_317,
    daysElapsed: 18,
    daysInPeriod: 31,
    periodStartISO: '2026-08-01',
  }

  it('nhịp · dự kiến · còn tự do', () => {
    const r = remainingPlan(base)!
    expect(r.daysLeft).toBe(13)
    expect(r.dailyPace).toBe(12_346) // 222.236 / 18
    expect(r.expected).toBe(12_346 * 13)
    expect(r.free).toBe(409_251 - 222_236 - 6_317 - 12_346 * 13)
    expect(r.lastISO).toBe('2026-08-31')
  })

  it('kỳ đã xong → null ("còn tự do bao nhiêu" của kỳ đã hết là câu vô nghĩa)', () => {
    expect(remainingPlan({ ...base, daysElapsed: 31 })).toBeNull()
  })

  it('kỳ chưa bắt đầu → null (chưa có nhịp nào để suy)', () => {
    expect(remainingPlan({ ...base, daysElapsed: 0 })).toBeNull()
  })

  it('còn tự do ÂM khi nhịp hiện tại sẽ làm kỳ hụt', () => {
    const r = remainingPlan({ ...base, incomeSoFar: 100_000 })!
    expect(r.free).toBeLessThan(0)
  })
})

describe('sortMonthTable', () => {
  const row = (p: Partial<MonthTableRow> & Pick<MonthTableRow, 'categoryId'>): MonthTableRow => ({
    name: p.categoryId,
    icon: '📦',
    thisMonth: 0,
    pct: 0,
    avg3: 0,
    deltaPct: null,
    isNew: false,
    spark: [],
    budgeted: null,
    fixed: false,
    ...p,
  })

  const rows = [
    row({ categoryId: 'a', name: 'Ăn uống', thisMonth: 100, deltaPct: 5 }),
    row({ categoryId: 'b', name: 'Bảo hiểm', thisMonth: 300, deltaPct: -10 }),
    row({ categoryId: 'c', name: 'Cơm ngoài', thisMonth: 200, deltaPct: 50 }),
    row({ categoryId: 'd', name: 'Du lịch', thisMonth: 400, deltaPct: null, isNew: true }),
  ]

  it('mặc định theo TIỀN giảm dần', () => {
    expect(sortMonthTable(rows, 'amount').map((r) => r.categoryId)).toEqual(['d', 'b', 'c', 'a'])
  })

  it('theo Δ: dòng KHÔNG so được xuống cuối, không bị coi là 0', () => {
    expect(sortMonthTable(rows, 'delta').map((r) => r.categoryId)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('theo tên dùng thứ tự tiếng Việt', () => {
    expect(sortMonthTable(rows, 'name').map((r) => r.categoryId)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('không sửa mảng gốc', () => {
    const before = rows.map((r) => r.categoryId)
    sortMonthTable(rows, 'delta')
    expect(rows.map((r) => r.categoryId)).toEqual(before)
  })
})

describe('concentration', () => {
  const row = (id: string, amount: number): MonthTableRow => ({
    categoryId: id,
    name: id,
    icon: '📦',
    thisMonth: amount,
    pct: 0,
    avg3: 0,
    deltaPct: null,
    isNew: false,
    spark: [],
    budgeted: null,
    fixed: false,
  })

  it('bao nhiêu danh mục đầu bảng gộp lại vượt 80%', () => {
    const r = concentration([row('a', 800), row('b', 100), row('c', 50), row('d', 50)])
    expect(r).toEqual({ count: 1, pct: 80 })
  })

  it('rải đều thì phải nhiều dòng mới đủ 80%', () => {
    const r = concentration([row('a', 25), row('b', 25), row('c', 25), row('d', 25)])
    expect(r?.count).toBe(4)
  })

  it('tổng = 0 → null', () => {
    expect(concentration([row('a', 0)])).toBeNull()
  })
})

describe('budgetCellLabel', () => {
  it('danh mục cố định không in phần trăm', () => {
    expect(budgetCellLabel({ budgeted: 1_000, thisMonth: 2_000, fixed: true })).toEqual({
      text: 'cố định',
      tone: 'muted',
    })
  })

  it('chưa đặt hạn mức → dấu gạch, không phải 0%', () => {
    expect(budgetCellLabel({ budgeted: null, thisMonth: 500, fixed: false }).text).toBe('—')
  })

  it('ĐÚNG BẰNG trần không phải "vượt"', () => {
    expect(budgetCellLabel({ budgeted: 1_000, thisMonth: 1_000, fixed: false })).toEqual({
      text: 'vừa hết',
      tone: 'warn',
    })
  })

  it('vượt trần / gần trần / còn dư', () => {
    expect(budgetCellLabel({ budgeted: 1_000, thisMonth: 2_820, fixed: false })).toEqual({
      text: '282%',
      tone: 'over',
    })
    expect(budgetCellLabel({ budgeted: 1_000, thisMonth: 850, fixed: false }).tone).toBe('warn')
    expect(budgetCellLabel({ budgeted: 1_000, thisMonth: 120, fixed: false }).tone).toBe('ok')
  })
})

describe('incomeSplit', () => {
  const RECURRING = 'rule-luong'

  it('tach theo recurring_rule_id, KHONG theo so tien', () => {
    const txs = [
      tx({ type: 'income', amount: 329_000, recurring_rule_id: RECURRING, occurred_on: '2026-08-25' }),
      tx({ type: 'income', amount: 80_251, occurred_on: '2026-08-10' }), // thưởng hè
    ]
    const r = incomeSplit(txs, 222_236, currencyOf, 'JPY', RATES)
    expect(r.recurring).toBe(329_000)
    expect(r.oneOff).toBe(80_251)
    expect(r.recurringPct).toBe(80)
  })

  it('tỷ lệ giữ lại theo LƯƠNG ĐỊNH KỲ khác hẳn theo tổng thu', () => {
    const txs = [
      tx({ type: 'income', amount: 329_000, recurring_rule_id: RECURRING, occurred_on: '2026-08-25' }),
      tx({ type: 'income', amount: 80_251, occurred_on: '2026-08-10' }),
    ]
    const r = incomeSplit(txs, 222_236, currencyOf, 'JPY', RATES)
    // Trên tổng thu 409.251: giữ lại 46%. Trên lương định kỳ 329.000: chỉ 32%.
    expect(Math.round(((409_251 - 222_236) / 409_251) * 100)).toBe(46)
    expect(r.keptOnRecurringPct).toBe(32)
  })

  it('chưa có khoản thu nào gắn quy tắc → hasSignal false (khối phải ẨN)', () => {
    const r = incomeSplit(
      [tx({ type: 'income', amount: 300_000, occurred_on: '2026-08-01' })],
      100_000,
      currencyOf,
      'JPY',
      RATES,
    )
    expect(r.hasSignal).toBe(false)
    expect(r.keptOnRecurringPct).toBeNull()
    expect(r.oneOff).toBe(300_000)
  })

  it('chi vượt lương định kỳ → tỷ lệ ÂM, không kẹp về 0', () => {
    const r = incomeSplit(
      [tx({ type: 'income', amount: 100_000, recurring_rule_id: RECURRING, occurred_on: '2026-08-01' })],
      150_000,
      currencyOf,
      'JPY',
      RATES,
    )
    expect(r.keptOnRecurringPct).toBe(-50)
  })

  it('bỏ chi, dòng tiền nợ và khoản loại khỏi thống kê', () => {
    const txs = [
      tx({ type: 'income', amount: 100_000, recurring_rule_id: RECURRING, occurred_on: '2026-08-01' }),
      tx({ type: 'expense', amount: 9_999, occurred_on: '2026-08-01' }),
      tx({ type: 'income', amount: 9_999, is_debt_flow: true, occurred_on: '2026-08-01' }),
      tx({ type: 'income', amount: 9_999, exclude_from_stats: true, occurred_on: '2026-08-01' }),
    ]
    const r = incomeSplit(txs, 0, currencyOf, 'JPY', RATES)
    expect(r.recurring).toBe(100_000)
    expect(r.oneOff).toBe(0)
  })

  it('thu = 0 → khong in phan tram nao', () => {
    const r = incomeSplit([], 5_000, currencyOf, 'JPY', RATES)
    expect(r.recurringPct).toBeNull()
    expect(r.hasSignal).toBe(false)
  })
})
