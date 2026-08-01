// Luật đọc biểu đồ — thuần, không React, test được (verdicts.test.ts).
//
// Mỗi hàm trả về SỐ + mức, không trả về câu tiếng Việt: câu chữ nằm ở thẻ (cần <b>,
// cần formatMoney theo tiền tệ đang xem), còn ở đây chỉ là quyết định "tốt hay tệ".
// Nhờ vậy test kiểm được đúng phần dễ sai (ngưỡng, mẫu số, tháng nào bị loại) mà
// không phải so chuỗi tiếng Việt.
//
// NGUYÊN TẮC CHUNG, đây là chỗ dễ sai nhất: mọi kết luận chỉ tính trên tháng ĐÃ
// HOÀN TẤT. Tháng đang chạy dở luôn có số thấp giả (mới qua 5 ngày), mà chế độ Năm
// còn liệt kê đủ 12 tháng nên các tháng CHƯA TỚI đều là 0. Đem những tháng đó vào
// trung bình thì thẻ sẽ khen "chi giảm 60%" vào ngày mùng 3 hằng tháng.
import type { MonthKey } from '../../lib/dates'
import type { NoteTone } from '../../components/VerdictNote'
import type { MonthlyPoint } from './aggregate'

/** Thứ tự tuyệt đối của một tháng, để so trước/sau. */
const keyIndex = (k: MonthKey) => k.year * 12 + k.month

/**
 * Bỏ tháng đang chạy dở (và mọi tháng sau nó), rồi bỏ các tháng RỖNG ở hai đầu.
 * Tháng rỗng ở giữa thì GIỮ: có dữ liệu trước và sau nó nghĩa là tháng đó thật sự
 * không thu không chi, đó là số liệu chứ không phải thiếu số liệu.
 *
 * `currentKey = null` nghĩa là "không tháng nào đang dở" (đang xem một năm đã qua).
 */
export function completedPoints(
  points: readonly MonthlyPoint[],
  currentKey: MonthKey | null,
): MonthlyPoint[] {
  const cut = currentKey ? keyIndex(currentKey) : Number.POSITIVE_INFINITY
  const kept = points.filter((p) => keyIndex(p.key) < cut)
  const empty = (p: MonthlyPoint) => p.income === 0 && p.expense === 0
  let start = 0
  let end = kept.length
  while (start < end && empty(kept[start])) start++
  while (end > start && empty(kept[end - 1])) end--
  return kept.slice(start, end)
}

export interface ExpenseTrend {
  tone: NoteTone
  /** tháng hoàn tất gần nhất — thẻ cần nó để gọi tên đúng tháng đang nói tới */
  lastKey: MonthKey
  /** base minor: chi của tháng hoàn tất gần nhất */
  last: number
  /** base minor: chi trung bình các tháng hoàn tất TRƯỚC đó */
  avgPrior: number
  /** (last − avgPrior) / avgPrior; 0,25 = cao hơn 25% */
  delta: number
  /** số tháng làm nền cho trung bình */
  priorMonths: number
}

/**
 * Chi tháng gần nhất so với nếp chi trung bình trước đó. Ngưỡng ±10% là "nhiễu
 * thường" (một lần mua sắm lớn là đủ lệch), +25% mới coi là chệch thật.
 *
 * Cần ≥ 2 tháng hoàn tất và trung bình nền > 0, không thì null.
 */
export function expenseTrend(
  points: readonly MonthlyPoint[],
  currentKey: MonthKey | null,
): ExpenseTrend | null {
  const done = completedPoints(points, currentKey)
  if (done.length < 2) return null
  const lastPoint = done[done.length - 1]
  const prior = done.slice(0, -1)
  const avgPrior = prior.reduce((s, p) => s + p.expense, 0) / prior.length
  if (avgPrior <= 0) return null
  const delta = (lastPoint.expense - avgPrior) / avgPrior
  const tone: NoteTone =
    delta > 0.25 ? 'bad' : delta > 0.1 ? 'warn' : delta < -0.1 ? 'good' : 'info'
  return {
    tone,
    lastKey: lastPoint.key,
    last: lastPoint.expense,
    avgPrior,
    delta,
    priorMonths: prior.length,
  }
}

