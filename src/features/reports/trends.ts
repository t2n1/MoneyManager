// Phân tích xu hướng dài hạn — thuần, không phụ thuộc React, unit-test được.
// Khác với aggregate.ts (gom số của MỘT kỳ), file này so sánh NHIỀU kỳ với nhau:
// trung bình trượt, cùng kỳ năm trước, điểm gãy, giá rổ quen thuộc, dịch chuyển hai nửa kỳ.

import type { MonthKey } from '../../lib/dates'

/**
 * Trung bình trượt `window` phần tử gần nhất. Phần tử chưa đủ cửa sổ trả null
 * (không lấy trung bình một phần — sẽ nhiễu đúng chỗ người ta hay nhìn nhất).
 */
export function rollingAverage(values: number[], window: number): (number | null)[] {
  if (window < 1) return values.map(() => null)
  const out: (number | null)[] = []
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= window) sum -= values[i - window]
    out.push(i >= window - 1 ? sum / window : null)
  }
  return out
}

export interface YearOverYearPoint {
  key: MonthKey
  /** giá trị tháng này */
  current: number
  /** giá trị CÙNG THÁNG năm trước; null = chưa có dữ liệu năm ngoái */
  yearAgo: number | null
  /** % thay đổi so với cùng kỳ; null khi năm ngoái = 0 hoặc thiếu dữ liệu */
  deltaPct: number | null
}

/**
 * Ghép từng tháng với cùng tháng của năm trước. `points` phải là chuỗi liên tục
 * theo tháng (cũ → mới); hàm tự tìm phần tử cách đó đúng 12 tháng theo MonthKey
 * nên không phụ thuộc việc chuỗi dài bao nhiêu.
 */
export function yearOverYear(points: { key: MonthKey; value: number }[]): YearOverYearPoint[] {
  const byId = new Map(points.map((p) => [`${p.key.year}-${p.key.month}`, p.value]))
  return points.map((p) => {
    const yearAgo = byId.get(`${p.key.year - 1}-${p.key.month}`) ?? null
    const deltaPct =
      yearAgo === null || yearAgo === 0 ? null : ((p.value - yearAgo) / yearAgo) * 100
    return { key: p.key, current: p.value, yearAgo, deltaPct }
  })
}

// ------------------------------------------------------------
// Điểm gãy xu hướng (change point)
// ------------------------------------------------------------

export interface ChangePoint {
  /** chỉ số phần tử ĐẦU TIÊN của đoạn sau (mức mới bắt đầu từ đây) */
  index: number
  /** trung bình đoạn trước và đoạn sau */
  before: number
  after: number
  /** độ mạnh của cú gãy (thống kê t); càng lớn càng chắc chắn không phải nhiễu */
  score: number
}

export interface ChangePointOptions {
  /** số phần tử tối thiểu mỗi đoạn — dưới mức này thì "xu hướng" chỉ là nhiễu */
  minSegment: number
  /** ngưỡng t để coi là gãy thật */
  threshold: number
  /** số điểm gãy tối đa trả về */
  maxPoints: number
}

const DEFAULT_CP: ChangePointOptions = { minSegment: 3, threshold: 2.5, maxPoints: 3 }

const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length)

/** Điểm cắt tốt nhất trong [from, to) theo thống kê t hai mẫu (phương sai gộp). */
function bestSplit(
  values: number[],
  from: number,
  to: number,
  minSegment: number,
): ChangePoint | null {
  let best: ChangePoint | null = null
  for (let i = from + minSegment; i <= to - minSegment; i++) {
    const a = values.slice(from, i)
    const b = values.slice(i, to)
    const ma = mean(a)
    const mb = mean(b)
    const ss =
      a.reduce((s, x) => s + (x - ma) ** 2, 0) + b.reduce((s, x) => s + (x - mb) ** 2, 0)
    const df = a.length + b.length - 2
    if (df <= 0) continue
    const pooledVar = ss / df
    // Phương sai 0 (mọi tháng giống hệt nhau) mà hai mức khác nhau → gãy tuyệt đối
    const se = Math.sqrt(pooledVar * (1 / a.length + 1 / b.length))
    const score = se === 0 ? (ma === mb ? 0 : Number.POSITIVE_INFINITY) : Math.abs(mb - ma) / se
    if (!best || score > best.score) best = { index: i, before: ma, after: mb, score }
  }
  return best
}

