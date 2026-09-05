// Lũy kế chi trong tháng, so với cùng tháng năm ngoái — phần toán của chế độ
// "So năm ngoái" trong thẻ Chi từng ngày (Bản tin).
//
// Vì sao LŨY KẾ chứ không so từng ngày: chi mỗi ngày là sự kiện rời rạc, ngày lương /
// cuối tuần / ngày lễ hai năm rơi lệch nhau nên cột ngày-3-vs-ngày-3 chỉ ra nhiễu.
// Cộng dồn từ đầu tháng thì câu trả lời thành "tới hôm nay mình đã chi nhanh hơn hay
// chậm hơn quỹ đạo năm ngoái" — đúng câu người dùng hỏi để phanh lại. Và vì lũy kế là
// đại lượng tăng (tụt khi hoàn tiền) liên tục theo ngày, vẽ ĐƯỜNG không phạm B41.
//
// Hai tháng lệch số ngày (28 vs 31, hoặc ngày-bắt-đầu-tháng tùy chỉnh): so theo
// ngày-thứ-mấy-của-tháng, tháng ngắn hơn thì kẹp về ngày cuối của nó — tức từ chỗ đó
// trở đi là so với TRỌN tháng năm ngoái, không bịa thêm ngày.

import type { DaySpend } from './dailySpike'

export interface CumulativeCompare {
  /** Lũy kế năm nay (base minor), chỉ những ngày ĐÃ xảy ra — tới cutoffISO. */
  current: number[]
  /** Lũy kế TRỌN tháng cùng kỳ năm ngoái. */
  prior: number[]
  /** Lũy kế năm ngoái tại đúng ngày-thứ-mấy hiện tại (kẹp về ngày cuối nếu tháng đó ngắn hơn). */
  priorAtSameDay: number
  /** % chênh tại ngày hiện tại; null khi năm ngoái tới ngày đó chưa chi đồng nào. */
  deltaPct: number | null
  /** Tổng cả tháng năm ngoái — đích đến của đường mờ. */
  priorTotal: number
}

function cumulate(days: readonly DaySpend[]): number[] {
  const out: number[] = []
  let sum = 0
  for (const d of days) {
    sum += d.total
    out.push(sum)
  }
  return out
}

/**
 * `null` khi không có gì của năm ngoái để so — người gọi tự quyết giấu biểu đồ hay
 * hiện câu "chưa có dữ liệu cùng kỳ". Việc phân biệt "tháng đó không ghi khoản nào"
 * (txCount = 0) với "tháng đó có ghi" là của người gọi, vì DaySpend không mang cờ đó.
 */
export function cumulativeCompare(
  currentDays: readonly DaySpend[],
  cutoffISO: string,
  priorDays: readonly DaySpend[],
): CumulativeCompare | null {
  if (priorDays.length === 0) return null

  const current = cumulate(currentDays.filter((d) => d.date <= cutoffISO))
  const prior = cumulate(priorDays)
  if (current.length === 0) return null

  const priorAtSameDay = prior[Math.min(current.length, prior.length) - 1]
  const nowAtCutoff = current[current.length - 1]
  const deltaPct =
    priorAtSameDay === 0 ? null : ((nowAtCutoff - priorAtSameDay) / priorAtSameDay) * 100

  return { current, prior, priorAtSameDay, deltaPct, priorTotal: prior[prior.length - 1] }
}
