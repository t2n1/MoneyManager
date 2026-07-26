// Chỉ số "sức khỏe tài chính" — thuần, không phụ thuộc React, unit-test được.
// Mọi số tiền là minor units theo BASE currency (đã quy đổi trước khi gọi).
// Nguyên tắc chung: thiếu dữ liệu → trả null (UI hiện "—" kèm lý do), KHÔNG đoán.

/** Kết luận màu của một chỉ số. 'unknown' = chưa đủ dữ liệu để chấm. */
export type Verdict = 'good' | 'warn' | 'bad' | 'unknown'

export const VERDICT_LABELS: Record<Verdict, string> = {
  good: 'Tốt',
  warn: 'Cần chú ý',
  bad: 'Rủi ro',
  unknown: 'Chưa đủ dữ liệu',
}

/**
 * Chấm điểm theo 2 mốc. `higherIsBetter = true`: ≥ goodAt là tốt, ≥ warnAt là
 * cần chú ý, dưới nữa là rủi ro. `false` thì đảo chiều (vd tỷ lệ nợ: càng thấp càng tốt).
 */
export function verdictFor(
  value: number | null,
  warnAt: number,
  goodAt: number,
  higherIsBetter = true,
): Verdict {
  if (value === null || !Number.isFinite(value)) return 'unknown'
  if (higherIsBetter) {
    if (value >= goodAt) return 'good'
    if (value >= warnAt) return 'warn'
    return 'bad'
  }
  if (value <= goodAt) return 'good'
  if (value <= warnAt) return 'warn'
  return 'bad'
}

/**
 * Quỹ dự phòng: tài sản lỏng cầm cự được mấy THÁNG nếu mất thu nhập, đo bằng
 * chi CỐ ĐỊNH (tiền nhà, bảo hiểm, học phí…) — phần không cắt được khi thất nghiệp.
 * Chi cố định ≤ 0 (chưa phân loại danh mục) → null.
 */
export function emergencyFundMonths(
  liquidAssets: number,
  monthlyFixedExpense: number,
): number | null {
  if (monthlyFixedExpense <= 0) return null
  return liquidAssets / monthlyFixedExpense
}

/**
 * Tỷ lệ thanh khoản: tài sản lỏng / nợ phải trả trong 12 tháng tới.
 * ≥ 1 nghĩa là bán sạch tiền mặt là trả hết được nợ ngắn hạn.
 * Không có nợ ngắn hạn → null (UI hiện "Không có nợ ngắn hạn", không phải điểm xấu).
 */
export function liquidityRatio(liquidAssets: number, debtDueWithin12m: number): number | null {
  if (debtDueWithin12m <= 0) return null
  return liquidAssets / debtDueWithin12m
}

/**
 * Nợ trên thu nhập: tổng dư nợ / thu nhập 12 tháng gần nhất (0.8 = nợ bằng
 * 80% thu nhập một năm). Thu nhập ≤ 0 → null.
 */
export function debtToIncome(totalDebt: number, annualIncome: number): number | null {
  if (annualIncome <= 0) return null
  return totalDebt / annualIncome
}

/**
 * Gánh nặng trả nợ: số tiền trả nợ trung bình mỗi tháng / thu nhập trung bình
 * mỗi tháng. Đây là con số quyết định dòng tiền có nghẹt không (khác với
 * debtToIncome đo tồn kho nợ).
 */
export function debtServiceRatio(
  monthlyDebtPayment: number,
  monthlyIncome: number,
): number | null {
  if (monthlyIncome <= 0) return null
  return monthlyDebtPayment / monthlyIncome
}

export interface IncomeConcentration {
  /** tỷ trọng nguồn thu lớn nhất (0..1) */
  topShare: number
  /** Herfindahl–Hirschman: Σ share² (1 = một nguồn duy nhất, càng thấp càng dàn trải) */
  hhi: number
  /** số nguồn thu có tiền > 0 */
  sourceCount: number
  /** khóa của nguồn lớn nhất (categoryId) */
  topKey: string
}

/**
 * Mức độ phụ thuộc một nguồn thu. Mất nguồn chiếm 90% thu nhập là rủi ro lớn
 * hơn hẳn mất 1 trong 4 nguồn đều nhau, dù tổng thu giống nhau.
 * Không có nguồn thu nào > 0 → null.
 */
