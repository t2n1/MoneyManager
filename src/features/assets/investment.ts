// Lãi/lỗ đầu tư (mục AE) — thuần, không phụ thuộc React, để unit-test được.
// Vốn gốc ròng (costBasis) = số dư sổ (nạp − rút). Giá thị trường (marketValue) =
// snapshot mới nhất người dùng nhập. Lãi/lỗ chưa thực hiện = marketValue − costBasis.
// Mọi số ở minor units theo currency của TÀI KHOẢN (không quy đổi ở đây).

export interface InvestmentStats {
  /** vốn gốc ròng (minor units gốc) = số dư sổ */
  costBasis: number
  /** giá trị thị trường (minor units gốc); null = chưa cập nhật giá */
  marketValue: number | null
  /** lãi/lỗ chưa thực hiện (minor units gốc) = marketValue − costBasis; null = chưa cập nhật */
  unrealizedPnl: number | null
  /** tỷ lệ lãi/lỗ (vd 0.25 = +25%; có thể âm); null = chưa cập nhật hoặc vốn gốc ≤ 0 */
  pnlPercent: number | null
}

/**
 * Thống kê một tài khoản đầu tư từ vốn gốc + giá thị trường (cùng currency tài khoản).
 * `marketValue = null` (chưa cập nhật giá) → lãi/lỗ chưa xác định.
 * Vốn gốc ≤ 0 (đã rút/bán nhiều hơn nạp) → không tính được % (chia cho ≤ 0), trả null.
 */
export function investmentStats(costBasis: number, marketValue: number | null): InvestmentStats {
  if (marketValue == null) {
    return { costBasis, marketValue: null, unrealizedPnl: null, pnlPercent: null }
  }
  const unrealizedPnl = marketValue - costBasis
  const pnlPercent = costBasis > 0 ? unrealizedPnl / costBasis : null
  return { costBasis, marketValue, unrealizedPnl, pnlPercent }
}
