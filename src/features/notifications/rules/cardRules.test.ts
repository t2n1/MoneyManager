import { describe, expect, it } from 'vitest'
import { cardRules } from './cardRules'
import type { NotificationInput } from '../types'
import type { AccountBalanceRow } from '../../../types/database.types'

function card(over: Partial<AccountBalanceRow> & { id: string }): AccountBalanceRow {
  return {
    id: over.id,
    user_id: 'u',
    name: over.name ?? 'Thẻ PayPay',
    type: 'card',
    currency: 'JPY',
    asset_group: null,
    is_hidden: false,
    include_in_totals: true,
    credit_limit: null,
    statement_day: over.statement_day !== undefined ? over.statement_day : 31,
    payment_due_day: 27,
    payment_account_id: null,
    is_archived: over.is_archived ?? false,
    sort_order: 0,
    cost_basis: 0,
    depreciation_months: null,
    depreciation_from: null,
    salvage_value: 0,
    tax_shelter: null,
    shelter_annual_limit: null,
    market_value: null,
    balance: -12_000,
  }
}

function input(todayISO: string, accounts: AccountBalanceRow[]): NotificationInput {
  return {
    todayISO,
    monthStartDay: 1,
    base: 'JPY',
    rates: {},
    formatMoney: (m) => String(m),
    currencyOf: () => 'JPY',
    accounts,
    categories: [],
    debts: [],
    recurringRules: [],
    budgetReport: undefined,
    savingsGoals: [],
    networthSnapshots: [],
    recentTxs: [],
    offTypes: [],
  }
}

describe('card-statement-day', () => {
  it('đúng ngày chốt thì báo', () => {
    const out = cardRules(input('2026-07-31', [card({ id: 'c', statement_day: 31 })]))
    expect(out).toHaveLength(1)
    expect(out[0].key).toBe('card-statement-day:c:2026-07')
    expect(out[0].kind).toBe('info')
    expect(out[0].title).toContain('PayPay')
  })

  it('một ngày trước ngày chốt thì chưa báo', () => {
    expect(cardRules(input('2026-07-30', [card({ id: 'c', statement_day: 31 })]))).toHaveLength(0)
  })

  it('một ngày sau ngày chốt thì thôi', () => {
    expect(cardRules(input('2026-08-01', [card({ id: 'c', statement_day: 31 })]))).toHaveLength(0)
  })

  it('ngày chốt 31 ở tháng 2 thì kẹp về ngày cuối tháng', () => {
    const out = cardRules(input('2026-02-28', [card({ id: 'c', statement_day: 31 })]))
    expect(out).toHaveLength(1)
    expect(out[0].key).toBe('card-statement-day:c:2026-02')
  })

  it('thẻ chưa khai ngày chốt thì bỏ qua', () => {
    expect(cardRules(input('2026-07-31', [card({ id: 'c', statement_day: null })]))).toHaveLength(0)
  })

  it('thẻ đã lưu trữ thì bỏ qua', () => {
    const out = cardRules(input('2026-07-31', [card({ id: 'c', is_archived: true })]))
    expect(out).toHaveLength(0)
  })

  it('mã ổn định qua hai lần gọi', () => {
    const arg = input('2026-07-31', [card({ id: 'c' })])
    expect(cardRules(arg).map((n) => n.key)).toEqual(cardRules(arg).map((n) => n.key))
  })
})
