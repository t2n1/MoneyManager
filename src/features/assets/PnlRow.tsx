// Một dòng lãi/lỗ trên trang chi tiết tài khoản: nhãn tô màu theo dấu, số có dấu, phần
// trăm trong ngoặc.
//
// File riêng vì có HAI chỗ gọi (tài khoản có sổ lệnh và tài khoản định giá tay) và chúng
// phải hiện giống hệt nhau. Trước đây là hai đoạn JSX chép tay, và chúng đã lệch thật:
// một bên viết '−' (U+2212) bằng tay trong khi formatMoney in '-', nên bề rộng chữ số
// khác nhau dù cả hai đều tabular-nums.
//
// `pct` KHÔNG tự có ở đây nữa: dùng chung bản của `investFormat.ts` — bản đó đã là thứ
// hai tab /invest render, nên trang tài khoản và tab, cách nhau một cú bấm "Xem →", giờ
// in đúng cùng một chuỗi (dấu '−' U+2212, phẩy thập phân) cho cùng một con số, thay vì
// mỗi nơi tự chép một công thức rồi lệch nhau ở đúng chỗ đó.
import { Money } from '../../components/ui'
import type { CurrencyCode } from '../../lib/money'
import { pct } from './investFormat'

interface Props {
  label: string
  /** Có thể âm — dấu do component lo, nơi gọi truyền số nguyên bản. */
  amount: number
  currency: CurrencyCode
  /** Tỷ lệ (0,15 = 15%); null = không chia được nên không in ngoặc. */
  percent: number | null
}

export function PnlRow({ label, amount, currency, percent }: Props) {
  const lai = amount >= 0
  const mau = lai ? 'text-money-in' : 'text-money-out'
  return (
    <div className="flex items-center justify-between font-medium">
      <span className={mau}>{label}</span>
      <span>
        <Money amount={Math.abs(amount)} currency={currency} tone={lai ? 'in' : 'out'} showSign />
        {percent != null && (
          <span className={`ml-1 text-xs tabular-nums ${mau}`}>({pct(percent)})</span>
        )}
      </span>
    </div>
  )
}
