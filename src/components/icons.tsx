import { Coins, CreditCard, Gem, Landmark, LineChart, TrainFront, Wallet } from 'lucide-react'
import type { AccountType } from '../types/database.types'

const ICONS: Record<AccountType, typeof Coins> = {
  cash: Coins,
  bank: Landmark,
  card: CreditCard,
  ic: TrainFront,
  ewallet: Wallet,
  investment: LineChart,
  fixed: Gem,
}

/**
 * Icon cho loại tài khoản: tiền mặt (Coins) / ngân hàng (Landmark) / thẻ tín dụng (CreditCard) / IC giao thông (TrainFront) / ví điện tử (Wallet) / đầu tư (LineChart) / tài sản cố định (Gem).
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
  // strokeWidth 1.6 (mặc định của lucide là 2): độ đậm nét icon của bản 1a. Nét 2px
  // bên cạnh chữ IBM Plex Sans 13px trông nặng hơn hẳn chữ, icon giành mất điểm nhìn
  // của chính dòng nó đứng cạnh. CỠ vẫn để bên gọi quyết (mặc định h-5 w-5 như cũ) —
  // 1a chốt ~17px, nhưng đó là con số của từng bố cục, chuẩn hoá dần theo từng màn.
  return <Icon className={className} strokeWidth={1.6} aria-hidden />
}
