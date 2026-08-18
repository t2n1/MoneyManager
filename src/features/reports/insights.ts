// Chỉ số thấu hiểu tài chính — thuần, không phụ thuộc React, unit-test được.
// Không gọi `new Date()` để lấy giờ hiện tại: `today` luôn truyền vào (test tất định).

import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'
import type { CurrencyOf } from './aggregate'
import { compareClause } from './headline'

/** (thu − chi) / thu. income <= 0 → null. Có thể âm nếu chi > thu. */
export function savingsRate(income: number, expense: number): number | null {
  if (income <= 0) return null
  return (income - expense) / income
}

// `noSpendStreak` ĐÃ XOÁ (bản 1a §B16). Nó đếm chuỗi ngày không chi tính LÙI từ hôm nay,
// nên với người chi hằng ngày nó ra 0 mỗi ngày trong năm — và bản 1a bỏ ô KPI đó khỏi tab
// Tháng này đúng vì lý do đó. Câu hỏi được giữ, định nghĩa thì đổi: xem `noSpendPattern`
// ở behavior.ts (đếm cả cửa sổ + chuỗi dài nhất), dùng ở tab Sức khỏe cùng chỗ với nhịp
// chi theo thứ.

export interface Insight {
  id: string
  text: string
}

export interface InsightInput {
  /** chi tháng này (base, minor units) */
  expenseThis: number
  /** chi tháng trước (base, minor units) */
  expensePrev: number
  /** tên danh mục chi lớn nhất, null nếu không có */
  topCategoryName: string | null
  /** số tiền danh mục lớn nhất (base) */
  topCategoryAmount: number
  /** tổng chi tháng này (base) */
  expenseTotal: number
}

/** Sinh vài câu gợi ý rule-based; chỉ câu nào đủ dữ liệu. */
export function buildInsights(
  input: InsightInput,
  fmt: (minor: number) => string,
): Insight[] {
  const out: Insight[] = []
  const { expenseThis, expensePrev, topCategoryName, topCategoryAmount, expenseTotal } = input

  if (expensePrev > 0 && expenseThis > 0) {
    const pct = Math.round(((expenseThis - expensePrev) / expensePrev) * 100)
    // Cùng cách đọc với câu tổng trang Báo cáo (compareClause): ≥200% nói "gấp X lần",
    // còn lại nói hơn/kém %. Hai chỗ nói hai kiểu về CÙNG một phép so thì như hai số khác.
    out.push({
      id: 'vs-prev',
      text:
        pct === 0
          ? `Tháng này chi ${fmt(expenseThis)}, ngang tháng trước.`
          : `Tháng này chi ${fmt(expenseThis)}, ${compareClause(pct, 'tháng trước')}.`,
    })
  }

  if (topCategoryName && expenseTotal > 0 && topCategoryAmount > 0) {
    const pct = Math.round((topCategoryAmount / expenseTotal) * 100)
    out.push({
      id: 'top-cat',
      text: `${topCategoryName} chiếm ${pct}% tổng chi tháng này.`,
    })
  }

  return out
}

export interface Forecast {
  /** dự báo tổng chi cuối tháng (base, minor units) */
  projected: number
  /** cận dưới / cận trên của khoảng dự báo. Không đo được độ chênh thì cả hai = projected. */
  low: number
  high: number
  /** Có khoảng thật để nói không (false = chỉ có một con số). */
  hasRange: boolean
  spentSoFar: number
  daysElapsed: number
  daysInMonth: number
}

/**
 * Nội suy tuyến tính chi cả tháng theo tốc độ tới nay, kèm KHOẢNG chứ không chỉ một điểm.
 *
 * Vì sao cần khoảng: một con số đơn đọc như thể chắc chắn, trong khi nó chỉ là phép chia
 * cho vài ngày đầu tháng. Người chi đều mỗi ngày và người dồn hết vào hai ngày cuối tuần
 * có thể ra CÙNG một con số dự báo, nhưng độ tin cậy khác hẳn nhau. permtrack nói "tháng
 * 8 – tháng 9 tuỳ nhịp" thay vì một mốc, và đó là cách nói trung thực hơn.
 *
 * Cách đo: phần đã chi là số THẬT, không có sai số. Sai số chỉ nằm ở phần còn lại của
 * tháng, ước bằng độ lệch chuẩn chi mỗi ngày nhân căn bậc hai số ngày còn lại (sai số của
 * một tổng cộng dồn lớn theo căn bậc hai số hạng, không theo số hạng).
 *
 * `dailySpend` là chi từng ngày đã trôi. Thiếu nó thì vẫn chạy, chỉ là không có khoảng.
 * Khi truyền `fixedSoFar` thì nên truyền chuỗi ngày CHỈ GỒM phần biến đổi — độ chênh
 * của khoản trả một-lần không nói gì về mấy ngày còn lại.
 *
 * `fixedSoFar`: phần trong `spentSoFar` thuộc danh mục chi CỐ ĐỊNH (tiền nhà, đăng ký…).
 * Khoản cố định trả MỘT lần mỗi tháng — nhân nó theo tốc độ ngày là dự báo phình gấp
 * nhiều lần ngay sau hôm trả (tiền nhà 68k trả ngày 6 → nội suy trơn ra ~350k/tháng).
 * Nên phần cố định đã trả được cộng NGUYÊN, chỉ phần biến đổi mới nội suy. Mặt trái
 * chấp nhận được: khoản cố định CHƯA tới ngày trả thì dự báo thiếu phần đó — thiếu
 * một khoản biết trước vẫn trung thực hơn thừa gấp năm lần.
 */
