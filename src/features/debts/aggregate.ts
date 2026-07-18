// Tổng hợp nợ / cho vay — thuần, không phụ thuộc React, để unit-test được.
// Số tiền của khoản nợ lưu theo currency của nó; quy đổi base qua convertToBase.

import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { DebtPaymentRow, DebtRow } from '../../types/database.types'

/** Đã trả cho một khoản nợ (minor units theo currency của nợ). */
export function paidOf(debtId: string, payments: DebtPaymentRow[]): number {
  return payments.filter((p) => p.debt_id === debtId).reduce((s, p) => s + p.amount, 0)
}

/** Còn lại = principal − đã trả (minor units theo currency của nợ). Có thể ≤ 0. */
export function remainingOf(debt: DebtRow, payments: DebtPaymentRow[]): number {
  return debt.principal - paidOf(debt.id, payments)
}

export interface DebtSummary {
  /** tổng mình nợ còn lại, quy đổi base (minor units) */
  iOwe: number
  /** tổng người ta nợ mình còn lại, quy đổi base (minor units) */
  owedToMe: number
  /** owedToMe − iOwe: ảnh hưởng ròng lên tài sản (âm = nợ ròng) */
  net: number
  /** thiếu tỷ giá cho ít nhất một khoản → tổng có thể thiếu */
  hasMissingRate: boolean
  /** có ít nhất một khoản nợ mở còn > 0 (để quyết định hiển thị) */
  hasOpen: boolean
}

/**
 * Tổng hợp các khoản nợ **mở và còn > 0**, quy đổi về base.
 * Khoản `settled` hoặc đã trả hết bị bỏ qua. Thiếu tỷ giá → đánh dấu hasMissingRate,
 * khoản đó không cộng vào tổng (giống cách trang Tài sản xử lý).
 */
export function debtSummary(
  debts: DebtRow[],
  payments: DebtPaymentRow[],
  base: CurrencyCode,
  rates: Rates,
): DebtSummary {
  let iOwe = 0
  let owedToMe = 0
  let hasMissingRate = false
  let hasOpen = false

  for (const d of debts) {
    if (d.status !== 'open') continue
    const remaining = remainingOf(d, payments)
    if (remaining <= 0) continue
    hasOpen = true
    const baseVal = convertToBase(remaining, d.currency, base, rates)
    if (baseVal === null) {
      hasMissingRate = true
      continue
    }
    if (d.direction === 'i_owe') iOwe += baseVal
    else owedToMe += baseVal
  }

  return { iOwe, owedToMe, net: owedToMe - iOwe, hasMissingRate, hasOpen }
}
