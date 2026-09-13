// Dấu "đã xem" cho từng hàng lệch của một kỳ, lưu trên `card_bills.dismissed`.
//
// Khoá phải SỐNG QUA lần nạp file sau: dòng sổ có id nên dùng id; dòng thẻ không có id
// nên dùng (ngày, tiền, tên NFKC) — hai dòng thẻ cùng ngày cùng tiền cùng tên là một thứ
// theo nghĩa người đọc. Nhưng dòng trùng KHÔNG hiếm (statementReviewRows.ts: CBTS 4.950 × 3
// trong một kỳ là chuyện thật) nên `dismissKey` một mình không đủ làm khoá lưu — dòng thứ
// hai, ba... cùng base key phải được đánh số `#2`, `#3` (xem `keysFor`), nếu không bỏ qua
// một dòng sẽ ẩn luôn cả cụm và `isReviewed` báo sai. Cụm nạp ví là MỘT hàng/kỳ nên khoá
// theo ngày chốt. Hàng hoàn tiền phía sổ không có id (Đợt 1 không giữ) ⇒ ngày|tiền|ghi chú.
//
// Thuần, không phụ thuộc React.

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

/**
 * Khoá lưu thật của từng hàng, CÙNG độ dài và thứ tự với `rows`. Dòng đầu tiên trùng base
 * key giữ nguyên (đúng dạng đã ghi ở `dismissKey`); dòng thứ k (k ≥ 2, đếm theo thứ tự
 * `rows`) nối hậu tố `#k`. Đánh đổi đã chấp nhận: đây là số thứ tự trong LƯỢT NẠP hiện tại,
 * không phải id bền — nếu sau này một dòng trùng khác được đối chiếu (biến thành `ledger`)
 * và rơi khỏi danh sách `statement`, thứ tự #2/#3 còn lại có thể xê dịch, khiến một dấu đã
 * bỏ qua từ trước không còn khớp đúng dòng cũ. Hệ quả chỉ là người dùng bấm Bỏ qua lại lần
 * nữa — không mất gì, không hiện sai số.
 */
export function keysFor(rows: ReviewRow[]): string[] {
  const seen = new Map<string, number>()
  return rows.map((row) => {
    const base = dismissKey(row)
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base}#${count}`
  })
}

export function splitDismissed(rows: ReviewRow[], dismissed: readonly string[]) {
  const set = new Set(dismissed)
  const keys = keysFor(rows)
  const open: ReviewRow[] = []
  const hidden: ReviewRow[] = []
  rows.forEach((r, i) => (set.has(keys[i]) ? hidden : open).push(r))
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
 * Dòng `card_bills` sau một lần Bỏ qua / Xem lại: tổng và ngày lấy từ FILE (`m.total`,
 * `m.range`) — CỐ Ý, không phải bill đã lưu: kỳ đang mở nghĩa là đã có file mới hơn, và
 * bảng tổng quan đã coi tổng của file là số đáng tin cho kỳ đang nạp. `reviewed` tính lại
 * từ hàng hiện có (`rows` + `dismissed`), không đọc từ bill cũ.
 */
export function billAfterDismiss(
  m: MergedStatement,
  accountId: string,
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
