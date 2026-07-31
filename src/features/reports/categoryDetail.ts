// Lọc giao dịch cho trang chi tiết danh mục — thuần, không phụ thuộc React, để test được.
// Khớp đúng những gì categoryBreakdown đã tính (bỏ dòng tiền nợ/cho vay và loại khỏi
// thống kê) để tổng ở trang chi tiết = tổng trên thẻ Cơ cấu. Giữ lại hoàn tiền vì đó
// vẫn là giao dịch thật của danh mục (nó kéo tổng xuống).

import type { TransactionRow } from '../../types/database.types'

/**
 * Giao dịch của một danh mục trong khoảng [startISO, endISO) — endISO LOẠI TRỪ,
 * đúng quy ước của getMonthRange/getYearRange. Sắp xếp mới nhất trước.
 */
export function filterCategoryPeriodTxs(
  txs: TransactionRow[],
  categoryId: string,
  kind: 'expense' | 'income',
  startISO: string,
  endISO: string,
): TransactionRow[] {
  return txs
    .filter(
      (t) =>
        t.type === kind &&
        t.category_id === categoryId &&
        !t.is_debt_flow &&
        !t.exclude_from_stats &&
        t.occurred_on >= startISO &&
        t.occurred_on < endISO,
    )
    .sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : a.occurred_on > b.occurred_on ? -1 : 0))
}
