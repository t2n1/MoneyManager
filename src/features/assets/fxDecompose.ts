// Tách lãi của một tài khoản ngoại tệ thành PHẦN GIÁ và PHẦN TỶ GIÁ — THUẦN, có test.
//
// Công thức (Chặng 8 giáo trình đã đối chiếu 09/2026, và là toán tỷ giá cơ bản):
//   (1 + lãi theo base) = (1 + lãi theo tiền tài khoản) × (1 + lãi tỷ giá)
// Nửa cuối 08/2026 đã có ca thật: cổ phiếu VN −2,2% (₫) nhưng đồ thị ¥ chỉ hiện −0,4%
// vì ₫ mạnh lên +1,8% — không tách thì "danh mục ổn" có thể chỉ là ảo giác tỷ giá.
//
// Nguồn tỷ giá là fx_history: chỉ tích từ cuối 07/2026 và chỉ có dòng ở ngày người dùng
// mở app. Vì vậy hàm tự tìm dòng GẦN NHẤT trong ±maxGapDays quanh ngày định giá thay vì
// đòi đúng ngày; ngoài giới hạn đó thì trả null — thà không nói còn hơn nói bằng tỷ giá
// của một tuần khác.
import type { CurrencyCode } from '../../lib/currencies'

export interface FxDecomposePoint {
  /** ISO yyyy-mm-dd. */
  on: string
  /** Giá trị tài khoản, minor units theo TIỀN CỦA TÀI KHOẢN. */
  valueMinor: number
}

export interface FxDayRates {
  on_date: string
  /** 1 đơn vị base đổi được rates[X] đơn vị X (major units) — đúng chiều fx_history. */
  rates: Record<string, number | undefined>
}

export interface FxDecomposition {
  from: string
  to: string
  /** Số ngày giữa hai mốc định giá. */
  spanDays: number
  /** Tỷ lệ, ví dụ −0.022 = −2,2%. Theo TIỀN TÀI KHOẢN. */
  rAsset: number
  /** Phần do tỷ giá: dương = tiền của tài khoản mạnh lên so với base. */
  rFx: number
  /** Điều người dùng thấy trên đồ thị base: (1+rAsset)(1+rFx) − 1. */
  rBase: number
}

/** Số ngày giữa hai ISO date (b − a). Thuần, không Date.now(). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/**
 * Dòng tỷ giá gần `on` nhất trong ±maxGapDays; hoà thì lấy dòng SỚM hơn.
 * Export cho các phép so cần "tỷ giá thị trường quanh một ngày" (kiều hối dùng chung) —
 * viết lại ở chỗ khác là hai định nghĩa "gần nhất" trôi lệch nhau.
 */
export function nearestFxRate(
  fxDays: FxDayRates[],
  on: string,
  currency: CurrencyCode,
  maxGapDays: number,
): number | null {
  let best: { gap: number; rate: number } | null = null
  for (const d of fxDays) {
    const r = d.rates[currency]
    if (typeof r !== 'number' || r <= 0) continue
    const gap = Math.abs(daysBetween(d.on_date, on))
    if (gap > maxGapDays) continue
    if (best === null || gap < best.gap) best = { gap, rate: r }
  }
  return best?.rate ?? null
}

export const FX_DECOMPOSE_WINDOW_DAYS = 30
export const FX_DECOMPOSE_MAX_GAP_DAYS = 3
/** Kỳ ngắn hơn mức này thì phần trăm chỉ là nhiễu ngày — không đáng nói. */
export const FX_DECOMPOSE_MIN_SPAN_DAYS = 7

/**
 * null khi không tách được: tài khoản cùng tiền với base (không có gì để tách), thiếu
 * định giá, hay thiếu tỷ giá quanh hai mốc. KHÔNG bao giờ đoán 1:1.
 */
export function decomposeFxReturn(args: {
  points: FxDecomposePoint[]
  currency: CurrencyCode
  base: CurrencyCode
  fxDays: FxDayRates[]
  windowDays?: number
  maxGapDays?: number
}): FxDecomposition | null {
  const {
    points,
    currency,
    base,
    fxDays,
    windowDays = FX_DECOMPOSE_WINDOW_DAYS,
    maxGapDays = FX_DECOMPOSE_MAX_GAP_DAYS,
  } = args
  if (currency === base) return null

  // Chỉ những mốc định giá CÓ tỷ giá quanh nó mới dùng được.
  const usable = [...points]
    .filter((p) => p.valueMinor > 0)
    .sort((a, b) => (a.on < b.on ? -1 : 1))
    .map((p) => ({ ...p, rate: nearestFxRate(fxDays, p.on, currency, maxGapDays) }))
    .filter((p): p is typeof p & { rate: number } => p.rate !== null)
  if (usable.length < 2) return null

  const end = usable[usable.length - 1]
  // Mốc đầu kỳ: dòng GẦN (end − windowDays) nhất — không phải dòng cũ nhất, để "một
  // tháng qua" không âm thầm biến thành "từ thuở có dữ liệu".
  const targetFrom = daysBetween('1970-01-01', end.on) - windowDays
  let startIdx = 0
  let bestGap = Infinity
  for (let i = 0; i < usable.length - 1; i++) {
    const gap = Math.abs(daysBetween('1970-01-01', usable[i].on) - targetFrom)
    if (gap <= bestGap) {
      bestGap = gap
      startIdx = i
    }
  }
  const start = usable[startIdx]
  const spanDays = daysBetween(start.on, end.on)
  if (spanDays < FX_DECOMPOSE_MIN_SPAN_DAYS) return null

  const rAsset = end.valueMinor / start.valueMinor - 1
  // Giá trị theo base = v ÷ rate (rate: 1 base = r tiền tài khoản), nên phần tỷ giá là
  // rate ĐẦU chia rate CUỐI: rate giảm = tiền tài khoản mạnh lên = phần cộng cho base.
  const rFx = start.rate / end.rate - 1
  const rBase = (1 + rAsset) * (1 + rFx) - 1
  return { from: start.on, to: end.on, spanDays, rAsset, rFx, rBase }
}
