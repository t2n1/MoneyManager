// Dựng danh sách HÀNG cho phần "Cần bạn xem" của một kỳ từ ReconcileResult, và bản điền
// sẵn để "Thêm vào sổ" từ một dòng sao kê.
//
// Tách khỏi component vì hai lý do: thứ tự và khoá hàng là luật (test được), và
// `prefillFromLine` là chỗ duy nhất quyết định một dòng sao kê thành giao dịch trông thế
// nào — để sai dấu ở đây là khoản hoàn thành khoản chi.
//
// Thuần, không phụ thuộc React.

import type { TransactionRow } from '../../types/database.types'
import type { LedgerTx, ReconcileResult } from './statementReconcile'
import type { StatementLine } from './statementLine'

export type ReviewRow =
  | { kind: 'ledger'; key: string; tx: LedgerTx; amount: number; refund: boolean }
  | { kind: 'statement'; key: string; line: StatementLine; amount: number; refund: boolean }
  /** Nạp ví không ghép được — MỘT hàng cho cả kỳ, không rải lẻ (spec §4.4). */
  | { kind: 'topups'; key: string; count: number; amount: number }

/**
 * Thứ tự cố định: sổ thừa → thẻ thiếu → cụm nạp ví → hoàn tiền (sổ trước, thẻ sau).
 * Khoá hàng có chỉ số `i` vì hai dòng thẻ cùng ngày cùng tiền cùng tên là chuyện thật
 * (CBTS 4.950 × 3 trong một kỳ).
 */
export function reviewRows(result: ReconcileResult, closeISO: string): ReviewRow[] {
  const rows: ReviewRow[] = []
  result.extraInLedger.forEach((e) =>
    rows.push({ kind: 'ledger', key: `led-${e.tx.id}`, tx: e.tx, amount: e.amount, refund: false }),
  )
  result.missingFromLedger.forEach((l, i) =>
    rows.push({ kind: 'statement', key: `stm-${closeISO}-${i}-${l.iso}-${l.amount}`, line: l, amount: l.amount, refund: false }),
  )
  if (result.unmatchedTopups.count > 0) {
    rows.push({
      kind: 'topups',
      key: `topups-${closeISO}`,
      count: result.unmatchedTopups.count,
      amount: result.unmatchedTopups.total,
    })
  }
  result.refundDiffs.forEach((d, i) => {
    if (d.source === 'ledger') {
      // refundDiffs không giữ LedgerTx gốc — dựng lại đủ trường phép sửa cần: id không có,
      // nên hàng này KHÔNG có nút Sửa (xem trang). Giữ amount âm để tone đúng.
      rows.push({
        kind: 'ledger',
        key: `refund-led-${closeISO}-${i}`,
        tx: { id: '', occurred_on: d.iso, amount: Math.abs(d.amount), type: 'expense', is_refund: true, to_account_id: null, note: d.label },
        amount: d.amount,
        refund: true,
      })
    } else {
      rows.push({
        kind: 'statement',
        key: `refund-stm-${closeISO}-${i}`,
        line: { iso: d.iso, amount: d.amount, billed: d.amount, name: d.label, kind: 'adjustment', isAdjustment: true },
        amount: d.amount,
        refund: true,
      })
    }
  })
  return rows
}

/**
 * `TransactionRow` GIẢ (id rỗng) để mở `TransactionForm` điền sẵn — hợp đồng đã ghi ở
 * chú thích `initialTagIds` của form: bản điền sẵn không phải giao dịch thật.
 * Dòng thẻ âm = hoàn tiền ⇒ `amount` dương + `is_refund`, đúng cách repo ghi (không phải income).
 */
export function prefillFromLine(line: StatementLine, cardId: string): TransactionRow {
  const now = new Date().toISOString()
  return {
    id: '',
    user_id: '',
    type: 'expense',
    amount: Math.abs(line.amount),
    to_amount: null,
    category_id: null,
    account_id: cardId,
    to_account_id: null,
    recurring_rule_id: null,
    occurred_on: line.iso,
    note: line.name,
    is_refund: line.amount < 0,
    created_at: now,
    updated_at: now,
  }
}
