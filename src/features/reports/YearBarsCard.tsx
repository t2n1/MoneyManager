import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import { Card } from '../../components/ui'
import type { YearRow } from './multiYear'

// Cùng một nguồn màu với MonthlyBarsCard: Recharts nhận màu qua prop `fill` nên không
// dùng được biến CSS của token, phải là hằng số JS.
const INCOME = '#16a34a'
const EXPENSE = '#ef4444'

interface Props {
  rows: readonly YearRow[]
  base: CurrencyCode
}

export function YearBarsCard({ rows, base }: Props) {
  const data = rows.map((r) => ({
    label: String(r.year),
    income: r.income,
    expense: r.expense,
    // Năm ghi thiếu tháng vẫn vẽ, nhưng nhãn phải nói ra để không đọc nhầm là "năm đó tiêu ít"
    partial: r.months < 12,
  }))

  return (
    <Card as="section">
      <h2 className="mb-2 text-sm font-semibold text-fg-muted">Thu / chi theo năm</h2>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--fg-muted)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => formatCompact(v, base)}
              tick={{ fontSize: 11, fill: 'var(--fg-muted)' }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              formatter={(v, name) => [
                formatMoney(Number(v), base),
                name === 'income' ? 'Thu' : 'Chi',
              ]}
              labelFormatter={(l) => {
                const row = data.find((d) => d.label === l)
                return row?.partial ? `Năm ${l} (thiếu tháng)` : `Năm ${l}`
              }}
              contentStyle={{ borderRadius: 8, fontSize: 12 }}
              cursor={{ fill: 'rgba(148,163,184,0.15)' }}
            />
            <Bar dataKey="income" fill={INCOME} radius={[3, 3, 0, 0]} />
            <Bar dataKey="expense" fill={EXPENSE} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex justify-center gap-4 text-xs text-fg-muted">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: INCOME }} /> Thu
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: EXPENSE }} /> Chi
        </span>
      </div>
    </Card>
  )
}
