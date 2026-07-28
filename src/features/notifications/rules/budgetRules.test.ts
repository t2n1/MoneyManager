import { describe, expect, it } from 'vitest'
import { budgetRules } from './budgetRules'
import type { NotificationInput } from '../types'
import type { BudgetLine, BudgetReport } from '../../budgets/progress'
import type { CategoryRow } from '../../../types/database.types'

function line(over: Partial<BudgetLine> & { categoryId: string }): BudgetLine {
  const budgeted = over.budgeted ?? 40_000
  const spent = over.spent ?? 0
  return {
    categoryId: over.categoryId,
    budgeted,
    carried: 0,
    spent,
    ratio: budgeted === 0 ? 0 : spent / budgeted,
    status: over.status ?? (spent >= budgeted ? 'over' : spent / budgeted >= 0.8 ? 'warn' : 'ok'),
    isMarker: over.isMarker ?? false,
  }
}

function report(lines: BudgetLine[]): BudgetReport {
  return {
    lines,
    totalBudgeted: lines.reduce((s, l) => (l.isMarker ? s : s + l.budgeted), 0),
    totalSpent: lines.reduce((s, l) => (l.isMarker ? s : s + l.spent), 0),
    totalStatus: 'ok',
    overCount: lines.filter((l) => !l.isMarker && l.status === 'over').length,
    warnCount: 0,
    hasMissingRate: false,
    spentByCategory: new Map(lines.map((l) => [l.categoryId, l.spent])),
  }
}

function cat(id: string, name: string, parent_id: string | null = null): CategoryRow {
  return {
    id,
    user_id: 'u',
    name,
    type: 'expense',
    icon: '',
    parent_id,
    sort_order: 0,
    is_archived: false,
    created_at: '',
    need_level: null,
    cost_type: null,
  }
}

function input(over: Partial<NotificationInput>): NotificationInput {
  return {
    todayISO: '2026-07-13', // qua 12/31 ngày ≈ 39% tháng 7
    monthStartDay: 1,
    base: 'JPY',
    rates: {},
    formatMoney: (m) => String(m),
    currencyOf: () => 'JPY',
    accounts: [],
    categories: [cat('c1', 'Ăn ngoài'), cat('c2', 'Giải trí')],
    debts: [],
    recurringRules: [],
    budgetReport: undefined,
    savingsGoals: [],
    networthSnapshots: [],
    recentTxs: [],
    offTypes: [],
    ...over,
  }
}

describe('budget-over', () => {
  it('vượt hạn mức thì báo mức cao', () => {
    const out = budgetRules(
      input({ budgetReport: report([line({ categoryId: 'c1', spent: 43_200 })]) }),
    )
    const hit = out.find((n) => n.type === 'budget-over')
    expect(hit?.key).toBe('budget-over:c1')
    expect(hit?.severity).toBe('high')
    expect(hit?.title).toContain('Ăn ngoài')
  })

  it('đúng bằng hạn mức tính là vượt', () => {
    const out = budgetRules(
      input({ budgetReport: report([line({ categoryId: 'c1', spent: 40_000 })]) }),
    )
    expect(out.filter((n) => n.type === 'budget-over')).toHaveLength(1)
  })

  it('chưa vượt thì không báo', () => {
    const out = budgetRules(
      input({ budgetReport: report([line({ categoryId: 'c1', spent: 39_999 })]) }),
    )
    expect(out.filter((n) => n.type === 'budget-over')).toHaveLength(0)
  })
})

