// Tính giao dịch bù cho sheet "Điều chỉnh số dư".
// Thuần, không phụ thuộc React, để unit-test được.

import { statementCloseFor } from '../../lib/cardAutopay'
import { nextCardDueDate } from '../../lib/dates'

export interface ReconcileInput {
  /** Thẻ tín dụng: ô nhập là SỐ ĐANG NỢ (luôn dương), số dư sổ mang dấu âm. */
  isCard: boolean
  /** Số dư sổ hiện tại (minor units). Thẻ đang nợ → số âm. */
  currentBalance: number
  /** Số người dùng gõ vào ô, luôn dương. */
  entered: number
}

export interface ReconcilePlan {
  /** Số dư sổ mong muốn sau khi bù. */
  target: number
  /** target − currentBalance. Dương → giao dịch thu, âm → giao dịch chi. */
  diff: number
  type: 'income' | 'expense'
}

/**
 * Quy số người dùng nhập về số dư sổ rồi lấy chênh lệch. Với thẻ, "nợ 120.000"
 * nghĩa là số dư sổ −120.000, nên nợ tăng ra diff âm → giao dịch CHI trên thẻ
 * (chi làm số dư giảm, tức nợ tăng — khớp view account_balances).
 */
export function reconcilePlan({ isCard, currentBalance, entered }: ReconcileInput): ReconcilePlan {
  const debt = Math.abs(entered)
  // `-0` sẽ lọt vào DB và hiện ra chỗ khác, nên chặn ngay tại đây
  const target = isCard ? (debt === 0 ? 0 : -debt) : entered
  const diff = target - currentBalance
  return { target, diff, type: diff > 0 ? 'income' : 'expense' }
}

/** Số nợ hiển thị của thẻ (dương). Thẻ trả dư (số dư > 0) coi như nợ 0. */
export function cardDebt(balance: number): number {
  return Math.max(0, -balance)
}

export interface AdjustDateInput {
  isCard: boolean
  statementDay: number | null
  paymentDueDay: number | null
  todayISO: string
}

/**
 * Ngày mặc định cho giao dịch bù. Ví/tài khoản thường: hôm nay.
 *
 * THẺ TÍN DỤNG thì không: engine tự-trả (`runCardAutopayCatchUp`) tính số phải
 * trả bằng số dư TẠI NGÀY CHỐT SAO KÊ, mà ngày chốt của kỳ đến hạn kế tiếp
 * thường đã nằm trong quá khứ. Khoản bù ghi ngày hôm nay rơi RA NGOÀI mốc đó →
 * kỳ tới engine vẫn rút theo số nợ sai. Nên mặc định lùi về đúng ngày chốt.
 *
 * Kẹp không vượt quá hôm nay: khi ngày chốt còn ở phía trước (chốt ngày 5, đến
 * hạn ngày 25, hôm nay mùng 2), giao dịch hôm nay vẫn nằm trước mốc chốt nên
 * engine đã tính đúng — không cần ghi ngày tương lai vào sổ.
 *
 * Thẻ thiếu ngày chốt/ngày trả thì không có mốc nào để lùi → hôm nay.
 */
export function defaultAdjustDate({
  isCard,
  statementDay,
  paymentDueDay,
  todayISO,
}: AdjustDateInput): string {
  if (!isCard || statementDay == null || paymentDueDay == null) return todayISO
  const closeISO = statementCloseFor(nextCardDueDate(paymentDueDay, todayISO), statementDay)
  return closeISO < todayISO ? closeISO : todayISO
}

/**
 * Ghi chú gắn cho khoản bù TỔNG NỢ thẻ — cũng là dấu hiệu để tổng "Quẹt trong
 * kỳ" (cardMonthCharge) nhận ra và bỏ qua nó: khoản bù tổng nợ không phải tiền
 * quẹt, cộng vào sẽ ra số không có trên sao kê thật nào. Khoản bù của "Chỉnh
 * cho khớp" mang ghi chú khác nên vẫn được tính như thiết kế.
 */
export const CARD_RECONCILE_NOTE = 'Điều chỉnh số nợ'

// --- Danh mục cho giao dịch bù ---
// Bảng transactions có CHECK: chi/thu BẮT BUỘC có danh mục (chỉ chuyển khoản mới
// được để trống). Nên giao dịch bù phải gắn một danh mục — app tự tạo sẵn một
// danh mục riêng cho việc này, mỗi chiều một cái, để sổ đọc ra nghĩa ngay.
export const ADJUST_CATEGORY_NAME = 'Điều chỉnh số dư'
export const ADJUST_CATEGORY_ICON = '⚖️'

interface CategoryLike {
  id: string
  name: string
  type: 'expense' | 'income'
  is_archived: boolean
}

/** Danh mục bù đang dùng được cho chiều `kind`; null = chưa có, cần tạo. */
export function findAdjustCategory<T extends CategoryLike>(
  categories: T[],
  kind: 'expense' | 'income',
): T | null {
  return (
    categories.find(
      (c) => c.type === kind && c.name === ADJUST_CATEGORY_NAME && !c.is_archived,
    ) ?? null
  )
}
