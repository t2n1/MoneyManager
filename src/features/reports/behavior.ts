// Phân tích HÀNH VI chi tiêu — thuần, không phụ thuộc React, unit-test được.
// Trả lời: tiền chảy vào đâu là chính (Pareto), một khoản chi điển hình là bao
// nhiêu (trung vị), tiêu mạnh nhất lúc nào (ngày lương / thứ trong tuần), và
// mỗi tháng mất bao nhiêu cho các khoản trả đều đặn.

import type { RecurringFrequency } from '../../lib/recurring'
import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { RecurringRuleRow, TransactionRow } from '../../types/database.types'
import type { CategorySlice, CurrencyOf } from './aggregate'

// ------------------------------------------------------------
// Pareto 80/20
// ------------------------------------------------------------

export interface ParetoResult {
  /** số danh mục ÍT NHẤT gộp lại đạt ngưỡng (mặc định 80% tổng chi) */
  count: number
  /** tổng của nhóm đó */
  total: number
  /** tỷ trọng thật của nhóm đó (≥ ngưỡng) */
  share: number
  /** tổng số danh mục có chi > 0 */
  categoryCount: number
  /** id các danh mục trong nhóm, theo thứ tự lớn → nhỏ */
  categoryIds: string[]
}

/**
 * Bao nhiêu danh mục "gánh" phần lớn chi tiêu: cộng dồn từ lớn xuống nhỏ cho tới
 * khi chạm ngưỡng. Biết "3/18 danh mục chiếm 80% tiền" thì biết nên siết ở đâu.
 * Slices phải đã sắp giảm dần (categoryBreakdown trả về đúng như vậy).
 */
export function paretoCut(slices: CategorySlice[], threshold = 0.8): ParetoResult | null {
  const positive = slices.filter((s) => s.amount > 0)
  const grand = positive.reduce((s, x) => s + x.amount, 0)
  if (grand <= 0) return null
  const sorted = [...positive].sort((a, b) => b.amount - a.amount)
  const ids: string[] = []
  let running = 0
  for (const s of sorted) {
    ids.push(s.categoryId)
    running += s.amount
    if (running / grand >= threshold) break
  }
  return {
    count: ids.length,
    total: running,
    share: running / grand,
    categoryCount: positive.length,
    categoryIds: ids,
  }
}

// ------------------------------------------------------------
// Phân bố độ lớn một khoản chi
// ------------------------------------------------------------

export interface SpendPercentiles {
  count: number
  median: number
  p75: number
  p90: number
  max: number
  /** trung bình — để đối chiếu với trung vị: lệch nhiều = có vài khoản khổng lồ kéo lên */
  mean: number
  /** Phân vị 5 và 95 — khoảng chứa 90% số lần chi, đã bỏ hai đuôi cực trị. */
  p5: number
  p95: number
  /** Từng khoản chi đã quy đổi, đã sắp tăng dần — để dựng cột phân bố. */
  values: number[]
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/**
 * Một khoản chi điển hình của bạn to cỡ nào. Dùng trung vị thay vì trung bình vì
 * một lần mua điện thoại đủ kéo trung bình lệch hẳn khỏi đời thực.
 * Hoàn tiền bị loại (không phải "một khoản chi").
 */
export function spendPercentiles(
  txs: TransactionRow[],
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): SpendPercentiles | null {
  const values: number[] = []
  for (const t of txs) {
    if (t.type !== 'expense' || t.is_debt_flow || t.exclude_from_stats || t.is_refund) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null || v <= 0) continue
    values.push(v)
  }
  if (values.length === 0) return null
  values.sort((a, b) => a - b)
  return {
    count: values.length,
    median: quantile(values, 0.5),
    p75: quantile(values, 0.75),
    p90: quantile(values, 0.9),
    max: values[values.length - 1],
    mean: values.reduce((s, x) => s + x, 0) / values.length,
    p5: quantile(values, 0.05),
    p95: quantile(values, 0.95),
    values,
  }
}

// ------------------------------------------------------------
// Hiệu ứng ngày lương
// ------------------------------------------------------------

