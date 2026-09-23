// Tổng hợp nợ / cho vay — thuần, không phụ thuộc React, để unit-test được.
// Số tiền của khoản nợ lưu theo currency của nó; quy đổi base qua convertToBase.

import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { DebtPaymentRow, DebtRow } from '../../types/database.types'

/**
 * Chênh lệch ròng của các bút toán trả (minor units). Lần trả DƯƠNG = trả bớt;
 * lần trả ÂM = giải ngân thêm (cho vay/vay tiếp cùng người → tăng số còn lại).
 */
export function paidOf(debtId: string, payments: DebtPaymentRow[]): number {
  return payments.filter((p) => p.debt_id === debtId).reduce((s, p) => s + p.amount, 0)
}

/** Tổng đã trả THỰC = chỉ cộng các lần trả dương (bỏ qua lần giải ngân thêm). */
export function repaidOf(debtId: string, payments: DebtPaymentRow[]): number {
  return payments
    .filter((p) => p.debt_id === debtId && p.amount > 0)
    .reduce((s, p) => s + p.amount, 0)
}

/**
 * Tổng đã cho vay/vay = gốc ban đầu + các lần giải ngân thêm (lần trả âm).
 * Dùng làm "gốc" hiển thị khi một người được cộng dồn nhiều lần.
 */
export function disbursedOf(debt: DebtRow, payments: DebtPaymentRow[]): number {
  const advances = payments
    .filter((p) => p.debt_id === debt.id && p.amount < 0)
    .reduce((s, p) => s - p.amount, 0)
  return debt.principal + advances
}

/** Còn lại = gốc − chênh lệch ròng đã trả (minor units theo currency của nợ). Có thể ≤ 0. */
export function remainingOf(debt: DebtRow, payments: DebtPaymentRow[]): number {
  return debt.principal - paidOf(debt.id, payments)
}

export interface DebtBalance {
  /** Còn phải trả, kẹp ≥ 0 (minor units theo currency của nợ). */
  remaining: number
  /** Phần đã trả VƯỢT số nợ (≥ 0). Hiện ra thành "Trả thừa ¥X", đừng giấu thành ¥0. */
  overpaid: number
  /** Đã trả hết (còn ≤ 0) — không còn gì để "Ghi nhận trả". */
  paidOff: boolean
}

/** Tách số còn lại (có thể âm) thành hai con số dương để hiển thị, cộng cờ đã trả hết. */
export function debtBalance(debt: DebtRow, payments: DebtPaymentRow[]): DebtBalance {
  const r = remainingOf(debt, payments)
  return { remaining: Math.max(r, 0), overpaid: Math.max(-r, 0), paidOff: r <= 0 }
}

/**
 * Một lần trả `amount` vượt số còn lại bao nhiêu (≥ 0). Còn lại đã ≤ 0 thì cả lần trả là
 * thừa. Biểu mẫu dùng để CẢNH BÁO và đòi xác nhận riêng — không chặn cứng, vì người ta
 * có thể thật sự bị trả thừa.
 */
export function overpayOf(remaining: number, amount: number): number {
  return Math.max(amount - Math.max(remaining, 0), 0)
}

/**
 * Lần trả đã được phép lưu chưa, xét riêng chuyện trả thừa: không thừa thì được; thừa
 * thì chỉ được khi người dùng đã bấm xác nhận ĐÚNG số đang gõ (`confirmedAt`). Gõ số
 * khác sau khi xác nhận → phải xác nhận lại. Cả hai đường trả nợ (DebtPaymentSheet và
 * form Nhập) cùng đi qua đây.
 */
export function overpayConfirmed(overpay: number, confirmedAt: number | null, amount: number): boolean {
  return overpay === 0 || confirmedAt === amount
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
