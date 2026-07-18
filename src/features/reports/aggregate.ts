// Tổng hợp số liệu cho báo cáo — thuần, không phụ thuộc React, để unit-test được.
// Mọi số tiền quy đổi về base currency qua convertToBase; thiếu tỷ giá → hasMissingRate.

import { addMonths, monthKeyForDate, type MonthKey } from '../../lib/dates'
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

export interface IncomeExpenseSum {
  /** minor units theo base currency */
  income: number
  expense: number
  hasForeign: boolean
  hasMissingRate: boolean
}

/** Tổng thu + tổng chi (đã quy đổi base). Chuyển khoản KHÔNG tính. */
export function sumIncomeExpense(
  txs: TransactionRow[],
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): IncomeExpenseSum {
  let income = 0
  let expense = 0
  let hasForeign = false
  let hasMissingRate = false
  for (const t of txs) {
    if (t.type === 'transfer') continue
    const cur = currencyOf(t.account_id)
    if (cur !== base) hasForeign = true
    const v = convertToBase(t.amount, cur, base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    if (t.type === 'income') income += v
    else expense += v
  }
  return { income, expense, hasForeign, hasMissingRate }
}

export interface CategoryComparisonRow {
  categoryId: string
  thisMonth: number // base minor
  prevMonth: number // base minor
  avg3: number // TB tổng chi của M-1, M-2, M-3 (tháng thiếu tính 0)
  deltaPct: number | null // (thisMonth - prevMonth)/prevMonth * 100; null nếu prevMonth = 0
  isNew: boolean // prevMonth = 0 && thisMonth > 0
}

export interface CategoryComparison {
  rows: CategoryComparisonRow[] // sắp theo thisMonth giảm dần
  hasMissingRate: boolean
}

/**
 * So sánh chi theo danh mục: tháng đang xem vs tháng trước vs TB 3 tháng trước.
 * Chỉ tính expense có category_id; ▲▼% so tháng trước; avg3 là cột tham chiếu.
 */
export function categoryComparison(
  txs: TransactionRow[],
  activeMonth: MonthKey,
  monthStartDay: number,
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): CategoryComparison {
  const m0 = monthId(activeMonth)
  const m1 = monthId(addMonths(activeMonth, -1))
  const m2 = monthId(addMonths(activeMonth, -2))
  const m3 = monthId(addMonths(activeMonth, -3))
  const byCat = new Map<string, Map<string, number>>()
  let hasMissingRate = false
  for (const t of txs) {
    if (t.type !== 'expense' || !t.category_id) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    const mid = monthId(monthKeyForDate(t.occurred_on, monthStartDay))
    if (mid !== m0 && mid !== m1 && mid !== m2 && mid !== m3) continue
    const inner = byCat.get(t.category_id) ?? new Map<string, number>()
    inner.set(mid, (inner.get(mid) ?? 0) + v)
    byCat.set(t.category_id, inner)
  }
  const rows: CategoryComparisonRow[] = []
  for (const [categoryId, inner] of byCat) {
    const thisMonth = inner.get(m0) ?? 0
    const prevMonth = inner.get(m1) ?? 0
    const avg3 = Math.round(((inner.get(m1) ?? 0) + (inner.get(m2) ?? 0) + (inner.get(m3) ?? 0)) / 3)
    if (thisMonth === 0 && prevMonth === 0 && avg3 === 0) continue
    const deltaPct = prevMonth > 0 ? Math.round(((thisMonth - prevMonth) / prevMonth) * 100) : null
    const isNew = prevMonth === 0 && thisMonth > 0
    rows.push({ categoryId, thisMonth, prevMonth, avg3, deltaPct, isNew })
  }
  rows.sort((a, b) => b.thisMonth - a.thisMonth)
  return { rows, hasMissingRate }
}

export interface CashflowPoint {
  date: string
  balance: number // base minor, tích lũy
}

export interface CumulativeCashflow {
  points: CashflowPoint[]
  hasMissingRate: boolean
}

/**
 * Số dư chạy theo ngày (thu +, chi −, bắt đầu từ 0) từ startISO tới lastISO (đều gồm).
 * Chuyển khoản KHÔNG tính. Ngày không có giao dịch giữ nguyên số dư.
 */
export function cumulativeDailyBalance(
  txs: TransactionRow[],
  startISO: string,
  lastISO: string,
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): CumulativeCashflow {
  const netByDay = new Map<string, number>()
  let hasMissingRate = false
  for (const t of txs) {
    if (t.type === 'transfer') continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    const signed = t.type === 'income' ? v : -v
    netByDay.set(t.occurred_on, (netByDay.get(t.occurred_on) ?? 0) + signed)
  }
  const points: CashflowPoint[] = []
  let balance = 0
  const cur = new Date(startISO + 'T00:00:00Z')
  const last = new Date(lastISO + 'T00:00:00Z')
  while (cur <= last) {
    const iso = cur.toISOString().slice(0, 10)
    balance += netByDay.get(iso) ?? 0
    points.push({ date: iso, balance })
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return { points, hasMissingRate }
}