/**
 * Ngày lương suy ra từ chính giao dịch Thu: lấy các khoản thu lớn (≥ nửa khoản
 * thu lớn nhất) — người dùng KHÔNG phải khai báo gì thêm.
 */
export function detectPaydays(
  txs: TransactionRow[],
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): string[] {
  const incomes: { date: string; value: number }[] = []
  for (const t of txs) {
    if (t.type !== 'income' || t.is_debt_flow || t.exclude_from_stats) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null || v <= 0) continue
    incomes.push({ date: t.occurred_on, value: v })
  }
  if (incomes.length === 0) return []
  const biggest = incomes.reduce((m, x) => Math.max(m, x.value), 0)
  const cut = biggest / 2
  return [...new Set(incomes.filter((x) => x.value >= cut).map((x) => x.date))].sort()
}

export interface PaydayEffect {
  /** chi trung bình MỖI NGÀY trong cửa sổ ngay sau ngày lương */
  afterPayday: number
  /** chi trung bình mỗi ngày ở những ngày còn lại */
  otherDays: number
  /** afterPayday / otherDays; 1.8 = ngay sau lương tiêu gấp 1,8 lần ngày thường */
  ratio: number
  daysInWindow: number
  daysOutside: number
  paydayCount: number
}

const addDays = (iso: string, n: number): string => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Sau khi nhận lương có tiêu mạnh tay hơn không: so mức chi trung bình mỗi ngày
 * trong `windowDays` ngày kể từ ngày lương với những ngày còn lại.
 * Cần cả hai nhóm ngày đều có mặt, nếu không → null.
 */
export function paydayEffect(
  dailyExpense: { date: string; expense: number }[],
  paydays: string[],
  windowDays = 3,
): PaydayEffect | null {
  if (paydays.length === 0 || dailyExpense.length === 0) return null
  const window = new Set<string>()
  for (const p of paydays) {
    for (let i = 0; i < windowDays; i++) window.add(addDays(p, i))
  }
  let inSum = 0
  let inDays = 0
  let outSum = 0
  let outDays = 0
  for (const d of dailyExpense) {
    if (window.has(d.date)) {
      inSum += d.expense
      inDays++
    } else {
      outSum += d.expense
      outDays++
    }
  }
  if (inDays === 0 || outDays === 0) return null
  const afterPayday = inSum / inDays
  const otherDays = outSum / outDays
  return {
    afterPayday,
    otherDays,
    ratio: otherDays > 0 ? afterPayday / otherDays : 0,
    daysInWindow: inDays,
    daysOutside: outDays,
    paydayCount: paydays.length,
  }
}

// ------------------------------------------------------------
// Chi theo thứ trong tuần
// ------------------------------------------------------------

export interface WeekdayBucket {
  /** 0 = Chủ nhật … 6 = Thứ bảy (khớp Date.getUTCDay) */
  dow: number
  total: number
  days: number
  avg: number
}

export const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

/** Chi trung bình theo từng thứ trong tuần, để lộ thói quen cuối tuần. */
export function weekdayProfile(
  dailyExpense: { date: string; expense: number }[],
): WeekdayBucket[] {
  const buckets: WeekdayBucket[] = WEEKDAY_LABELS.map((_, dow) => ({
    dow,
    total: 0,
    days: 0,
    avg: 0,
  }))
  for (const d of dailyExpense) {
    const dow = new Date(d.date + 'T00:00:00Z').getUTCDay()
    buckets[dow].total += d.expense
    buckets[dow].days++
  }
  for (const b of buckets) b.avg = b.days > 0 ? b.total / b.days : 0
  return buckets
}

// ------------------------------------------------------------
// Ngày không chi
// ------------------------------------------------------------

export interface NoSpendPattern {
  /** số ngày trong cửa sổ không có đồng chi nào */
  days: number
  /** tổng số ngày của cửa sổ — mẫu số, để "12 ngày" không bị đọc là 12/30 */
  total: number
  /** chuỗi ngày không chi DÀI NHẤT trong cửa sổ */
  longestRun: number
}

