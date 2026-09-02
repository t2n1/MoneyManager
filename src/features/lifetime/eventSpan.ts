// Một mốc kéo mấy năm thì tổng là bao nhiêu — THUẦN.
//
// `LifetimeEvent.amountMinor` là số MỖI NĂM trong [startYear, endYear] (project.ts). Hàng
// mốc trong bàn sửa hiện "2029 → 2030 · ¥3,000,000" mà không nói đó là ¥3M × 2 năm; người
// dùng đọc thành "cưới tốn ¥3M" trong khi bản chiếu trừ ¥6M (bắt được trên app
// 2026-09-02). Hàm này trả về phần thiếu đó để hàng mốc nói ra.

export type EventSpan =
  /** Mốc kéo từ 2 năm trở lên: số năm và tổng cả khoảng. */
  | { kind: 'multi'; years: number; totalMinor: number }
  /** Không có năm kết thúc = chạy tới hết đời, không có tổng hữu hạn. */
  | { kind: 'open' }

/** `null` khi mốc chỉ một năm (không có gì để cộng) hoặc năm kết thúc đang gõ dở (< bắt đầu). */
export function eventSpan(startYear: number, endYear: number | null, amountMinor: number): EventSpan | null {
  if (endYear === null) return { kind: 'open' }
  const years = endYear - startYear + 1
  if (years < 2) return null
  return { kind: 'multi', years, totalMinor: amountMinor * years }
}