/**
 * Tìm những thời điểm mức chi/thu đổi hẳn (không phải dao động vặt): chia đôi
 * đệ quy (binary segmentation), mỗi lần lấy điểm cắt có thống kê t lớn nhất và
 * chỉ nhận nếu vượt ngưỡng. Trả về theo thứ tự thời gian.
 *
 * Cần ít nhất 2×minSegment phần tử; ít hơn → mảng rỗng.
 */
export function detectChangePoints(
  values: number[],
  opts: Partial<ChangePointOptions> = {},
): ChangePoint[] {
  const { minSegment, threshold, maxPoints } = { ...DEFAULT_CP, ...opts }
  const found: ChangePoint[] = []
  const search = (from: number, to: number) => {
    if (found.length >= maxPoints || to - from < minSegment * 2) return
    const cp = bestSplit(values, from, to, minSegment)
    if (!cp || cp.score < threshold) return
    found.push(cp)
    search(from, cp.index)
    search(cp.index, to)
  }
  search(0, values.length)
  return found.sort((a, b) => a.index - b.index)
}

// ------------------------------------------------------------
// Giá của rổ quen thuộc
//
// Trước đây khối này tên là "lạm phát của riêng bạn". Tên đó sai: lạm phát là thay
// đổi GIÁ, còn app chỉ có tổng tiền mỗi danh mục — không có đơn giá, không có số
// lượng. Chi ít hơn vì mua ít hơn ra cùng một con số với chi ít hơn vì giá giảm,
// nên không thể tách. Tên mới nói đúng cái đo được: cùng rổ danh mục đó, kỳ này
// tốn bao nhiêu so với kỳ trước.
// ------------------------------------------------------------

export interface BasketCost {
  /** tỷ lệ thay đổi của RỔ CHUNG (0.06 = tốn thêm 6%) */
  rate: number
  /** số danh mục có mặt ở cả hai kỳ */
  basketSize: number
  /** tỷ trọng rổ chung trên tổng chi kỳ hiện tại (0..1) — thấp thì con số kém tin */
  coverage: number
  /** tổng chi của rổ ở hai kỳ, để hiển thị cho dễ hiểu */
  currentTotal: number
  previousTotal: number
}

/**
 * Rổ quen thuộc tốn bao nhiêu: so tổng chi của CÙNG MỘT RỔ danh mục giữa hai kỳ
 * dài bằng nhau. Chỉ lấy danh mục có chi ở cả hai kỳ — nếu không, việc năm nay mới
 * phát sinh khoản "học phí" sẽ bị tính nhầm thành rổ đắt lên.
 *
 * KHÔNG PHẢI CHỈ SỐ GIÁ. Con số này gồm cả việc mua ít hơn hoặc nhiều hơn. Mọi
 * chỗ hiển thị nó bắt buộc kèm câu đó — xem `BASKET_COST_CAVEAT`.
 *
 * Rổ chung rỗng hoặc kỳ trước = 0 → null.
 */
export function basketCost(
  currentByCat: Map<string, number>,
  previousByCat: Map<string, number>,
): BasketCost | null {
  let currentTotal = 0
  let previousTotal = 0
  let basketSize = 0
  for (const [cat, cur] of currentByCat) {
    const prev = previousByCat.get(cat)
    if (prev === undefined || prev <= 0 || cur <= 0) continue
    currentTotal += cur
    previousTotal += prev
    basketSize++
  }
  if (basketSize === 0 || previousTotal <= 0) return null
  const grandTotal = [...currentByCat.values()].reduce((s, x) => s + Math.max(x, 0), 0)
  return {
    rate: currentTotal / previousTotal - 1,
    basketSize,
    coverage: grandTotal > 0 ? currentTotal / grandTotal : 0,
    currentTotal,
    previousTotal,
  }
}

/** Câu bắt buộc đi kèm mọi chỗ in `basketCost` — đừng bỏ, đừng viết lại nhẹ hơn. */
export const BASKET_COST_CAVEAT = 'Gồm cả việc mua ít hơn — không phải chỉ số giá.'

