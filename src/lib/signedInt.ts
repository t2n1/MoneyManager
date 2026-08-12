// Logic thuần cho ô nhập một số NGUYÊN có thể âm — 口数 quỹ đầu tư Nhật, số cổ phiếu
// Việt Nam khi Điều chỉnh (gộp cổ/gộp 口 thì nhập số âm). Cả hai cột đều `bigint` trong
// DB (xem fund_trades.units, stock_trades.quantity) nên không có phần thập phân để lo.
//
// VÌ SAO không dùng <input type="number">: chuẩn HTML bắt browser tự lọc giá trị theo
// "valid floating-point number" TRƯỚC khi bắn onChange. Một dấu "-" đơn lẻ không khớp
// chuẩn đó, nên browser trả `e.target.value = ''` ngay từ ký tự đầu. Gõ "-500" theo thứ
// tự tự nhiên (-, 5, 0, 0) thì onChange nhận lần lượt '', '5', '50', '500' — dấu trừ
// không bao giờ tới tay code, và `Number(v) || 0` chỉ còn thấy số dương.
//
// Sửa bằng <input type="text" inputMode="numeric">: browser không tự lọc gì cả, ta lọc
// tay bằng `sanitizeSignedIntText` (giữ state = đúng những gì đã gõ) rồi `parseSignedIntText`
// đọc số ra khi cần dùng.

/** Giữ lại phần gõ HỢP LỆ: một dấu "-" tuỳ chọn ở đầu, rồi các chữ số. Bỏ mọi ký tự khác. */
export function sanitizeSignedIntText(raw: string): string {
  return raw.match(/^-?\d*/)?.[0] ?? ''
}

/** '' hoặc '-' (đang gõ dở, chưa ra số nào) → 0; ngược lại → số nguyên đã gõ. */
export function parseSignedIntText(text: string): number {
  if (text === '' || text === '-') return 0
  const n = Math.round(Number(text))
  return Number.isFinite(n) ? n : 0
}

/** Số nguyên (0 = chưa nhập) → chuỗi hiện trong ô, đúng chiều ngược của `parseSignedIntText`. */
export function signedIntToText(n: number): string {
  return n === 0 ? '' : String(n)
}
