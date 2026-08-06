// So tuần đang dở với tuần trước — TÍNH TỚI CÙNG SỐ NGÀY.
//
// Vì sao phải cắt: so 4 ngày của tuần này với trọn 7 ngày tuần trước thì lúc nào cũng ra
// "đang tiêu ít hơn", rồi tới Chủ nhật câu chữ đột ngột đổi giọng. Cắt đúng số ngày đã
// trôi mới nói được điều gì thật. Đây là cách permtrack so "tuần này vs tuần trước": họ
// ghi thẳng "ngày 4/7" cạnh con số để người đọc biết đang so trên nền mấy ngày.
//
// Cùng ý với `forecastMonthEnd` của insights.ts nhưng khác câu hỏi: cái kia chiếu ra cuối
// tháng, cái này so với kỳ liền trước.

export interface WeekPaceInput {
  /** Chi từng ngày của tuần này, phần tử 0 là ngày đầu tuần. */
  thisWeek: number[]
  /** Chi từng ngày của tuần trước, đủ 7 phần tử. */
  lastWeek: number[]
  /** Đang ở ngày thứ mấy của tuần này (1..7). */
  dayOfWeek: number
}

export interface WeekPace {
  tone: 'good' | 'warn' | 'info'
  spent: number
  priorSameDays: number
  deltaPct: number | null
  dayOfWeek: number
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** Trả null khi chưa có tuần trước để so. */
export function weekPace(input: WeekPaceInput): WeekPace | null {
  const { thisWeek, lastWeek, dayOfWeek } = input
  if (lastWeek.length === 0) return null

  const spent = sum(thisWeek.slice(0, dayOfWeek))
  const priorSameDays = sum(lastWeek.slice(0, dayOfWeek))

  // Tuần trước không chi gì thì mọi mức chi tuần này đều là "tăng vô hạn" — không nói
  // gì còn hơn nói một con số vô nghĩa.
  const deltaPct =
    priorSameDays > 0 ? Math.round(((spent - priorSameDays) / priorSameDays) * 100) : null

  const tone: WeekPace['tone'] =
    deltaPct === null ? 'info' : deltaPct > 0 ? 'warn' : deltaPct < 0 ? 'good' : 'info'

  return { tone, spent, priorSameDays, deltaPct, dayOfWeek }
}
