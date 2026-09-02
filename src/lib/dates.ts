// "Tháng" của app có thể bắt đầu từ ngày bất kỳ (profiles.month_start_day, 1–28).
// MỌI query theo tháng phải đi qua getMonthRange — không tự cộng trừ ngày ở nơi khác.

import { shiftToBusinessDay } from './jpHolidays'

/** Tháng hiển thị, xác định bởi tháng dương lịch chứa ngày bắt đầu. month: 1–12. */
export interface MonthKey {
  year: number
  month: number
}

/** Khoảng ngày ISO local 'YYYY-MM-DD'; end là NGÀY LOẠI TRỪ (exclusive). */
export interface MonthRange {
  start: string
  end: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Date → 'YYYY-MM-DD' theo giờ địa phương (không dùng toISOString vì lệch UTC). */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function getMonthRange(key: MonthKey, monthStartDay = 1): MonthRange {
  // monthStartDay ≤ 28 (DB check) nên ngày luôn hợp lệ với mọi tháng
  const start = new Date(key.year, key.month - 1, monthStartDay)
  const end = new Date(key.year, key.month, monthStartDay)
  return { start: toISODate(start), end: toISODate(end) }
}

/** Ngày ISO thuộc "tháng" nào (ngày trước monthStartDay thuộc tháng trước). */
export function monthKeyForDate(dateISO: string, monthStartDay = 1): MonthKey {
  const [year, month, day] = dateISO.split('-').map(Number)
  if (day >= monthStartDay) return { year, month }
  return addMonths({ year, month }, -1)
}

export function addMonths(key: MonthKey, delta: number): MonthKey {
  const d = new Date(key.year, key.month - 1 + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export function formatMonthLabel(key: MonthKey): string {
  return `${key.year}/${pad(key.month)}`
}

/** MonthKey → "YYYY-MM" (dùng cho budgets.month_key). */
export function monthKeyString(key: MonthKey): string {
  return `${key.year}-${pad(key.month)}`
}

/** "YYYY-MM" → MonthKey. */
export function parseMonthKey(s: string): MonthKey {
  const [year, month] = s.split('-').map(Number)
  return { year, month }
}

/** Kẹp ngày bắt đầu tháng về 1–28 (làm tròn; giá trị không hữu hạn → 1). */
export function clampMonthStartDay(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.min(28, Math.max(1, Math.round(n)))
}

/** Số ngày nguyên giữa 2 ngày ISO 'YYYY-MM-DD' (bISO − aISO), theo mốc UTC 00:00. */
export function daysBetween(aISO: string, bISO: string): number {
  const a = Date.parse(aISO + 'T00:00:00Z')
  const b = Date.parse(bISO + 'T00:00:00Z')
  return Math.round((b - a) / 86_400_000)
}

/**
 * Cộng thêm `n` tháng vào một ngày ISO (yyyy-mm-dd), giữ nguyên ngày trong tháng
 * và KẸP về ngày cuối nếu tháng đích ngắn hơn (31/1 + 1 tháng = 28/2, không phải 3/3).
 * Không đụng múi giờ (tách chuỗi). Đây là bản duy nhất — từng có bản chép tay dùng
 * Date.UTC bị tràn tháng trong features/health, cho kết quả khác bản này.
 */
export function addMonthsISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const base = m - 1 + n
  const year = y + Math.floor(base / 12)
  const month = ((base % 12) + 12) % 12
  const lastDay = new Date(year, month + 1, 0).getDate()
  const day = Math.min(d, lastDay)
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

/** Cộng/trừ số ngày vào ngày ISO 'YYYY-MM-DD', trả ISO mới (mốc UTC). */
export function addDaysISO(iso: string, delta: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

// Nhãn thứ trong tuần cho ngày đến hạn thẻ (đã dời sang ngày làm việc nên chỉ rơi T2–T6)
const WEEKDAY_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

/** "T2, 7/27" (tháng/ngày) cho một ngày ISO — dùng cho ngày đến hạn trả thẻ. */
export function dueDateLabel(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  const dow = new Date(iso + 'T00:00:00Z').getUTCDay()
  return `${WEEKDAY_VI[dow]}, ${m}/${d}`
}

/**
 * 'YYYY-MM-DD' → '2026/04/21'. Dạng NGÀY DUY NHẤT hiện ra cho người dùng.
 *
 * Có hàm này vì trước 2026-08-12 mọi ô ngày là `<input type="date">` native, mà dạng
 * chữ của nó do NGÔN NGỮ của trình duyệt quyết định — không HTML, không CSS nào đổi
 * được. Máy để tiếng Anh thì ô ngày đọc ra "April 21, 2026" giữa một app tiếng Việt,
 * và mỗi máy một kiểu. Chuỗi rỗng trả rỗng (ô chưa chọn).
 */
export function formatDateLabel(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${y}/${m}/${d}`
}

/** "8/1" (tháng/ngày) cho một ngày ISO — dùng khi chỉ cần mốc ngày, không cần thứ. */
export function dayMonthLabel(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${m}/${d}`
}

/** "hôm nay" · "ngày mai" · "còn N ngày" từ hôm nay đến hạn. */
export function dueRelativeLabel(todayISO: string, dueISO: string): string {
  const n = daysBetween(todayISO, dueISO)
  if (n <= 0) return 'hôm nay'
  if (n === 1) return 'ngày mai'
  return `còn ${n} ngày`
}

/**
 * Ngày trả thẻ kế tiếp (≥ todayISO) rơi vào `dueDay` (1–31) hằng tháng, đã kẹp về
 * cuối tháng khi tháng ngắn hơn và dời sang NGÀY LÀM VIỆC kế tiếp (qua T7/CN, ngày
 * lễ Nhật, kỳ nghỉ Tết dương) — đúng quy tắc 「土日祝の場合は翌営業日」 của thẻ.
 * Ví dụ dueDay=27, hôm nay sau ngày 27 → ngày 27 (đã dời) của tháng sau.
 */
export function nextCardDueDate(dueDay: number, todayISO: string): string {
  return nextCardDuePeriod(dueDay, todayISO).payISO
}

export interface NextCardDue {
  /** Ngày `dueDay` DANH NGHĨA của kỳ — chưa dời. Dùng suy ngược mốc chốt sao kê. */
  periodISO: string
  /** Ngày tiền thực rời tài khoản — đã dời T7/CN, lễ, Tết dương. */
  payISO: string
}

/**
 * Như `nextCardDueDate` nhưng giữ lại cả ngày DANH NGHĨA của kỳ.
 *
 * Có hàm này vì mốc chốt sao kê phải suy từ ngày danh nghĩa, không từ ngày đã dời:
 * ngày dời có thể nhảy QUA chính ngày chốt (thẻ chốt 1 / trả 1, kỳ 1/8/2026 rơi T7
 * nên rút 3/8 — suy ngược từ 3/8 ra mốc chốt 1/8, tức kỳ SAU) và kéo cả phép chia
 * lệch một tháng so với `runCardAutopayCatchUp`, vốn luôn dùng ngày danh nghĩa.
 */
export function nextCardDuePeriod(dueDay: number, todayISO: string): NextCardDue {
  const [ty, tm] = todayISO.split('-').map(Number)
  for (let i = 0; i < 14; i++) {
    const k = addMonths({ year: ty, month: tm }, i)
    const dim = new Date(k.year, k.month, 0).getDate() // số ngày của tháng k
    const periodISO = `${k.year}-${pad(k.month)}-${pad(Math.min(dueDay, dim))}`
    const payISO = shiftToBusinessDay(periodISO)
    if (payISO >= todayISO) return { periodISO, payISO }
  }
  const periodISO = `${ty}-${pad(tm)}-${pad(dueDay)}`
  return { periodISO, payISO: shiftToBusinessDay(periodISO) }
}

/** Khoảng ngày của cả năm tài chính Y: từ đầu tháng (Y,1) tới cuối tháng (Y,12) (end loại trừ). */
export function getYearRange(year: number, monthStartDay = 1): MonthRange {
  const start = getMonthRange({ year, month: 1 }, monthStartDay).start
  const end = getMonthRange({ year, month: 12 }, monthStartDay).end
  return { start, end }
}

/** Nhãn năm hiển thị. */
export function formatYearLabel(year: number): string {
  return `Năm ${year}`
}

/**
 * Năm DƯƠNG LỊCH 1/1–31/12 — trục thời gian THỨ HAI của app, dành cho thuế Nhật (所得税,
 * 住民税, ふるさと納税, NISA đều chốt theo lịch, không theo ngày lương).
 *
 * Tồn tại để CÓ TÊN GỌI: đọc code thấy `calendarYearRange` là biết chỗ đó cố ý không theo
 * `month_start_day`, không phải ai quên. Dùng `getMonthRange`/`getYearRange` với
 * monthStartDay của người dùng ở đây là báo "đã đủ 38万" khi một lần gửi ngày 28/12 bị
 * đẩy sang "tháng 1" của app.
 */
export function calendarYearRange(year: number): MonthRange {
  return getYearRange(year, 1)
}

/** Năm dương lịch của một ngày ISO — cặp với `calendarYearRange`. */
export function calendarYearOf(iso: string): number {
  return Number(iso.slice(0, 4))
}
