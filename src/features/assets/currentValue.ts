// "Giá trị hiện tại" của MỘT tài khoản — một chỗ duy nhất trả lời câu này.
//
// Vì sao tồn tại: cùng một tài khoản NISA, trang chi tiết in ¥78.913 (giá thị trường tính từ
// sổ lệnh) còn Cài đặt › Tài khoản và Mục tiêu tiết kiệm in ¥80.809 (số dư sổ = tiền đã
// nạp). Cả hai số đều đúng theo định nghĩa riêng, nhưng không màn nào nói mình đang in số
// nào — nên đọc ra là hai màn cãi nhau. Nay ba chỗ gọi chung hàm này, cùng thứ tự nguồn với
// trang chi tiết, và kèm theo CƠ SỞ của con số để màn in nhãn ngắn cạnh số.
//
// Thuần, không React. Hook nối dây ở `useAccountCurrentValues.ts`.

import type { AccountRow } from '../../types/database.types'
import { depreciate } from './depreciation'
import type { AccountPortfolioState } from './useAccountPortfolio'

/**
 * - `balance`      — tài khoản thường: số dư.
 * - `market`       — đầu tư có sổ lệnh, định giá được bằng bảng giá.
 * - `valuation`    — lần định giá gần nhất (view `market_value`): nhập tay, hoặc ảnh chụp
 *                    của cron khi sổ lệnh chưa tải xong.
 * - `ledger`       — đầu tư chưa có giá: rơi về số dư sổ (tiền đã nạp − đã rút).
 * - `depreciation` — tài sản cố định chưa định giá tay: suy từ công thức khấu hao.
 */
export type ValueBasis = 'balance' | 'market' | 'valuation' | 'ledger' | 'depreciation'

export interface AccountCurrentValue {
  value: number
  basis: ValueBasis
}

export type CurrentValueAccount = Pick<
  AccountRow,
  'type' | 'initial_balance' | 'salvage_value' | 'depreciation_months' | 'depreciation_from'
>

/**
 * Cùng thứ tự nguồn với số lớn của trang chi tiết tài khoản:
 *
 * - Đầu tư: có sổ lệnh (`portfolio` là object) → giá thị trường tính tại máy, không định giá
 *   được thì SỐ DƯ SỔ (không rơi về ảnh chụp cũ — xem chú thích ở AccountDetailPage). Không
 *   có sổ lệnh (`null`) hoặc chưa biết (`undefined`, còn đang tải) → lần định giá gần nhất,
 *   chưa có thì số dư sổ.
 * - Tài sản cố định: định giá tay thắng công thức khấu hao, thiếu cả hai thì số dư sổ.
 * - Còn lại: số dư.
 *
 * `marketValue` là cột `market_value` của view `account_balances` (lần định giá gần nhất).
 */
export function accountCurrentValue(
  account: CurrentValueAccount,
  balance: number,
  marketValue: number | null,
  portfolio: AccountPortfolioState,
  todayISO: string,
): AccountCurrentValue {
  if (account.type === 'investment') {
    if (portfolio) {
      return portfolio.marketValue != null
        ? { value: portfolio.marketValue, basis: 'market' }
        : { value: balance, basis: 'ledger' }
    }
    return marketValue != null
      ? { value: marketValue, basis: 'valuation' }
      : { value: balance, basis: 'ledger' }
  }
  if (account.type === 'fixed') {
    if (marketValue != null) return { value: marketValue, basis: 'valuation' }
    const dep = depreciate({
      costBasis: account.initial_balance ?? 0,
      salvageValue: account.salvage_value ?? 0,
      months: account.depreciation_months ?? null,
      fromISO: account.depreciation_from ?? null,
      todayISO,
    })
    if (dep) return { value: dep.currentValue, basis: 'depreciation' }
    return { value: balance, basis: 'ledger' }
  }
  return { value: balance, basis: 'balance' }
}

/**
 * Nhãn cơ sở in cạnh số — CHỈ cho tài khoản đầu tư, nơi hai nguồn (giá thị trường / số dư
 * sổ) lệch nhau thường xuyên và người đọc cần biết đang nhìn số nào. null = không in nhãn.
 */
export function valueBasisLabel(
  type: AccountRow['type'],
  basis: ValueBasis,
): string | null {
  if (type !== 'investment') return null
  if (basis === 'market') return 'giá thị trường'
  if (basis === 'valuation') return 'giá cập nhật gần nhất'
  if (basis === 'ledger') return 'số dư sổ'
  return null
}
