import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { VerdictNote } from '../../components/VerdictNote'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import type { MonthKey } from '../../lib/dates'
import type { MonthlySeries } from './aggregate'
import { expenseTrend } from './verdicts'

// MỘT nguồn cho cả cột và chấm chú giải. Trước đây cột dùng hex cứng còn chấm dùng
// class `bg-green-600`, nên từ hồi nâng Tailwind v3 → v4 (green-600 đổi từ #16a34a
// sang #00a63e) chú giải đã chỉ sai màu cột nó gán nhãn. Recharts nhận màu qua prop
// `fill` nên không dùng được biến CSS của token — phải là hằng số JS.
const INCOME = '#16a34a'
const EXPENSE = '#ef4444'

interface Props {
  series: MonthlySeries
  base: CurrencyCode
  title: string
  labelOf: (key: MonthKey) => string
  /**
   * Tháng đang chạy dở — bị loại khỏi câu kết luận (biểu đồ vẫn vẽ nó). Không truyền
   * thì mọi tháng trong chuỗi được coi là đã hoàn tất.
   */
  currentKey?: MonthKey | null
}

export function MonthlyBarsCard({ series, base, title, labelOf, currentKey = null }: Props) {
  const barData = series.points.map((p) => ({
    label: labelOf(p.key),
    income: p.income,
    expense: p.expense,
  }))
  const trend = expenseTrend(series.points, currentKey)

  return (
    <section className="rounded-xl bg-surface p-3 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-fg-muted">{title}</h2>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--fg-muted)' }} axisLine={false} tickLine={false} />
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
              labelFormatter={(l) => `Tháng ${l}`}
              // Nền/viền/chữ tooltip do index.css xử lý theo dark mode (.recharts-default-tooltip)
              contentStyle={{ borderRadius: 8, fontSize: 12 }}
              // Con trỏ hover trung tính, dịu ở CẢ nền sáng lẫn tối (mặc định recharts
              // là xám sáng, nháy chói trong dark mode)
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

      {/* Kết luận nói về THÁNG HOÀN TẤT gần nhất, không phải tháng đang dở — nên có
          thể là cột kế cuối trên biểu đồ. Vì vậy câu chữ luôn gọi tên tháng ra. */}
      {trend && (
        <div className="mt-2">
          <VerdictNote tone={trend.tone}>
            Tháng {labelOf(trend.lastKey)} chi{' '}
            <b>{formatMoney(Math.round(trend.last), base)}</b>
            {trend.tone === 'info' ? ', đi ngang so với ' : ', '}
            {trend.tone !== 'info' && (
              <>
                {trend.delta > 0 ? 'cao hơn' : 'thấp hơn'}{' '}
                <b>{Math.abs(Math.round(trend.delta * 100))}%</b> so với{' '}
              </>
            )}
            {/* Một tháng thì KHÔNG gọi là trung bình — nói "trung bình 1 tháng" đọc
                như thể có nền dày, trong khi đó chỉ là so với đúng một tháng. */}
            {trend.priorMonths === 1
              ? 'tháng trước đó'
              : `trung bình ${trend.priorMonths} tháng trước đó`}{' '}
            ({formatMoney(Math.round(trend.avgPrior), base)}).
          </VerdictNote>
        </div>
      )}
    </section>
  )
}