/**
 * Chi tiêu đang "tập trung" hay "rò rỉ đều khắp" — đọc từ kết quả paretoCut.
 * Ở đây mức KHÔNG nói về sức khỏe (chi tập trung không phải đức tính) mà nói về
 * KHẢ NĂNG HÀNH ĐỘNG: cần ít danh mục để chạm 80% thì siết vài chỗ là xong, còn
 * phải gọi tên gần hết danh mục thì cắt lẻ vô ích, phải đặt ngân sách tổng.
 */
export function paretoTone(count: number, categoryCount: number): NoteTone {
  if (categoryCount <= 0) return 'info'
  const ratio = count / categoryCount
  if (ratio <= 1 / 3) return 'good'
  if (ratio <= 2 / 3) return 'info'
  return 'warn'
}

export interface NetFlowVerdict {
  tone: NoteTone
  /** base minor: tổng thu − chi các tháng hoàn tất */
  total: number
  negativeMonths: number
  months: number
}

/**
 * Cả kỳ đang cộng dồn hay bị bào mòn. Tổng âm là rủi ro thật; tổng dương nhưng
 * quá nửa số tháng thâm hụt thì vẫn phải cảnh báo — dư đó đến từ một hai tháng
 * thu đột biến chứ không phải từ nếp chi tiêu.
 */
export function netFlowVerdict(
  points: readonly MonthlyPoint[],
  currentKey: MonthKey | null,
): NetFlowVerdict | null {
  const done = completedPoints(points, currentKey)
  if (done.length === 0) return null
  let total = 0
  let negativeMonths = 0
  for (const p of done) {
    const net = p.income - p.expense
    total += net
    if (net < 0) negativeMonths++
  }
  const tone: NoteTone =
    total < 0 ? 'bad' : negativeMonths * 2 >= done.length ? 'warn' : 'good'
  return { tone, total, negativeMonths, months: done.length }
}

export interface SavingsRateVerdict {
  tone: NoteTone
  /** (thu − chi) / thu trên toàn kỳ hoàn tất; 0,2 = giữ lại 20% */
  rate: number
  /** Nửa sau so với nửa đầu kỳ. null = chưa đủ 4 tháng để nói xu hướng. */
  trend: 'up' | 'down' | 'flat' | null
  /** chênh lệch điểm phần trăm giữa nửa sau và nửa đầu (chỉ có khi trend ≠ null) */
  trendDelta: number | null
  months: number
}

/**
 * Tỷ lệ tiết kiệm cả kỳ + xu hướng. Mốc 20% lấy từ quy tắc 50/30/20 mà thẻ "Cơ cấu
 * chi tiêu" đang dùng — hai thẻ phải cùng một mốc, không thì một thẻ khen còn thẻ
 * kia cảnh báo trên cùng con số.
 *
 * Tính trên TỔNG thu và TỔNG chi cả kỳ, không phải trung bình các tỷ lệ tháng: tháng
 * thu 0 sẽ làm tỷ lệ tháng đó vô nghĩa, mà trung bình của các tỷ lệ thì tháng thu
 * 100k và tháng thu 3 triệu lại nặng bằng nhau.
 */
export function savingsRateVerdict(
  points: readonly MonthlyPoint[],
  currentKey: MonthKey | null,
): SavingsRateVerdict | null {
  const done = completedPoints(points, currentKey)
  if (done.length === 0) return null
  const rateOf = (ps: readonly MonthlyPoint[]) => {
    const income = ps.reduce((s, p) => s + p.income, 0)
    if (income <= 0) return null
    const expense = ps.reduce((s, p) => s + p.expense, 0)
    return (income - expense) / income
  }
  const rate = rateOf(done)
  if (rate === null) return null

  let trend: SavingsRateVerdict['trend'] = null
  let trendDelta: number | null = null
  if (done.length >= 4) {
    const mid = Math.floor(done.length / 2)
    const first = rateOf(done.slice(0, mid))
    const second = rateOf(done.slice(mid))
    if (first !== null && second !== null) {
      trendDelta = second - first
      trend = trendDelta > 0.03 ? 'up' : trendDelta < -0.03 ? 'down' : 'flat'
    }
  }
  const tone: NoteTone = rate >= 0.2 ? 'good' : rate > 0 ? 'warn' : 'bad'
  return { tone, rate, trend, trendDelta, months: done.length }
}
