// Lịch trả góp dự kiến (mục AG) — thuần, không phụ thuộc React, để unit-test được.
// Mọi số tiền ở minor units (integer) theo currency của khoản nợ.
// Lãi suất truyền theo basis points/năm (550 = 5.50%/năm). Đây là ƯỚC TÍNH theo
// công thức niên kim (equal payment); ngân hàng thực tế có thể làm tròn khác chút.

/** Cộng thêm `n` tháng vào một ngày ISO (yyyy-mm-dd), giữ nguyên ngày trong tháng
 *  (kẹp về ngày cuối nếu tháng đích ngắn hơn). Không đụng múi giờ (tách chuỗi). */
export function addMonthsISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const base = m - 1 + n
  const year = y + Math.floor(base / 12)
  const month = ((base % 12) + 12) % 12
  const lastDay = new Date(year, month + 1, 0).getDate()
  const day = Math.min(d, lastDay)
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

/**
 * Tiền trả mỗi kỳ (minor units) theo công thức niên kim.
 * bps = 0 → chia đều gốc. Trả về số nguyên (làm tròn).
 */
export function monthlyPayment(principalMinor: number, bps: number, termMonths: number): number {
  if (termMonths <= 0) return 0
  if (bps <= 0) return Math.round(principalMinor / termMonths)
  const r = bps / 10000 / 12 // lãi suất tháng (thập phân)
  const factor = Math.pow(1 + r, termMonths)
  return Math.round((principalMinor * r * factor) / (factor - 1))
}

export interface ScheduleRow {
  /** kỳ thứ mấy, 1-based */
  index: number
  /** ngày dự kiến trả (ISO) */
  dueOn: string
  /** tổng trả kỳ này (minor units) */
  payment: number
  /** phần lãi (minor units) */
  interest: number
  /** phần gốc (minor units) */
  principal: number
  /** dư nợ còn lại sau kỳ này (minor units, ≥ 0) */
  balance: number
}

export interface Schedule {
  rows: ScheduleRow[]
  /** tiền trả đều mỗi kỳ (kỳ cuối có thể lệch chút để về 0) */
  monthly: number
  /** tổng lãi phải trả cả kỳ hạn (minor units) */
  totalInterest: number
  /** tổng phải trả = gốc + lãi (minor units) */
  totalPaid: number
}

/**
 * Dựng lịch trả góp. `startISO` = ngày kỳ đầu (thường due_on hoặc ngày tạo).
 * Kỳ cuối tự điều chỉnh để dư nợ về đúng 0 (bù sai số làm tròn).
 */
export function buildSchedule(params: {
  principalMinor: number
  bps: number
  termMonths: number
  startISO: string
}): Schedule {
  const { principalMinor, bps, termMonths, startISO } = params
  const monthly = monthlyPayment(principalMinor, bps, termMonths)
  const r = bps > 0 ? bps / 10000 / 12 : 0
  const rows: ScheduleRow[] = []
  let balance = principalMinor
  let totalInterest = 0

  for (let i = 1; i <= termMonths; i++) {
    const interest = Math.round(balance * r)
    let principalPart = monthly - interest
    // Kỳ cuối (hoặc khi gốc gần hết): trả nốt phần dư
    if (i === termMonths || principalPart >= balance) {
      principalPart = balance
    }
    const payment = principalPart + interest
    balance -= principalPart
    totalInterest += interest
    rows.push({
      index: i,
      dueOn: addMonthsISO(startISO, i - 1),
      payment,
      interest,
      principal: principalPart,
      balance: Math.max(0, balance),
    })
    if (balance <= 0) break
  }

  const totalPaid = principalMinor + totalInterest
  return { rows, monthly, totalInterest, totalPaid }
}
