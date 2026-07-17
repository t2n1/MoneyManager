// Chỉ số thấu hiểu tài chính — thuần, không phụ thuộc React, unit-test được.
// Không gọi `new Date()` để lấy giờ hiện tại: `today` luôn truyền vào (test tất định).

import { getMonthRange, monthKeyForDate } from '../../lib/dates'
import type { TransactionRow } from '../../types/database.types'

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
  const spendDays = new Set(txs.filter((t) => t.type === 'expense').map((t) => t.occurred_on))
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
