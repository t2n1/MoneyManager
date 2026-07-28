// Soát khoản lớn bất thường ở màn xem trước CSV (mục G của spec) — THUẦN.
// KHÔNG chặn lưu, chỉ tô màu để soát bằng mắt.
import type { TransactionRow } from '../../types/database.types'

/** Gấp bao nhiêu lần trung vị thì coi là bất thường. */
export const ANOMALY_FACTOR = 3
/** Ít hơn bấy nhiêu giao dịch thì không đủ cơ sở — trả null, không tô gì. */
export const ANOMALY_MIN_SAMPLES = 20

/**
 * Trung vị số tiền CHI từ `sinceISO` trở đi. null = chưa đủ dữ liệu.
 * Dùng trung vị chứ không dùng trung bình: một khoản tiền nhà to là kéo lệch
 * trung bình, còn trung vị vẫn phản ánh "mức thường ngày".
 */
export function expenseMedian(txs: TransactionRow[], sinceISO: string): number | null {
  const amounts = txs
    .filter((t) => t.type === 'expense' && t.occurred_on >= sinceISO && t.amount > 0)
    .map((t) => t.amount)
    .sort((a, b) => a - b)

  if (amounts.length < ANOMALY_MIN_SAMPLES) return null
  const mid = Math.floor(amounts.length / 2)
  return amounts.length % 2 ? amounts[mid] : (amounts[mid - 1] + amounts[mid]) / 2
}

export function isUnusuallyLarge(amount: number, median: number | null): boolean {
  if (median === null || median <= 0) return false
  return amount > median * ANOMALY_FACTOR
}