export function forecastMonthEnd(
  spentSoFar: number,
  daysElapsed: number,
  daysInMonth: number,
  dailySpend?: number[],
  fixedSoFar = 0,
): Forecast | null {
  if (daysElapsed < 1 || daysInMonth < 1) return null
  // Kẹp vào [0, spentSoFar]: cố định là một PHẦN của đã-chi, dữ liệu lệch thì thà
  // dự báo = số đã chi còn hơn ra số âm hay số vượt quá cái đã xảy ra.
  const fixed = Math.min(Math.max(fixedSoFar, 0), spentSoFar)
  const variable = spentSoFar - fixed
  const projected = Math.round(fixed + (variable / daysElapsed) * daysInMonth)
  const daysLeft = Math.max(0, daysInMonth - daysElapsed)

  // Dưới 2 ngày dữ liệu thì không có "độ chênh" để nói, và hết ngày rồi thì không còn gì
  // để đoán — cả hai trường hợp trả về một điểm.
  if (!dailySpend || dailySpend.length < 2 || daysLeft === 0) {
    return { projected, low: projected, high: projected, hasRange: false, spentSoFar, daysElapsed, daysInMonth }
  }

  const mean = dailySpend.reduce((s, v) => s + v, 0) / dailySpend.length
  const variance =
    dailySpend.reduce((s, v) => s + (v - mean) ** 2, 0) / dailySpend.length
  const margin = Math.sqrt(variance) * Math.sqrt(daysLeft)

  return {
    projected,
    // Cận dưới không xuống dưới số ĐÃ chi: tiền tiêu rồi không lấy lại được, một khoảng
    // gợi ý "có thể cuối tháng chi ít hơn số đang chi" là khoảng nói dối.
    low: Math.max(spentSoFar, Math.round(projected - margin)),
    high: Math.round(projected + margin),
    hasRange: margin >= 1,
    spentSoFar,
    daysElapsed,
    daysInMonth,
  }
}

/** Trung vị của mảng số. Mảng rỗng → 0. */
export function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

export interface Anomaly {
  transactionId: string
  categoryId: string
  amount: number // base minor (khoản hiện tại)
  median: number // base minor (trung vị lịch sử danh mục)
  ratio: number // amount / median
}

export interface AnomalyOptions {
  threshold: number
  minSamples: number
}

/**
 * Giao dịch chi bất thường: lớn hơn `threshold`× trung vị lịch sử cùng danh mục,
 * chỉ xét danh mục có `>= minSamples` giao dịch lịch sử. historyTxs KHÔNG gồm tháng đang xem.
 */
export function detectAnomalies(
  currentTxs: TransactionRow[],
  historyTxs: TransactionRow[],
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
  opts: AnomalyOptions = { threshold: 3, minSamples: 5 },
): { anomalies: Anomaly[]; hasMissingRate: boolean } {
  const history = new Map<string, number[]>()
  for (const t of historyTxs) {
    // Hoàn tiền là chi âm — không phải "khoản chi bất thường"
    if (t.type !== 'expense' || !t.category_id || t.exclude_from_stats || t.is_refund) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) continue
    const arr = history.get(t.category_id) ?? []
    arr.push(v)
    history.set(t.category_id, arr)
  }
  const medianByCat = new Map<string, number>()
  for (const [cat, arr] of history) {
    if (arr.length >= opts.minSamples) medianByCat.set(cat, median(arr))
  }

  const anomalies: Anomaly[] = []
  let hasMissingRate = false
  for (const t of currentTxs) {
    // Hoàn tiền là chi âm — không phải "khoản chi bất thường"
    if (t.type !== 'expense' || !t.category_id || t.exclude_from_stats || t.is_refund) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    const med = medianByCat.get(t.category_id)
    if (med === undefined || med <= 0) continue
    if (v >= opts.threshold * med) {
      anomalies.push({
        transactionId: t.id,
        categoryId: t.category_id,
        amount: v,
        median: med,
        ratio: v / med,
      })
    }
  }
  anomalies.sort((a, b) => b.ratio - a.ratio)
  return { anomalies, hasMissingRate }
}
