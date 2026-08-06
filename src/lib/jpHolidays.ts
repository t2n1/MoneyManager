// Ngày ngân hàng Nhật đóng cửa: Thứ 7, Chủ nhật, ngày lễ quốc gia, và kỳ nghỉ
// Tết dương 31/12–3/1. Thẻ tín dụng ghi "27日（土日祝の場合は翌営業日）" nên ngày
// tiền thực rời tài khoản phải nhảy qua hết những ngày này.
//
// Tính theo QUY TẮC chứ không tra bảng: bảng phải cập nhật tay mỗi năm, mà app
// còn hiện ngày trả của các kỳ tương lai.
//
// Giới hạn đã biết:
// - Luật áp dụng là luật hiện hành (từ 2022). Hai năm Olympic 2020–2021 dời
//   海の日/スポーツの日/山の日 khác thường — không xử, vì app không sinh giao dịch
//   lùi xa tới đó.
// - Công thức xuân/thu phân chỉ đúng trong khoảng 2000–2099.
// - Ngày lễ đột xuất do luật riêng (lễ đăng quang, quốc tang) không có ở đây.

// Tự cộng ngày thay vì mượn `addDaysISO` của ./dates: dates.ts phải import ngược
// tệp này cho `nextCardDueDate`, mượn qua mượn lại thành vòng import.
function addDaysISO(isoDate: string, delta: number): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
/** 0 = CN … 6 = T7 */
const dow = (isoDate: string) => new Date(isoDate + 'T00:00:00Z').getUTCDay()

/** Ngày của lần thứ `nth` mà thứ 2 rơi vào trong tháng (nth = 2 → Thứ 2 tuần 2). */
function nthMonday(year: number, month: number, nth: number): number {
  const firstDow = dow(iso(year, month, 1))
  // Thứ 2 đầu tiên: 1 + số ngày phải đợi từ mùng 1 tới Thứ 2 gần nhất
  const first = 1 + ((8 - firstDow) % 7)
  return first + (nth - 1) * 7
}

/**
 * Ngày Xuân phân / Thu phân — hai ngày lễ duy nhất trôi theo thiên văn.
 * Công thức chính thức dùng rộng rãi cho 2000–2099.
 */
function equinoxDay(year: number, base: number): number {
  return Math.floor(base + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4))
}

/** Các ngày lễ "gốc" của năm, CHƯA tính bù Chủ nhật và ngày nghỉ kẹp giữa. */
function baseHolidays(year: number): string[] {
  return [
    iso(year, 1, 1), // 元日
    iso(year, 1, nthMonday(year, 1, 2)), // 成人の日
    iso(year, 2, 11), // 建国記念の日
    iso(year, 2, 23), // 天皇誕生日
    iso(year, 3, equinoxDay(year, 20.8431)), // 春分の日
    iso(year, 4, 29), // 昭和の日
    iso(year, 5, 3), // 憲法記念日
    iso(year, 5, 4), // みどりの日
    iso(year, 5, 5), // こどもの日
    iso(year, 7, nthMonday(year, 7, 3)), // 海の日
    iso(year, 8, 11), // 山の日
    iso(year, 9, nthMonday(year, 9, 3)), // 敬老の日
    iso(year, 9, equinoxDay(year, 23.2488)), // 秋分の日
    iso(year, 10, nthMonday(year, 10, 2)), // スポーツの日
    iso(year, 11, 3), // 文化の日
    iso(year, 11, 23), // 勤労感謝の日
  ]
}

const cache = new Map<number, Set<string>>()

/** Tập ngày lễ của một năm, đã gồm ngày bù và ngày nghỉ kẹp giữa. */
function holidaysOf(year: number): Set<string> {
  const cached = cache.get(year)
  if (cached) return cached

  const set = new Set(baseHolidays(year))

  // 振替休日: lễ rơi Chủ nhật thì ngày KHÔNG-lễ kế tiếp thành ngày nghỉ bù.
  // Duyệt tăng dần để chuỗi 3/5–5/5 dồn ngày bù ra sau cùng (2026: bù vào 6/5).
  for (const day of [...set].sort()) {
    if (dow(day) !== 0) continue
    let d = addDaysISO(day, 1)
    while (set.has(d)) d = addDaysISO(d, 1)
    set.add(d)
  }

  // 国民の休日: ngày thường kẹp giữa hai ngày lễ cũng được nghỉ. Thực tế chỉ xảy
  // ra ở "Tuần lễ Bạc" tháng 9 khi 敬老の日 và 秋分の日 cách nhau đúng một ngày.
  for (const day of [...set]) {
    const gap = addDaysISO(day, 1)
    if (set.has(gap) || dow(gap) === 0) continue
    if (set.has(addDaysISO(gap, 1))) set.add(gap)
  }

  cache.set(year, set)
  return set
}

/** Ngày lễ quốc gia Nhật (đã gồm ngày bù, ngày nghỉ kẹp giữa). */
export function isJapaneseHoliday(isoDate: string): boolean {
  return holidaysOf(Number(isoDate.slice(0, 4))).has(isoDate)
}

/**
 * Ngân hàng Nhật đóng cửa: cuối tuần, ngày lễ, và 31/12–3/1.
 * (1/1 vừa là lễ vừa nằm trong kỳ nghỉ Tết — trùng nhau không sao.)
 */
export function isBankClosed(isoDate: string): boolean {
  const d = dow(isoDate)
  if (d === 0 || d === 6) return true
  const md = isoDate.slice(5)
  if (md === '12-31' || md === '01-02' || md === '01-03') return true
  return isJapaneseHoliday(isoDate)
}

/**
 * Dời sang NGÀY LÀM VIỆC kế tiếp nếu ngân hàng đóng cửa; ngày thường giữ nguyên.
 * Đây là quy tắc "土日祝の場合は翌営業日" của PayPay Card / Rakuten Card.
 */
export function shiftToBusinessDay(isoDate: string): string {
  let d = isoDate
  // Chuỗi đóng cửa dài nhất thực tế là Tết dương (31/12–3/1) cộng cuối tuần kề:
  // 10 vòng là quá dư, chỉ để chặn lặp vô hạn nếu dữ liệu ngày hỏng.
  for (let i = 0; i < 10 && isBankClosed(d); i++) d = addDaysISO(d, 1)
  return d
}
