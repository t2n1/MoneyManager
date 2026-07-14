// Lọc giao dịch — thuần, không phụ thuộc React, dùng chung cho demoRepo
// và trang tìm kiếm. Khớp text không phân biệt hoa/thường & dấu tiếng Việt.

import type { TxFilter } from '../../data'
import type { TransactionRow } from '../../types/database.types'

/** Bỏ dấu + viết thường: "Ăn Uống" → "an uong" (để tìm gần đúng). */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim()
}

/** Một giao dịch có khớp bộ lọc không (đã giả định nằm trong [start, end)). */
export function matchesFilter(t: TransactionRow, filter: TxFilter): boolean {
  if (filter.types && filter.types.length > 0 && !filter.types.includes(t.type)) return false

  if (filter.categoryIds && filter.categoryIds.length > 0) {
    if (!t.category_id || !filter.categoryIds.includes(t.category_id)) return false
  }

  if (filter.accountIds && filter.accountIds.length > 0) {
    const hit =
      filter.accountIds.includes(t.account_id) ||
      (t.to_account_id != null && filter.accountIds.includes(t.to_account_id))
    if (!hit) return false
  }

  const text = filter.text?.trim()
  if (text) {
    if (!normalizeText(t.note).includes(normalizeText(text))) return false
  }

  return true
}

/** Lọc + sắp xếp giảm dần theo ngày (rồi thời điểm tạo). */
export function filterTransactions(txs: TransactionRow[], filter: TxFilter): TransactionRow[] {
  return txs
    .filter((t) => t.occurred_on >= filter.start && t.occurred_on < filter.end)
    .filter((t) => matchesFilter(t, filter))
    .sort(
      (a, b) =>
        b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at),
    )
}
