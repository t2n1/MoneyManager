// Tính tiến độ ngân sách — thuần, không phụ thuộc React, để unit-test được.
// Hạn mức và spent đều ở base currency (minor units); spent quy đổi qua convertToBase.

import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { BudgetRow, TransactionRow } from '../../types/database.types'
import type { CurrencyOf } from '../reports/aggregate'

export type BudgetStatus = 'ok' | 'warn' | 'over' // <80% / ≥80% / ≥100%

export interface BudgetLine {
  categoryId: string
  budgeted: number // minor units base
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
  hasMissingRate: boolean
}

function statusOf(ratio: number): BudgetStatus {
  if (ratio >= 1) return 'over'
  if (ratio >= 0.8) return 'warn'
  return 'ok'
}

export function buildBudgetReport(
  budgets: BudgetRow[],
  monthTxs: TransactionRow[],
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): BudgetReport {
  const spentByCat = new Map<string, number>()
  let hasMissingRate = false
  for (const t of monthTxs) {
    if (t.type !== 'expense' || !t.category_id) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    spentByCat.set(t.category_id, (spentByCat.get(t.category_id) ?? 0) + v)
  }

  let totalBudgeted = 0
  let totalSpent = 0
  let overCount = 0
  const lines: BudgetLine[] = budgets.map((b) => {
    const spent = spentByCat.get(b.category_id) ?? 0
    const ratio = b.amount > 0 ? spent / b.amount : 0
    const status = statusOf(ratio)
    if (status === 'over') overCount++
    totalBudgeted += b.amount
    totalSpent += spent
    return { categoryId: b.category_id, budgeted: b.amount, spent, ratio, status }
  })
  lines.sort((a, b) => b.ratio - a.ratio)

  const totalRatio = totalBudgeted > 0 ? totalSpent / totalBudgeted : 0
  const totalStatus = statusOf(totalRatio)
  return {
    lines,
    totalBudgeted,
    totalSpent,
    totalStatus,
    overCount,
    hasMissingRate,
  }
}
