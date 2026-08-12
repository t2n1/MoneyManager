import { describe, expect, it } from 'vitest'
import type { RecurringRuleRow } from '../../../types/database.types'
import type { NotificationInput } from '../types'
import { billRules } from './billRules'

function rule(over: Partial<RecurringRuleRow> = {}): RecurringRuleRow {
  return {
    id: 'r1',
    user_id: 'u',
    type: 'expense',
    amount: 30_000,
    to_amount: null,
    category_id: 'c1',
    account_id: 'a1',
    to_account_id: null,
    note: 'Gửi tiền cho má',
    frequency: 'monthly',
    start_on: '2026-05-10',
    end_on: null,
    is_paused: false,
    is_refund: false,
    last_generated_on: null,
    mode: 'remind',
    remind_days_before: 0,
    created_at: '',
    updated_at: '',
    ...over,
  }
}

function input(rules: RecurringRuleRow[], todayISO = '2026-08-10'): NotificationInput {
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
    recurringRules: rules,
    savingsGoals: [],
    networthSnapshots: [],
    recentTxs: [],
    offTypes: [],
  }
}

describe('bill-due', () => {
  it('quy tắc kiểu tự ghi không sinh tin nào — app đã ghi hộ rồi', () => {
    expect(billRules(input([rule({ mode: 'auto' })]))).toEqual([])
  })

  it('quá hạn → mức đỏ, kèm tên khoản và số tiền', () => {
    // Kỳ 10/8 chưa xác nhận, hôm nay đã 15/8 → trễ 5 ngày
    const out = billRules(input([rule({ last_generated_on: '2026-07-10' })], '2026-08-15'))
    expect(out).toHaveLength(1)
    expect(out[0].detail).toContain('Quá hạn 5 ngày')
    expect(out[0].type).toBe('bill-due')
    expect(out[0].kind).toBe('action')
    expect(out[0].severity).toBe('high')
    expect(out[0].title).toContain('Gửi tiền cho má')
    expect(out[0].title).toContain('30000')
  })

  it('đúng ngày đến hạn → mức vừa, chưa phải đỏ', () => {
    const out = billRules(input([rule({ last_generated_on: '2026-07-10' })], '2026-08-10'))
    expect(out[0].severity).toBe('medium')
    expect(out[0].title).toContain('Hôm nay tới hạn')
  })

  it('sắp tới hạn (trong tầm nhắc trước) → mức thấp', () => {
    const r = rule({ last_generated_on: '2026-07-10', remind_days_before: 5 })
    const out = billRules(input([r], '2026-08-07'))
    expect(out[0].severity).toBe('low')
    expect(out[0].title).toContain('3 ngày nữa')
  })

  it('mã mang KỲ, để xác nhận xong kỳ này thì kỳ sau vẫn báo', () => {
    const r = rule({ last_generated_on: '2026-07-10' })
    expect(billRules(input([r], '2026-08-10'))[0].key).toBe('bill-due:r1:2026-08-10')
    const daXacNhan = rule({ last_generated_on: '2026-08-10' })
    expect(billRules(input([daXacNhan], '2026-09-10'))[0].key).toBe('bill-due:r1:2026-09-10')
  })

  it('link mở thẳng form đã điền sẵn theo đúng kỳ đang nợ', () => {
    const out = billRules(input([rule({ last_generated_on: '2026-07-10' })]))
    expect(out[0].to).toBe('/entry?rule=r1&on=2026-08-10')
  })

  it('nợ nhiều kỳ thì nói ra là mấy kỳ', () => {
    // Chưa xác nhận kỳ nào từ 10/5 → 10/5, 10/6, 10/7, 10/8 = 4 kỳ
    const out = billRules(input([rule()]))
    expect(out[0].detail).toContain('4 kỳ')
  })

  it('khoản chưa đặt ghi chú vẫn có tên đọc được', () => {
    const out = billRules(input([rule({ note: '   ', last_generated_on: '2026-07-10' })]))
    expect(out[0].title).toContain('Khoản định kỳ')
  })

  it('chưa tới tầm nhắc thì im hẳn', () => {
    const r = rule({ last_generated_on: '2026-07-10' })
    expect(billRules(input([r], '2026-08-01'))).toEqual([])
  })

  it('mã ổn định qua hai lần gọi', () => {
    const arg = input([rule()])
    expect(billRules(arg).map((n) => n.key)).toEqual(billRules(arg).map((n) => n.key))
  })
})
