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

/**
 * 給付利率 của はぐくみ企業年金, 事業年度 **2025** — basis points (30 = 0,30%/năm).
 *
 * 基金 đặt lại suất này theo TỪNG 事業年度, và giấy nói rõ không bảo đảm cho tương lai. Vì
 * vậy đây chỉ là giá trị MẶC ĐỊNH khi người dùng chưa khai suất mới.
 */
export const KIKIN_GIVE_RATE_BPS_2025 = 30

/**
 * Ba điểm lãi in trên đồ thị sheet 基金 (プラン①, ¥20.000/tháng, 年利0,3%).
 *
 * Dùng để **hiệu chuẩn hình dạng** đường lãi. Ghép lãi tháng thuần ở 0,3%/12 cho ra
 * ¥3.159 / ¥29.147 / ¥81.758 — thấp hơn 基金 lần lượt 37% / 12% / 7%, và tỷ lệ đó giảm
 * dần theo số tháng nên **không có MỘT suất nào khớp cả ba**. Không rõ 月次再評価率 của họ
 * cộng theo quy tắc gì.
 *
 * Nên: `lãi = ghép_lãi_thuần(suất) × hệ_số_hình_dạng(số tháng)`. Hệ số nội suy giữa ba
 * điểm này và giữ phẳng ngoài hai đầu. Cách dựng đó làm con số ĐÚNG TUYỆT ĐỐI tại cả ba
 * điểm neo, mà ô sửa suất vẫn hoạt động tự nhiên.
 */
export const KIKIN_INTEREST_ANCHORS = [
  { months: 36, monthly: 20_000, interest: 4_328 },
  { months: 108, monthly: 20_000, interest: 32_660 },
  { months: 180, monthly: 20_000, interest: 87_622 },
] as const

/** Lãi của chuỗi đóng đều cuối kỳ, KHÔNG làm tròn. Nội bộ file. */
function plainAnnuityInterest(monthly: number, i: number, n: number): number {
  if (i <= 0 || n <= 0) return 0
  return monthly * (((1 + i) ** n - 1) / i - n)
}

/** Hệ số hình dạng ở `n` tháng — nội suy giữa các điểm neo, giữ phẳng ngoài hai đầu. */
function shapeFactor(n: number, i: number): number {
  const A = KIKIN_INTEREST_ANCHORS
  const of = (k: number) => {
    const a = A[k]
    const plain = plainAnnuityInterest(a.monthly, i, a.months)
    return plain <= 0 ? 1 : a.interest / plain
  }
  if (n <= A[0].months) return of(0)
  if (n >= A[A.length - 1].months) return of(A.length - 1)
  for (let k = 1; k < A.length; k++) {
    if (n > A[k].months) continue
    const t = (n - A[k - 1].months) / (A[k].months - A[k - 1].months)
    return of(k - 1) + (of(k) - of(k - 1)) * t
  }
  return of(A.length - 1)
}

export interface BalanceProjection {
  /** Số tháng còn đóng: từ tháng SAU tháng hiện tại tới hết năm trước `toYear`. */
  months: number
  /** `value + minorPerMonth × months`. Không lãi — đây là SÀN. */
  minor: number
  /**
   * Cùng phép trên nhưng có lãi ghép, hiệu chuẩn theo đồ thị 基金.
   * `null` khi tầng gọi không truyền suất — lúc đó màn hình chỉ có số sàn.
   */
  minorAtRate: number | null
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
  annualRateBps?: number,
): BalanceProjection | null {
  if (c.minorPerMonth <= 0) return null
  if (toYear <= now.year) return null
  const months = Math.max(0, (toYear - now.year) * 12 - now.month)
  const minor = value + c.minorPerMonth * months

  if (annualRateBps === undefined || !Number.isFinite(annualRateBps)) {
    return { months, minor, minorAtRate: null }
  }
  const i = Math.max(0, annualRateBps) / 10_000 / 12
  // Hệ số hình dạng áp cho phần ĐÓNG ĐỀU, không áp cho phần số dư sẵn có: hệ số đo trên
  // một chuỗi đóng đều, dùng nó cho một khoản nằm sẵn là dùng số ngoài phạm vi nó đo.
  const laiDong = plainAnnuityInterest(c.minorPerMonth, i, months) * shapeFactor(months, i)
  const laiSoDu = value * ((1 + i) ** months - 1)
  // Cộng rồi mới làm tròn MỘT lần — làm tròn từng phần thì tổng lệch vài yên so với con
  // số đã tính tay trong spec.
  return { months, minor, minorAtRate: minor + Math.round(laiDong + laiSoDu) }
}
