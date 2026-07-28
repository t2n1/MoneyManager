import { describe, expect, it } from 'vitest'
import { rhythmRules } from './rhythmRules'
import type { NotificationInput } from '../types'
import type {
  NetWorthSnapshotRow,
  SavingsGoalRow,
  TransactionRow,
} from '../../../types/database.types'

function tx(over: Partial<TransactionRow> & { id: string; occurred_on: string }): TransactionRow {
  return {
    id: over.id,
    user_id: 'u',
    type: over.type ?? 'expense',
    amount: over.amount ?? 1_000,
    to_amount: null,
    category_id: over.category_id ?? 'cat',
    account_id: over.account_id ?? 'acc',
    to_account_id: null,
    recurring_rule_id: null,
    occurred_on: over.occurred_on,
    note: over.note ?? '',
    created_at: '',
    updated_at: '',
  }
}

function snapshot(on: string, net: number): NetWorthSnapshotRow {
  return { id: on, user_id: 'u', snapshot_on: on, net_worth: net, created_at: '' }
}

function goal(over: Partial<SavingsGoalRow> & { id: string }): SavingsGoalRow {
  return {
    id: over.id,
    user_id: 'u',
    name: over.name ?? 'Quỹ mua xe',
    account_id: over.account_id ?? 'acc',
    target_amount: over.target_amount ?? 1_000_000,
    target_date: null,
    note: '',
    sort_order: 0,
    created_at: '',
  }
}

