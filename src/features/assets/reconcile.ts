// Tính giao dịch bù cho sheet "Điều chỉnh số dư".
// Thuần, không phụ thuộc React, để unit-test được.

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
