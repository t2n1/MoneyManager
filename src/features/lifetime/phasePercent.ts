// Chặng khai bằng PHẦN TRĂM của chặng liền trước — THUẦN (migration 0067).
//
// Vì sao cần: ô "Chi mỗi năm" của một chặng ở tương lai đòi một con số tuyệt đối cho
// một năm chưa tới. "¥3.480.000/năm vào 2056" thì không ai biết, nên ô đó hoặc bị bỏ
// trống, hoặc bị điền một con số bịa mà về sau không ai nhớ nó ở đâu ra. "Nghỉ hưu thì
// chi khoảng 80% như bây giờ" thì trả lời được thật — và nó TỰ ĐI THEO khi số của chặng
// hiện tại đổi, thay vì mắc kẹt ở con số đã gõ một lần.
//
// Ý này lấy từ Forecasting của Monarch (khảo sát 07/09/2026): sự kiện Retirement của họ
// có "Expenses in retirement — what percentage of your current spending" và "Income
// reduction — what percentage of the owner's income sources to end", cả hai mặc định
// 100%. Ở Sổ Gạo thì thứ mang thu/chi nền là CHẶNG, nên phần trăm thuộc về chặng.
//
// DÂY CHUYỀN, KHÔNG PHẢI SO VỚI CHẶNG ĐẦU: chặng 3 lấy 80% của chặng 2 ĐÃ GIẢI, mà
// chặng 2 có thể lại là 50% của chặng 1. Giải tuần tự nên "về VN sống 50%, rồi nghỉ hưu
// còn 80% của mức đó" ra 40% chặng đầu, đúng cách người ta xếp chồng các quyết định.
import { convertLifetimeMinor, type LifetimePhase } from './project'
import type { CurrencyCode } from '../../lib/currencies'

/** Trần cho phần trăm, khớp `check (… between 0 and 1000)` của migration 0067. */
export const MAX_PHASE_PCT = 1000

/**
 * Thay `annualIncomeMinor`/`annualExpenseMinor` của những chặng khai bằng phần trăm
 * bằng số đã tính. Chặng khai số tuyệt đối thì trả về NGUYÊN đối tượng cũ.
 *
 * `phases` phải ĐÃ SẮP theo `startYear` tăng dần — "chặng liền trước" chỉ có nghĩa khi
 * đã sắp, và hàm này cố ý KHÔNG tự sắp: chỗ gọi (`projectLifetime`) đã sắp một lần rồi,
 * sắp lại ở đây là mời hai thứ tự khác nhau cùng tồn tại.
 */
export function resolvePhasePercents(
  phases: LifetimePhase[],
  displayCurrency: CurrencyCode,
): LifetimePhase[] {
  const out: LifetimePhase[] = []
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i]
    // Chặng ĐẦU không có gì để lấy phần trăm của. Bỏ qua cờ và dùng số tuyệt đối —
    // KHÔNG trả 0, vì 0 ở đây nghĩa là "chặng đầu đời không thu không chi", một câu
    // sai hẳn mà không có gì trên màn hình nói ra.
    const prev = out[i - 1]
    if (prev === undefined) {
      out.push(p)
      continue
    }
    const income = fromPct(p.incomePctOfPrev, prev.annualIncomeMinor, prev, p, displayCurrency)
    const expense = fromPct(p.expensePctOfPrev, prev.annualExpenseMinor, prev, p, displayCurrency)
    if (income === null && expense === null) {
      out.push(p)
      continue
    }
    out.push({
      ...p,
      ...(income !== null && { annualIncomeMinor: income }),
      ...(expense !== null && { annualExpenseMinor: expense }),
    })
  }
  return out
}

/**
 * `null` = chặng này không khai phần trăm cho trường đó (giữ số tuyệt đối).
 *
 * PHẢI ĐỔI TIỀN HAI CHẶNG VỀ CÙNG ĐƠN VỊ trước khi nhân: "80% của chặng trước" với
 * chặng trước tính bằng ¥ và chặng này tính bằng ₫ mà nhân thẳng thì ra ₫2,8 triệu/năm
 * thay vì ₫460 triệu — sai 165 lần, và KHÔNG có guard nào bắt được vì cả hai số đều
 * hợp lệ. Cùng lớp bẫy đơn vị mà `presets.ts` đã phải ép cứng `currency` để tránh.
 *
 * Đi qua tiền HIỂN THỊ vì đó là đơn vị duy nhất cả hai chặng đều biết đường tới
 * (`fxToDisplay` của chính nó). Không có tỷ giá trực tiếp chặng→chặng ở đâu cả.
 */
function fromPct(
  pct: number | null | undefined,
  prevMinor: number,
  prev: LifetimePhase,
  cur: LifetimePhase,
  displayCurrency: CurrencyCode,
): number | null {
  if (pct == null) return null
  if (!Number.isFinite(pct) || pct < 0) return null
  // Tỷ giá 0 hoặc âm là dữ liệu hỏng; nhân vào cho ra 0 hoặc số âm mà không ai thấy.
  // Giữ số tuyệt đối và để dấu cảnh báo `fx === 1` sẵn có của trình sửa lo phần báo.
  if (!(cur.fxToDisplay > 0)) return null

  const prevInDisplay = convertLifetimeMinor(
    prevMinor,
    prev.currency,
    displayCurrency,
    prev.fxToDisplay,
  )
  const wantedInDisplay = (prevInDisplay * pct) / 100
  // Ngược đường: display → tiền của chặng này. `1 / fxToDisplay` vì `fxToDisplay` là
  // "1 đơn vị chặng = bao nhiêu đơn vị display".
  return Math.round(
    convertLifetimeMinor(
      Math.round(wantedInDisplay),
      displayCurrency,
      cur.currency,
      1 / cur.fxToDisplay,
    ),
  )
}
