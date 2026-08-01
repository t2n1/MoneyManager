// Chỉ số "sức khỏe tài chính" — thuần, không phụ thuộc React, unit-test được.
// Mọi số tiền là minor units theo BASE currency (đã quy đổi trước khi gọi).
// Nguyên tắc chung: thiếu dữ liệu → trả null (UI hiện "—" kèm lý do), KHÔNG đoán.

/** Kết luận màu của một chỉ số. 'unknown' = chưa đủ dữ liệu để chấm. */
export type Verdict = 'good' | 'warn' | 'bad' | 'unknown'

/** Màu một vùng trên thang đo. Không có 'unknown': vùng luôn là một trong ba mức. */
export type Tone = 'bad' | 'warn' | 'good'

/**
 * Một vùng trên thang đo, kéo dài tới mốc `upTo` (các mốc TĂNG DẦN, vùng đầu bắt
 * đầu từ 0). Khai ở đây chứ không ở component vì thang đo vừa dùng để VẼ vừa dùng
 * để CHẤM ĐIỂM — hai chỗ đọc cùng một mốc thì điểm không thể lệch khỏi thanh màu
 * mà người dùng đang nhìn.
 */
export interface Zone {
  upTo: number
  tone: Tone
}

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

// ------------------------------------------------------------
// Thang đo — MỘT nguồn cho cả thanh màu và điểm
// ------------------------------------------------------------

/**
 * Thang đo của từng chỉ số. Trước đây các mảng này nằm trong `HealthView.tsx` và chỉ
 * dùng để vẽ; đưa xuống đây để điểm tổng chấm trên ĐÚNG mốc đang vẽ. Chiều của thang
 * đọc từ vùng đầu tiên: `bad` trước là "càng cao càng tốt", `good` trước là ngược lại.
 */
export const HEALTH_ZONES = {
  fund: [
    { upTo: 3, tone: 'bad' },
    { upTo: 6, tone: 'warn' },
    { upTo: 12, tone: 'good' },
  ],
  liquidity: [
    { upTo: 1, tone: 'bad' },
    { upTo: 2, tone: 'warn' },
    { upTo: 4, tone: 'good' },
  ],
  dti: [
    { upTo: 0.5, tone: 'good' },
    { upTo: 1.5, tone: 'warn' },
    { upTo: 3, tone: 'bad' },
  ],
  concentration: [
    { upTo: 0.7, tone: 'good' },
    { upTo: 0.95, tone: 'warn' },
    { upTo: 1, tone: 'bad' },
  ],
  runway: [
    { upTo: 6, tone: 'bad' },
    { upTo: 18, tone: 'warn' },
    { upTo: 60, tone: 'good' },
  ],
  taxBurden: [
    { upTo: 0.25, tone: 'good' },
    { upTo: 0.35, tone: 'warn' },
    { upTo: 0.6, tone: 'bad' },
  ],
} as const satisfies Record<string, readonly Zone[]>

// ------------------------------------------------------------
// Điểm sức khỏe tổng
// ------------------------------------------------------------

/**
 * Dải điểm của từng mức. Cùng ba mốc với `verdictFromScore` bên dưới, nên một chỉ số
 * "Tốt" luôn ra ≥ 70 và ngược lại — điểm và nhãn màu không bao giờ nói khác nhau.
 */
const BANDS: Record<Tone, [number, number]> = {
  bad: [0, 40],
  warn: [40, 70],
  good: [70, 100],
}

/**
 * Đổi giá trị thô thành điểm 0–100 theo thang đo của chính chỉ số đó, nội suy tuyến
 * tính TRONG từng vùng. Vì sao không chấm theo kết luận (Tốt=100/Chú ý=60/Rủi ro=20):
 * điểm sẽ nhảy bậc, quỹ dự phòng từ 5,9 lên 6,0 tháng nhảy 40 điểm còn từ 6 lên 12
 * tháng thì đứng im — người dùng cải thiện thật mà đồng hồ không nhích.
 *
 * Ngoài trần thang thì kẹp (runway 80 tháng trên thang 0–60 vẫn là 100, không phải >100).
 */