/**
 * Ngày không chi trong cả cửa sổ, KHÔNG phải chuỗi đang chạy tính lùi từ hôm nay.
 *
 * Bản trước là `noSpendStreak` ở insights.ts: đếm lùi từ hôm nay tới lúc gặp ngày có
 * chi, giới hạn trong tháng tài chính. Với người chi hằng ngày nó ra 0 mỗi ngày trong
 * năm — bản 1a bỏ nó khỏi ô KPI của tab Tháng này đúng vì lý do đó (§B16), và một con
 * số luôn bằng 0 thì dời sang tab khác vẫn luôn bằng 0.
 *
 * Nên định nghĩa đổi cùng lúc với chỗ đứng: cửa sổ là cả quãng đang xét (6 tháng ở tab
 * Sức khỏe), và câu trả lời là ĐẾM + chuỗi dài nhất. Hai số đó nói được cái chuỗi-đang-
 * chạy không nói: có bao nhiêu ngày rỗng trong nếp, và người này có bao giờ nghỉ tiêu
 * hai ngày liền hay không.
 *
 * `expense` ở đây là số đã trừ hoàn tiền (`expenseSign`), nên một ngày chỉ có hoàn tiền
 * ra số ÂM — vẫn là ngày có phát sinh, không phải ngày không chi. Chỉ đúng 0 mới tính.
 */
export function noSpendPattern(
  dailyExpense: { date: string; expense: number }[],
): NoSpendPattern {
  let days = 0
  let longestRun = 0
  let run = 0
  for (const d of dailyExpense) {
    if (d.expense === 0) {
      days++
      run++
      if (run > longestRun) longestRun = run
    } else {
      run = 0
    }
  }
  return { days, total: dailyExpense.length, longestRun }
}

// ------------------------------------------------------------
// Khoản trả đều đặn (thuê bao)
// ------------------------------------------------------------

/** Số kỳ mỗi tháng của một tần suất (tuần ≈ 52/12 kỳ). */
export const PERIODS_PER_MONTH: Record<RecurringFrequency, number> = {
  weekly: 52 / 12,
  monthly: 1,
  yearly: 1 / 12,
}

export interface SubscriptionSummary {
  /** tổng quy về MỖI THÁNG (base minor) */
  monthly: number
  /** tổng quy về mỗi năm */
  yearly: number
  count: number
  /** từng khoản, sắp giảm dần theo chi phí tháng */
  items: { id: string; note: string; monthly: number; frequency: RecurringFrequency }[]
  hasMissingRate: boolean
}

/**
 * Mỗi tháng mất bao nhiêu cho những thứ tự động trừ tiền. Quy mọi tần suất về
 * "mỗi tháng" để so sánh được: gói năm 12.000 = 1.000/tháng.
 * Chỉ tính rule CHI đang chạy (không tạm dừng, chưa hết hạn tại `today`).
 */
export function subscriptionSummary(
  rules: RecurringRuleRow[],
  today: string,
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): SubscriptionSummary {
  const items: SubscriptionSummary['items'] = []
  let monthly = 0
  let hasMissingRate = false
  for (const r of rules) {
    if (r.type !== 'expense' || r.is_paused) continue
    if (r.end_on && r.end_on < today) continue
    const v = convertToBase(r.amount, currencyOf(r.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    const perMonth = v * PERIODS_PER_MONTH[r.frequency]
    monthly += perMonth
    items.push({ id: r.id, note: r.note, monthly: perMonth, frequency: r.frequency })
  }
  items.sort((a, b) => b.monthly - a.monthly)
  return { monthly, yearly: monthly * 12, count: items.length, items, hasMissingRate }
}

// ------------------------------------------------------------
// Quy đổi giờ làm
// ------------------------------------------------------------

/**
 * Món này bằng mấy giờ làm việc. Cùng một con số tiền, đọc theo giờ làm thường
 * cho cảm giác thật hơn nhiều. Chưa khai lương giờ → null.
 */
export function hoursOfWork(amountBase: number, hourlyWage: number | null): number | null {
  if (!hourlyWage || hourlyWage <= 0 || amountBase <= 0) return null
  return amountBase / hourlyWage
}
