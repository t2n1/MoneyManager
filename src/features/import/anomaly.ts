// Soát khoản lớn bất thường ở màn xem trước CSV (mục G của spec) — THUẦN.
// KHÔNG chặn lưu, chỉ tô màu để soát bằng mắt.
import type { CurrencyCode } from '../../lib/money'
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

/**
 * `expenseMedian`, nhưng lọc lịch sử về ĐÚNG loại tiền của tài khoản đang nhập,
 * trước khi tính trung vị.
 *
 * Bắt buộc phải lọc: app đa tiền tệ, số tiền lưu theo đơn vị nhỏ nhất của
 * riêng từng loại tiền, nên một bữa chợ ở Việt Nam (₫500.000) có giá trị SỐ
 * lớn gấp trăm lần một bữa ăn ở Nhật (¥3.000) dù đời thực tương đương. Gộp
 * chung mọi loại tiền thì trung vị rơi vào loại tiền nào có nhiều giao dịch
 * hơn, và hậu quả rất tệ theo cả hai chiều:
 * - Giao dịch VND nhiều hơn → trung vị ở mức đồng → nhập sao kê thẻ Nhật
 *   không bao giờ có dòng nào bị tô, dù khoản đó lạ tới đâu. Tính năng chết
 *   đúng ở chỗ cần nó nhất.
 * - Giao dịch JPY nhiều hơn → nhập sao kê VND thì gần như dòng nào cũng bị
 *   tô, quen mắt rồi là thôi không ai để ý nữa.
 *
 * Lọc theo LOẠI TIỀN (không phải theo từng tài khoản) để mẫu đủ lớn — một
 * người có hai thẻ Yên vẫn nên gộp chung lịch sử hai thẻ đó, không nên tách
 * riêng rồi rơi xuống dưới ngưỡng 20 mẫu một cách oan uổng.
 *
 * `currencyOf` được truyền vào dạng hàm (không truyền thẳng mảng account) để
 * file này không cần biết gì về hình dạng bảng account — cùng quy ước với
 * `currencyOf` ở `features/reports/aggregate.ts` và bộ máy quy tắc thông báo.
 * Tài khoản không tra được loại tiền (hàm trả `undefined`) bị loại khỏi mẫu,
 * không bị tính nhầm vào bất kỳ loại tiền nào.
 */
export function expenseMedianForCurrency(
  txs: TransactionRow[],
  currencyOf: (accountId: string) => CurrencyCode | undefined,
  currency: CurrencyCode,
  sinceISO: string,
): number | null {
  const sameCurrencyTxs = txs.filter((t) => currencyOf(t.account_id) === currency)
  return expenseMedian(sameCurrencyTxs, sinceISO)
}
