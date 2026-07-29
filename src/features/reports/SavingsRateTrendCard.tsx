import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import type { MonthKey } from '../../lib/dates'
import type { MonthlySeries } from './aggregate'
import { savingsRate } from './insights'

interface Props {
  series: MonthlySeries
  labelOf: (key: MonthKey) => string
}

/** Xu hướng tỷ lệ tiết kiệm (thu−chi)/thu theo từng tháng — cột xanh dương, âm thì đỏ. */
export function SavingsRateTrendCard({ series, labelOf }: Props) {
  const data = series.points.map((p) => {
    const r = savingsRate(p.income, p.expense)
    return {
      label: labelOf(p.key),
      // % làm tròn; null (chưa có thu) coi như không có cột
      pct: r === null ? null : Math.round(r * 100),
    }
  })
  const hasAny = data.some((d) => d.pct !== null)
  if (!hasAny) return null

  return (
    <section className="rounded-xl bg-surface p-3 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-fg-muted">
        Xu hướng tỷ lệ tiết kiệm
      </h2>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 4, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <ReferenceLine y={0} stroke="#d1d5db" />
            <Bar dataKey="pct" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={i} fill={(d.pct ?? 0) < 0 ? '#ef4444' : '#0ea5e9'} />
              ))}
              <LabelList
                dataKey="pct"
                position="top"
                formatter={(v: unknown) => (typeof v === 'number' ? `${v}%` : '')}
                style={{ fontSize: 10, fill: '#6b7280' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-center text-2xs text-fg-muted">
        Phần thu nhập giữ lại được mỗi tháng
      </p>
    </section>
  )
}
