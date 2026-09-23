// Phép suy THUẦN cho bản ĐỌC của tab Tương lai trên màn hẹp (`TuongLaiMobile.tsx`, mục 22,
// soát 2026-09-23).
//
// Bản đọc không tính gì mới: kết luận đi qua `lifetimeVerdict`/`verdictHeadline`
// (summary.ts), bảng theo năm đọc thẳng `YearRow`. File này chỉ gom mỗi CHẶNG thành một dòng
// giả định — và đọc thu/chi của chặng TỪ BẢN CHIẾU chứ không từ số thô của chặng: chặng khai
// "% chặng trước" có `annualIncomeMinor` vô nghĩa, và số thô còn chưa quy về tiền hiển thị.
// Bản chiếu đã làm cả hai việc đó (project.ts), đọc lại là không phải làm lần hai.
import type { LifetimeInput, YearRow } from './project'
import { phaseRange } from './summary'

export interface PhaseDigest {
  label: string
  start: number
  /** Năm cuối của chặng. `null` = chạy tới hết bản chiếu (chặng cuối). */
  end: number | null
  /** Thu/chi NỀN năm đầu của chặng trong bản chiếu (không gồm mốc), theo tiền hiển thị.
   *  `null` = bản chiếu không có năm nào của chặng này (chặng đã qua, hoặc chưa chiếu). */
  incomeMinor: number | null
  expenseMinor: number | null
}

export function phaseDigest(input: LifetimeInput, rows: readonly YearRow[]): PhaseDigest[] {
  return [...input.phases]
    .sort((a, b) => a.startYear - b.startYear)
    .map((p) => {
      const { start, end } = phaseRange(input, p)
      const row = rows.find((r) => r.year >= start && (end === null || r.year <= end))
      return {
        label: p.label,
        start,
        end,
        incomeMinor: row?.incomeMinor ?? null,
        expenseMinor: row?.expenseMinor ?? null,
      }
    })
}
