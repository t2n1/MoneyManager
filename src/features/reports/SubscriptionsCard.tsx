// Thẻ "Tiền tự động trừ mỗi tháng": gom mọi khoản định kỳ đang chạy, quy về
// cùng đơn vị "mỗi tháng" rồi cho xem luôn con số cả năm — gói 980/tháng nghe rẻ,
// nhưng 11.760/năm thì phải cân nhắc lại.
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { ExplainBox } from '../../components/ExplainBox'
import { Card, Money, SectionTitle } from '../../components/ui'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { SubscriptionSummary } from './behavior'
import { hoursOfWork } from './behavior'
import { getLang, tr } from '../../i18n'
import { trn } from '../../i18n/react'

const FREQ_LABEL = { weekly: tr('hàng tuần'), monthly: tr('hàng tháng'), yearly: tr('hàng năm') } as const

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
    <Card as="section">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <SectionTitle>
          {tr('Tiền tự động trừ mỗi tháng')}
        </SectionTitle>
        <Link
          to="/recurring"
          className="shrink-0 inline-flex items-center gap-0.5 text-sm font-medium text-fg-accent"
        >
          {tr('{n} khoản', { n: data.count })}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <p className="text-kpi font-mono font-medium tracking-number tabular-nums text-fg-primary">
        {money(data.monthly)}
        <span className="ml-1 text-sm font-normal text-fg-muted">{tr('/tháng')}</span>
      </p>
      <p className="mt-0.5 text-sm text-fg-secondary">
        {trn('Tức {amount} mỗi năm', { amount: <b>{money(data.yearly)}</b> })}
        {shareOfIncome !== null && tr(' · {pct}% thu nhập', { pct: Math.round(shareOfIncome * 100) })}
        {hours !== null &&
          tr(' · ≈ {hours} giờ làm mỗi tháng', {
            hours: hours.toFixed(1).replace('.', getLang() === 'en' ? '.' : ','),
          })}
        .
      </p>

      <ul className="mt-2 space-y-1">
        {data.items.slice(0, 6).map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-2 rounded-lg bg-surface-page px-2 py-1.5 text-sm"
          >
            <span className="min-w-0 flex-1 truncate text-fg-primary">
              {item.note || tr('Khoản định kỳ')}
            </span>
            <span className="shrink-0 text-2xs text-fg-muted">
              {FREQ_LABEL[item.frequency]}
            </span>
            <Money
              amount={Math.round(item.monthly)}
              currency={base}
              className="w-20 shrink-0 text-right font-medium"
            />
          </li>
        ))}
      </ul>
      {data.items.length > 6 && (
        <p className="mt-1 text-2xs text-fg-muted">
          {tr('…và {n} khoản nhỏ hơn.', { n: data.items.length - 6 })}
        </p>
      )}

      {data.hasMissingRate && (
        <p className="mt-2 text-2xs text-state-warn-fg">
          {tr('Một khoản ngoại tệ chưa quy đổi được nên tổng có thể thiếu.')}
        </p>
      )}

      <ExplainBox label={tr('Cách tính')}>
        <p>
          {tr('Lấy mọi quy tắc định kỳ loại Chi đang chạy (bỏ khoản tạm dừng và khoản đã hết hạn), quy về cùng đơn vị mỗi tháng: hàng tuần × 52/12, hàng năm ÷ 12.')}
        </p>
        <p>
          {tr('Đây là tiền chắc chắn ra đi kể cả tháng bạn không mua gì. Rà lại danh sách này mỗi vài tháng thường là cách cắt chi nhanh nhất mà không phải thay đổi thói quen nào.')}
        </p>
      </ExplainBox>
    </Card>
  )
}
