// "Tháng" của app có thể bắt đầu từ ngày bất kỳ (profiles.month_start_day, 1–28).
// MỌI query theo tháng phải đi qua getMonthRange — không tự cộng trừ ngày ở nơi khác.

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
  return `Tháng ${key.month}/${key.year}`
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

/** Cộng/trừ số ngày vào ngày ISO 'YYYY-MM-DD', trả ISO mới (mốc UTC). */
export function addDaysISO(iso: string, delta: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
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
