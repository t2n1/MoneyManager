// Tổng hợp số liệu cho báo cáo — thuần, không phụ thuộc React, để unit-test được.
// Mọi số tiền quy đổi về base currency qua convertToBase; thiếu tỷ giá → hasMissingRate.

import { addMonths, monthKeyForDate, type MonthKey } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { CategoryRow, TransactionRow } from '../../types/database.types'

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
    if (t.type !== kind || !t.category_id || t.is_debt_flow || t.exclude_from_stats) continue
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

export interface ParentGroup {
  parentId: string
  /** base minor: trực tiếp + tổng con */
  total: number
  /** base minor: giao dịch gán thẳng vào cha (>= 0) */
  direct: number
  /** con có số tiền > 0, xếp giảm dần */
  children: CategorySlice[]
}

/**
 * Gom slices phẳng thành nhóm theo cha (1 cấp).
 * - Con (parent_id != null) cộng vào children của cha.
 * - Cha (parent_id == null) hoặc danh mục mồ côi (không có trong categories)
 *   → cộng vào `direct` của chính nó, coi là một cha đứng riêng.
 * Cha xếp theo total giảm dần; con xếp theo amount giảm dần; bỏ cha total = 0.
 */
export function groupByParent(slices: CategorySlice[], categories: CategoryRow[]): ParentGroup[] {
  const catById = new Map(categories.map((c) => [c.id, c]))
  const groups = new Map<string, ParentGroup>()
  const ensure = (parentId: string): ParentGroup => {
    let g = groups.get(parentId)
    if (!g) {
      g = { parentId, total: 0, direct: 0, children: [] }
      groups.set(parentId, g)
    }
    return g
  }
  for (const s of slices) {
    const cat = catById.get(s.categoryId)
    if (cat && cat.parent_id) {
      const g = ensure(cat.parent_id)
      g.children.push({ categoryId: s.categoryId, amount: s.amount })
      g.total += s.amount
    } else {
      const g = ensure(s.categoryId)
      g.direct += s.amount
      g.total += s.amount
    }
  }
  const result = [...groups.values()].filter((g) => g.total > 0)
  for (const g of result) g.children.sort((a, b) => b.amount - a.amount)
  result.sort((a, b) => b.total - a.total)
  return result
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
    if (t.type === 'transfer' || t.is_debt_flow || t.exclude_from_stats) continue
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

export interface CategoryMonthlyPoint {
  key: MonthKey
  /** base minor */
  amount: number
}

export interface CategoryMonthlySeries {
  points: CategoryMonthlyPoint[]
  hasMissingRate: boolean
}

/**
 * Số tiền (quy đổi base) theo từng tháng trong `months`, chỉ cho giao dịch có
 * category_id thuộc `ids` và type === kind. Dùng vẽ đường xu hướng một danh mục.
 * Bỏ is_debt_flow / exclude_from_stats. Tháng trống = 0.
 */
export function categoryMonthlySeries(
  txs: TransactionRow[],
  months: MonthKey[],
  kind: 'expense' | 'income',
  ids: Set<string>,
  monthStartDay: number,
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): CategoryMonthlySeries {
  const byMonth = new Map<string, number>()
  let hasMissingRate = false
  for (const t of txs) {
    if (t.type !== kind || !t.category_id || t.is_debt_flow || t.exclude_from_stats) continue
    if (!ids.has(t.category_id)) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    const id = monthId(monthKeyForDate(t.occurred_on, monthStartDay))
    byMonth.set(id, (byMonth.get(id) ?? 0) + v)
  }
  const points = months.map((key) => ({ key, amount: byMonth.get(monthId(key)) ?? 0 }))
  return { points, hasMissingRate }
}

export interface IncomeExpenseSum {
  /** minor units theo base currency */
  income: number
  expense: number
  hasForeign: boolean
  hasMissingRate: boolean
}

/** Tổng thu + tổng chi (đã quy đổi base). Chuyển khoản & dòng tiền nợ/cho vay (is_debt_flow) KHÔNG tính. */
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
    if (t.type === 'transfer' || t.is_debt_flow || t.exclude_from_stats) continue
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
    if (t.type !== 'expense' || !t.category_id || t.is_debt_flow || t.exclude_from_stats) continue
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
 * Chuyển khoản & dòng tiền nợ/cho vay (is_debt_flow) KHÔNG tính. Ngày không có giao dịch giữ nguyên số dư.
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
    if (t.type === 'transfer' || t.is_debt_flow || t.exclude_from_stats) continue
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

export interface DailyExpensePoint {
  date: string
  expense: number // base minor, chi trong ngày (>= 0)
}

export interface DailyExpense {
  points: DailyExpensePoint[]
  hasMissingRate: boolean
}

/**
 * Tổng chi theo từng ngày (base minor) từ startISO tới lastISO (đều gồm), 0 cho ngày trống.
 * Chuyển khoản & dòng tiền nợ/cho vay KHÔNG tính. Nền cho heatmap và chi tích lũy vs ngân sách.
 */
export function dailyExpenseTotals(
  txs: TransactionRow[],
  startISO: string,
  lastISO: string,
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): DailyExpense {
  const byDay = new Map<string, number>()
  let hasMissingRate = false
  for (const t of txs) {
    if (t.type !== 'expense' || t.is_debt_flow || t.exclude_from_stats) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    byDay.set(t.occurred_on, (byDay.get(t.occurred_on) ?? 0) + v)
  }
  const points: DailyExpensePoint[] = []
  const cur = new Date(startISO + 'T00:00:00Z')
  const last = new Date(lastISO + 'T00:00:00Z')
  while (cur <= last) {
    const iso = cur.toISOString().slice(0, 10)
    points.push({ date: iso, expense: byDay.get(iso) ?? 0 })
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return { points, hasMissingRate }
}

export interface ClassificationBreakdown {
  needEssential: number
  needFlexible: number
  needUnclassified: number
  costFixed: number
  costVariable: number
  costUnclassified: number
  /** chi vừa flexible vừa variable — "van xả khẩn cấp" */
  emergencyCut: number
  totalExpense: number
}

/**
 * Gom chi theo 2 trục độc lập từ slices (đã quy đổi base).
 * Nhãn đọc trực tiếp từ danh mục của slice; thiếu nhãn → Unclassified.
 */
export function classificationBreakdown(
  slices: CategorySlice[],
  categories: CategoryRow[],
): ClassificationBreakdown {
  const byId = new Map(categories.map((c) => [c.id, c]))
  const r: ClassificationBreakdown = {
    needEssential: 0, needFlexible: 0, needUnclassified: 0,
    costFixed: 0, costVariable: 0, costUnclassified: 0,
    emergencyCut: 0, totalExpense: 0,
  }
  for (const s of slices) {
    const c = byId.get(s.categoryId)
    const need = c?.need_level ?? null
    const cost = c?.cost_type ?? null
    r.totalExpense += s.amount
    if (need === 'essential') r.needEssential += s.amount
    else if (need === 'flexible') r.needFlexible += s.amount
    else r.needUnclassified += s.amount
    if (cost === 'fixed') r.costFixed += s.amount
    else if (cost === 'variable') r.costVariable += s.amount
    else r.costUnclassified += s.amount
    if (need === 'flexible' && cost === 'variable') r.emergencyCut += s.amount
  }
  return r
}
