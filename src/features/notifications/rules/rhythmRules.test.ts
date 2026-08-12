import { describe, expect, it } from 'vitest'
import { rhythmRules } from './rhythmRules'
import { ruleKey } from '../../../lib/recurringRadar'
import type { NotificationInput } from '../types'
import type {
  NetWorthSnapshotRow,
  RecurringRuleRow,
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
    exclude_from_stats: over.exclude_from_stats,
    is_debt_flow: over.is_debt_flow,
    created_at: '',
    updated_at: '',
  }
}

function recurringRule(over: Partial<RecurringRuleRow> & { id: string }): RecurringRuleRow {
  return {
    id: over.id,
    user_id: 'u',
    type: over.type ?? 'expense',
    amount: over.amount ?? 1_000,
    to_amount: null,
    category_id: over.category_id ?? 'cat',
    account_id: over.account_id ?? 'acc',
    to_account_id: null,
    note: '',
    frequency: over.frequency ?? 'monthly',
    start_on: over.start_on ?? '2026-05-01',
    end_on: null,
    is_paused: false,
    is_refund: false,
    last_generated_on: null,
    mode: 'auto',
    remind_days_before: 0,
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

describe('recurring-suggestion', () => {
  it('thấy khoản chi lặp đều hằng tháng (>= 3 lần, còn sống) thì gợi ý tạo quy tắc', () => {
    const out = rhythmRules(
      input({
        recentTxs: [
          tx({ id: 't1', occurred_on: '2026-05-01' }),
          tx({ id: 't2', occurred_on: '2026-05-31' }),
          tx({ id: 't3', occurred_on: '2026-06-30' }),
        ],
      }),
    )
    const hit = out.find((n) => n.type === 'recurring-suggestion')
    expect(hit?.key).toBe(`recurring-suggestion:${ruleKey('expense', 'acc', 'cat', 1_000)}`)
  })

  it('đã có quy tắc định kỳ khớp đúng nhóm thì thôi gợi ý', () => {
    const out = rhythmRules(
      input({
        recentTxs: [
          tx({ id: 't1', occurred_on: '2026-05-01' }),
          tx({ id: 't2', occurred_on: '2026-05-31' }),
          tx({ id: 't3', occurred_on: '2026-06-30' }),
        ],
        recurringRules: [recurringRule({ id: 'r1' })],
      }),
    )
    expect(out.filter((n) => n.type === 'recurring-suggestion')).toHaveLength(0)
  })
})

describe('savings-milestone', () => {
  /** Tài khoản 'acc' với số dư cho trước — mọi ca mốc chỉ khác nhau ở số dư. */
  function savingsAccount(balance: number) {
    return {
      id: 'acc',
      user_id: 'u',
      name: 'Tiết kiệm',
      type: 'bank' as const,
      currency: 'JPY' as const,
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
      balance,
    }
  }

  /** Mốc cao nhất đạt được, hoặc undefined nếu chưa mốc nào. */
  function milestoneFor(balance: number, target = 1_000_000) {
    const out = rhythmRules(
      input({
        savingsGoals: [goal({ id: 'g1', target_amount: target })],
        accounts: [savingsAccount(balance)],
      }),
    )
    return out.find((n) => n.type === 'savings-milestone')
  }

  // Ba ca cho mỗi ngưỡng theo mục I: chưa tới · vượt · ĐÚNG NGAY RANH GIỚI.
  it('đúng 25% thì đã tính là chạm mốc 25 (>=, không phải >)', () => {
    expect(milestoneFor(250_000)?.key).toBe('savings-milestone:g1:25')
  })

  it('sát dưới 25% thì chưa mốc nào', () => {
    expect(milestoneFor(249_999)).toBeUndefined()
  })

  it('đúng 100% thì báo mốc 100', () => {
    expect(milestoneFor(1_000_000)?.key).toBe('savings-milestone:g1:100')
  })

  it('vượt 100% thì mã VẪN kẹp ở :100, không sinh mốc mới mỗi lần nạp thêm', () => {
    // Mã đổi là "đã tắt" mất tác dụng — vượt mục tiêu rồi mà mỗi lần nạp thêm lại ra
    // một mã mới thì tin đã tắt sống lại liên tục.
    expect(milestoneFor(3_000_000)?.key).toBe('savings-milestone:g1:100')
    expect(milestoneFor(1_000_001)?.key).toBe('savings-milestone:g1:100')
  })

  it('mục tiêu = 0 thì IM, không chia cho 0', () => {
    // Chốt cả hai phía của guard `target_amount <= 0` (trước đây chưa có phép thử nào).
    expect(milestoneFor(500_000, 0)).toBeUndefined()
    expect(milestoneFor(500_000, -1)).toBeUndefined()
  })

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

  it('tài khoản không tồn tại thì coi như 0, không có mốc nào', () => {
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

  it('vượt bản ngay trước nhưng chưa vượt đỉnh cũ (mới hồi phục một phần) thì im', () => {
    const out = rhythmRules(
      input({
        networthSnapshots: [
          snapshot('2026-05-01', 5_000_000),
          snapshot('2026-06-01', 3_000_000),
          snapshot('2026-07-27', 4_000_000),
        ],
      }),
    )
    expect(out.filter((n) => n.type === 'networth-record')).toHaveLength(0)
  })

  it('hồi phục vượt luôn đỉnh cũ thì báo kỷ lục', () => {
    const out = rhythmRules(
      input({
        networthSnapshots: [
          snapshot('2026-05-01', 5_000_000),
          snapshot('2026-06-01', 3_000_000),
          snapshot('2026-07-27', 6_000_000),
        ],
      }),
    )
    expect(out.filter((n) => n.type === 'networth-record')).toHaveLength(1)
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

  it('bỏ qua giao dịch loại trừ thống kê và dòng tiền nợ khi cộng tổng', () => {
    const out = rhythmRules(
      input({
        todayISO: '2026-08-01',
        recentTxs: [
          tx({ id: 't1', occurred_on: '2026-07-10', type: 'expense', amount: 182_000 }),
          tx({ id: 't2', occurred_on: '2026-07-25', type: 'income', amount: 280_000 }),
          tx({
            id: 't3',
            occurred_on: '2026-07-12',
            type: 'expense',
            amount: 999_000,
            exclude_from_stats: true,
          }),
          tx({
            id: 't4',
            occurred_on: '2026-07-18',
            type: 'expense',
            amount: 500_000,
            is_debt_flow: true,
          }),
        ],
      }),
    )
    const hit = out.find((n) => n.type === 'monthly-summary')
    expect(hit?.title).toContain('chi 182000')
    expect(hit?.title).toContain('thu 280000')
    expect(hit?.detail).toContain('98000')
  })

  // Người dùng thật của app chạy ví JPY + chuyển tiền VND. Cộng thẳng 8.000.000 ₫
  // vào 182.000 ¥ ra "chi ¥8.182.000" — số vô nghĩa, lại vênh hẳn với trang Báo cáo.
  it('nhiều loại tiền thì quy đổi về base trước khi cộng', () => {
    const out = rhythmRules(
      input({
        todayISO: '2026-08-01',
        base: 'JPY',
        rates: { VND: 160 }, // 1 ¥ = 160 ₫
        currencyOf: (id) => (id === 'accVND' ? 'VND' : 'JPY'),
        recentTxs: [
          tx({ id: 't1', occurred_on: '2026-07-10', type: 'expense', amount: 182_000 }),
          tx({
            id: 't2',
            occurred_on: '2026-07-20',
            type: 'expense',
            amount: 8_000_000,
            account_id: 'accVND',
          }),
        ],
      }),
    )
    const hit = out.find((n) => n.type === 'monthly-summary')
    // 8.000.000 ₫ / 160 = 50.000 ¥ → tổng chi = 232.000 ¥ (KHÔNG phải 8.182.000)
    expect(hit?.title).toBe('Tháng 7: chi 232000, thu 0')
    expect(hit?.detail).toBe('Để dành -232000')
  })

  it('thiếu tỷ giá cho một loại tiền thì IM, không đăng tổng sai', () => {
    const out = rhythmRules(
      input({
        todayISO: '2026-08-01',
        base: 'JPY',
        rates: {}, // không có tỷ giá VND
        currencyOf: (id) => (id === 'accVND' ? 'VND' : 'JPY'),
        recentTxs: [
          tx({ id: 't1', occurred_on: '2026-07-10', type: 'expense', amount: 182_000 }),
          tx({
            id: 't2',
            occurred_on: '2026-07-20',
            type: 'expense',
            amount: 8_000_000,
            account_id: 'accVND',
          }),
        ],
      }),
    )
    expect(out.filter((n) => n.type === 'monthly-summary')).toHaveLength(0)
  })

  it('chỉ một loại tiền, trùng base thì không cần tỷ giá vẫn báo', () => {
    const out = rhythmRules(
      input({
        todayISO: '2026-08-01',
        rates: {},
        recentTxs: [tx({ id: 't1', occurred_on: '2026-07-10', type: 'expense', amount: 5_000 })],
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
