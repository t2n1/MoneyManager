import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import type { MonthKey } from '../../lib/dates'
import type { CategoryMonthlyPoint } from './aggregate'
import { CHART_TEXT_2XS, CHART_TEXT_XS } from '../../lib/chartText'

interface Props {
  points: CategoryMonthlyPoint[]
  base: CurrencyCode
  color: string
  labelOf: (key: MonthKey) => string
  title: string
}

export function CategoryLineChart({ points, base, color, labelOf, title }: Props) {
  const data = points.map((p) => ({ label: labelOf(p.key), amount: p.amount }))

  return (
    <div className="mt-2 rounded-lg bg-surface-sunken p-2">
      <p className="mb-1 truncate text-sm font-medium text-fg-muted">{title}</p>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 14, left: -8, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: CHART_TEXT_2XS, fill: 'var(--fg-muted)' }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={(v: number) => formatCompact(v, base)}
              tick={{ fontSize: CHART_TEXT_2XS, fill: 'var(--fg-muted)' }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              formatter={(v) => [formatMoney(Number(v), base), 'Số tiền']}
              labelFormatter={(l) => String(l)}
              contentStyle={{ borderRadius: 8, fontSize: CHART_TEXT_XS }}
              cursor={{ stroke: 'rgba(148,163,184,0.4)' }}
            />
            <Line type="monotone" dataKey="amount" stroke={color} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
