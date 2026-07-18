import { Coins, CreditCard, Landmark } from 'lucide-react'
import type { AccountType } from '../types/database.types'

const ICONS: Record<AccountType, typeof Coins> = {
  cash: Coins,
  bank: Landmark,
  card: CreditCard,
}

/**
 * Icon cho loại tài khoản: tiền mặt (Coins) / ngân hàng (Landmark) / thẻ tín dụng (CreditCard).
 * Kế thừa màu theo `currentColor` nên tự đúng ở cả nền sáng lẫn tối.
 * Dùng ở danh sách/tiêu đề — KHÔNG dùng trong <option> native (không render được SVG).
 */
export function AccountTypeIcon({
  type,
  className = 'h-5 w-5',
}: {
  type: AccountType
  className?: string
}) {
  const Icon = ICONS[type] ?? Coins
  return <Icon className={className} aria-hidden />
}
