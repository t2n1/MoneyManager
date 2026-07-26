// Tiền "đã có chủ": phần tài sản lỏng đang để dành cho một mục tiêu tiết kiệm.
//
// Chỉ số Quỹ dự phòng cộng hết tiền lỏng, nhưng nếu ¥500.000 trong đó là tiền
// gom cho chuyến về VN thì nó không thực sự sẵn sàng cho lúc mất việc. Hàm này
// tách phần đó ra để trang Sức khỏe nói được cả hai con số.

import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { AccountBalanceRow, SavingsGoalRow } from '../../types/database.types'
import { LIQUID_TYPES } from './snapshot'

export interface Earmarked {
  /** tổng đã giữ chỗ, quy đổi base (minor units) */
  total: number
  hasMissingRate: boolean
}

/**
 * Với mỗi tài khoản LỎNG có mục tiêu: giữ chỗ = min(số dư, tổng đích của các
 * mục tiêu trên tài khoản đó).
 *
 * - Kẹp theo số dư vì không thể "đã để dành" nhiều hơn số đang có.
 * - Kẹp theo đích vì phần vượt đích là tiền tự do, không còn ràng buộc.
 * - Gộp theo TÀI KHOẢN trước khi kẹp, nếu không hai mục tiêu cùng một tài khoản
 *   sẽ cộng thành nhiều hơn số dư thật.
 * - Bỏ qua tài khoản không lỏng / đã ẩn / không tính vào tổng, đúng bằng bộ lọc
 *   mà `buildHealthSnapshot` dùng cho `liquidAssets` — hai số phải cùng gốc thì
 *   phép trừ mới có nghĩa.
 */
export function earmarkedForGoals(
  goals: SavingsGoalRow[],
  balances: AccountBalanceRow[],
  base: CurrencyCode,
  rates: Rates,
): Earmarked {
  const targetByAccount = new Map<string, number>()
  for (const g of goals) {
    targetByAccount.set(g.account_id, (targetByAccount.get(g.account_id) ?? 0) + g.target_amount)
  }

  let total = 0
  let hasMissingRate = false
  for (const b of balances) {
    const target = targetByAccount.get(b.id)
    if (target === undefined) continue
    if (b.is_archived || b.is_hidden || !b.include_in_totals) continue
    if (!LIQUID_TYPES.includes(b.type)) continue
    const held = Math.min(Math.max(b.balance, 0), target)
    if (held <= 0) continue
    const v = convertToBase(held, b.currency, base, rates)
    if (v === null) hasMissingRate = true
    else total += v
  }
  return { total, hasMissingRate }
}