export function scoreFromZones(value: number | null, zones: readonly Zone[]): number | null {
  if (value === null || !Number.isFinite(value) || zones.length === 0) return null
  const lowerIsBetter = zones[0].tone === 'good'
  const max = zones[zones.length - 1].upTo
  if (value <= 0) return lowerIsBetter ? 100 : 0
  if (value >= max) return lowerIsBetter ? 0 : 100

  let from = 0
  for (const z of zones) {
    if (value <= z.upTo) {
      const width = z.upTo - from
      const t = width <= 0 ? 0 : (value - from) / width
      const [lo, hi] = BANDS[z.tone]
      return lowerIsBetter ? hi - t * (hi - lo) : lo + t * (hi - lo)
    }
    from = z.upTo
  }
  // Không tới được: `value >= max` đã chặn ở trên.
  return lowerIsBetter ? 0 : 100
}

/** Ngưỡng của điểm tổng, khớp với dải điểm của từng mức. */
export function verdictFromScore(score: number): Verdict {
  if (score >= 70) return 'good'
  if (score >= 40) return 'warn'
  return 'bad'
}

export interface ScoreItem {
  key: string
  /** Tên chỉ số để nói ra được câu "kéo điểm xuống nhiều nhất là …". */
  label: string
  /** Điểm 0–100, hoặc null nếu chưa đủ dữ liệu → bị loại khỏi trung bình. */
  score: number | null
  /** Trọng số tương đối; chỉ cần cùng đơn vị với nhau, không cần cộng lại bằng 1. */
  weight: number
}

export interface HealthScore {
  /** 0–100 đã làm tròn. */
  score: number
  verdict: Verdict
  /** Tỷ trọng các chỉ số chấm được (0..1). Dưới 1 nghĩa là điểm đang chấm thiếu. */
  coverage: number
  /** Số chỉ số chấm được / tổng số chỉ số. */
  counted: number
  total: number
  /** Tên các chỉ số chưa chấm được — để nói thẳng điểm đang thiếu cái gì. */
  missing: string[]
  /** Chỉ số điểm thấp nhất trong số chấm được; hoà thì lấy chỉ số nặng hơn. */
  weakest: ScoreItem | null
}

/**
 * Trung bình có trọng số của các chỉ số chấm được. Chỉ số `null` bị LOẠI khỏi cả tử
 * và mẫu, không phải tính 0 điểm: chưa phân loại danh mục là thiếu dữ liệu, không
 * phải sức khỏe kém. Bù lại `coverage` nói ra điểm đang dựa trên bao nhiêu phần, để
 * UI không trình bày một con số chấm trên 2/6 chỉ số như thể nó là kết luận đầy đủ.
 *
 * Không chỉ số nào chấm được → null (UI hiện "chưa đủ dữ liệu", KHÔNG hiện 0 điểm).
 */
export function healthScore(items: ScoreItem[]): HealthScore | null {
  const counted = items.filter((i) => i.score !== null && i.weight > 0)
  const totalWeight = items.reduce((s, i) => s + Math.max(i.weight, 0), 0)
  const countedWeight = counted.reduce((s, i) => s + i.weight, 0)
  if (counted.length === 0 || countedWeight <= 0) return null

  const sum = counted.reduce((s, i) => s + i.score! * i.weight, 0)
  const score = Math.round(sum / countedWeight)
  let weakest = counted[0]
  for (const i of counted) {
    if (i.score! < weakest.score! || (i.score === weakest.score && i.weight > weakest.weight)) {
      weakest = i
    }
  }
  return {
    score,
    verdict: verdictFromScore(score),
    coverage: totalWeight > 0 ? countedWeight / totalWeight : 0,
    counted: counted.length,
    total: items.length,
    missing: items.filter((i) => i.score === null).map((i) => i.label),
    weakest,
  }
}
