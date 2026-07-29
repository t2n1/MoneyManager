import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import type { DailyExpensePoint } from './aggregate'

// Một nguồn cho cả nét vẽ và chú giải — recharts nhận màu qua prop nên phải là hằng
// số JS, không dùng được biến CSS của token.
const ACTUAL = '#ef4444'
const BUDGET = '#9ca3af'

interface Props {
  /** chi từng ngày cho TRỌN tháng tài chính (0 cho ngày trống/tương lai) */
  points: DailyExpensePoint[]
  /** số ngày đã trôi qua (tháng hiện tại); = độ dài tháng nếu là tháng quá khứ */
  daysElapsed: number
  /** tổng ngân sách tháng (base minor); 0 = chưa đặt ngân sách */
  totalBudgeted: number
  base: CurrencyCode
}

/** Chi tích lũy thực tế vs đường ngân sách tuyến tính — thấy đang đi nhanh/chậm hơn kế hoạch. */
export function SpendVsBudgetCard({ points, daysElapsed, totalBudgeted, base }: Props) {
  const days = points.length
  if (days === 0) return null
  let cum = 0
  const data = points.map((p, i) => {
    cum += p.expense
    const dayNo = i + 1
    return {
      label: `${Number(p.date.slice(8))}/${Number(p.date.slice(5, 7))}`,
      // đường thực chi chỉ vẽ tới hôm nay
      actual: dayNo <= daysElapsed ? cum : null,
      budget: totalBudgeted > 0 ? Math.round((totalBudgeted * dayNo) / days) : null,
    }
  })

  return (
    <section className="rounded-xl bg-surface p-3 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-fg-muted">
        Chi tích lũy vs ngân sách
      </h2>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              interval={4}
            />
            <YAxis
              tickFormatter={(v: number) => formatCompact(v, base)}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              formatter={(v, name) => [formatMoney(Number(v), base), name === 'actual' ? 'Đã chi' : 'Ngân sách']}
              labelFormatter={(l) => `Ngày ${l}`}
              contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
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
      <div className="mt-1 flex justify-center gap-4 text-xs text-fg-muted">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ACTUAL }} /> Đã chi
        </span>
        {totalBudgeted > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-3.5 rounded" style={{ backgroundColor: BUDGET }} /> Ngân sách
          </span>
        )}
      </div>
    </section>
  )
}
