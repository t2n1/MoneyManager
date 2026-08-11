// Dự báo mục tiêu tiết kiệm: với tốc độ tích lũy hiện tại thì bao giờ đạt đích.
// Thuần, không phụ thuộc React. Mọi số ở minor units theo currency TÀI KHOẢN
// (mục tiêu luôn gắn với đúng một tài khoản nên không cần quy đổi).

import { addMonths, monthKeyForDate, type MonthKey } from '../../lib/dates'
import type { TransactionRow } from '../../types/database.types'

/**
 * Số dư tài khoản tăng/giảm trung bình bao nhiêu mỗi tháng, tính trên `months`
 * tháng đã hoàn tất gần nhất.
 *
 * Cộng đủ MỌI dòng tiền chạm tài khoản (thu, chi, chuyển vào, chuyển ra) vì đây
 * là tốc độ số dư thật, không phải tốc độ tiết kiệm lý thuyết. Giao dịch bị loại
 * khỏi thống kê vẫn tính — nó vẫn làm số dư đổi.
 */
export function accountMonthlyGrowth(
  accountId: string,
  txs: TransactionRow[],
  months: MonthKey[],
  monthStartDay: number,
): number | null {
  if (months.length === 0) return null
  const ids = new Set(months.map((k) => `${k.year}-${k.month}`))
  let delta = 0
  for (const t of txs) {
    const key = monthKeyForDate(t.occurred_on, monthStartDay)
    if (!ids.has(`${key.year}-${key.month}`)) continue
    if (t.type === 'income' && t.account_id === accountId) delta += t.amount
    else if (t.type === 'expense' && t.account_id === accountId)
      delta += t.is_refund ? t.amount : -t.amount
    else if (t.type === 'transfer' && t.account_id === accountId) delta -= t.amount
    else if (t.type === 'transfer' && t.to_account_id === accountId)
      delta += t.to_amount ?? t.amount
  }
  return delta / months.length
}

export interface GoalForecast {
  /** đã có bao nhiêu (số dư hiện tại, kẹp ≥ 0) */
  current: number
  target: number
  /** 0..1, kẹp tại 1 */
  ratio: number
  /** còn thiếu bao nhiêu (0 nếu đã đạt) */
  remaining: number
  /** tốc độ tích lũy mỗi tháng (có thể âm) */
  monthlyGrowth: number
  /** số tháng nữa đạt đích; null = không bao giờ theo đà hiện tại */
  monthsLeft: number | null
  /** tháng dự kiến đạt đích; null khi monthsLeft null */
  etaMonth: MonthKey | null
  /** đã đạt đích rồi */
  done: boolean
  /**
   * So với hạn tự đặt: 'ahead' = kịp, 'behind' = trễ, null = không đặt hạn
   * hoặc không dự báo được.
   */
  vsDeadline: 'ahead' | 'behind' | null
}

/** Trần dự báo — quá 50 năm thì con số không còn ý nghĩa gì với người dùng. */
const MAX_MONTHS = 600

/**
 * Bao giờ chạm đích. `monthlyGrowth ≤ 0` (số dư đứng yên hoặc đang tụt) → không
 * đưa ra ngày, vì kéo dài một đường ngang tới vô cực chẳng nói lên điều gì.
 */
export function goalForecast(
  currentBalance: number,
  target: number,
  monthlyGrowth: number | null,
  currentMonth: MonthKey,
  targetDate: string | null,
  monthStartDay: number,
): GoalForecast {
  const current = Math.max(0, currentBalance)
  const remaining = Math.max(0, target - current)
  const done = target > 0 && current >= target
  const growth = monthlyGrowth ?? 0
  const base: GoalForecast = {
    current,
    target,
    ratio: target > 0 ? Math.min(1, current / target) : 0,
    remaining,
    monthlyGrowth: growth,
    monthsLeft: null,
    etaMonth: null,
    done,
    vsDeadline: null,
  }
  if (done || remaining === 0) return { ...base, monthsLeft: 0, etaMonth: currentMonth }
  if (growth <= 0) return base

  const monthsLeft = Math.ceil(remaining / growth)
  if (monthsLeft > MAX_MONTHS) return base
  const etaMonth = addMonths(currentMonth, monthsLeft)

  let vsDeadline: 'ahead' | 'behind' | null = null
  if (targetDate) {
    const deadline = monthKeyForDate(targetDate, monthStartDay)
    const etaIndex = etaMonth.year * 12 + etaMonth.month
    const deadlineIndex = deadline.year * 12 + deadline.month
    vsDeadline = etaIndex <= deadlineIndex ? 'ahead' : 'behind'
  }
  return { ...base, monthsLeft, etaMonth, vsDeadline }
}

/**
 * Cần bỏ vào bao nhiêu MỖI THÁNG để kịp hạn — con số duy nhất mà một mục tiêu nhiều
 * năm gửi được sang trang Ngân sách hàng tháng.
 *
 * `goalForecast` đi theo chiều ngược lại ("với đà này thì bao giờ tới"), hữu ích để
 * nhìn lại nhưng vô dụng lúc lập kế hoạch: nó nói tương lai sẽ ra sao chứ không nói
 * tháng này phải để riêng bao nhiêu.
 *
 * null khi không đặt hạn (không có gì để chia), đã đủ, hoặc hạn đã trôi qua — lúc đó
 * "mỗi tháng bao nhiêu" không còn nghĩa gì, chuyện cần nói là mục tiêu đã trễ.
 *
 * Tính CẢ tháng đến hạn (+1) và làm tròn LÊN: chia đúng số học rồi làm tròn xuống thì
 * tháng cuối vẫn hụt, mà hụt một đồng cũng là không kịp.
 */
export function monthlyNeeded(
  remaining: number,
  targetDate: string | null,
  fromMonth: MonthKey,
  monthStartDay: number,
): number | null {
  if (!targetDate || remaining <= 0) return null
  const deadline = monthKeyForDate(targetDate, monthStartDay)
  const months =
    deadline.year * 12 + deadline.month - (fromMonth.year * 12 + fromMonth.month) + 1
  if (months <= 0) return null
  return Math.ceil(remaining / months)
}