function input(over: Partial<NotificationInput>): NotificationInput {
  return {
    todayISO: '2026-07-28',
    monthStartDay: 1,
    base: 'JPY',
    rates: {},
    formatMoney: (m) => String(m),
    currencyOf: () => 'JPY',
    accounts: [],
    categories: [],
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

describe('stale-entry', () => {
  it('3 ngày không ghi thì báo, mã theo tuần ISO', () => {
    const out = rhythmRules(input({ recentTxs: [tx({ id: 't', occurred_on: '2026-07-25' })] }))
    const hit = out.find((n) => n.type === 'stale-entry')
    expect(hit?.key).toBe('stale-entry:2026-W31')
    expect(hit?.title).toContain('3 ngày')
  })

  it('2 ngày thì chưa báo', () => {
    const out = rhythmRules(input({ recentTxs: [tx({ id: 't', occurred_on: '2026-07-26' })] }))
    expect(out.filter((n) => n.type === 'stale-entry')).toHaveLength(0)
  })

  it('chưa có giao dịch nào thì im (chưa đủ dữ liệu, không đoán)', () => {
    const out = rhythmRules(input({ recentTxs: [] }))
    expect(out.filter((n) => n.type === 'stale-entry')).toHaveLength(0)
  })
})

describe('savings-milestone', () => {
  it('đạt 50% thì báo mốc 50', () => {
    const out = rhythmRules(
      input({
        savingsGoals: [goal({ id: 'g1', target_amount: 1_000_000 })],
        accounts: [
          {
            id: 'acc',
            user_id: 'u',
            name: 'Tiết kiệm',
            type: 'bank',
            currency: 'JPY',
            asset_group: null,
            is_hidden: false,
            include_in_totals: true,
            credit_limit: null,
            statement_day: null,
            payment_due_day: null,
            payment_account_id: null,
            is_archived: false,
            sort_order: 0,
            cost_basis: 0,
            depreciation_months: null,
            depreciation_from: null,
            salvage_value: 0,
            tax_shelter: null,
            shelter_annual_limit: null,
            market_value: null,
            balance: 520_000,
          },
        ],
      }),
    )
    const hit = out.find((n) => n.type === 'savings-milestone')
    expect(hit?.key).toBe('savings-milestone:g1:50')
    expect(hit?.title).toContain('50%')
  })

  it('mới 10% thì chưa có mốc nào', () => {
    const out = rhythmRules(
      input({
        savingsGoals: [goal({ id: 'g1', target_amount: 1_000_000 })],
        accounts: [],
      }),
    )
    expect(out.filter((n) => n.type === 'savings-milestone')).toHaveLength(0)
  })
})

describe('networth-record', () => {
  it('bản chụp mới nhất cao nhất từ trước tới nay thì báo', () => {
    const out = rhythmRules(
      input({
        networthSnapshots: [
          snapshot('2026-05-01', 3_000_000),
          snapshot('2026-06-01', 3_500_000),
          snapshot('2026-07-27', 4_280_000),
        ],
      }),
    )
    const hit = out.find((n) => n.type === 'networth-record')
    expect(hit?.key).toBe('networth-record:2026-07')
  })

  it('chưa đủ 3 bản chụp thì im', () => {
    const out = rhythmRules(
      input({ networthSnapshots: [snapshot('2026-06-01', 1), snapshot('2026-07-01', 2)] }),
    )
    expect(out.filter((n) => n.type === 'networth-record')).toHaveLength(0)
  })

  it('không phải kỷ lục thì im', () => {
    const out = rhythmRules(
      input({
        networthSnapshots: [
          snapshot('2026-05-01', 5_000_000),
          snapshot('2026-06-01', 4_000_000),
          snapshot('2026-07-27', 3_000_000),
        ],
      }),
    )
    expect(out.filter((n) => n.type === 'networth-record')).toHaveLength(0)
  })
})

describe('monthly-summary', () => {
  it('vào ngày đầu kỳ mới thì báo tổng kết tháng vừa khép', () => {
    const out = rhythmRules(
      input({
        todayISO: '2026-08-01',
        recentTxs: [
          tx({ id: 't1', occurred_on: '2026-07-10', type: 'expense', amount: 182_000 }),
          tx({ id: 't2', occurred_on: '2026-07-25', type: 'income', amount: 280_000 }),
        ],
      }),
    )
    const hit = out.find((n) => n.type === 'monthly-summary')
    expect(hit?.key).toBe('monthly-summary:2026-07')
  })

  it('giữa tháng thì không báo tổng kết', () => {
    const out = rhythmRules(input({ todayISO: '2026-08-15', recentTxs: [] }))
    expect(out.filter((n) => n.type === 'monthly-summary')).toHaveLength(0)
  })

  it('theo month_start_day = 25 thì ngày đầu kỳ là 25', () => {
    const out = rhythmRules(
      input({
        todayISO: '2026-08-25',
        monthStartDay: 25,
        recentTxs: [tx({ id: 't1', occurred_on: '2026-08-01', type: 'expense', amount: 5_000 })],
      }),
    )
    expect(out.filter((n) => n.type === 'monthly-summary')).toHaveLength(1)
  })
})

describe('chung', () => {
  it('mã ổn định qua hai lần gọi', () => {
    const arg = input({ recentTxs: [tx({ id: 't', occurred_on: '2026-07-25' })] })
    expect(rhythmRules(arg).map((n) => n.key)).toEqual(rhythmRules(arg).map((n) => n.key))
  })
})

describe('isoWeekKey (qua stale-entry)', () => {
  it('hai ngày trong cùng tuần ISO thì mã tuần giống nhau', () => {
    // 2026-07-20 (Thứ 2) và 2026-07-25 (Thứ 7) cùng tuần ISO 31.
    const mon = rhythmRules(
      input({ todayISO: '2026-07-23', recentTxs: [tx({ id: 't', occurred_on: '2026-07-19' })] }),
    ).find((n) => n.type === 'stale-entry')
    const sat = rhythmRules(
      input({ todayISO: '2026-07-25', recentTxs: [tx({ id: 't', occurred_on: '2026-07-19' })] }),
    ).find((n) => n.type === 'stale-entry')
    expect(mon?.key).toBe(sat?.key)
  })

  it('hai ngày ở hai tuần ISO liền kề thì mã khác nhau', () => {
    const wk31 = rhythmRules(
      input({ todayISO: '2026-07-25', recentTxs: [tx({ id: 't', occurred_on: '2026-07-19' })] }),
    ).find((n) => n.type === 'stale-entry')
    const wk32 = rhythmRules(
      input({ todayISO: '2026-08-01', recentTxs: [tx({ id: 't', occurred_on: '2026-07-19' })] }),
    ).find((n) => n.type === 'stale-entry')
    expect(wk31?.key).not.toBe(wk32?.key)
  })

  it('qua ranh giới năm dương lịch: 2025-12-29 (Thứ 2) và 2026-01-01 (Thứ 5) cùng tuần ISO 2026-W01', () => {
    const dec29 = rhythmRules(
      input({ todayISO: '2025-12-29', recentTxs: [tx({ id: 't', occurred_on: '2025-12-20' })] }),
    ).find((n) => n.type === 'stale-entry')
    const jan1 = rhythmRules(
      input({ todayISO: '2026-01-01', recentTxs: [tx({ id: 't', occurred_on: '2025-12-20' })] }),
    ).find((n) => n.type === 'stale-entry')
    expect(dec29?.key).toBe('stale-entry:2026-W01')
    expect(jan1?.key).toBe('stale-entry:2026-W01')
    expect(dec29?.key).toBe(jan1?.key)
  })
})
