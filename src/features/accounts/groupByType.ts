// Gom danh sách tài khoản theo loại cho trang Tài khoản (Cài đặt).
// Thuần, không phụ thuộc React, để unit-test được.

import type { CurrencyCode } from '../../lib/money'
import { ACCOUNT_TYPE_LABELS } from '../assets/aggregate'
import type { AccountRow, AccountType } from '../../types/database.types'

/** Thứ tự hiển thị các loại — khớp thứ tự ô "Loại" trong form thêm tài khoản. */
const TYPE_ORDER: AccountType[] = ['cash', 'bank', 'card', 'ic', 'ewallet', 'investment']

/** Tổng số dư của một loại, tách theo từng loại tiền. */
export interface CurrencyTotal {
  currency: CurrencyCode
  total: number
}

/** Một khối tài khoản cùng loại trên trang Tài khoản. */
export interface AccountTypeGroup {
  type: AccountType
  label: string
  accounts: AccountRow[]
  /** Tổng theo từng loại tiền, thứ tự theo lần xuất hiện đầu tiên trong khối. */
  totalsByCurrency: CurrencyTotal[]
}

/**
 * Gom `accounts` theo loại, giữ nguyên thứ tự tài khoản truyền vào trong mỗi loại
 * (gọi bên ngoài đã sắp theo sort_order). Chỉ trả về loại có ≥1 tài khoản, theo
 * thứ tự cố định TYPE_ORDER. Tổng mỗi loại cộng riêng theo từng loại tiền để
 * không cần tỷ giá quy đổi. `balanceOf` cho số dư hiển thị của mỗi tài khoản.
 */
export function groupAccountsByType(
  accounts: AccountRow[],
  balanceOf: (id: string) => number,
): AccountTypeGroup[] {
  const byType = new Map<AccountType, AccountRow[]>()
  for (const a of accounts) {
    const list = byType.get(a.type)
    if (list) list.push(a)
    else byType.set(a.type, [a])
  }

  const result: AccountTypeGroup[] = []
  for (const type of TYPE_ORDER) {
    const list = byType.get(type)
    if (!list || list.length === 0) continue

    const totals: CurrencyTotal[] = []
    for (const a of list) {
      const entry = totals.find((t) => t.currency === a.currency)
      if (entry) entry.total += balanceOf(a.id)
      else totals.push({ currency: a.currency, total: balanceOf(a.id) })
    }

    result.push({
      type,
      label: ACCOUNT_TYPE_LABELS[type],
      accounts: list,
      totalsByCurrency: totals,
    })
  }
  return result
}
