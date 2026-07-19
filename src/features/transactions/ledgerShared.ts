// Helper thuần dùng chung cho các view của Sổ Giao dịch (Daily/Calendar/Monthly/Summary).
// Mọi số tiền quy đổi về base qua convertToBase; thiếu tỷ giá → trả null để caller fallback.

import { CURRENCIES, formatMoney, type CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'

export const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']
export const WEEKDAYS_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

export type CurrencyOf = (accountId: string) => CurrencyCode

/** 'YYYY-MM-DD' → "Thứ hai, 7/7". */
export function formatDayHeader(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${d}/${m}`
}

export interface Sum {
  value: number
  hasForeign: boolean
}

/**
 * Tổng thu/chi quy đổi về base. Trả về:
 * - {value, hasForeign} khi đủ tỷ giá
 * - null khi thiếu tỷ giá → caller fallback (tách loại tiền)
 * Chuyển khoản & dòng tiền nợ/cho vay (is_debt_flow) KHÔNG tính vào thu/chi.
 */
export function sumInBase(
  txs: TransactionRow[],
  kind: 'income' | 'expense',
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates | undefined,
): Sum | null {
  let value = 0
  let hasForeign = false
  for (const t of txs) {
    if (t.type !== kind || t.is_debt_flow) continue
    const cur = currencyOf(t.account_id)
    if (cur !== base) hasForeign = true
    const v = convertToBase(t.amount, cur, base, rates ?? {})
    if (v === null) return null
    value += v
  }
  return { value, hasForeign }
}

/** Fallback khi thiếu tỷ giá: tổng theo từng loại tiền, ví dụ "¥3.280 · 1.500.000 ₫". */
export function sumPerCurrency(
  txs: TransactionRow[],
  kind: 'income' | 'expense',
  currencyOf: CurrencyOf,
): string {
  const sums = new Map<CurrencyCode, number>()
  for (const t of txs) {
    if (t.type !== kind || t.is_debt_flow) continue
    const cur = currencyOf(t.account_id)
    sums.set(cur, (sums.get(cur) ?? 0) + t.amount)
  }
  if (sums.size === 0) return '0'
  return [...sums.entries()].map(([cur, v]) => formatMoney(v, cur)).join(' · ')
}

/** "≈ ¥123.456" nếu có ngoại tệ, ngược lại "¥123.456". */
export function approxLabel(r: Sum, base: CurrencyCode): string {
  return `${r.hasForeign ? '≈ ' : ''}${formatMoney(r.value, base)}`
}

/** minor units → nhãn ngắn cho ô lịch chật (¥3k, 1,5M…). Chỉ dùng ở nơi không đủ chỗ. */
export function formatCompact(minor: number, base: CurrencyCode): string {
  const major = minor / 10 ** CURRENCIES[base].decimals
  const abs = Math.abs(major)
  if (abs >= 1_000_000) return `${(major / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (abs >= 1_000) return `${Math.round(major / 1_000)}k`
  return String(Math.round(major))
}

/** Gộp giao dịch theo ngày (giữ nguyên thứ tự giảm dần từ repo). */
export function groupByDay(txs: TransactionRow[]): [string, TransactionRow[]][] {
  const map = new Map<string, TransactionRow[]>()
  for (const t of txs) {
    const list = map.get(t.occurred_on) ?? []
    list.push(t)
    map.set(t.occurred_on, list)
  }
  return [...map.entries()]
}
