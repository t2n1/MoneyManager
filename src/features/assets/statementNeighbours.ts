// Xếp các bản sao kê vừa nạp theo thứ tự kỳ, và với mỗi bản chỉ ra kỳ liền trước +
// liền sau TRONG CHÍNH TẬP VỪA NẠP.
//
// Hai trong bốn luật của `reconcileStatement` (hoàn tiền lệch kỳ, lệch ranh giới ngày)
// cần dòng của kỳ bên cạnh. Nạp một file lẻ thì hai luật đó im lặng không chạy, và
// phần lệch hợp lệ bị báo thành "cần bạn xem" — đó là lý do màn nạp cho chọn nhiều file.
//
// Thuần, không phụ thuộc React, để unit-test được.

import type { NewCardBill } from '../../data/repo'
import type { ParsedStatement } from './paypayStatement'

export interface StatementWithNeighbours {
  parsed: ParsedStatement
  neighbours: { lines: ParsedStatement['lines'] }[]
}

/**
 * Gộp các bản trùng KỲ (cùng `range.closeISO`) — bản nạp SAU thắng.
 *
 * Cần ở HAI chỗ, mỗi chỗ một lý do khác nhau, nên nó đứng riêng thay vì nằm trong một
 * trong hai:
 *
 *   · Trước khi lưu: `upsertCardBills` gửi cả lô lên một câu `on conflict` theo
 *     `(account_id, close_date)`. Postgres từ chối cả lô nếu một câu chạm cùng một dòng
 *     hai lần ("ON CONFLICT DO UPDATE command cannot affect row a second time"), còn bản
 *     demo thì lặng lẽ ghi đè — tức chọn nhầm một file hai lần chỉ vỡ ở app THẬT. Đó là
 *     loại lỗi tệ nhất, nên chặn ở đây chứ không ở component.
 *   · Trước khi ghép hàng xóm: một kỳ trùng chính nó sẽ thành hàng xóm của chính nó, và
 *     mọi dòng của nó tự "giải thích" được lẫn nhau — phần lệch thật biến mất khỏi màn.
 */
export function dedupeByPeriod(parsed: ParsedStatement[]): ParsedStatement[] {
  const byClose = new Map<string, ParsedStatement>()
  for (const p of parsed) byClose.set(p.range.closeISO, p)
  return [...byClose.values()]
}

/** Sắp theo `closeISO` tăng dần rồi gắn hàng xóm hai bên. */
export function withNeighbours(parsed: ParsedStatement[]): StatementWithNeighbours[] {
  const sorted = dedupeByPeriod(parsed).sort((a, b) =>
    a.range.closeISO.localeCompare(b.range.closeISO),
  )
  return sorted.map((p, i) => ({
    parsed: p,
    neighbours: [sorted[i - 1], sorted[i + 1]]
      .filter((n): n is ParsedStatement => n != null)
      .map((n) => ({ lines: n.lines })),
  }))
}

/** Dòng `card_bills` cho một thẻ — mỗi kỳ ĐÚNG một dòng (xem `dedupeByPeriod`). */
export function billRowsFor(accountId: string, parsed: ParsedStatement[]): NewCardBill[] {
  return dedupeByPeriod(parsed).map((p) => ({
    account_id: accountId,
    close_date: p.range.closeISO,
    due_date: p.range.dueISO,
    total: p.total,
  }))
}
