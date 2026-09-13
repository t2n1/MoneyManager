// Dấu "đã xem" cho từng hàng lệch của một kỳ, lưu trên `card_bills.dismissed`.
//
// Khoá phải SỐNG QUA lần nạp file sau: dòng sổ có id nên dùng id; dòng thẻ không có id
// nên dùng (ngày, tiền, tên NFKC) — hai dòng thẻ cùng ngày cùng tiền cùng tên là một thứ
// theo nghĩa người đọc, và trùng như vậy hiếm (spec §7.1). Cụm nạp ví là MỘT hàng/kỳ nên
// khoá theo ngày chốt. Hàng hoàn tiền phía sổ không có id (Đợt 1 không giữ) ⇒ ngày|tiền|ghi chú.
//
// Thuần, không phụ thuộc React.

import type { CardBillRow } from '../../types/database.types'
import type { NewCardBill } from '../../data/repo'
import type { MergedStatement } from './statementBatch'
import type { ReviewRow } from './statementReviewRows'

const nfkc = (s: string) => s.normalize('NFKC').trim()

export function dismissKey(row: ReviewRow): string {
  switch (row.kind) {
    case 'ledger':
      return row.tx.id !== ''
        ? `tx:${row.tx.id}`
        : `rtx:${row.tx.occurred_on}|${row.amount}|${nfkc(row.tx.note ?? '')}`
    case 'statement':
      return `stm:${row.line.iso}|${row.line.amount}|${nfkc(row.line.name)}`
    case 'topups':
      // key hàng là `topups-<closeISO>` (statementReviewRows) — lấy phần sau dấu gạch đầu.
      return `topups:${row.key.slice('topups-'.length)}`
  }
}

export function splitDismissed(rows: ReviewRow[], dismissed: readonly string[]) {
  const set = new Set(dismissed)
  const open: ReviewRow[] = []
  const hidden: ReviewRow[] = []
  for (const r of rows) (set.has(dismissKey(r)) ? hidden : open).push(r)
  return { open, hidden }
}

/** Kỳ "đã đối chiếu" = không còn hàng nào chưa xử lý. Không có hàng nào cũng là đã đối chiếu. */
export function isReviewed(rows: ReviewRow[], dismissed: readonly string[]): boolean {
  return splitDismissed(rows, dismissed).open.length === 0
}

export function toggleKey(dismissed: readonly string[], key: string, on: boolean): string[] {
  const set = new Set(dismissed)
  if (on) set.add(key)
  else set.delete(key)
  return [...set]
}

/**
 * Dòng `card_bills` sau một lần Bỏ qua / Xem lại: tổng và ngày lấy từ FILE (nguồn mới
 * hơn bill đã lưu), dấu từ tham số, `reviewed` tính lại từ hàng hiện có. `existing` chỉ để
 * chỗ gọi tiện tra — không đọc gì từ nó ngoài việc chấp nhận null (kỳ chưa có bill).
 */
export function billAfterDismiss(
  m: MergedStatement,
  accountId: string,
  _existing: CardBillRow | null,
  dismissed: string[],
  rows: ReviewRow[],
): NewCardBill {
  return {
    account_id: accountId,
    close_date: m.range.closeISO,
    due_date: m.range.dueISO,
    total: m.total,
    dismissed,
    reviewed: isReviewed(rows, dismissed),
  }
}