describe('budget-pace', () => {
  it('tiêu 71% khi mới qua 39% tháng thì báo', () => {
    const out = budgetRules(
      input({ budgetReport: report([line({ categoryId: 'c1', spent: 28_400 })]) }),
    )
    const hit = out.find((n) => n.type === 'budget-pace')
    expect(hit?.key).toBe('budget-pace:c1')
    expect(hit?.severity).toBe('medium')
  })

  // Ranh giới chính xác. todayISO = 2026-07-13, kỳ 01→31/07 nên ngày đã qua = 12/31
  // = 0.3870967742. Ngưỡng báo là `tỷ lệ tiêu − tỷ lệ ngày > 0.25`, tức tỷ lệ tiêu phải
  // vượt 0.6370967742 → spent phải vượt 40_000 × 0.6370967742 = 25.483,87.
  // Vậy 25_483 (ratio 0.63707500, chênh 0.24997823) là ca CHƯA báo,
  // còn 25_484 (ratio 0.63710000, chênh 0.25000323) là ca ĐÃ báo. Ép cả hai phía.
  it('chênh sát dưới 25 điểm phần trăm thì chưa báo', () => {
    const out = budgetRules(
      input({ budgetReport: report([line({ categoryId: 'c1', spent: 25_483 })]) }),
    )
    expect(out.filter((n) => n.type === 'budget-pace')).toHaveLength(0)
  })

  it('chênh vừa vượt 25 điểm phần trăm thì báo', () => {
    const out = budgetRules(
      input({ budgetReport: report([line({ categoryId: 'c1', spent: 25_484 })]) }),
    )
    expect(out.filter((n) => n.type === 'budget-pace')).toHaveLength(1)
  })

  it('đầu tháng (chưa qua 1/3 kỳ) thì im dù tiêu nhiều', () => {
    const out = budgetRules(
      input({
        todayISO: '2026-07-05',
        budgetReport: report([line({ categoryId: 'c1', spent: 35_000 })]),
      }),
    )
    expect(out.filter((n) => n.type === 'budget-pace')).toHaveLength(0)
  })

  it('mục vặt (hạn mức < 5% tổng) thì không báo', () => {
    const out = budgetRules(
      input({
        budgetReport: report([
          line({ categoryId: 'c1', budgeted: 2_000, spent: 1_800 }),
          line({ categoryId: 'c2', budgeted: 200_000, spent: 10_000 }),
        ]),
      }),
    )
    expect(out.filter((n) => n.type === 'budget-pace')).toHaveLength(0)
  })

  it('đã vượt hẳn thì KHÔNG báo nhịp nữa (không nói hai lần một ý)', () => {
    const out = budgetRules(
      input({ budgetReport: report([line({ categoryId: 'c1', spent: 45_000 })]) }),
    )
    expect(out.filter((n) => n.type === 'budget-pace')).toHaveLength(0)
    expect(out.filter((n) => n.type === 'budget-over')).toHaveLength(1)
  })

  it('mục con của nhóm có trần cha (isMarker) thì bỏ qua', () => {
    const out = budgetRules(
      input({
        budgetReport: report([line({ categoryId: 'c1', spent: 28_400, isMarker: true })]),
      }),
    )
    expect(out).toHaveLength(0)
  })
})

describe('budget-parent-over', () => {
  it('tổng chi các con vượt trần cha thì báo', () => {
    const parent = line({ categoryId: 'p1', budgeted: 100_000, spent: 108_400 })
    const rep = report([parent])
    rep.spentByCategory = new Map([
      ['p1', 0],
      ['c1', 60_000],
      ['c2', 48_400],
    ])
    const out = budgetRules(
      input({
        categories: [cat('p1', 'Sinh hoạt'), cat('c1', 'Ăn ngoài', 'p1'), cat('c2', 'Giải trí', 'p1')],
        budgetReport: rep,
      }),
    )
    const hit = out.find((n) => n.type === 'budget-parent-over')
    expect(hit?.key).toBe('budget-parent-over:p1')
    expect(hit?.title).toContain('Sinh hoạt')
  })

  it('mục cha không có con thì không sinh dòng nhóm', () => {
    const out = budgetRules(
      input({ budgetReport: report([line({ categoryId: 'c1', spent: 43_200 })]) }),
    )
    expect(out.filter((n) => n.type === 'budget-parent-over')).toHaveLength(0)
  })
})

describe('chung', () => {
  it('chưa có báo cáo ngân sách thì im, không đoán', () => {
    expect(budgetRules(input({ budgetReport: undefined }))).toHaveLength(0)
  })

  it('mã ổn định qua hai lần gọi', () => {
    const arg = input({ budgetReport: report([line({ categoryId: 'c1', spent: 43_200 })]) })
    expect(budgetRules(arg).map((n) => n.key)).toEqual(budgetRules(arg).map((n) => n.key))
  })
})
