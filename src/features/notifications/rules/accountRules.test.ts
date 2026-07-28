import { describe, expect, it } from 'vitest'
import { accountRules } from './accountRules'
import type { NotificationInput } from '../types'
import type { AccountBalanceRow, RecurringRuleRow } from '../../../types/database.types'

const fmt = (minor: number) => String(minor)

function account(over: Partial<AccountBalanceRow> & { id: string }): AccountBalanceRow {
  return {
    id: over.id,
    user_id: 'u',
    name: over.name ?? 'Ví',
    type: over.type ?? 'bank',
    currency: over.currency ?? 'JPY',
    asset_group: null,
    is_hidden: false,
    include_in_totals: true,
    credit_limit: over.credit_limit ?? null,
    statement_day: over.statement_day ?? null,
    payment_due_day: over.payment_due_day ?? null,
    payment_account_id: over.payment_account_id ?? null,
    is_archived: false,
    sort_order: 0,
    cost_basis: 0,
    depreciation_months: null,
    depreciation_from: null,
    salvage_value: 0,
    tax_shelter: null,
    shelter_annual_limit: null,
    market_value: null,
    balance: over.balance ?? 0,
  }
}

function rule(over: Partial<RecurringRuleRow> & { id: string }): RecurringRuleRow {
  return {
    id: over.id,
    user_id: 'u',
    type: over.type ?? 'expense',
    amount: over.amount ?? 0,
    to_amount: null,
    category_id: null,
    account_id: over.account_id ?? 'acc',
    to_account_id: null,
    note: over.note ?? '',
    frequency: over.frequency ?? 'monthly',
    start_on: over.start_on ?? '2026-07-30',
    end_on: null,
    is_paused: over.is_paused ?? false,
    last_generated_on: over.last_generated_on ?? '2026-06-30',
    created_at: '',
    updated_at: '',
  }
}

function input(over: Partial<NotificationInput>): NotificationInput {
  return {
    todayISO: '2026-07-28',
    monthStartDay: 1,
    base: 'JPY',
    rates: {},
    formatMoney: fmt,
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

describe('account-negative', () => {
  it('ví ngân hàng âm thì báo', () => {
    const out = accountRules(input({ accounts: [account({ id: 'a', balance: -1200 })] }))
    expect(out.map((n) => n.type)).toContain('account-negative')
    expect(out.find((n) => n.type === 'account-negative')?.key).toBe('account-negative:a')
  })

  it('số dư đúng bằng 0 thì không báo', () => {
    const out = accountRules(input({ accounts: [account({ id: 'a', balance: 0 })] }))
    expect(out.filter((n) => n.type === 'account-negative')).toHaveLength(0)
  })

  it('thẻ tín dụng âm là bình thường, không báo', () => {
    const out = accountRules(
      input({ accounts: [account({ id: 'c', type: 'card', balance: -50_000 })] }),
    )
    expect(out.filter((n) => n.type === 'account-negative')).toHaveLength(0)
  })

  it('tài khoản đầu tư âm không báo (giá trị thị trường không phải tiền chi được)', () => {
    const out = accountRules(
      input({ accounts: [account({ id: 'i', type: 'investment', balance: -10 })] }),
    )
    expect(out.filter((n) => n.type === 'account-negative')).toHaveLength(0)
  })
})

describe('account-shortfall', () => {
  const source = account({ id: 'src', name: 'Rakuten Bank', balance: 40_000 })
  // Thẻ nợ 45.000, trả ngày 27 hằng tháng → ngày trả kế tiếp 2026-08-27 (còn 30 ngày)
  const farCard = account({
    id: 'card1',
    name: 'Thẻ Rakuten',
    type: 'card',
    balance: -45_000,
    payment_due_day: 27,
    payment_account_id: 'src',
  })
  // Thẻ trả ngày 5 → ngày trả kế tiếp 2026-08-05 (còn 8 ngày, trong tầm 14 ngày)
  const nearCard = account({
    id: 'card2',
    name: 'Thẻ PayPay',
    type: 'card',
    balance: -45_000,
    payment_due_day: 5,
    payment_account_id: 'src',
  })

  it('thẻ đến hạn trong 14 ngày mà nguồn không đủ thì báo', () => {
    const out = accountRules(input({ accounts: [source, nearCard] }))
    const hit = out.find((n) => n.type === 'account-shortfall')
    expect(hit?.key).toBe('account-shortfall:src')
    expect(hit?.title).toContain('Rakuten Bank')
  })

  it('thẻ đến hạn ngoài 14 ngày thì chưa báo', () => {
    const out = accountRules(input({ accounts: [source, farCard] }))
    expect(out.filter((n) => n.type === 'account-shortfall')).toHaveLength(0)
  })

  it('nguồn đủ tiền thì không báo', () => {
    const rich = account({ id: 'src', name: 'Rakuten Bank', balance: 90_000 })
    const out = accountRules(input({ accounts: [rich, nearCard] }))
    expect(out.filter((n) => n.type === 'account-shortfall')).toHaveLength(0)
  })

  it('đủ sát nút (thiếu 0đ) thì không báo', () => {
    const exact = account({ id: 'src', name: 'Rakuten Bank', balance: 45_000 })
    const out = accountRules(input({ accounts: [exact, nearCard] }))
    expect(out.filter((n) => n.type === 'account-shortfall')).toHaveLength(0)
  })

  it('cộng quy tắc định kỳ CHI trong 14 ngày vào phần phải trả', () => {
    const rich = account({ id: 'src', name: 'Rakuten Bank', balance: 50_000 })
    const rent = rule({
      id: 'r1',
      type: 'expense',
      amount: 17_000,
      account_id: 'src',
      note: 'Tiền nhà',
      start_on: '2026-08-01',
      last_generated_on: '2026-07-01',
    })
    const out = accountRules(input({ accounts: [rich, nearCard], recurringRules: [rent] }))
    const hit = out.find((n) => n.type === 'account-shortfall')
    expect(hit).toBeDefined()
    expect(hit?.detail).toContain('Tiền nhà')
  })

  it('trừ quy tắc định kỳ THU trong 14 ngày (không báo động giả trước kỳ lương)', () => {
    const salary = rule({
      id: 'r2',
      type: 'income',
      amount: 280_000,
      account_id: 'src',
      note: 'Lương',
      start_on: '2026-08-01',
      last_generated_on: '2026-07-01',
    })
    const out = accountRules(input({ accounts: [source, nearCard], recurringRules: [salary] }))
    expect(out.filter((n) => n.type === 'account-shortfall')).toHaveLength(0)
  })

  it('quy tắc đang tạm dừng thì không tính', () => {
    const rich = account({ id: 'src', name: 'Rakuten Bank', balance: 50_000 })
    const paused = rule({
      id: 'r3',
      type: 'expense',
      amount: 17_000,
      account_id: 'src',
      is_paused: true,
      start_on: '2026-08-01',
      last_generated_on: '2026-07-01',
    })
    const out = accountRules(input({ accounts: [rich, nearCard], recurringRules: [paused] }))
    expect(out.filter((n) => n.type === 'account-shortfall')).toHaveLength(0)
  })

  it('mã ổn định qua hai lần gọi', () => {
    const a = accountRules(input({ accounts: [source, nearCard] })).map((n) => n.key)
    const b = accountRules(input({ accounts: [source, nearCard] })).map((n) => n.key)
    expect(a).toEqual(b)
  })
})
