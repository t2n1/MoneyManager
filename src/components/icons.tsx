import { Coins, CreditCard, Landmark, TrainFront, Wallet } from 'lucide-react'
import type { AccountType } from '../types/database.types'

const ICONS: Record<AccountType, typeof Coins> = {
  cash: Coins,
  bank: Landmark,
  card: CreditCard,
  ic: TrainFront,
  ewallet: Wallet,
}

/**
 * Icon cho loại tài khoản: tiền mặt (Coins) / ngân hàng (Landmark) / thẻ tín dụng (CreditCard) / IC giao thông (TrainFront) / ví điện tử (Wallet).
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
