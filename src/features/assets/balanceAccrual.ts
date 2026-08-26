// Chiếu số dư của một tài khoản đóng đều hằng tháng — THUẦN, không React, không ngày
// tháng (khoá tháng do tầng gọi tính, để `monthStartDay` của người dùng chỉ có MỘT chỗ
// định nghĩa: `monthKeyForDate` ở lib/dates.ts).
//
// Sinh ra cho 退職金 (DB掛金 — hưu trí doanh nghiệp): một tài khoản `investment` + JPY
// không có 基準価額, giá trị là số dư, và số dư đó tăng bằng một mức đóng đều mỗi tháng.
// Câu người dùng hỏi là "tới lúc tôi nghỉ thì nó bao nhiêu" — xem `projectBalance`.

/** Một khoản đã vào tài khoản, đã gắn khoá tháng theo cài đặt của người dùng. */
export interface ContributionRow {
  /** Khoá tháng — tầng gọi tính bằng `monthKeyForDate(occurred_on, monthStartDay)`. */
  monthKey: string
  minor: number
}

export interface MonthlyContribution {
  /** minor units/tháng. 0 = không đo được. */
  minorPerMonth: number
  /** Số tháng CÓ đóng đã dùng để đo — hiện ra để người đọc biết số đáng tin cỡ nào. */
  monthsObserved: number
}

/**
 * Mức đóng đều hằng tháng, đo bằng **trung vị** chứ không trung bình.
 *
 * Trang Nhập phiếu lương ghi DB掛金 theo từng phiếu, và phiếu bù (một tháng trả gộp hai
 * kỳ) là chuyện đã xảy ra thật: sổ có tháng 5/2026 vào ¥20.000 rồi 6, 7, 8 mỗi tháng
 * ¥10.000. Trung bình bốn tháng đó ra ¥12.500 — một mức đóng không tồn tại trên hợp đồng
 * nào — và sai số ấy được nhân lên vài trăm lần trong con số chiếu tới lúc nghỉ. Trung vị
 * ra đúng ¥10.000.
 *
 * Chỉ đếm tháng CÓ đóng: một tháng rỗng thường là chưa nhập phiếu, không phải đã ngừng
 * đóng — đếm nó là 0 thì trung vị tụt và con số chiếu tới hụt một nửa.
 */
export function measureMonthlyContribution(rows: ContributionRow[]): MonthlyContribution {
  const theoThang = new Map<string, number>()
  for (const r of rows) theoThang.set(r.monthKey, (theoThang.get(r.monthKey) ?? 0) + r.minor)

  const sorted = [...theoThang.values()].sort((a, b) => a - b)
  if (sorted.length === 0) return { minorPerMonth: 0, monthsObserved: 0 }

  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  return { minorPerMonth: median, monthsObserved: sorted.length }
}

export interface BalanceProjection {
  /** Số tháng còn đóng: từ tháng SAU tháng hiện tại tới hết năm trước `toYear`. */
  months: number
  /** `value + minorPerMonth × months`. */
  minor: number
}

/**
 * Số dư chiếu tới **đầu** năm `toYear` — năm người dùng ngừng làm, nên tháng đóng cuối
 * cùng là tháng 12 của năm trước đó.
 *
 * `now` là **tháng theo cách người dùng chia tháng**, không phải tháng dương lịch: tầng
 * gọi phải đưa vào `monthKeyForDate(hômNay, monthStartDay)`. Bản đầu của hàm này tự cắt
 * chuỗi ISO ra lấy tháng, tức bỏ qua cài đặt ngày bắt đầu tháng — trong khi nửa còn lại
 * của cùng tính năng (`measureMonthlyContribution`) thì tôn trọng nó. Hai định nghĩa
 * "tháng" trong một tính năng lệch nhau đúng một tháng tiền đóng, và lệch lặng lẽ.
 *
 * **Không cộng lãi.** 予定利率 của 基金 nằm trên giấy 残高通知 gửi hằng năm, không có
 * trong sổ; bịa một mức lãi là bịa cả con số cuối. Vì vậy đây là **sàn**, và màn hình
 * phải nói ra chữ đó.
 *
 * `null` khi không đo được mức đóng, hoặc `toYear` không còn ở tương lai — thà không nói
 * gì còn hơn hiện lại chính số dư hôm nay như thể đã chiếu.
 */
export function projectBalance(
  value: number,
  c: MonthlyContribution,
  toYear: number,
  now: { year: number; month: number },
): BalanceProjection | null {
  if (c.minorPerMonth <= 0) return null
  if (toYear <= now.year) return null
  const months = Math.max(0, (toYear - now.year) * 12 - now.month)
  return { months, minor: value + c.minorPerMonth * months }
}
