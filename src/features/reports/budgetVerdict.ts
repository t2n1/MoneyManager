// Phán quyết ngân sách tháng: "với đà này có thủng tổng trần không".
//
// Tách khỏi `monthPace.tsx` (file .tsx, kéo theo recharts) để canh được bằng phép thử
// thuần, và để chỗ RENDER nó không còn buộc phải nằm cạnh biểu đồ.
//
// PHẠM VI là điều duy nhất quan trọng ở đây. `MonthPace` có hai dự báo:
//   - `forecast`       — TOÀN BỘ chi trong tháng
//   - `budgetForecast` — chỉ các mục ĐÃ ĐẶT hạn mức, cùng phạm vi với `totalBudgeted`
// Phán quyết chỉ được nhìn cái thứ hai. Lấy toàn bộ chi đem so với trần của vài mục là so
// lệch phạm vi: ai mới đặt vài hạn mức cũng thấy "vượt" khổng lồ, rồi thôi tin cả thẻ.

import type { MonthPace } from './monthPace'

export type BudgetVerdict =
  /** Cả kịch bản chi ít nhất cũng vượt — nói chắc. */
  | { kind: 'over'; totalBudgeted: number; overBy: number; budgetedCount: number }
  /** Chỉ cận trên vượt — còn tuỳ mấy ngày cuối tháng. */
  | { kind: 'near'; totalBudgeted: number; budgetedCount: number }
  /** Cả cận trên cũng không vượt. */
  | { kind: 'under'; totalBudgeted: number; budgetedCount: number }
  /** Chưa đặt trần nào — mời đặt, không phán quyết. */
  | { kind: 'unset' }

/**
 * `null` = không có gì để nói (chưa phát sinh chi, tháng đã qua nên không dựng dự báo,
 * hoặc có trần mà chưa dựng được dự báo cùng phạm vi). Im lặng chứ KHÔNG rơi về
 * `forecast` toàn bộ chi — thà không nói còn hơn nói một con số khác phạm vi.
 */
export function pickBudgetVerdict(pace: MonthPace): BudgetVerdict | null {
  const { hasSpend, forecast, budgetForecast, totalBudgeted, budgetedCount } = pace
  if (!hasSpend || !forecast) return null
  if (totalBudgeted === 0) return { kind: 'unset' }
  if (!budgetForecast) return null

  // So cận DƯỚI: chỉ nói "sẽ vượt" khi ngay cả kịch bản chi ít nhất cũng vượt. Nói chắc
  // rồi tháng sau không vượt thì lần sau người dùng thôi tin cả thẻ này.
  if (budgetForecast.low > totalBudgeted) {
    return {
      kind: 'over',
      totalBudgeted,
      overBy: budgetForecast.projected - totalBudgeted,
      budgetedCount,
    }
  }
  if (budgetForecast.high > totalBudgeted) return { kind: 'near', totalBudgeted, budgetedCount }
  return { kind: 'under', totalBudgeted, budgetedCount }
}
