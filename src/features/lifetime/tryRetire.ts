// Nút "Thử nghỉ việc từ năm FIRE" — THUẦN, không React.
//
// "Không bao giờ âm" của hộp kết luận là câu trả lời DỄ: mô hình cho người dùng đi làm
// tới tuổi cuối kịch bản, nên tiền không thể âm. Câu hỏi thật của mốc FIRE là "nghỉ
// việc đúng năm đó thì tiền có đủ tới già không". Nút này cắm mẫu "Nghỉ hưu" sẵn có
// (presets.ts) vào năm FIRE và kéo tuổi chiếu lên 90 — trong BẢN NHÁP, không ghi gì.
//
// Dùng CHÍNH mẫu `nghi-huu` chứ không dựng chặng riêng: cùng lý do JSDoc `applyPreset`
// — hai bảng mẫu sẽ trôi lệch, và người dùng thấy hai con số lương hưu khác nhau từ
// hai nút.
import { applyPreset, type ScenarioDraft } from './draft'
import type { FxOf } from './fxModel'
import { LIFE_PRESETS, type PresetContext, type PresetResult } from './presets'
import { phaseForYear, type LifetimeInput } from './project'

/** Tuổi chiếu tối thiểu khi thử nghỉ việc: chiếu tới 70 mà bảo "đủ tới hết đời" là
 *  nói quá đúng chỗ nguy hiểm nhất (xem summary.ts). */
export const RETIRE_TRIAL_MIN_END_AGE = 90

const RETIRE_PRESET = LIFE_PRESETS.find((p) => p.id === 'nghi-huu')

/**
 * Ngữ cảnh cho mẫu Nghỉ hưu đặt ở `year`: lấy chặng ĐANG HIỆU LỰC năm đó (không phải
 * chặng hôm nay) — nghỉ hưu ở Mỹ thì chi tính theo chặng Mỹ, bằng USD. Tỷ giá là hôm
 * nay (`fxOf`), không phải `fxToDisplay` đã lưu — cùng lý do với `normalizeToPhaseCurrency`.
 */
export function retireTrialCtx(
  input: LifetimeInput,
  scenarioId: string,
  year: number,
  fxOf: FxOf,
): PresetContext | null {
  const sorted = [...input.phases].sort((a, b) => a.startYear - b.startYear)
  const phase = phaseForYear(sorted, year)
  if (!phase) return null
  return {
    scenarioId,
    year,
    birthYear: input.birthYear,
    currency: phase.currency,
    country: phase.country,
    currentIncomeMinor: phase.annualIncomeMinor,
    currentExpenseMinor: phase.annualExpenseMinor,
    fxToDisplay: fxOf(phase.currency, input.displayCurrency) ?? phase.fxToDisplay,
    displayCurrency: input.displayCurrency,
    fxOf: (c) => fxOf(c, input.displayCurrency),
  }
}

/** Mẫu Nghỉ hưu đã dựng cho `year`. `null` khi không có chặng nào để dựa vào. */
export function buildRetireTrial(
  input: LifetimeInput,
  scenarioId: string,
  year: number,
  fxOf: FxOf,
): PresetResult | null {
  const ctx = retireTrialCtx(input, scenarioId, year, fxOf)
  if (!ctx || !RETIRE_PRESET) return null
  return RETIRE_PRESET.build(ctx)
}

/** Cắm mẫu vào nháp và kéo tuổi chiếu lên tối thiểu 90 (không kéo xuống). */
export function applyRetireTrial(draft: ScenarioDraft, result: PresetResult, seed: number): ScenarioDraft {
  const next = applyPreset(draft, result, seed)
  return { ...next, endAge: Math.max(next.endAge, RETIRE_TRIAL_MIN_END_AGE) }
}

/**
 * Có nên mời "Thử nghỉ việc từ <năm FIRE>" không: cần một năm FIRE còn ở TƯƠNG LAI, và
 * chưa có chặng nào bắt đầu đúng năm đó (bấm lần hai sẽ sinh chặng trùng năm — bàn sửa
 * có báo, nhưng mời người dùng làm một việc rồi báo lỗi là mời sai).
 */
export function canOfferRetireTrial(input: LifetimeInput, fireYear: number | null): boolean {
  if (fireYear === null || fireYear <= input.currentYear) return false
  return !input.phases.some((p) => p.startYear === fireYear)
}
