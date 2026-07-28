import { describe, expect, it } from 'vitest'
import { debtRules } from './debtRules'
import type { NotificationInput } from '../types'
import type { DebtRow } from '../../../types/database.types'

function debt(over: Partial<DebtRow> & { id: string }): DebtRow {
  return {
    id: over.id,
    user_id: 'u',
    counterparty: over.counterparty ?? 'Anh Tuấn',
    direction: over.direction ?? 'owed_to_me',
    currency: over.currency ?? 'JPY',
    principal: over.principal ?? 50_000,
    due_on: over.due_on ?? null,
    status: over.status ?? 'open',
    note: '',
    interest_bps: null,
    term_months: null,
    disbursement_transaction_id: null,
    created_at: '',
    updated_at: '',
  }
}

function input(debts: DebtRow[]): NotificationInput {
  return {
    todayISO: '2026-07-28',
    monthStartDay: 1,
    base: 'JPY',
    rates: {},
    formatMoney: (m) => String(m),
    currencyOf: () => 'JPY',
    accounts: [],
    categories: [],
    debts,
    recurringRules: [],
    budgetReport: undefined,
    savingsGoals: [],
    networthSnapshots: [],
    recentTxs: [],
    offTypes: [],
  }
}

describe('debtRules', () => {
  it('quá hạn thì báo mức cao', () => {
    const out = debtRules(input([debt({ id: 'd1', due_on: '2026-07-22' })]))
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('debt-overdue')
    expect(out[0].severity).toBe('high')
    expect(out[0].key).toBe('debt-overdue:d1')
    expect(out[0].title).toContain('6 ngày')
  })

  it('đến hạn đúng hôm nay tính là sắp đến hạn, không phải quá hạn', () => {
    const out = debtRules(input([debt({ id: 'd1', due_on: '2026-07-28' })]))
    expect(out[0].type).toBe('debt-due-soon')
  })

  it('còn đúng 7 ngày thì vẫn báo sắp đến hạn', () => {
    const out = debtRules(input([debt({ id: 'd1', due_on: '2026-08-04' })]))
    expect(out[0].type).toBe('debt-due-soon')
  })

  it('còn 8 ngày thì chưa báo', () => {
    const out = debtRules(input([debt({ id: 'd1', due_on: '2026-08-05' })]))
    expect(out).toHaveLength(0)
  })

  it('khoản đã tất toán thì không báo', () => {
    const out = debtRules(input([debt({ id: 'd1', due_on: '2026-07-01', status: 'settled' })]))
    expect(out).toHaveLength(0)
  })

  it('khoản không đặt hạn thì không báo', () => {
    const out = debtRules(input([debt({ id: 'd1', due_on: null })]))
    expect(out).toHaveLength(0)
  })

  it('hai khoản quá hạn thì vẫn là hai dòng riêng', () => {
    const out = debtRules(
      input([debt({ id: 'd1', due_on: '2026-07-20' }), debt({ id: 'd2', due_on: '2026-07-21' })]),
    )
    expect(out.filter((n) => n.type === 'debt-overdue')).toHaveLength(2)
  })

  it('ba khoản quá hạn thì gộp thành một dòng', () => {
    const out = debtRules(
      input([
        debt({ id: 'd1', due_on: '2026-07-20' }),
        debt({ id: 'd2', due_on: '2026-07-21' }),
        debt({ id: 'd3', due_on: '2026-07-22' }),
      ]),
    )
    const overdue = out.filter((n) => n.type === 'debt-overdue')
    expect(overdue).toHaveLength(1)
    expect(overdue[0].key).toBe('debt-overdue:group')
    expect(overdue[0].title).toContain('3 khoản')
  })

  it('gộp riêng từng loại: 3 quá hạn + 1 sắp đến hạn', () => {
    const out = debtRules(
      input([
        debt({ id: 'd1', due_on: '2026-07-20' }),
        debt({ id: 'd2', due_on: '2026-07-21' }),
        debt({ id: 'd3', due_on: '2026-07-22' }),
        debt({ id: 'd4', due_on: '2026-07-30' }),
      ]),
    )
    expect(out.filter((n) => n.type === 'debt-overdue')).toHaveLength(1)
    expect(out.filter((n) => n.type === 'debt-due-soon')).toHaveLength(1)
    expect(out.find((n) => n.type === 'debt-due-soon')?.key).toBe('debt-due-soon:d4')
  })

  it('mã ổn định qua hai lần gọi', () => {
    const arg = input([debt({ id: 'd1', due_on: '2026-07-20' })])
    expect(debtRules(arg).map((n) => n.key)).toEqual(debtRules(arg).map((n) => n.key))
  })
})
