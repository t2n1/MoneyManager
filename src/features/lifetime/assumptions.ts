// Ba giả định vặn tại chỗ (§4.4 / 13b) — phần THUẦN.
//
// 13b muốn ba con số của chặng đang chạy (thu · chi · lợi suất) thành thanh trượt vẽ
// lại ngay, có nút Lưu. Phần khó không phải cái thanh trượt mà là: bản chiếu đang xem
// phải là bản chiếu của giá trị ĐANG KÉO, không phải giá trị đã lưu — mà không được
// ghi đè lên dữ liệu cho tới khi bấm Lưu.
//
// Cách làm: giữ một lớp "đè" trong bộ nhớ, áp lên `LifetimeInput` rồi mới chiếu. Không
// đụng tới `buildLifetimeInput` — nó dựng input TỪ DỮ LIỆU ĐÃ LƯU, và trộn thêm trạng
// thái giao diện vào đó là làm hỏng đúng thứ khiến nó test được.
//
// Cổng hiệu năng (R6): `projectLifetime` đo được 0,063 ms/lần trên bản chiếu 60 năm —
// dư 252 lần trong một khung 16 ms, nên chiếu lại NGAY trong lúc kéo là hợp lệ, không
// cần đợi thả tay. Xem phép thử hiệu năng kèm theo.
import type { LifetimeInput } from './project'

/** Ba giá trị vặn được. `null` ở một trường = giữ nguyên giá trị đã lưu. */
export interface AssumptionOverride {
  /** Thu mỗi năm của chặng đang chạy, minor units, ĐƠN VỊ CỦA CHẶNG. */
  annualIncomeMinor: number | null
  annualExpenseMinor: number | null
  /** Lợi suất thực của cả kịch bản, basis points. */
  realReturnBps: number | null
}

export const NO_OVERRIDE: AssumptionOverride = {
  annualIncomeMinor: null,
  annualExpenseMinor: null,
  realReturnBps: null,
}

export function hasOverride(o: AssumptionOverride): boolean {
  return o.annualIncomeMinor !== null || o.annualExpenseMinor !== null || o.realReturnBps !== null
}

/**
 * Chỉ số của chặng ĐANG HIỆU LỰC trong `input.phases` — chặng bắt đầu gần nhất tính đến
 * năm nay. Trả -1 khi không có chặng nào.
 *
 * KHÔNG giả định `phases` đã sắp xếp: `buildLifetimeInput` sắp theo `start_year`, nhưng
 * hàm này còn được gọi trên input đã áp đè, và một hàm chỉ đúng khi đầu vào đã sắp là
 * một cái bẫy chờ người sau.
 */
export function currentPhaseIndex(input: LifetimeInput): number {
  let best = -1
  let bestYear = -Infinity
  for (let i = 0; i < input.phases.length; i++) {
    const y = input.phases[i].startYear
    if (y <= input.currentYear && y >= bestYear) {
      best = i
      bestYear = y
    }
  }
  // Chưa tới chặng nào (mọi chặng đều ở tương lai) → lấy chặng SỚM NHẤT, cùng luật với
  // `currentPhase` ở LifetimeView: bản chiếu vẫn phải dựa trên một chặng nào đó.
  if (best === -1 && input.phases.length > 0) {
    let som = 0
    for (let i = 1; i < input.phases.length; i++) {
      if (input.phases[i].startYear < input.phases[som].startYear) som = i
    }
    return som
  }
  return best
}

/**
 * `input` với lớp đè đã áp. Trả về CHÍNH `input` khi không có gì đè — để `useMemo` ở
 * tầng trên giữ nguyên tham chiếu và không chiếu lại vô ích.
 *
 * Sao chép nông có chủ đích: chỉ `phases` và đúng một phần tử trong đó bị thay, phần
 * còn lại (events, cờ nominalTerms…) dùng chung tham chiếu vì không ai sửa chúng.
 */
export function applyOverride(input: LifetimeInput, o: AssumptionOverride): LifetimeInput {
  if (!hasOverride(o)) return input
  const i = currentPhaseIndex(input)
  const next: LifetimeInput = {
    ...input,
    realReturnBps: o.realReturnBps ?? input.realReturnBps,
  }
  if (i >= 0 && (o.annualIncomeMinor !== null || o.annualExpenseMinor !== null)) {
    const phases = [...input.phases]
    phases[i] = {
      ...phases[i],
      annualIncomeMinor: o.annualIncomeMinor ?? phases[i].annualIncomeMinor,
      annualExpenseMinor: o.annualExpenseMinor ?? phases[i].annualExpenseMinor,
    }
    next.phases = phases
  }
  return next
}

/**
 * Biên của thanh trượt tiền: 0 → gấp đôi giá trị nền, làm tròn lên một bậc "đẹp".
 *
 * Vì sao suy từ giá trị nền chứ không đặt một hằng số: app trộn ¥ và ₫, mà một biên
 * cứng hợp với ¥5.000.000/năm thì với ₫900.000.000/năm là thanh trượt kẹt ở mép. Gấp
 * đôi cho chỗ vặn cả hai chiều mà vẫn giữ giá trị hiện tại ở khoảng giữa — chỗ dễ kéo.
 *
 * Nền bằng 0 (chưa khai thu) thì không nhân được: rơi về `fallback`, nếu không thanh
 * trượt có min = max = 0 và không kéo được đi đâu.
 */
export function moneySliderMax(baseMinor: number, fallback: number): number {
  const gapDoi = Math.abs(baseMinor) * 2
  if (gapDoi <= 0) return fallback
  // Bậc làm tròn = 1/100 của giá trị, quy về luỹ thừa 10 gần nhất — cho ra 10.000.000
  // chứ không 9.876.543, tức mép thanh trượt là một con số đọc được.
  const bac = 10 ** Math.max(0, Math.floor(Math.log10(gapDoi)) - 1)
  return Math.ceil(gapDoi / bac) * bac
}

/** Bước kéo: 1/200 khoảng, quy về bậc 10 — đủ mịn để vặn, đủ thô để không ra số lẻ xấu. */
export function moneySliderStep(max: number): number {
  const tho = max / 200
  if (tho <= 1) return 1
  return 10 ** Math.max(0, Math.floor(Math.log10(tho)))
}