// ------------------------------------------------------------
// Dịch chuyển giữa hai nửa kỳ
//
// Chỗ này từng là "co giãn lối sống" (%Δchi / %Δthu). Đã bỏ hẳn, hai lý do:
//
// 1. SAI CHIỀU. Hệ số suy từ một đoạn thu GIẢM rồi được đọc thành "thu tăng thì chi
//    phình theo bấy nhiêu". Phép ngoại suy ngược chiều đó không có căn cứ: người ta
//    cắt chi khi thu hụt không đối xứng với việc tiêu thêm khi thu dôi.
// 2. MỘT ĐIỂM KHÔNG DỰNG ĐƯỢC ĐƯỜNG. Muốn có hệ số co giãn cần nhiều lần thu đổi
//    mức. Trong 24 tháng chỉ có MỘT lần đổi nếp, nên "hệ số" thật ra là tỷ số của
//    đúng hai điểm — đổi cách chia nửa kỳ là nó ra số khác.
//
// Thay bằng bốn con số phát biểu đúng cái quan sát được: trung bình thu và chi mỗi
// tháng của hai nửa, và tỷ lệ giữ lại suy ra từ chúng.
// ------------------------------------------------------------

export interface HalfPeriodShift {
  /** trung bình mỗi tháng của nửa đầu / nửa sau */
  incomeBefore: number
  incomeAfter: number
  expenseBefore: number
  expenseAfter: number
  /** % thay đổi giữa hai nửa (âm = giảm) */
  incomeChangePct: number
  expenseChangePct: number
  /** tỷ lệ giữ lại (thu − chi) / thu của từng nửa; null khi thu ≤ 0 */
  keptRateBefore: number | null
  keptRateAfter: number | null
  /** số tháng mỗi nửa — để nói ra mẫu số */
  monthsPerHalf: number
}

/**
 * So trung bình tháng của nửa sau với nửa đầu. Số tháng lẻ thì bỏ tháng giữa để hai
 * nửa không chồng lấn.
 *
 * KHÔNG suy ra hệ số nào từ hai con số này. Nếu giữa hai nửa có một cú đổi nếp thì
 * chúng nói về HAI NẾP SỐNG KHÁC NHAU, không phải về một đường co giãn — chỗ hiển
 * thị phải nói ra điều đó (`detectChangePoints` cho biết cú đổi nằm ở đâu).
 *
 * Cần ≥ 4 tháng (mỗi nửa ≥ 2) và nửa đầu phải có thu > 0.
 */
export function halfPeriodShift(incomes: number[], expenses: number[]): HalfPeriodShift | null {
  const n = Math.min(incomes.length, expenses.length)
  if (n < 4) return null
  const half = Math.floor(n / 2)
  const incomeBefore = mean(incomes.slice(0, half))
  const incomeAfter = mean(incomes.slice(n - half))
  const expenseBefore = mean(expenses.slice(0, half))
  const expenseAfter = mean(expenses.slice(n - half))
  if (incomeBefore <= 0) return null
  const keptRate = (inc: number, exp: number) => (inc > 0 ? (inc - exp) / inc : null)
  return {
    incomeBefore,
    incomeAfter,
    expenseBefore,
    expenseAfter,
    incomeChangePct: ((incomeAfter - incomeBefore) / incomeBefore) * 100,
    expenseChangePct:
      expenseBefore > 0 ? ((expenseAfter - expenseBefore) / expenseBefore) * 100 : 0,
    keptRateBefore: keptRate(incomeBefore, expenseBefore),
    keptRateAfter: keptRate(incomeAfter, expenseAfter),
    monthsPerHalf: half,
  }
}

// ---------------------------------------------------------------------------------
// Mùa vụ NÓI VỀ THÁNG TỚI (bản vẽ 15a mục 3)
//
// Khối "So với chính mình năm ngoái" mô tả QUÁ KHỨ: 12 tháng qua chi nhiều hơn 12 tháng
// trước đó bao nhiêu. Đúng nhưng không làm được gì với nó. 15a đổi hướng câu hỏi: trong
// những tháng SẮP TỚI, tháng nào vốn nặng hơn thường lệ, và từ giờ tới đó cần để thêm
// bao nhiêu mỗi tháng.
//
// Ví dụ trong §4.5: "tháng 12 nặng hơn 34% — còn 4 tháng để dành thêm ¥28k/tháng".

