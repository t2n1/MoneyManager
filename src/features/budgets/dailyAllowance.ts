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

/**
 * Ba đoạn của thanh "Còn được tiêu": ĐÃ CHI · ĐÃ CAM KẾT · TỰ DO.
 *
 * Vì sao ba đoạn chứ không một: thanh tiến độ một màu chỉ nói "đã dùng bao nhiêu phần
 * trần", mà giữa tháng câu đó không đủ để quyết định gì — phần trần còn lại đã bị tiền
 * điện ngày 25 và thẻ tới hạn ngày 27 xí trước một khúc. Đoạn giữa vẽ đúng khúc đó ra,
 * nên phần XANH mới là tiền thật sự còn tự do, cùng con số mà `dailyAllowance` chia cho
 * số ngày còn lại.
 *
 * Mẫu số LUÔN là `budgeted`, không phải `spent + committed`: thanh này đo "còn bao nhiêu
 * phần trần", nên nó phải đầy đúng lúc trần hết. Lấy tổng làm mẫu số thì tháng vượt trần
 * lại vẽ ra một thanh chưa đầy.
 *
 * Khi đã hứa quá phần còn lại (`free` < 0) thì đoạn cam kết chỉ vẽ tới mép và `free`
 * VẪN trả số âm — nơi gọi phải in ra "thiếu ¥X trước cuối tháng", cùng lý do với
 * `spendableRemaining` (B36.2): kẹp về 0 là giấu đúng tin quan trọng nhất của tháng.
 */
export interface SpendableSegments {
  /** 0…1 — phần trần đã tiêu. */
  spent: number
  /** 0…1 — phần trần đã hứa cho cam kết chưa ra. */
  committed: number
  /** 0…1 — phần còn tự do. 0 khi đã hứa hết. */
  free: number
  /** Tiền còn tự do (base minor); ÂM = đã hứa nhiều hơn phần còn lại. */
  freeAmount: number
}

export function spendableSegments(
  budgeted: number,
  spent: number,
  committed: number,
): SpendableSegments | null {
  if (budgeted <= 0) return null
  const s = Math.min(1, Math.max(0, spent) / budgeted)
  const c = Math.min(1 - s, Math.max(0, committed) / budgeted)
  return {
    spent: s,
    committed: c,
    free: Math.max(0, 1 - s - c),
    freeAmount: Math.round(budgeted - spent - Math.max(0, committed)),
  }
}
