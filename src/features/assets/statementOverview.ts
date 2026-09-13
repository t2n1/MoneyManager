// Bảng tổng quan mọi kỳ của MỘT thẻ: kỳ đã lưu trong `card_bills` ∪ kỳ vừa nạp trong lô.
//
// Vì sao luôn có nội dung: câu hỏi đầu tiên khi mở trang là "kỳ nào còn vấn đề, kỳ nào
// thiếu" — trả lời được ngay từ hoá đơn đã lưu, không cần chọn file. Kỳ vừa nạp đè kỳ đã
// lưu về tổng/ngày rút (file là nguồn mới hơn), và mang thêm kết quả ghép.
//
// Thuần, không phụ thuộc React.

import type { CardBillRow } from '../../types/database.types'
import type { MergedStatement } from './statementBatch'
import { emptyResult, type ReconcileResult } from './statementReconcile'
import { reviewRows } from './statementReviewRows'

export interface OverviewRow {
  closeISO: string
  dueISO: string
  billTotal: number
  /**
   * Chỉ có khi kỳ này vừa nạp file trong lô đang xem (không phải mọi kỳ đã lưu trong
   * `card_bills`). `matchedCount`/`lineCount` là số dòng sao kê đã ghép / tổng số dòng sao
   * kê của kỳ; `reviewCount` là số dòng còn "cần bạn xem" sau khi ghép; `parts` là các
   * nguồn file gộp vào kỳ này (vd PayPay + Rakuten cùng kỳ).
   *
   * Cột "Sổ" (tổng số tiền phía sổ giao dịch của kỳ, để so trực tiếp với `billTotal`) CHƯA
   * có ở đây — dự kiến thêm ở Đợt 4.
   */
  loaded: null | {
    matchedCount: number
    lineCount: number
    reviewCount: number
    parts: MergedStatement['parts']
  }
  status: 'saved-only' | 'ok' | 'review'
}

export function overviewRows(
  bills: CardBillRow[],
  accountId: string,
  merged: MergedStatement[],
  results: Map<string, ReconcileResult>,
): OverviewRow[] {
  const byClose = new Map<string, OverviewRow>()
  for (const b of bills) {
    if (b.account_id !== accountId) continue
    byClose.set(b.close_date, {
      closeISO: b.close_date,
      dueISO: b.due_date,
      billTotal: b.total,
      loaded: null,
      status: 'saved-only',
    })
  }
  for (const m of merged) {
    const r = results.get(m.range.closeISO) ?? emptyResult()
    const reviewCount = reviewRows(r, m.range.closeISO).length
    byClose.set(m.range.closeISO, {
      closeISO: m.range.closeISO,
      dueISO: m.range.dueISO,
      billTotal: m.total,
      loaded: { matchedCount: r.matchedCount, lineCount: m.lines.length, reviewCount, parts: m.parts },
      status: reviewCount > 0 ? 'review' : 'ok',
    })
  }
  return [...byClose.values()].sort((a, b) => b.closeISO.localeCompare(a.closeISO))
}
