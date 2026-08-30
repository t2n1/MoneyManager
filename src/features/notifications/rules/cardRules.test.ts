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
    is_liquid: null,
    cash_account_id: null,
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
    last_reconciled_at: null,
    market_value: null,
    balance: -12_000,
  }
}

function input(
  todayISO: string,
  accounts: AccountBalanceRow[],
  monthStartDay = 1,
): NotificationInput {
  return {
    todayISO,
    monthStartDay,
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

  // GHIM chỗ CỐ Ý lệch khỏi mục B của spec (xem đầu cardRules.ts): kỳ sao kê là của nhà
  // phát hành thẻ nên mã dùng tháng dương lịch, KHÔNG dùng MonthKey theo month_start_day.
  // Không có phép thử này thì một lần "dọn cho nhất quán" sang monthKeyForDate vẫn xanh
  // hết, mà mọi mã đã tắt của người dùng hiện tại thì đổi hết — tin đã tắt sống lại.
  it('month_start_day = 25 thì mã VẪN theo tháng dương lịch, không theo MonthKey', () => {
    // Ngày 2026-07-10 với month_start_day = 25 nằm trong kỳ MonthKey **2026-06**
    // (25/06 → 24/07), nên hai cách đánh mã ra hai giá trị KHÁC nhau ở đây. Mã đúng là
    // 2026-07 — tháng dương lịch. Đây chính là ca mà một lần refactor sang
    // monthKeyForDate sẽ làm đổi mã, và test cũ (toàn monthStartDay = 1) không thấy.
    const out = cardRules(input('2026-07-10', [card({ id: 'c', statement_day: 10 })], 25))
    expect(out).toHaveLength(1)
    expect(out[0].key).toBe('card-statement-day:c:2026-07')
  })

  it('mã không phụ thuộc month_start_day chút nào', () => {
    const a = cardRules(input('2026-07-10', [card({ id: 'c', statement_day: 10 })], 1))
    const b = cardRules(input('2026-07-10', [card({ id: 'c', statement_day: 10 })], 25))
    expect(a.map((n) => n.key)).toEqual(b.map((n) => n.key))
  })
})
