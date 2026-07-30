// Thẻ "Tiền tự động trừ mỗi tháng": gom mọi khoản định kỳ đang chạy, quy về
// cùng đơn vị "mỗi tháng" rồi cho xem luôn con số cả năm — gói 980/tháng nghe rẻ,
// nhưng 11.760/năm thì phải cân nhắc lại.
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { ExplainBox } from '../../components/ExplainBox'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { SubscriptionSummary } from './behavior'
import { hoursOfWork } from './behavior'

const FREQ_LABEL = { weekly: 'hàng tuần', monthly: 'hàng tháng', yearly: 'hàng năm' } as const

interface Props {
  data: SubscriptionSummary
  base: CurrencyCode
  /** thu nhập trung bình mỗi tháng (base minor); 0 = chưa tính được */
  monthlyIncome: number
  hourlyWage: number | null
}

export function SubscriptionsCard({ data, base, monthlyIncome, hourlyWage }: Props) {
  if (data.count === 0) return null
  const money = (v: number) => formatMoney(Math.round(v), base)
  const shareOfIncome = monthlyIncome > 0 ? data.monthly / monthlyIncome : null
  const hours = hoursOfWork(data.monthly, hourlyWage)

  return (
    <section className="rounded-xl bg-surface p-3 shadow-sm ">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          Tiền tự động trừ mỗi tháng
        </h2>
        <Link
          to="/recurring"
          className="shrink-0 inline-flex items-center gap-0.5 text-xs font-medium text-green-700 dark:text-green-400"
        >
          {data.count} khoản
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <p className="text-2xl font-bold tabular-nums text-fg-primary">
        {money(data.monthly)}
        <span className="ml-1 text-sm font-normal text-fg-muted">/tháng</span>
      </p>
      <p className="mt-0.5 text-xs text-fg-secondary">
        Tức <b>{money(data.yearly)}</b> mỗi năm
        {shareOfIncome !== null && <> · {Math.round(shareOfIncome * 100)}% thu nhập</>}
        {hours !== null && <> · ≈ {hours.toFixed(1).replace('.', ',')} giờ làm mỗi tháng</>}.
      </p>

      <ul className="mt-2 space-y-1">
        {data.items.slice(0, 6).map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-2 rounded-lg bg-surface-page px-2 py-1.5 text-xs "
          >
            <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-200">
              {item.note || 'Khoản định kỳ'}
            </span>
            <span className="shrink-0 text-2xs text-fg-muted">
              {FREQ_LABEL[item.frequency]}
            </span>
            <span className="w-20 shrink-0 text-right font-medium tabular-nums text-fg-primary">
              {money(item.monthly)}
            </span>
          </li>
        ))}
      </ul>
      {data.items.length > 6 && (
        <p className="mt-1 text-2xs text-fg-muted">
          …và {data.items.length - 6} khoản nhỏ hơn.
        </p>
      )}

      {data.hasMissingRate && (
        <p className="mt-2 text-2xs text-amber-700 dark:text-amber-300">
          Một khoản ngoại tệ chưa quy đổi được nên tổng có thể thiếu.
        </p>
      )}

      <ExplainBox label="Cách tính">
        <p>
          Lấy mọi quy tắc định kỳ loại Chi đang chạy (bỏ khoản tạm dừng và khoản đã hết hạn), quy về
          cùng đơn vị mỗi tháng: hàng tuần × 52/12, hàng năm ÷ 12.
        </p>
        <p>
          Đây là tiền chắc chắn ra đi kể cả tháng bạn không mua gì. Rà lại danh sách này mỗi vài
          tháng thường là cách cắt chi nhanh nhất mà không phải thay đổi thói quen nào.
        </p>
      </ExplainBox>
    </section>
  )
}
