import { describe, expect, it } from 'vitest'
import type { PlannedExpenseRow } from '../../../types/database.types'
import type { NotificationInput } from '../types'
import { plannedRules } from './plannedRules'
import { dueSoonCount, todoBadge } from '../../bulletin/todoView'

const plan = (over: Partial<PlannedExpenseRow> = {}): PlannedExpenseRow => ({
  id: 'p1',
  user_id: 'u',
  title: 'Sửa nhà',
  amount: 50_000,
  currency: 'JPY',
  due_on: '2026-09-01',
  due_precision: 'month',
  remind_days_before: 3,
  category_id: null,
  account_id: null,
  status: 'planned',
  transaction_id: null,
  note: '',
  created_at: '',
  updated_at: '',
  ...over,
})

function input(rows: PlannedExpenseRow[], todayISO: string): NotificationInput {
  return {
    todayISO,
    monthStartDay: 1,
    base: 'JPY',
    rates: {},
    formatMoney: (m) => String(m),
    currencyOf: () => 'JPY',
    accounts: [],
    categories: [],
    debts: [],
    recurringRules: [],
    savingsGoals: [],
    networthSnapshots: [],
    recentTxs: [],
    offTypes: [],
    plannedExpenses: rows,
  }
}

describe('planned-due — khoản chỉ biết tháng', () => {
  // Ca đã gặp: hôm nay 23/9, khoản "tháng 9" lưu due_on = 1/9. Tiêu đề nói "Trong
  // tháng 9…" mà nhãn Việc cần làm lại đỏ "QUÁ HẠN" vì tính từ ngày 1.
  it('giữa tháng: không quá hạn, nhãn nói THÁNG, không phải QUÁ HẠN', () => {
    const [n] = plannedRules(input([plan()], '2026-09-23'))
    expect(n.title).toContain('Trong tháng 9')
    expect(n.onISO).toBe('2026-09-30')
    expect(n.onPrecision).toBe('month')
    expect(todoBadge(n, '2026-09-10')).toEqual({ text: 'THÁNG 9', urgent: false })
    expect(todoBadge(n, '2026-09-23')).toEqual({ text: 'THÁNG 9', urgent: true })
  })

  it('đầu tháng: chưa vào "có hạn trong tuần"; tuần cuối tháng thì vào', () => {
    const [n] = plannedRules(input([plan()], '2026-09-05'))
    expect(dueSoonCount([n], '2026-09-05')).toBe(0)
    expect(dueSoonCount([n], '2026-09-23')).toBe(1)
  })

  it('cả tháng đã qua mới là QUÁ HẠN', () => {
    const [n] = plannedRules(input([plan()], '2026-10-02'))
    expect(n.severity).toBe('high')
    expect(n.onISO).toBe('2026-09-30')
    expect(todoBadge(n, '2026-10-02')).toEqual({ text: 'QUÁ HẠN', urgent: true })
  })

  it('khoản có ngày giữ nguyên hạn và không có onPrecision', () => {
    const [n] = plannedRules(
      input([plan({ due_on: '2026-09-25', due_precision: 'day' })], '2026-09-23'),
    )
    expect(n.onISO).toBe('2026-09-25')
    expect(n.onPrecision).toBeUndefined()
    expect(todoBadge(n, '2026-09-23')).toEqual({ text: '2 NGÀY', urgent: true })
  })
})
