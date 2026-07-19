import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import type { MonthKey } from '../../lib/dates'
import type { MonthlySeries } from './aggregate'

interface Props {
  series: MonthlySeries
  base: CurrencyCode
  title: string
  labelOf: (key: MonthKey) => string
}

export function MonthlyBarsCard({ series, base, title, labelOf }: Props) {
  const barData = series.points.map((p) => ({
    label: labelOf(p.key),
    income: p.income,
    expense: p.expense,
  }))

  return (
    <section className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">{title}</h2>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={(v: number) => formatCompact(v, base)}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              formatter={(v, name) => [
                formatMoney(Number(v), base),
                name === 'income' ? 'Thu' : 'Chi',
              ]}
              labelFormatter={(l) => `Tháng ${l}`}
              contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e7eb' }}
            />
            <Bar dataKey="income" fill="#16a34a" radius={[3, 3, 0, 0]} />
            <Bar dataKey="expense" fill="#ef4444" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex justify-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-green-600" /> Thu
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Chi
        </span>
      </div>
    </section>
  )
}
