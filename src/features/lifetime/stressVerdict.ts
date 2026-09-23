// Câu kết luận của khối "Stress test" — tách khỏi StressPanel.tsx để có test canh.
//
// Quy ước trang Tương lai: "không năm nào âm" LUÔN kèm phạm vi "tới tuổi N" (xem
// verdictHeadline trong summary.ts). Bản chiếu dừng ở endAge; nói trơn "không năm nào
// âm" là hứa một điều bản chiếu không hề xét tới.

export interface StressVerdictArgs {
  /** Năm âm đầu tiên (nhánh bi quan) của bản GỐC và bản CÓ sốc; `null` = không âm. */
  baseNegativeYear: number | null
  stressNegativeYear: number | null
  birthYear: number
  /** Tuổi cuối của bản chiếu GỐC (endAge của kịch bản). */
  baseEndAge: number
  /**
   * Số năm cú sốc "Sống thọ hơn dự tính" kéo dài bản CÓ sốc (0 khi tắt) — cùng luật
   * `lastYear` trong project.ts. Bản gốc không bị kéo dài.
   */
  longevityYears: number
}

export function stressVerdict(a: StressVerdictArgs): string {
  const stressEndAge = a.baseEndAge + a.longevityYears
  if (a.stressNegativeYear === null)
    return `Kịch bản chịu được các cú sốc đang bật: vẫn không năm nào âm tới tuổi ${stressEndAge}.`
  if (a.baseNegativeYear === null)
    return `Cú sốc làm nhánh bi quan âm từ ${a.stressNegativeYear} (tuổi ${a.stressNegativeYear - a.birthYear}) — kịch bản gốc vốn không năm nào âm tới tuổi ${a.baseEndAge}.`
  return `Cú sốc kéo năm âm từ ${a.baseNegativeYear} lên ${a.stressNegativeYear}.`
}
