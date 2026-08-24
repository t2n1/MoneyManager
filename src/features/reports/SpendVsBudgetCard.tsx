import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Guide } from '../../components/Guide'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import type { DailyExpensePoint } from './aggregate'
import { Card, SectionTitle } from '../../components/ui'
import { CHART_TEXT_2XS, CHART_TEXT_XS } from '../../lib/chartText'

// Một nguồn cho cả nét vẽ và chú giải — recharts nhận màu qua prop nên phải là hằng
// số JS, không dùng được biến CSS của token.
const ACTUAL = '#ef4444'
// var(--fg-muted) chứ không #9ca3af: gray-400 chỉ 2,54:1 trên trắng, mà đây là NÉT
// biểu đồ (đồ hoạ mang thông tin, cần 3:1) kèm chấm chú giải. Tiền lệ: LifetimeChartCard.
const BUDGET = 'var(--fg-muted)'

interface Props {
  /** chi từng ngày cho TRỌN tháng tài chính (0 cho ngày trống/tương lai).
   *  Khi totalBudgeted > 0, caller phải truyền chi CÙNG PHẠM VI với ngân sách
   *  (chỉ các mục đã đặt hạn mức) — hai đường khác phạm vi thì không so được. */
  points: DailyExpensePoint[]
  /** số ngày đã trôi qua (tháng hiện tại); = độ dài tháng nếu là tháng quá khứ */
  daysElapsed: number
  /** tổng ngân sách tháng (base minor); 0 = chưa đặt ngân sách */
  totalBudgeted: number
  base: CurrencyCode
  /** Ghi chú phạm vi dưới chú giải — vd "Chỉ tính 3 mục đã đặt hạn mức" */
  scopeNote?: string
}

/** Chi tích lũy thực tế vs đường ngân sách tuyến tính — thấy đang đi nhanh/chậm hơn kế hoạch. */
export function SpendVsBudgetCard({ points, daysElapsed, totalBudgeted, base, scopeNote }: Props) {
  const days = points.length
  if (days === 0) return null
  let cum = 0
  const data = points.map((p, i) => {
    cum += p.expense
    const dayNo = i + 1
    return {
      label: `${Number(p.date.slice(5, 7))}/${Number(p.date.slice(8))}`,
      // đường thực chi chỉ vẽ tới hôm nay
      actual: dayNo <= daysElapsed ? cum : null,
      budget: totalBudgeted > 0 ? Math.round((totalBudgeted * dayNo) / days) : null,
    }
  })

  return (
    <Card as="section">
      <SectionTitle className="mb-2">
        Chi tích lũy vs ngân sách
      </SectionTitle>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 14, left: -8, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: CHART_TEXT_2XS, fill: 'var(--fg-muted)' }}
              axisLine={false}
              tickLine={false}
              interval={4}
            />
            <YAxis
              tickFormatter={(v: number) => formatCompact(v, base)}
              tick={{ fontSize: CHART_TEXT_2XS, fill: 'var(--fg-muted)' }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              formatter={(v, name) => [formatMoney(Number(v), base), name === 'actual' ? 'Đã chi' : 'Ngân sách']}
              labelFormatter={(l) => String(l)}
              contentStyle={{ borderRadius: 8, fontSize: CHART_TEXT_XS, border: '1px solid #e5e7eb' }}
            />
            {totalBudgeted > 0 && (
              <Line
                type="monotone"
                dataKey="budget"
                stroke={BUDGET}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive={false}
              />
            )}
            <Line
              type="monotone"
              dataKey="actual"
              stroke={ACTUAL}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex justify-center gap-4 text-sm text-fg-muted">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ACTUAL }} /> Đã chi
        </span>
        {totalBudgeted > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-3.5 rounded" style={{ backgroundColor: BUDGET }} /> Ngân sách
          </span>
        )}
      </div>
      {scopeNote && (
        <Guide className="mt-1 text-center text-2xs text-fg-muted">{scopeNote}</Guide>
      )}
    </Card>
  )
}
