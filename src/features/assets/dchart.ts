// Đọc phản hồi dchart (VNDirect) — thuần, test được, và được GÓI sang edge function.
//
// Vì sao phép quy đổi đơn vị nằm ở `src/` chứ không nằm trong `supabase/functions`: luật
// repo là edge function không có phép tính riêng (xem serverBundle.ts và
// scripts/bundle-rules.mjs). Mà quy đổi thang chính là phép dễ sai nhất ở đây — dchart trả
// giá cổ phiếu bằng NGHÌN ĐỒNG và chỉ số bằng ĐIỂM có hai số lẻ, hai thang khác nhau trên
// cùng một hình dạng JSON. Sai thang không làm gì đổ: nó chỉ ra một biểu đồ sai hình, và
// không màn nào nói ra.
//
// Hình dạng phản hồi (đã gọi tay 06/09/2026):
//   { s: 'ok', t: [1788480000, …], c: [21.7, …], o: […], h: […], l: […], v: […] }
// `t` là giây UTC của NỬA ĐÊM ngày phiên, `c` là giá đóng cửa ĐÃ ĐIỀU CHỈNH cổ tức/chia
// tách.

/** Nghìn đồng → đồng, để khớp đúng đơn vị `stock_prices.price`. */
export const DCHART_STOCK_SCALE = 1_000

/** Điểm → điểm × 100 (1853,08 → 185308), vì repo không dùng số thực. */
export const DCHART_INDEX_SCALE = 100

export interface DchartBar {
  /** ISO date của phiên */
  trading_date: string
  /** ĐÃ nhân thang, luôn > 0 */
  close: number
}

/** Ngày ISO → giây UTC của nửa đêm ngày đó, đúng thang mà dchart nhận ở `from`/`to`. */
export function unixDay(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / 1000)
}

/**
 * Phản hồi dchart → các phiên đã đúng đơn vị, xếp theo ngày TĂNG DẦN, mỗi ngày một dòng.
 *
 * Bỏ phiên nào không dùng được thay vì bỏ cả lượt: một mã có vài phiên `close: null`
 * (tạm ngừng giao dịch) là chuyện thường, và ném cả 2.600 phiên đi vì ba phiên rỗng là
 * đổi một khoảng trống nhỏ lấy một khoảng trống toàn phần.
 *
 * Phiên có giá ≤ 0 (kể cả giá tròn về 0 sau khi nhân thang) cũng bị bỏ: cột `close` có
 * `check (close > 0)` nên một dòng như thế làm đổ cả câu upsert, tức mất luôn những phiên
 * hợp lệ đi cùng lô.
 */
export function parseDchart(json: unknown, scale: number): DchartBar[] {
  if (typeof json !== 'object' || json === null) return []
  const o = json as { s?: unknown; t?: unknown; c?: unknown }
  if (o.s !== 'ok' || !Array.isArray(o.t) || !Array.isArray(o.c)) return []

  const theoNgay = new Map<string, number>()
  const n = Math.min(o.t.length, o.c.length)
  for (let i = 0; i < n; i++) {
    const ts = o.t[i]
    const gia = o.c[i]
    if (typeof ts !== 'number' || !Number.isFinite(ts)) continue
    if (typeof gia !== 'number' || !Number.isFinite(gia) || gia <= 0) continue
    const close = Math.round(gia * scale)
    if (close <= 0) continue
    theoNgay.set(new Date(ts * 1000).toISOString().slice(0, 10), close)
  }

  return [...theoNgay]
    .map(([trading_date, close]) => ({ trading_date, close }))
    .sort((a, b) => a.trading_date.localeCompare(b.trading_date))
}