export function incomeConcentration(
  slices: { key: string; amount: number }[],
): IncomeConcentration | null {
  const positive = slices.filter((s) => s.amount > 0)
  const total = positive.reduce((s, x) => s + x.amount, 0)
  if (total <= 0) return null
  let hhi = 0
  let top = positive[0]
  for (const s of positive) {
    const share = s.amount / total
    hhi += share * share
    if (s.amount > top.amount) top = s
  }
  return { topShare: top.amount / total, hhi, sourceCount: positive.length, topKey: top.key }
}

/** Gánh nặng thuế + an sinh trên thu nhập GỘP (0.28 = 28% lương gộp đi đóng). */
export function taxBurden(taxAndSocial: number, grossIncome: number): number | null {
  if (grossIncome <= 0 || taxAndSocial < 0) return null
  return taxAndSocial / grossIncome
}

// ------------------------------------------------------------
// Runway — mô phỏng Monte Carlo
// ------------------------------------------------------------

/**
 * PRNG mulberry32 có hạt giống: mô phỏng phải TÁI LẬP được (cùng dữ liệu → cùng
 * kết quả), nếu dùng Math.random thì mỗi lần mở app ra một con số khác nhau và
 * test cũng không viết được.
 */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface RunwayResult {
  /** số tháng cầm cự ở kịch bản xấu (10% tệ nhất), đã kẹp trong horizon */
  p10: number
  /** kịch bản trung vị */
  p50: number
  /** kịch bản đẹp (10% tốt nhất) */
  p90: number
  /** tỷ lệ kịch bản KHÔNG cạn tiền trong horizon (0..1) */
  survivalRate: number
  /** trần mô phỏng — kết quả bằng horizon nghĩa là "còn hơn thế" */
  horizon: number
}

export interface RunwayOptions {
  /** số tháng tối đa mô phỏng */
  horizon: number
  /** số kịch bản chạy */
  iterations: number
  seed: number
}

const DEFAULT_RUNWAY: RunwayOptions = { horizon: 60, iterations: 2000, seed: 20260726 }

/** Phân vị theo kiểu "nearest rank" trên mảng ĐÃ sắp tăng dần. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))
  return sorted[idx]
}

/**
 * Còn sống được bao lâu nếu tương lai giống quá khứ: mỗi tháng bốc ngẫu nhiên
 * (bootstrap) một giá trị dòng tiền ròng đã từng xảy ra rồi cộng vào tài sản lỏng,
 * chạy `iterations` kịch bản. Ưu điểm so với phép chia đơn giản: phản ánh được
 * tháng nào cũng khác nhau, nên tháng đột biến kéo runway xuống đúng mức.
 *
 * `netFlows` là dòng tiền ròng (thu − chi) từng THÁNG đã hoàn tất; cần ≥ 3 tháng
 * mới đủ để bốc, ít hơn → null.
 */
export function monteCarloRunway(
  liquidAssets: number,
  netFlows: number[],
  opts: Partial<RunwayOptions> = {},
): RunwayResult | null {
  const { horizon, iterations, seed } = { ...DEFAULT_RUNWAY, ...opts }
  if (netFlows.length < 3 || liquidAssets <= 0) return null
  const rand = seededRandom(seed)
  const months: number[] = []
  let survived = 0
  for (let i = 0; i < iterations; i++) {
    let balance = liquidAssets
    let m = 0
    while (m < horizon) {
      balance += netFlows[Math.floor(rand() * netFlows.length)]
      if (balance < 0) break
      m++
    }
    if (m >= horizon) survived++
    months.push(m)
  }
  months.sort((a, b) => a - b)
  return {
    p10: percentile(months, 0.1),
    p50: percentile(months, 0.5),
    p90: percentile(months, 0.9),
    survivalRate: survived / iterations,
    horizon,
  }
}

/**
 * Runway "phép chia" để đối chiếu: tài sản lỏng / mức đốt tiền trung bình mỗi
 * tháng. Dòng tiền trung bình ≥ 0 (đang tích lũy) → null: không có ngày cạn.
 */
export function simpleRunway(liquidAssets: number, netFlows: number[]): number | null {
  if (netFlows.length === 0 || liquidAssets <= 0) return null
  const avg = netFlows.reduce((s, x) => s + x, 0) / netFlows.length
  if (avg >= 0) return null
  return liquidAssets / -avg
}
