import { describe, expect, it } from 'vitest'
import { tripRules } from './tripRules'
import type { NotificationInput } from '../types'
import type { TransactionRow, TripRow } from '../../../types/database.types'
import { addDaysISO } from '../../../lib/dates'

const TODAY = '2026-09-05'

const tx = (occurred_on: string): TransactionRow =>
  ({
    id: Math.random().toString(36),
    type: 'expense',
    amount: 1000,
    account_id: 'a1',
    category_id: 'c1',
    occurred_on,
    ...{},
  }) as TransactionRow

let seq = 0
const trip = (p: Partial<TripRow> & Pick<TripRow, 'start_on' | 'end_on'>): TripRow => ({
  id: `tr${seq++}`,
  user_id: 'u',
  label: '',
  country: 'VN',
  dismissed: false,
  created_at: '',
  ...p,
})

/** 60 ngày gần nhất có giao dịch mỗi ngày, TRỪ dải 20 → 14 ngày trước (7 ngày trống). */
function recentTxsVoiDaiTrong(): TransactionRow[] {
  const out: TransactionRow[] = []
  for (let i = 0; i <= 60; i++) {
    const iso = addDaysISO(TODAY, -i)
    if (i >= 14 && i <= 20) continue
    out.push(tx(iso))
  }
  return out
}

const input = (p: Partial<NotificationInput>): NotificationInput =>
  ({
    todayISO: TODAY,
    monthStartDay: 1,
    base: 'JPY',
    rates: {},
    formatMoney: (m: number) => String(m),
    currencyOf: () => 'JPY',
    accounts: [],
    categories: [],
    debts: [],
    recurringRules: [],
    savingsGoals: [],
    networthSnapshots: [],
    recentTxs: recentTxsVoiDaiTrong(),
    trips: [],
    offTypes: [],
    ...p,
  }) as NotificationInput

describe('tripRules', () => {
  it('dải 7 ngày trống đã đóng → đúng 1 việc-cần-làm, trỏ về tab Dài hạn', () => {
    const n = tripRules(input({}))
    expect(n).toHaveLength(1)
    expect(n[0].type).toBe('trip-gap')
    expect(n[0].kind).toBe('action')
    expect(n[0].severity).toBe('low')
    expect(n[0].to).toBe('/reports?view=long')
    expect(n[0].key).toBe(`trip-gap:${addDaysISO(TODAY, -20)}`)
    expect(n[0].title).toContain('7 ngày không có giao dịch nào')
  })

  it('trips chưa tải (undefined) → im lặng, không đoán', () => {
    expect(tripRules(input({ trips: undefined }))).toEqual([])
  })

  it('dải đã có hàng trips phủ (kể cả dismissed) → im', () => {
    const daXet = [
      trip({ start_on: addDaysISO(TODAY, -20), end_on: addDaysISO(TODAY, -14), dismissed: true }),
    ]
    expect(tripRules(input({ trips: daXet }))).toEqual([])
  })

  it('không có dải nào → im', () => {
    const dayDu: TransactionRow[] = []
    for (let i = 0; i <= 60; i++) dayDu.push(tx(addDaysISO(TODAY, -i)))
    expect(tripRules(input({ recentTxs: dayDu }))).toEqual([])
  })
})
