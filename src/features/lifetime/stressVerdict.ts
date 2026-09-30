// Câu kết luận của khối "Stress test" — tách khỏi StressPanel.tsx để có test canh.
//
// Quy ước trang Tương lai: "không năm nào âm" LUÔN kèm phạm vi "tới tuổi N" (xem
// verdictHeadline trong summary.ts). Bản chiếu dừng ở endAge; nói trơn "không năm nào
// âm" là hứa một điều bản chiếu không hề xét tới.

import { tr } from '../../i18n'

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
    return tr('Kịch bản chịu được các cú sốc đang bật: vẫn không năm nào âm tới tuổi {age}.', { age: stressEndAge })
  if (a.baseNegativeYear === null)
    return tr('Cú sốc làm nhánh bi quan âm từ {year} (tuổi {age}) — kịch bản gốc vốn không năm nào âm tới tuổi {endAge}.', {
      year: a.stressNegativeYear,
      age: a.stressNegativeYear - a.birthYear,
      endAge: a.baseEndAge,
    })
  return tr('Cú sốc kéo năm âm từ {from} lên {to}.', { from: a.baseNegativeYear, to: a.stressNegativeYear })
}
