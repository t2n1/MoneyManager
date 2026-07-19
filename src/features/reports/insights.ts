// Chỉ số thấu hiểu tài chính — thuần, không phụ thuộc React, unit-test được.
// Không gọi `new Date()` để lấy giờ hiện tại: `today` luôn truyền vào (test tất định).

import { getMonthRange, monthKeyForDate } from '../../lib/dates'
import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'
import type { CurrencyOf } from './aggregate'

/** (thu − chi) / thu. income <= 0 → null. Có thể âm nếu chi > thu. */
export function savingsRate(income: number, expense: number): number | null {
  if (income <= 0) return null
  return (income - expense) / income
}

/**
 * Số ngày liên tiếp gần nhất (lùi từ `today`) không có giao dịch loại `expense`,
 * giới hạn trong tháng tài chính hiện tại (từ đầu tháng tới `today`).
 */
export function noSpendStreak(
  txs: TransactionRow[],
  today: string,
  monthStartDay: number,
): number {
  const spendDays = new Set(
    txs.filter((t) => t.type === 'expense' && !t.exclude_from_stats).map((t) => t.occurred_on),
  )
  const { start } = getMonthRange(monthKeyForDate(today, monthStartDay), monthStartDay)
  let streak = 0
  // Dùng Date UTC chỉ để cộng/trừ ngày (không phải "giờ hiện tại")
  const cur = new Date(today + 'T00:00:00Z')
  const startDate = new Date(start + 'T00:00:00Z')
  while (cur >= startDate) {
    const iso = cur.toISOString().slice(0, 10)
    if (spendDays.has(iso)) break
    streak++
    cur.setUTCDate(cur.getUTCDate() - 1)
  }
  return streak
}

export interface Insight {
  id: string
  text: string
}

export interface InsightInput {
  /** chi tháng này (base, minor units) */
  expenseThis: number
  /** chi tháng trước (base, minor units) */
  expensePrev: number
  /** tên danh mục chi lớn nhất, null nếu không có */
  topCategoryName: string | null
  /** số tiền danh mục lớn nhất (base) */
  topCategoryAmount: number
  /** tổng chi tháng này (base) */
  expenseTotal: number
}

/** Sinh vài câu gợi ý rule-based; chỉ câu nào đủ dữ liệu. */
export function buildInsights(
  input: InsightInput,
  fmt: (minor: number) => string,
): Insight[] {
  const out: Insight[] = []
  const { expenseThis, expensePrev, topCategoryName, topCategoryAmount, expenseTotal } = input

  if (expensePrev > 0 && expenseThis > 0) {
    const pct = Math.round(((expenseThis - expensePrev) / expensePrev) * 100)
    const sign = pct >= 0 ? '+' : ''
    out.push({
      id: 'vs-prev',
      text: `Tháng này chi ${fmt(expenseThis)}, ${sign}${pct}% so với tháng trước.`,
    })
  }

  if (topCategoryName && expenseTotal > 0 && topCategoryAmount > 0) {
    const pct = Math.round((topCategoryAmount / expenseTotal) * 100)
    out.push({
      id: 'top-cat',
      text: `${topCategoryName} chiếm ${pct}% tổng chi tháng này.`,
    })
  }

  return out
}

export interface Forecast {
  /** dự báo tổng chi cuối tháng (base, minor units) */
  projected: number
  spentSoFar: number
  daysElapsed: number
  daysInMonth: number
}

/** Nội suy tuyến tính chi cả tháng theo tốc độ tới nay. Đầu vào không hợp lệ → null. */
export function forecastMonthEnd(
  spentSoFar: number,
  daysElapsed: number,
  daysInMonth: number,
): Forecast | null {
  if (daysElapsed < 1 || daysInMonth < 1) return null
  const projected = Math.round((spentSoFar / daysElapsed) * daysInMonth)
  return { projected, spentSoFar, daysElapsed, daysInMonth }
}

/** Trung vị của mảng số. Mảng rỗng → 0. */
export function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

export interface Anomaly {
  transactionId: string
  categoryId: string
  amount: number // base minor (khoản hiện tại)
  median: number // base minor (trung vị lịch sử danh mục)
  ratio: number // amount / median
}

export interface AnomalyOptions {
  threshold: number
  minSamples: number
}

/**
 * Giao dịch chi bất thường: lớn hơn `threshold`× trung vị lịch sử cùng danh mục,
 * chỉ xét danh mục có `>= minSamples` giao dịch lịch sử. historyTxs KHÔNG gồm tháng đang xem.
 */
export function detectAnomalies(
  currentTxs: TransactionRow[],
  historyTxs: TransactionRow[],
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
  opts: AnomalyOptions = { threshold: 3, minSamples: 5 },
): { anomalies: Anomaly[]; hasMissingRate: boolean } {
  const history = new Map<string, number[]>()
  for (const t of historyTxs) {
    if (t.type !== 'expense' || !t.category_id || t.exclude_from_stats) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) continue
    const arr = history.get(t.category_id) ?? []
    arr.push(v)
    history.set(t.category_id, arr)
  }
  const medianByCat = new Map<string, number>()
  for (const [cat, arr] of history) {
    if (arr.length >= opts.minSamples) medianByCat.set(cat, median(arr))
  }

  const anomalies: Anomaly[] = []
  let hasMissingRate = false
  for (const t of currentTxs) {
    if (t.type !== 'expense' || !t.category_id || t.exclude_from_stats) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    const med = medianByCat.get(t.category_id)
    if (med === undefined || med <= 0) continue
    if (v >= opts.threshold * med) {
      anomalies.push({
        transactionId: t.id,
        categoryId: t.category_id,
        amount: v,
        median: med,
        ratio: v / med,
      })
    }
  }
  anomalies.sort((a, b) => b.ratio - a.ratio)
  return { anomalies, hasMissingRate }
}
