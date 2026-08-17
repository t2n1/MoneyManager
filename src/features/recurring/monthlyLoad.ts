// "¥98,110/tháng tự ghi" — tổng gánh nặng mỗi tháng của các quy tắc định kỳ (bản vẽ 22c).
//
// Trang Định kỳ đang liệt kê từng quy tắc rất rõ (kỳ tới, tạm dừng, chỉ nhắc) nhưng không
// nói ra con số mà người ta thật sự mở trang để hỏi: "mỗi tháng tự động rời khỏi ví bao
// nhiêu". Tự cộng thì phải quy đổi tần suất trong đầu — hàng tuần với hàng năm không cộng
// thẳng vào hàng tháng được.
//
// BỐN QUYẾT ĐỊNH, cả bốn đều thu hẹp con số lại, và mỗi cái đều có thể làm nó sai nếu bỏ:
//
//   1. CHỈ `mode: 'auto'`. Nhãn ghi "tự ghi" vì đúng nghĩa: quy tắc 'remind' KHÔNG tự trừ
//      tiền, người dùng phải tự ghi và số tiền mỗi lần một khác (xem chú thích ở
//      NOTIFICATION_META['bill-due']). Gộp chúng vào là hứa một con số chắc chắn cho thứ
//      còn chưa biết bao nhiêu.
//   2. BỎ quy tắc đang tạm dừng — nó không rời ví đồng nào.
//   3. BỎ quy tắc đã hết hạn (`end_on` đã qua): nó nằm trong danh sách như một bản ghi cũ.
//   4. CHỈ CHI, không trừ thu. Trộn lương vào ra một con số ròng dương và nhãn "/tháng"
//      lúc đó nói ngược hẳn: người đọc tưởng mỗi tháng mình DƯ ra chừng đó một cách tự
//      động. Thu định kỳ là câu hỏi khác, và mặt lập kế hoạch đã trả lời nó.
//
// Chuyển khoản cũng bỏ: nó dời tiền giữa hai ví của cùng một người, không phải tiền ra.
import type { RecurringFrequency } from '../../lib/recurring'
import type { CurrencyCode } from '../../lib/currencies'

/** Số kỳ mỗi tháng của từng tần suất. */
const PER_MONTH: Record<RecurringFrequency, number> = {
  // 52 tuần / 12 tháng — KHÔNG phải 4. Lấy 4 thì một quy tắc hàng tuần bị tính thiếu
  // gần một kỳ mỗi tháng, tức thiếu ~8% cho đúng loại quy tắc dễ bị coi nhẹ nhất.
  weekly: 52 / 12,
  monthly: 1,
  yearly: 1 / 12,
}

export interface MonthlyLoadRule {
  amount: number
  currency: CurrencyCode
  type: 'expense' | 'income' | 'transfer'
  frequency: RecurringFrequency
  mode: 'auto' | 'remind'
  isPaused: boolean
  /** null = vô hạn. */
  endOn: string | null
  /** Hoàn tiền lặp lại — trừ ra chứ không cộng vào. */
  isRefund: boolean
}

export interface MonthlyLoad {
  /** Tổng chi mỗi tháng, quy đổi base, đã làm tròn. */
  perMonth: number
  /** Số quy tắc đã góp vào con số này. */
  counted: number
  /** true = có quy tắc ngoại tệ chưa quy đổi được → `perMonth` đang thiếu. */
  hasMissingRate: boolean
}

/**
 * Tổng chi tự động mỗi tháng. `convert` trả `null` khi thiếu tỷ giá — lúc đó quy tắc đó
 * bị bỏ khỏi tổng và `hasMissingRate` bật, để nơi hiển thị gắn dấu ≈ thay vì im lặng
 * cộng thiếu.
 */
export function monthlyLoad(
  rules: readonly MonthlyLoadRule[],
  todayISO: string,
  convert: (minor: number, from: CurrencyCode) => number | null,
): MonthlyLoad {
  let perMonth = 0
  let counted = 0
  let hasMissingRate = false

  for (const r of rules) {
    if (r.mode !== 'auto') continue
    if (r.isPaused) continue
    if (r.type !== 'expense') continue
    if (r.endOn !== null && r.endOn < todayISO) continue

    const base = convert(r.amount, r.currency)
    if (base === null) {
      hasMissingRate = true
      continue
    }
    // Hoàn tiền lặp lại là tiền VỀ, nên trừ ra. Nó vẫn là `type: 'expense'` trong DB
    // (xem cột is_refund), nên không lọc ở trên được.
    perMonth += (r.isRefund ? -base : base) * PER_MONTH[r.frequency]
    counted++
  }

  return { perMonth: Math.round(perMonth), counted, hasMissingRate }
}
