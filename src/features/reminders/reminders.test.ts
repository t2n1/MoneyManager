import { describe, expect, it } from 'vitest'
import { buildReminders, diffDays } from './reminders'
import type { DebtRow } from '../../types/database.types'

const debt = (p: Partial<DebtRow>): DebtRow => ({
  id: Math.random().toString(36).slice(2),
  user_id: 'u',
  counterparty: 'X',
  direction: 'i_owe',
  currency: 'JPY',
  principal: 1000,
  due_on: null,
  status: 'open',
  note: '',
  interest_bps: null,
  term_months: null,
  disbursement_transaction_id: null,
  created_at: '',
  updated_at: '',
  ...p,
})

describe('diffDays', () => {
  it('đếm đúng số ngày', () => {
    expect(diffDays('2026-07-01', '2026-07-08')).toBe(7)
    expect(diffDays('2026-07-10', '2026-07-08')).toBe(-2)
  })
})

describe('buildReminders', () => {
  const base = { todayISO: '2026-07-20', overBudgetCount: 0, lastTxISO: '2026-07-20' as string | null }

  it('nợ quá hạn + sắp đến hạn tách nhau', () => {
    const r = buildReminders({
      ...base,
      debts: [
        debt({ due_on: '2026-07-10' }), // quá hạn
        debt({ due_on: '2026-07-23' }), // sắp đến hạn (trong 7 ngày)
        debt({ due_on: '2026-09-01' }), // còn xa → bỏ qua
      ],
    })
    expect(r.find((x) => x.id === 'debt-overdue')?.message).toContain('1')
    expect(r.find((x) => x.id === 'debt-due-soon')?.message).toContain('1')
  })

  it('bỏ qua nợ đã tất toán', () => {
    const r = buildReminders({
      ...base,
      debts: [debt({ due_on: '2026-07-10', status: 'settled' })],
    })
    expect(r).toHaveLength(0)
  })

  it('vượt ngân sách + quên ghi sổ', () => {
    const r = buildReminders({
      ...base,
      debts: [],
      overBudgetCount: 2,
      lastTxISO: '2026-07-15', // 5 ngày trước
    })
    expect(r.find((x) => x.id === 'budget-over')?.message).toContain('2')
    expect(r.find((x) => x.id === 'stale')?.message).toContain('5 ngày')
  })

  it('mới ghi sổ hôm nay thì không nhắc quên', () => {
    const r = buildReminders({ ...base, debts: [], lastTxISO: '2026-07-20' })
    expect(r.find((x) => x.id === 'stale')).toBeUndefined()
  })
})
