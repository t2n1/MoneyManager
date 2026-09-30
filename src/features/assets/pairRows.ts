// Dựng thứ tự HÀNG cho bảng ghép đôi từ ReconcileResult, cùng nhãn tiếng Việt cho từng
// nguyên nhân giải thích được (`ExplainedCause`).
//
// Thứ tự cố định, không phải tuỳ ý:
//   1. `diff`      — việc phải làm đứng đầu: hàng lệch còn mở, có nút xử lý.
//   2. `explained` — user đã duyệt trên mockup rằng nhóm giải thích được nằm NGAY TRONG
//                    bảng (không tách riêng), vì nó vẫn là một phần của kỳ, chỉ là đã rõ
//                    lý do lệch nên không cần nút.
//   3. `matched`   — cặp khớp thường chỉ hiện khi hỏi (`showAll`), vì đây là phần ồn nhất
//                    (majority ~200 dòng khớp thẳng) và không ai cần xem lại nó mỗi lần.
//   4. `dismissed` — đã bỏ qua nằm CUỐI cùng: người dùng đã quyết định xong, chỉ giữ lại
//                    để có nút "Xem lại" khi lỡ tay.
//
// Thuần, không phụ thuộc React, không format ngày — trang tự format.

import type { ExplainedCause, Pair, ReconcileResult } from './statementReconcile'
import type { ReviewRow } from './statementReviewRows'
import { tr } from '../../i18n'

export type PairRow =
  | { kind: 'diff'; row: ReviewRow }
  | { kind: 'explained'; pair: Pair }
  | { kind: 'matched'; pair: Pair }
  | { kind: 'dismissed'; row: ReviewRow }

export const CAUSE_LABEL: Record<ExplainedCause, string> = {
  'date-edge': tr('lệch ngày'),
  'late-posting': tr('ghi trễ'),
  'refund-shifted': tr('hoàn cấn kỳ khác'),
  'merged-rows': tr('sổ ghi gộp'),
  'wallet-topup': tr('nạp ví'),
  recalculated: tr('nhà thẻ tính lại'),
  installment: tr('trả góp'),
  investment: tr('mua quỹ'),
}

export function pairRows(result: ReconcileResult, open: ReviewRow[], hidden: ReviewRow[], showAll: boolean): PairRow[] {
  const rows: PairRow[] = []
  open.forEach((row) => rows.push({ kind: 'diff', row }))
  result.pairs.forEach((pair) => {
    if (pair.cause) rows.push({ kind: 'explained', pair })
  })
  if (showAll) {
    result.pairs.forEach((pair) => {
      if (!pair.cause) rows.push({ kind: 'matched', pair })
    })
  }
  hidden.forEach((row) => rows.push({ kind: 'dismissed', row }))
  return rows
}
