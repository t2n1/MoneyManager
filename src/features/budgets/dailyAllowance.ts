// "Còn bao nhiêu, chia cho mấy ngày nữa" — trả lời câu hỏi hằng ngày của trang
// Ngân sách: hôm nay tiêu chừng nào thì cuối tháng vẫn trong trần.
// Thuần, không phụ thuộc React, để unit-test được.

export interface DailyAllowance {
  /** Tiền còn được tiêu (minor units, base). Luôn > 0 ở kết quả trả về. */
  remaining: number
  /** Số ngày còn lại KỂ CẢ HÔM NAY — hôm nay vẫn tiêu được nên phải đếm vào. */
  daysLeft: number
  /** Mức tiêu mỗi ngày để vừa đủ hết tháng, LÀM TRÒN XUỐNG. */
  perDay: number
}

/**
 * `daysElapsed` đếm cả hôm nay (1 = đang ở ngày đầu tháng), khớp với
 * `paceDaysElapsed` của useMonthPace. Trả null khi không có gì để nói:
 *  - đã tiêu hết hoặc vượt trần (remaining ≤ 0) — chia ra chỉ được số 0 hoặc âm,
 *    lúc đó phải nói "đã vượt", không phải "mỗi ngày còn 0";
 *  - hết ngày để chia (tháng đã qua, hoặc số ngày vô lý).
 * Làm tròn XUỐNG chứ không lên: nói dư một đồng mỗi ngày thì cuối tháng vượt trần
 * đúng bằng số ngày — sai theo hướng khiến người dùng thôi tin con số này.
 */
export function dailyAllowance(
  remaining: number,
  daysElapsed: number,
  daysInMonth: number,
): DailyAllowance | null {
  if (remaining <= 0) return null
  const daysLeft = daysInMonth - daysElapsed + 1
  if (daysLeft <= 0 || !Number.isFinite(daysLeft)) return null
  return { remaining, daysLeft, perDay: Math.floor(remaining / daysLeft) }
}
