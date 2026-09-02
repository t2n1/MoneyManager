// "Kế hoạch nói một đằng, sổ nói một nẻo" — THUẦN, không React.
//
// Hộp kết luận của tab Tương lai tính trên KẾ HOẠCH (thu chi nền người dùng gõ). Số thật
// 12 tháng từ sổ (`suggestBaseline`) trước đây chỉ hiện ở một dòng chữ nhỏ trong thẻ
// chặng — người đọc thấy "Đủ tới hết đời" mà không biết câu đó dựa trên một mức để dành
// cao gấp nhiều lần mức họ đang làm được. File này trả lời: nếu thay số thật vào chặng
// đang chạy thì kết luận đổi thế nào. Component lo chữ; đây lo suy.
import type { CurrencyCode } from '../../lib/currencies'
import { fireYear, firstNegativeYear } from './insights'
import { phaseForYear, projectLifetime, type LifetimeInput } from './project'

export interface RealNumbers {
  annualIncomeMinor: number
  annualExpenseMinor: number
}

/**
 * Ngưỡng "đáng nói": |thật − kế hoạch| trên thu nhập kế hoạch. Dưới ngưỡng thì ẩn dòng —
 * lệch vài phần trăm là chuyện thường của một năm, không phải một kế hoạch sai. Chốt 10%
 * với người dùng 2026-09-02.
 */
export const REALITY_GAP_THRESHOLD = 0.1

export interface RealityCheck {
  /** Tiền của chặng đang chạy — cả hai con số để dành tính theo nó. */
  currency: CurrencyCode
  planSavingMinor: number
  realSavingMinor: number
  /** Lệch đủ lớn để hiện dòng (xem REALITY_GAP_THRESHOLD). */
  meaningful: boolean
  fireYearPlan: number | null
  /** Năm FIRE nếu chặng đang chạy dùng số thật. */
  fireYearReal: number | null
  /** Năm đầu tiên nhánh bi quan âm, với số thật. null = không năm nào. */
  negativeYearReal: number | null
}

/**
 * `input` với thu chi của chặng ĐANG HIỆU LỰC (`currentYear`) thay bằng số thật.
 * Chặng tương lai giữ nguyên: sổ chỉ nói được về hôm nay. `null` khi không có chặng.
 *
 * Số thật phải cùng tiền với chặng đó — `suggestBaseline` được gọi với
 * `currentPhase.currency` đúng vì thế (xem ScenarioWorkbench / LifetimeView).
 */
export function withRealNumbers(input: LifetimeInput, real: RealNumbers): LifetimeInput | null {
  const sorted = [...input.phases].sort((a, b) => a.startYear - b.startYear)
  const current = phaseForYear(sorted, input.currentYear)
  if (!current) return null
  return {
    ...input,
    phases: input.phases.map((p) =>
      p === current
        ? { ...p, annualIncomeMinor: real.annualIncomeMinor, annualExpenseMinor: real.annualExpenseMinor }
        : p,
    ),
  }
}

export function realityCheck(input: LifetimeInput, real: RealNumbers): RealityCheck | null {
  const sorted = [...input.phases].sort((a, b) => a.startYear - b.startYear)
  const current = phaseForYear(sorted, input.currentYear)
  const realInput = withRealNumbers(input, real)
  if (!current || !realInput) return null

  const planSavingMinor = current.annualIncomeMinor - current.annualExpenseMinor
  const realSavingMinor = real.annualIncomeMinor - real.annualExpenseMinor
  // Mẫu số là thu kế hoạch; chặng chưa khai thu thì so với chi. Cả hai bằng 0 là kịch
  // bản trống — lúc đó mọi lệch đều đáng nói, không có gì để "vài phần trăm".
  const denom = current.annualIncomeMinor > 0 ? current.annualIncomeMinor : current.annualExpenseMinor
  const gap = Math.abs(realSavingMinor - planSavingMinor)
  const meaningful = denom > 0 ? gap >= denom * REALITY_GAP_THRESHOLD : gap > 0

  const realRows = projectLifetime(realInput)
  return {
    currency: current.currency,
    planSavingMinor,
    realSavingMinor,
    meaningful,
    fireYearPlan: fireYear(projectLifetime(input)),
    fireYearReal: fireYear(realRows),
    negativeYearReal: firstNegativeYear(realRows, 'low'),
  }
}
