import { describe, expect, it } from 'vitest'
import type { AccountBalanceRow, SavingsGoalRow } from '../../types/database.types'
import type { Rates } from '../../lib/rates'
import { earmarkedForGoals } from './earmarked'

const RATES: Rates = { JPY: 1, VND: 165 }

let seq = 0
const bal = (
  p: Partial<AccountBalanceRow> & Pick<AccountBalanceRow, 'id' | 'balance'>,
): AccountBalanceRow =>
  ({
    user_id: 'u',
    name: 'TK',
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
    ...p,
  }) as AccountBalanceRow

const goal = (account_id: string, target_amount: number): SavingsGoalRow => ({
  id: `g${seq++}`,
  user_id: 'u',
  name: 'Mục tiêu',
  account_id,
  target_amount,
  target_date: null,
  note: '',
  sort_order: 0,
  created_at: '',
})

describe('earmarkedForGoals', () => {
  it('không có mục tiêu → 0', () => {
    expect(earmarkedForGoals([], [bal({ id: 'a', balance: 100 })], 'JPY', RATES).total).toBe(0)
  })

  it('đã để dành ít hơn đích → chỉ tính phần thực có', () => {
    const r = earmarkedForGoals(
      [goal('a', 500_000)],
      [bal({ id: 'a', balance: 200_000 })],
      'JPY',
      RATES,
    )
    expect(r.total).toBe(200_000)
  })

  it('số dư vượt đích → chỉ giữ chỗ đúng phần đích cần', () => {
    const r = earmarkedForGoals(
      [goal('a', 300_000)],
      [bal({ id: 'a', balance: 900_000 })],
      'JPY',
      RATES,
    )
    expect(r.total).toBe(300_000)
  })

  it('hai mục tiêu cùng một tài khoản không được cộng quá số dư', () => {
    const r = earmarkedForGoals(
      [goal('a', 400_000), goal('a', 400_000)],
      [bal({ id: 'a', balance: 500_000 })],
      'JPY',
      RATES,
    )
    expect(r.total).toBe(500_000)
  })

  it('bỏ qua mục tiêu gắn tài khoản KHÔNG lỏng — tiền đó vốn không nằm trong quỹ dự phòng', () => {
    const r = earmarkedForGoals(
      [goal('inv', 1_000_000)],
      [bal({ id: 'inv', balance: 2_000_000, type: 'investment' })],
      'JPY',
      RATES,
    )
    expect(r.total).toBe(0)
  })

  it('bỏ qua tài khoản đã ẩn / không tính vào tổng — khớp với cách tính tài sản lỏng', () => {
    const hidden = earmarkedForGoals(
      [goal('a', 100_000)],
      [bal({ id: 'a', balance: 100_000, is_hidden: true })],
      'JPY',
      RATES,
    )
    expect(hidden.total).toBe(0)

    const excluded = earmarkedForGoals(
      [goal('a', 100_000)],
      [bal({ id: 'a', balance: 100_000, include_in_totals: false })],
      'JPY',
      RATES,
    )
    expect(excluded.total).toBe(0)
  })

  it('số dư âm không tạo ra khoản giữ chỗ âm', () => {
    const r = earmarkedForGoals(
      [goal('a', 100_000)],
      [bal({ id: 'a', balance: -50_000 })],
      'JPY',
      RATES,
    )
    expect(r.total).toBe(0)
  })

  it('quy đổi ngoại tệ; thiếu tỷ giá thì đánh dấu chứ không âm thầm bỏ', () => {
    const ok = earmarkedForGoals(
      [goal('a', 1_650_000)],
      [bal({ id: 'a', balance: 1_650_000, currency: 'VND' })],
      'JPY',
      RATES,
    )
    expect(ok.total).toBe(10_000)

    const missing = earmarkedForGoals(
      [goal('a', 100)],
      [bal({ id: 'a', balance: 100, currency: 'USD' })],
      'JPY',
      { JPY: 1 },
    )
    expect(missing.hasMissingRate).toBe(true)
    expect(missing.total).toBe(0)
  })

  it('mục tiêu trỏ tới tài khoản đã xoá thì bỏ qua', () => {
    const r = earmarkedForGoals([goal('khong-co', 100_000)], [], 'JPY', RATES)
    expect(r.total).toBe(0)
  })
})
