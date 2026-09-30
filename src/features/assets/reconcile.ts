// Tính giao dịch bù cho sheet "Điều chỉnh số dư".
// Thuần, không phụ thuộc React, để unit-test được.

import { nextStatementPeriod } from '../../lib/cardAutopay'
import type { AdjustKind } from '../../types/database.types'
import { ADJUST_CATEGORY_NAME } from '../categories/flowCategories'

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
  if (!isCard) return todayISO
  const period = nextStatementPeriod(statementDay, paymentDueDay, todayISO)
  if (!period) return todayISO
  return period.closeISO < todayISO ? period.closeISO : todayISO
}

/**
 * Ghi chú mặc định gắn cho khoản bù TỔNG NỢ thẻ. Từ migration 0072 dấu thật là cột
 * `adjust_kind`; ghi chú chỉ còn là đường nhận dạng cho dòng cũ chưa có dấu — xem
 * `isBalanceAdjust`.
 */
export const CARD_RECONCILE_NOTE = 'Điều chỉnh số nợ' // i18n-ignore — ghi chú lưu DB, dùng để nhận dạng dòng cũ

/**
 * Khoản bù TỔNG nợ/số dư (sheet "Điều chỉnh số nợ") — tổng "Quẹt trong kỳ"
 * (cardMonthCharge) và rổ đối chiếu sao kê phải bỏ qua nó: nó không phải tiền quẹt,
 * cộng vào sẽ ra số không có trên sao kê thật nào. Khoản bù của "Chỉnh cho khớp"
 * ('statement_month') thì vẫn tính — không tính thì chỉnh xong kỳ vẫn lệch.
 *
 * Dấu `adjust_kind` thắng ghi chú: trước đây nhận bằng ghi chú, người dùng sửa ghi
 * chú là khoản bù bị tính thành tiền quẹt và bảng "số bị rút" sai. Dòng chưa có dấu
 * (tạo trước 0072 hoặc lúc DB chưa chạy 0072) rơi về so ghi chú như cũ.
 *
 * Không tự kiểm tài khoản / loại giao dịch — nơi gọi lọc (thẻ nào, không phải chuyển khoản).
 */
export function isBalanceAdjust(t: {
  adjust_kind?: AdjustKind | null
  note?: string | null
}): boolean {
  if (t.adjust_kind != null) return t.adjust_kind === 'balance'
  return t.note === CARD_RECONCILE_NOTE
}

// --- Danh mục cho giao dịch bù ---
// Bảng transactions có CHECK: chi/thu BẮT BUỘC có danh mục (chỉ chuyển khoản mới
// được để trống). Nên giao dịch bù phải gắn một danh mục — app tự tạo sẵn một
// danh mục riêng cho việc này, mỗi chiều một cái, để sổ đọc ra nghĩa ngay.
// Tên nằm ở flowCategories vì màn Ngân sách cũng cần biết để ẩn nó đi.
export { ADJUST_CATEGORY_NAME }
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
