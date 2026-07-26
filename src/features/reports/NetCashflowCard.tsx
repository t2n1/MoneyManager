// Thẻ "Dòng tiền ròng" — mỗi tháng một cột thu − chi (xanh = dư, đỏ = thâm hụt)
// kèm đường tích lũy dồn qua các tháng để thấy cả kỳ đang cộng dồn hay bị bào mòn.
// Dữ liệu dẫn xuất từ MonthlySeries đã fetch cho thẻ Thu/chi → không gọi thêm mạng.
import {
  Bar,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import type { MonthKey } from '../../lib/dates'
import { netFlowSeries, netFlowSummary, type MonthlySeries } from './aggregate'

interface Props {
  series: MonthlySeries
  base: CurrencyCode
  title: string
  labelOf: (key: MonthKey) => string
}

const POSITIVE = '#16a34a'
const NEGATIVE = '#ef4444'
const CUMULATIVE = '#6366f1'

export function NetCashflowCard({ series, base, title, labelOf }: Props) {
  const points = netFlowSeries(series)
  const summary = netFlowSummary(points)
  // Cả kỳ không có giao dịch nào → thẻ rỗng, ẩn đi cho gọn (giống SavingsRateTrendCard).
  const hasAny = points.some((p) => p.net !== 0)
  if (!hasAny) return null

  const data = points.map((p) => ({
    label: labelOf(p.key),
    net: p.net,
    cumulative: p.cumulative,
  }))

  return (
    <section className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">{title}</h2>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => formatCompact(v, base)}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            {/* Mốc 0 phải rõ: đây là ranh giới dư / thâm hụt */}
            <ReferenceLine y={0} stroke="#9ca3af" />
            <Tooltip
              formatter={(v, name) => [
                formatMoney(Number(v), base),
                name === 'net' ? 'Ròng tháng' : 'Tích lũy',
              ]}
              labelFormatter={(l) => `Tháng ${l}`}
              // Nền/viền/chữ tooltip do index.css xử lý theo dark mode (.recharts-default-tooltip)
              contentStyle={{ borderRadius: 8, fontSize: 12 }}
              cursor={{ fill: 'rgba(148,163,184,0.15)' }}
            />
            <Bar dataKey="net" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.net < 0 ? NEGATIVE : POSITIVE} />
              ))}
            </Bar>
            <Line
              type="monotone"
              dataKey="cumulative"
              stroke={CUMULATIVE}
              strokeWidth={2}
              dot={{ r: 2, fill: CUMULATIVE }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-green-600" /> Ròng dương
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Ròng âm
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-4 rounded bg-indigo-500" /> Tích lũy
        </span>
      </div>

      {/* Tóm tắt bằng CHỮ — không để người dùng phải suy ra từ màu cột (a11y) */}
      <p className="mt-2 text-center text-[0.6875rem] text-gray-500 dark:text-gray-400">
        Tổng ròng{' '}
        <span
          className={
            summary.total < 0
              ? 'font-semibold text-red-600 dark:text-red-400'
              : 'font-semibold text-green-600 dark:text-green-400'
          }
        >
          {formatMoney(summary.total, base)}
        </span>{' '}
        · trung bình {formatMoney(summary.avg, base)}/tháng
        {summary.negativeMonths > 0 && ` · ${summary.negativeMonths} tháng thâm hụt`}
      </p>
    </section>
  )
}
