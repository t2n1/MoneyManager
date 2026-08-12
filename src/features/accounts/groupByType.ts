// Gom danh sách tài khoản theo loại cho trang Tài khoản (Cài đặt).
// Thuần, không phụ thuộc React, để unit-test được.

import type { CurrencyCode } from '../../lib/money'
import { ACCOUNT_TYPE_LABELS } from '../assets/aggregate'
import type { AccountRow, AccountType } from '../../types/database.types'

/**
 * Thứ tự hiển thị các loại — khớp thứ tự ô "Loại" trong form thêm tài khoản
 * (AccountsPage: Tiền mặt → Ngân hàng → Thẻ → IC → Ví → Đầu tư → Tài sản cố định).
 *
 * `fixed` từng bị thiếu ở đây: form cho tạo tài khoản loại đó, mà cả hai hàm dưới
 * đều lọc theo đúng danh sách này nên nó biến mất khỏi trang Tài khoản — tạo xong
 * không thấy đâu nữa. Loại nào lỡ thiếu vẫn được xếp cuối (xem `groupOptionsByType`),
 * nhưng danh sách này phải khớp form để thứ tự đúng như người ta vừa chọn.
 */
const TYPE_ORDER: AccountType[] = [
  'cash',
  'bank',
  'card',
  'ic',
  'ewallet',
  'investment',
  'fixed',
]

/** Một khối cho BỘ CHỌN tài khoản. */
export interface OptionTypeGroup<T> {
  type: AccountType
  label: string
  items: T[]
}

/**
 * Gom theo loại cho bộ chọn tài khoản: chỉ cần `type`, không cần số dư hay tổng.
 *
 * Loại nào KHÔNG có trong TYPE_ORDER vẫn được xếp vào cuối chứ không bị bỏ. Đây là
 * lưới an toàn cho lần tới có thêm loại mới: đánh rơi một tài khoản thì nó mất hẳn
 * khỏi bộ chọn (không nhập được giao dịch cho nó) và khỏi trang Tài khoản — đúng
 * chuyện đã xảy ra với `fixed`.
 *
 * `groupAccountsByType` dựng trên hàm này để thứ tự và lưới an toàn chỉ nằm một chỗ.
 */
export function groupOptionsByType<T extends { type: AccountType }>(
  options: T[],
): OptionTypeGroup<T>[] {
  const byType = new Map<AccountType, T[]>()
  for (const o of options) {
    const list = byType.get(o.type)
    if (list) list.push(o)
    else byType.set(o.type, [o])
  }
  const seen = new Set<AccountType>()
  const out: OptionTypeGroup<T>[] = []
  const push = (type: AccountType) => {
    const items = byType.get(type)
    if (!items || items.length === 0 || seen.has(type)) return
    seen.add(type)
    out.push({ type, label: ACCOUNT_TYPE_LABELS[type], items })
  }
  for (const type of TYPE_ORDER) push(type)
  for (const type of byType.keys()) push(type)
  return out
}

/** Tổng số dư của một loại, tách theo từng loại tiền. */
export interface CurrencyTotal {
  currency: CurrencyCode
  total: number
}

/** Một khối tài khoản cùng loại trên trang Tài khoản. */
export interface AccountTypeGroup {
  type: AccountType
  label: string
  accounts: AccountRow[]
  /** Tổng theo từng loại tiền, thứ tự theo lần xuất hiện đầu tiên trong khối. */
  totalsByCurrency: CurrencyTotal[]
}

/**
 * Gom `accounts` theo loại, giữ nguyên thứ tự tài khoản truyền vào trong mỗi loại
 * (gọi bên ngoài đã sắp theo sort_order). Chỉ trả về loại có ≥1 tài khoản, theo
 * thứ tự TYPE_ORDER. Tổng mỗi loại cộng riêng theo từng loại tiền để không cần tỷ
 * giá quy đổi. `balanceOf` cho số dư hiển thị của mỗi tài khoản.
 */
export function groupAccountsByType(
  accounts: AccountRow[],
  balanceOf: (id: string) => number,
): AccountTypeGroup[] {
  return groupOptionsByType(accounts).map((g) => {
    const totals: CurrencyTotal[] = []
    for (const a of g.items) {
      const entry = totals.find((t) => t.currency === a.currency)
      if (entry) entry.total += balanceOf(a.id)
      else totals.push({ currency: a.currency, total: balanceOf(a.id) })
    }
    return { type: g.type, label: g.label, accounts: g.items, totalsByCurrency: totals }
  })
}
