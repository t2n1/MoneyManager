import { describe, expect, it } from 'vitest'
import { priceStepRules } from './priceStepRules'
import type { NotificationInput } from '../types'
import type { RecurringRuleRow, TransactionRow } from '../../../types/database.types'

let seq = 0
const tx = (amount: number, occurred_on: string): TransactionRow =>
  ({
    id: `t${seq++}`,
    user_id: 'u',
    type: 'expense',
    amount,
    to_amount: null,
    category_id: 'nha',
    account_id: 'a1',
    to_account_id: null,
    recurring_rule_id: 'r1',
    occurred_on,
    note: '',
    created_at: '',
    updated_at: '',
  }) as TransactionRow

const RULE = {
  id: 'r1',
  user_id: 'u',
  type: 'expense',
  amount: 112_760,
  to_amount: null,
  category_id: 'nha',
  account_id: 'a1',
  to_account_id: null,
  note: 'Tiền nhà',
  frequency: 'monthly',
  start_on: '2026-05-01',
  end_on: null,
  is_paused: false,
  is_refund: false,
} as RecurringRuleRow

const input = (p: Partial<NotificationInput>): NotificationInput =>
  ({
    todayISO: '2026-09-05',
    monthStartDay: 1,
    base: 'JPY',
    rates: { JPY: 1 },
    formatMoney: (m: number) => `¥${m}`,
    currencyOf: () => 'JPY',
    accounts: [],
    categories: [{ id: 'nha', icon: '🔑' }],
    debts: [],
    recurringRules: [RULE],
    savingsGoals: [],
    networthSnapshots: [],
    recentTxs: [],
    offTypes: [],
    ...p,
  }) as unknown as NotificationInput

/** 2×62.760 rồi 2×112.760, cả bốn nằm trong cửa sổ 90 ngày. */
const inputVoiBac = () =>
  input({
    recentTxs: [
      tx(62_760, '2026-06-01'),
      tx(62_760, '2026-07-01'),
      tx(112_760, '2026-08-01'),
      tx(112_760, '2026-09-01'),
    ],
  })

describe('priceStepRules', () => {
  it('bậc trong cửa sổ → 1 tin info, key mang ngày đổi', () => {
    const n = priceStepRules(inputVoiBac())
    expect(n).toHaveLength(1)
    expect(n[0].kind).toBe('info')
    expect(n[0].type).toBe('price-step')
    expect(n[0].severity).toBe('low')
    expect(n[0].key).toBe('price-step:Tiền nhà:2026-08-01')
    expect(n[0].title).toBe('Tiền nhà đổi giá: ¥62760 → ¥112760')
    expect(n[0].detail).toContain('Nặng thêm')
    expect(n[0].to).toBe('/reports?view=long')
  })

  it('giảm giá → "Nhẹ đi"', () => {
    const n = priceStepRules(
      input({
        recentTxs: [
          tx(112_760, '2026-06-01'),
          tx(112_760, '2026-07-01'),
          tx(62_760, '2026-08-01'),
          tx(62_760, '2026-09-01'),
        ],
      }),
    )
    expect(n).toHaveLength(1)
    expect(n[0].detail).toContain('Nhẹ đi')
  })

  it('không bậc → im', () => {
    const n = priceStepRules(
      input({ recentTxs: [tx(62_760, '2026-08-01'), tx(62_760, '2026-09-01')] }),
    )
    expect(n).toEqual([])
  })
})
