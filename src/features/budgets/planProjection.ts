// Chiếu HỆ QUẢ của một kế hoạch chưa điền xong — thuần, test được.
//
// Vì sao là file riêng, cùng khuôn `planVerdict.ts`: `planVerdict` phán trên
// `summary.allocated`, tức chỉ trên NHỮNG GÌ ĐÃ ĐIỀN. Với dữ liệu thật tháng 8/2026 nó
// ra tông `warn` nhẹ — để dành 22%, đạt sàn 20% — nghe như kế hoạch gần xong. Số thật:
//
//   hiện tại            ¥226,138 đã chia · để dành ¥63,862 · 22,0% · đạt sàn
//   nhận hết 7 gợi ý    ¥273,208         · để dành ¥16,792 ·  5,8% · KHÔNG đạt
//   phủ luôn 2 cam kết  ¥295,608         · để dành −¥5,608 · chia QUÁ THU
//
// Kế hoạch này không đạt sàn — nó chỉ chưa được điền xong. `planVerdict` không thể biết
// điều đó vì nó không nhìn `suggestions` và `gaps` như TIỀN SẼ ĐƯỢC ĐIỀN VÀO. Đây là con
// số duy nhất khiến người dùng sửa một hạn mức.
import type { CoverageGap } from './commitments'
import type { PlanSummary } from './planning'
import type { Suggestion } from './suggest'

export interface PlanProjection {
  /** allocated + Σ suggestion.average của danh mục chưa đặt */
  ifSuggested: number
  /** ifSuggested + Σ gap.short */
  ifCovered: number
  /** income − ifSuggested; ÂM = chia quá thu */
  savingsIfSuggested: number
  savingsIfCovered: number
  /** sàn để dành quy ra tiền = income × savingsBps/10000 */
  savingsFloor: number
  /** còn được phân bổ thêm bao nhiêu mà vẫn giữ sàn; có thể ≤ 0 */
  headroom: number
  /** số danh mục chưa đặt hạn mức nhưng có gợi ý */
  unsetCount: number
  suggestedTotal: number
  gapTotal: number
  /** số trần đang hụt cam kết — để câu chiếu nói được BAO NHIÊU trần, không chỉ bao nhiêu tiền */
  gapCount: number
}

export interface PlanProjectionInput {
  summary: PlanSummary
  /** Gợi ý theo danh mục — `suggestLimits()` trả về nguyên bản. */
  suggestions: Map<string, Suggestion>
  /** Hạn mức đang đặt theo danh mục; vắng mặt = chưa đặt. */
  budgetedByCat: Map<string, number>
  /** Trần đang hụt cam kết (`coverageGaps()`). */
  gaps: CoverageGap[]
  /** Sàn để dành, basis points của thu nhập (2000 = 20%). */
  savingsBps: number
  /** Danh mục nào chỉ là MỐC CON — không nhận gợi ý vào tổng, xem B32.4. */
  isMarker: (categoryId: string) => boolean
  /** Danh mục nào được phép đặt hạn mức (bỏ dòng chảy / chuyển tài sản / đã lưu trữ). */
  isBudgetable: (categoryId: string) => boolean
}

/**
 * Chiếu kế hoạch. `null` = chưa có mẫu số nên mọi tỷ lệ vô nghĩa.
 *
 * Cùng luật `null` với `planVerdict`: khối "chưa biết thu nhập" đã có câu riêng mời khai
 * thu dự kiến, in thêm một khối chiếu ở trên nó là hai chỗ tranh nhau nói cùng một điều.
 */
