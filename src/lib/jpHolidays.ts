// Ngày lễ Nhật + ngày ngân hàng nghỉ — để biết thẻ THỰC SỰ bị trừ tiền ngày nào.
// Rakuten và PayPay đều ghi "27日（休日の場合は翌営業日）", tức ngày lễ cũng phải dời.
//
// Tính theo QUY TẮC, không dùng bảng tra cứng, để khỏi phải cập nhật mỗi năm. Theo luật
// hiện hành (từ 2020: 天皇誕生日 23/2, スポーツの日 tháng 10). Công thức xuân phân/thu phân
// đúng cho 1980–2099. KHÔNG import module khác trong lib/ để dates.ts dùng được mà không
// tạo vòng import.

const dayOfWeek = (dateISO: string) => new Date(dateISO + 'T00:00:00Z').getUTCDay() // 0 = CN

function addDays(dateISO: string, delta: number): string {
  const d = new Date(dateISO + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

/** Ngày trong tháng của Thứ Hai thứ `nth` (luật "Happy Monday"). */
function nthMondayDay(year: number, month: number, nth: number): number {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const firstMonday = 1 + ((8 - firstDow) % 7)
  return firstMonday + (nth - 1) * 7
}

/** 春分の日 — ngày xuân phân, xê dịch theo năm. */
const springEquinoxDay = (year: number) =>
  Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))

/** 秋分の日 — ngày thu phân. */
const autumnEquinoxDay = (year: number) =>
  Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))

/** Ngày lễ "gốc" — chưa tính nghỉ bù Chủ nhật và ngày kẹp giữa hai ngày lễ. */
function isPrimaryHoliday(dateISO: string): boolean {
  const [y, m, d] = dateISO.split('-').map(Number)
  switch (m) {
    case 1:
      return d === 1 || d === nthMondayDay(y, 1, 2) // 元日, 成人の日
    case 2:
      return d === 11 || d === 23 // 建国記念の日, 天皇誕生日
    case 3:
      return d === springEquinoxDay(y)
    case 4:
      return d === 29 // 昭和の日
    case 5:
      return d === 3 || d === 4 || d === 5 // 憲法記念日, みどりの日, こどもの日
    case 7:
      return d === nthMondayDay(y, 7, 3) // 海の日
    case 8:
      return d === 11 // 山の日
    case 9:
      return d === nthMondayDay(y, 9, 3) || d === autumnEquinoxDay(y) // 敬老の日, 秋分の日
    case 10:
      return d === nthMondayDay(y, 10, 2) // スポーツの日
    case 11:
      return d === 3 || d === 23 // 文化の日, 勤労感謝の日
    default:
      return false
  }
}

/**
 * Ngày lễ chính thức của Nhật, tính cả:
 * - 振替休日: ngày lễ rơi Chủ nhật thì ngày KHÔNG-phải-lễ đầu tiên sau đó thành ngày nghỉ
 *   (3/5 rơi Chủ nhật thì 4, 5/5 vẫn là lễ nên nghỉ bù dồn tới 6/5).
 * - 国民の休日: ngày thường kẹp giữa hai ngày lễ (thực tế chỉ xảy ra với 22/9).
 */
export function isJpPublicHoliday(dateISO: string): boolean {
  if (isPrimaryHoliday(dateISO)) return true
  if (dayOfWeek(dateISO) === 0) return false // Chủ nhật không bao giờ là ngày nghỉ bù
  // Lùi dần qua chuỗi ngày lễ liền trước; gặp Chủ nhật là lễ → hôm nay là ngày nghỉ bù
  for (let cur = addDays(dateISO, -1); isPrimaryHoliday(cur); cur = addDays(cur, -1)) {
    if (dayOfWeek(cur) === 0) return true
  }
  return isPrimaryHoliday(addDays(dateISO, -1)) && isPrimaryHoliday(addDays(dateISO, 1))
}

/**
 * Ngân hàng Nhật KHÔNG làm việc: Thứ 7, Chủ nhật, ngày lễ, và kỳ nghỉ Tết 31/12–3/1
 * (mấy ngày Tết không phải "ngày lễ" nhưng ngân hàng vẫn đóng, không rút tiền được).
 */
export function isJpBankHoliday(dateISO: string): boolean {
  const dow = dayOfWeek(dateISO)
  if (dow === 0 || dow === 6) return true
  const [, m, d] = dateISO.split('-').map(Number)
  if (m === 12 && d === 31) return true
  if (m === 1 && d <= 3) return true
  return isJpPublicHoliday(dateISO)
}
