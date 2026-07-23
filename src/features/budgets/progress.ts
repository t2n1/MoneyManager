// Tính tiến độ ngân sách — thuần, không phụ thuộc React, để unit-test được.
// Hạn mức và spent đều ở base currency (minor units); spent quy đổi qua convertToBase.

import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { BudgetRow, TransactionRow } from '../../types/database.types'
import type { CurrencyOf } from '../reports/aggregate'

export type BudgetStatus = 'ok' | 'warn' | 'over' // <80% / ≥80% / ≥100%

export function statusOf(ratio: number): BudgetStatus {
  if (ratio >= 1) return 'over'
  if (ratio >= 0.8) return 'warn'
  return 'ok'
}

export interface BudgetLine {
  categoryId: string
  budgeted: number // minor units base (đã gồm phần dồn nếu có)
  /** phần hạn mức dồn từ tháng trước (mục AH); 0 nếu không bật rollover */
  carried: number
  spent: number // minor units base (đã quy đổi)
  ratio: number // spent / budgeted (0 nếu budgeted = 0)
  status: BudgetStatus
}

export interface BudgetReport {
  lines: BudgetLine[] // sắp theo ratio giảm dần
  totalBudgeted: number
  totalSpent: number
  totalStatus: BudgetStatus
  overCount: number
  /** số danh mục ở ngưỡng cảnh báo ≥80% & <100% (mục AH) */
  warnCount: number
  hasMissingRate: boolean
}

export function buildBudgetReport(
  budgets: BudgetRow[],
  monthTxs: TransactionRow[],
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
  /** Cho biết một danh mục có phải là danh mục MẸ (đang có con) không. Mô hình
   *  "1 cấp": chỉ danh mục LÁ mới nhận hạn mức trực tiếp — hạn mức đặt nhầm ở
   *  danh mục mẹ (còn sót từ thiết kế cũ) bị bỏ qua để không trùng với hạn mức
   *  con. Mặc định: không có danh mục mẹ nào (mọi hạn mức đều được tính). */
  isParent: (categoryId: string) => boolean = () => false,
  /** Phần hạn mức chưa tiêu tháng trước, theo danh mục (mục AH). Chỉ cộng cho
   *  hạn mức bật rollover. Mặc định rỗng → không dồn. */
  carryByCat: Map<string, number> = new Map(),
): BudgetReport {
  const spentByCat = new Map<string, number>()
  let hasMissingRate = false
  for (const t of monthTxs) {
    if (t.type !== 'expense' || !t.category_id || t.exclude_from_stats) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    spentByCat.set(t.category_id, (spentByCat.get(t.category_id) ?? 0) + v)
  }

  // Mỗi hạn mức LÁ là một dòng độc lập; chi tiêu chỉ tính vào đúng danh mục của
  // nó (không gộp lên cha). Vì không còn hạn mức cha-con chồng nhau nên tổng chi
  // = tổng chi của các dòng, không cần chống trùng.
  let totalBudgeted = 0
  let totalSpent = 0
  let overCount = 0
  let warnCount = 0
  const lines: BudgetLine[] = []
  for (const b of budgets) {
    if (isParent(b.category_id)) continue // hạn mức mẹ = tổng con, tính ở UI
    const carried = b.rollover ? Math.max(0, carryByCat.get(b.category_id) ?? 0) : 0
    const budgeted = b.amount + carried
    const spent = spentByCat.get(b.category_id) ?? 0
    const ratio = budgeted > 0 ? spent / budgeted : 0
    const status = statusOf(ratio)
    if (status === 'over') overCount++
    else if (status === 'warn') warnCount++
    totalBudgeted += budgeted
    totalSpent += spent
    lines.push({ categoryId: b.category_id, budgeted, carried, spent, ratio, status })
  }
  lines.sort((a, b) => b.ratio - a.ratio)

  const totalRatio = totalBudgeted > 0 ? totalSpent / totalBudgeted : 0
  const totalStatus = statusOf(totalRatio)
  return {
    lines,
    totalBudgeted,
    totalSpent,
    totalStatus,
    overCount,
    warnCount,
    hasMissingRate,
  }
}

/**
 * Phần hạn mức CHƯA TIÊU của tháng trước theo danh mục (để dồn sang tháng sau).
 * leftover = max(0, hạn mức tháng trước − đã chi tháng trước). Chỉ cần cho danh mục
 * bật rollover ở tháng hiện tại, nhưng tính hết cho gọn.
 */
export function carryFromPreviousMonth(
  prevBudgets: BudgetRow[],
  prevMonthTxs: TransactionRow[],
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
  isParent: (categoryId: string) => boolean = () => false,
): Map<string, number> {
  const prev = buildBudgetReport(prevBudgets, prevMonthTxs, currencyOf, base, rates, isParent)
  const carry = new Map<string, number>()
  for (const line of prev.lines) {
    carry.set(line.categoryId, Math.max(0, line.budgeted - line.spent))
  }
  return carry
}
