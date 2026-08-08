// Khoản SẮP CHI — thuần, không phụ thuộc React, test được.
//
// Một khoản sắp chi là tiền CHƯA tiêu mà sẽ phải tiêu. Nó có hai độ chắc chắn (xem
// migration 0038): chốt ngày ('day') hay mới biết tháng ('month'). Và nó có thể bật
// nhắc hoặc không — "sửa nhà tháng 10" thì chỉ cần nằm trong danh sách cho mình nhớ,
// còn "đóng phí vệ sinh 20/8" thì phải kêu.

import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { PlannedExpenseRow } from '../../types/database.types'

/** Khoảng cách ngày (b − a); cả hai là ISO 'YYYY-MM-DD'. */
export function daysUntil(fromISO: string, toISO: string): number {
  const a = Date.parse(fromISO + 'T00:00:00Z')
  const b = Date.parse(toISO + 'T00:00:00Z')
  return Math.round((b - a) / 86_400_000)
}

export interface PlannedDue {
  id: string
  title: string
  dueISO: string
  /** Số ngày tới hạn; ÂM = đã quá hạn bấy nhiêu ngày. */
  daysLeft: number
  amount: number
  currency: CurrencyCode
}

/**
 * Khoản đang cần nhắc: còn `planned`, CÓ bật nhắc, và đã vào tầm nhắc.
 *
 * Khoản `remind_days_before = null` không bao giờ xuất hiện ở đây — đó là chủ ý của
 * người dùng: có những dự tính chỉ cần nằm trong danh sách, kêu lên là phiền.
 *
 * Khoản đã quá hạn thì KHÔNG tự tắt: một việc phải chi mà quá ngày vẫn là việc phải
 * chi. Nó chỉ hết khi được đánh dấu đã chi hoặc bỏ.
 *
 * Xếp theo hạn tăng dần: trễ nhất lên đầu.
 */
export function plannedDue(rows: PlannedExpenseRow[], todayISO: string): PlannedDue[] {
  const out: PlannedDue[] = []
  for (const r of rows) {
    if (r.status !== 'planned') continue
    if (r.remind_days_before === null) continue
    const daysLeft = daysUntil(todayISO, r.due_on)
    if (daysLeft > r.remind_days_before) continue
    out.push({
      id: r.id,
      title: r.title,
      dueISO: r.due_on,
      daysLeft,
      amount: r.amount,
      currency: r.currency,
    })
  }
  return out.sort((a, b) => (a.dueISO < b.dueISO ? -1 : a.dueISO > b.dueISO ? 1 : 0))
}

export interface PlannedMonth {
  /** 'YYYY-MM' */
  monthKey: string
  items: PlannedExpenseRow[]
  /** Tổng ước tính quy về base. Khoản thiếu tỷ giá bị bỏ và bật `hasMissingRate`. */
  totalBase: number
  hasMissingRate: boolean
}

/**
 * Gom các khoản CÒN PHẢI CHI theo tháng đến hạn, tháng gần nhất trước.
 *
 * Gom theo tháng dương lịch chứ không theo `month_start_day`: đây là kế hoạch, người
 * ta nghĩ bằng "tháng 10" chứ không nghĩ bằng chu kỳ sổ sách của mình.
 *
 * Khoản đã chi / đã bỏ KHÔNG có mặt: danh sách này trả lời "còn phải lo bao nhiêu",
 * mà tiền đã tiêu thì hết lo rồi.
 */
export function groupPlannedByMonth(
  rows: PlannedExpenseRow[],
  base: CurrencyCode,
  rates: Rates,
): PlannedMonth[] {
  const byMonth = new Map<string, PlannedMonth>()

  for (const r of rows) {
    if (r.status !== 'planned') continue
    const monthKey = r.due_on.slice(0, 7)
    const m = byMonth.get(monthKey) ?? {
      monthKey,
      items: [],
      totalBase: 0,
      hasMissingRate: false,
    }
    m.items.push(r)
    const v = convertToBase(r.amount, r.currency, base, rates)
    if (v === null) m.hasMissingRate = true
    else m.totalBase += v
    byMonth.set(monthKey, m)
  }

  for (const m of byMonth.values()) {
    m.items.sort((a, b) => a.due_on.localeCompare(b.due_on) || a.title.localeCompare(b.title, 'vi'))
  }

  return [...byMonth.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey))
}

export interface PlannedOutlook {
  /** Tổng ước tính (base) của các khoản đến hạn trong `months` tháng tới. */
  totalBase: number
  count: number
  hasMissingRate: boolean
}

/**
 * "Từ nay tới hết N tháng nữa cần bao nhiêu" — con số duy nhất đáng đặt lên đầu màn.
 *
 * Tính CẢ khoản đã quá hạn mà chưa chi: nó vẫn là tiền chưa trả, bỏ ra khỏi tổng thì
 * con số nhìn nhẹ đi một cách sai sự thật.
 */
export function plannedOutlook(
  rows: PlannedExpenseRow[],
  todayISO: string,
  months: number,
  base: CurrencyCode,
  rates: Rates,
): PlannedOutlook {
  // Mốc cuối = hết tháng thứ `months` tính từ tháng hiện tại.
  const [y, m] = todayISO.split('-').map(Number)
  const total = y * 12 + (m - 1) + months
  const endKey = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`

  let totalBase = 0
  let count = 0
  let hasMissingRate = false

  for (const r of rows) {
    if (r.status !== 'planned') continue
    if (r.due_on.slice(0, 7) > endKey) continue
    count++
    const v = convertToBase(r.amount, r.currency, base, rates)
    if (v === null) hasMissingRate = true
    else totalBase += v
  }

  return { totalBase, count, hasMissingRate }
}