export interface SeasonalOutlook {
  /** Tháng dương lịch đang nói tới (1–12). */
  month: number
  /** Còn bao nhiêu tháng nữa tới nó. */
  monthsAway: number
  /** TB chi của riêng tháng đó, qua các năm có dữ liệu. */
  avgForMonth: number
  /** TB chi của mọi tháng trong cửa sổ. */
  avgOverall: number
  /** Nặng hơn trung bình bao nhiêu phần trăm. */
  heavierPct: number
  /** Phần vượt trung bình, bằng tiền. */
  extra: number
  /** Chia phần vượt cho số tháng còn lại — số cần để thêm mỗi tháng. */
  savePerMonth: number
  /** Tháng đó xuất hiện mấy lần trong dữ liệu. 1 lần thì KHÔNG gọi là mùa vụ. */
  occurrences: number
}

export interface SeasonalOptions {
  /** Dưới mức này thì không đáng nói. */
  minHeavierPct: number
  /** Tháng đó phải xuất hiện ít nhất bấy nhiêu lần mới coi là một nếp mùa vụ. */
  minOccurrences: number
  /** Chỉ nhìn trước bấy nhiêu tháng. */
  horizon: number
}

const DEFAULT_SEASONAL: SeasonalOptions = { minHeavierPct: 15, minOccurrences: 2, horizon: 12 }

/**
 * Tháng nặng nhất trong `horizon` tháng tới, hoặc null nếu không tháng nào đáng nói.
 *
 * `points` là chuỗi chi theo tháng (bất kỳ độ dài), `currentMonth` là tháng dương lịch
 * hiện tại. Chỉ xét các tháng SAU tháng hiện tại — nói "tháng này vốn nặng" thì đã muộn,
 * cả điểm của khối này là còn thời gian để dành thêm.
 *
 * `minOccurrences: 2` là ràng buộc quan trọng nhất: một tháng 12 duy nhất trong dữ liệu
 * không phải mùa vụ, nó là một tháng 12. Thiếu chốt này thì với 12 tháng dữ liệu app sẽ
 * gọi MỌI tháng là mùa vụ.
 */
export function seasonalOutlook(
  points: { month: number; expense: number }[],
  currentMonth: number,
  opts: Partial<SeasonalOptions> = {},
): SeasonalOutlook | null {
  const { minHeavierPct, minOccurrences, horizon } = { ...DEFAULT_SEASONAL, ...opts }
  if (points.length === 0) return null

  const avgOverall = points.reduce((s, p) => s + p.expense, 0) / points.length
  if (avgOverall <= 0) return null

  let best: SeasonalOutlook | null = null
  for (let ahead = 1; ahead <= horizon; ahead++) {
    // ((currentMonth - 1 + ahead) % 12) + 1 — đi vòng qua tháng 12 về tháng 1.
    const m = ((currentMonth - 1 + ahead) % 12) + 1
    const of = points.filter((p) => p.month === m)
    if (of.length < minOccurrences) continue
    const avgForMonth = of.reduce((s, p) => s + p.expense, 0) / of.length
    const heavierPct = Math.round(((avgForMonth - avgOverall) / avgOverall) * 100)
    if (heavierPct < minHeavierPct) continue
    const extra = Math.round(avgForMonth - avgOverall)
    const cand: SeasonalOutlook = {
      month: m,
      monthsAway: ahead,
      avgForMonth: Math.round(avgForMonth),
      avgOverall: Math.round(avgOverall),
      heavierPct,
      extra,
      savePerMonth: Math.round(extra / ahead),
      occurrences: of.length,
    }
    // Nặng hơn thì thắng; bằng nhau thì lấy tháng GẦN hơn (ít thời gian chuẩn bị hơn).
    if (!best || cand.heavierPct > best.heavierPct) best = cand
  }
  return best
}
