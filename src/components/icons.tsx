import { Coins, Landmark } from 'lucide-react'

/**
 * Icon cho loại tài khoản: tiền mặt (Coins) / ngân hàng (Landmark).
 * Kế thừa màu theo `currentColor` nên tự đúng ở cả nền sáng lẫn tối.
 * Dùng ở danh sách/tiêu đề — KHÔNG dùng trong <option> native (không render được SVG).
 */
export function AccountTypeIcon({
  type,
  className = 'h-5 w-5',
}: {
  type: 'cash' | 'bank'
  className?: string
}) {
  const Icon = type === 'cash' ? Coins : Landmark
  return <Icon className={className} aria-hidden />
}
