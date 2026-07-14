// Tổng hợp số liệu cho báo cáo — thuần, không phụ thuộc React, để unit-test được.
// Mọi số tiền quy đổi về base currency qua convertToBase; thiếu tỷ giá → hasMissingRate.

import { monthKeyForDate, type MonthKey } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'

export type CurrencyOf = (accountId: string) => CurrencyCode

export interface CategorySlice {
  categoryId: string
  /** minor units theo base currency */
  amount: number
}

export interface Breakdown {
  slices: CategorySlice[]
  total: number
  hasForeign: boolean
  hasMissingRate: boolean
}

/** Tổng thu (hoặc chi) theo danh mục, đã quy đổi base, sắp xếp giảm dần. */
export function categoryBreakdown(
  txs: TransactionRow[],
  kind: 'expense' | 'income',
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): Breakdown {
  const map = new Map<string, number>()
  let total = 0
  let hasForeign = false
  let hasMissingRate = false
  for (const t of txs) {
    if (t.type !== kind || !t.category_id) continue
    const cur = currencyOf(t.account_id)
    if (cur !== base) hasForeign = true
    const v = convertToBase(t.amount, cur, base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    map.set(t.category_id, (map.get(t.category_id) ?? 0) + v)
    total += v
  }
  const slices = [...map.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((a, b) => b.amount - a.amount)
  return { slices, total, hasForeign, hasMissingRate }
}

export interface MonthlyPoint {
  key: MonthKey
  income: number
  expense: number
}

export interface MonthlySeries {
  points: MonthlyPoint[]
  hasMissingRate: boolean
}

const monthId = (k: MonthKey) => `${k.year}-${k.month}`

/**
 * Chuỗi thu/chi theo từng tháng trong danh sách `months` (đã quy đổi base).
 * Chuyển khoản KHÔNG tính (quyết định thiết kế #2).
 */
export function monthlySeries(
  txs: TransactionRow[],
  months: MonthKey[],
  monthStartDay: number,
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): MonthlySeries {
  const income = new Map<string, number>()
  const expense = new Map<string, number>()
  let hasMissingRate = false
  for (const t of txs) {
    if (t.type === 'transfer') continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    const id = monthId(monthKeyForDate(t.occurred_on, monthStartDay))
    const target = t.type === 'income' ? income : expense
    target.set(id, (target.get(id) ?? 0) + v)
  }
  const points = months.map((key) => ({
    key,
    income: income.get(monthId(key)) ?? 0,
    expense: expense.get(monthId(key)) ?? 0,
  }))
  return { points, hasMissingRate }
}