export function planProjection({
  summary,
  suggestions,
  budgetedByCat,
  gaps,
  savingsBps,
  isMarker,
  isBudgetable,
}: PlanProjectionInput): PlanProjection | null {
  if (summary.incomeSource === 'unknown' || summary.income <= 0) return null

  // Mẫu số là `summary.income`, KHÔNG tính lại (B32.2): `planSummary` đã chọn `declared`
  // thắng `baseline` (kể cả `declared = 0`), và tính lại ở đây là đẻ đường thứ hai sẽ lệch.
  const income = summary.income

  let suggestedTotal = 0
  let unsetCount = 0
  for (const [categoryId, s] of suggestions) {
    // Chỉ danh mục KHÔNG có trong `budgetedByCat` (B32.3). Danh mục đã đặt ¥3,000 trong
    // khi TB ¥13,070 (ca thật: Điện) KHÔNG được chiếu lên ¥13,070 — người dùng đã cố ý
    // đặt thấp, mà "chiếu" nghĩa là dự đoán họ sẽ bấm gợi ý, không phải đoán họ đặt sai.
    if (budgetedByCat.has(categoryId)) continue
    // Mốc con nằm trong trần cha nên nhận gợi ý ở đó không làm tổng kế hoạch tăng —
    // cùng lý do `plannedSlices` loại chúng ra (B32.4).
    if (isMarker(categoryId)) continue
    if (!isBudgetable(categoryId)) continue
    if (s.average <= 0) continue
    suggestedTotal += s.average
    unsetCount++
  }

  const gapTotal = gaps.reduce((t, g) => t + g.short, 0)
  const ifSuggested = summary.allocated + suggestedTotal
  const ifCovered = ifSuggested + gapTotal
  const savingsFloor = Math.round((income * savingsBps) / 10_000)

  return {
    ifSuggested,
    ifCovered,
    savingsIfSuggested: income - ifSuggested,
    savingsIfCovered: income - ifCovered,
    savingsFloor,
    // Con số thật sự dùng được: với dữ liệu tháng 8/2026 nó ra ¥5,862 trong khi gợi ý
    // muốn ¥47,070 — và chính khoảng chênh đó là lý do "nhận hết gợi ý" với "giữ sàn để
    // dành" không thể cùng đúng.
    headroom: income - savingsFloor - summary.allocated,
    unsetCount,
    suggestedTotal,
    gapTotal,
    gapCount: gaps.length,
  }
}

/** Đơn vị làm tròn của một hạn mức chia tự động. Số lẻ tới từng đồng không ai đặt bằng tay. */
const STEP = 100

/**
 * Chia `headroom` cho các danh mục chưa đặt, THEO TỈ LỆ trung bình của chúng.
 *
 * Đây là hành động duy nhất giữ được cả hai ràng buộc "phủ hết danh mục chưa đặt" và
 * "không phá sàn để dành" — hai thứ mà nút "Nhận hết gợi ý" không thể cùng làm.
 *
 * Tổng chia ra ĐÚNG BẰNG `headroom`: làm tròn về `STEP` rồi dồn phần lẻ vào mục có
 * `average` lớn nhất. Không dồn thì mỗi lần bấm lại hụt vài trăm đồng so với con số vừa
 * in trên nút, và người dùng đọc ra là app tính sai.
 *
 * `headroom <= 0` → map rỗng: nơi gọi phải vô hiệu hoá nút và nói câu thay thế, chứ
 * không âm thầm chia số âm (B35.3).
 *
 * Mọi `average` bằng 0 → chia ĐỀU: không có tỉ lệ nào để dựa vào thì mọi mục đáng giá
 * như nhau, và đó cũng là cách duy nhất không chia cho 0.
 */
export function distributeHeadroom(
  headroom: number,
  candidates: { categoryId: string; average: number }[],
): Map<string, number> {
  const out = new Map<string, number>()
  if (headroom <= 0 || candidates.length === 0) return out

  const weightTotal = candidates.reduce((s, c) => s + Math.max(0, c.average), 0)
  const share = (c: { average: number }) =>
    weightTotal > 0 ? (Math.max(0, c.average) / weightTotal) * headroom : headroom / candidates.length

  let given = 0
  for (const c of candidates) {
    const v = Math.floor(share(c) / STEP) * STEP
    out.set(c.categoryId, v)
    given += v
  }

  // Phần lẻ dồn vào mục có `average` lớn nhất (bằng nhau thì mục đầu tiên — thứ tự đầu
  // vào đã do nơi gọi quyết định, hàm này không sắp lại).
  const rest = headroom - given
  if (rest > 0) {
    const top = candidates.reduce((a, b) => (b.average > a.average ? b : a), candidates[0])
    out.set(top.categoryId, (out.get(top.categoryId) ?? 0) + rest)
  }
  return out
}
