import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import type { MonthKey } from '../../lib/dates'
import type { CategoryMonthlyPoint } from './aggregate'

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
    <div className="mt-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 p-2">
      <p className="mb-1 truncate text-xs font-medium text-gray-500 dark:text-gray-400">{title}</p>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={(v: number) => formatCompact(v, base)}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              formatter={(v) => [formatMoney(Number(v), base), 'Số tiền']}
              labelFormatter={(l) => `Tháng ${l}`}
              contentStyle={{ borderRadius: 8, fontSize: 12 }}
              cursor={{ stroke: 'rgba(148,163,184,0.4)' }}
            />
            <Line type="monotone" dataKey="amount" stroke={color} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
