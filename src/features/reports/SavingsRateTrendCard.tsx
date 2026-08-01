import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { VerdictNote } from '../../components/VerdictNote'
import type { MonthKey } from '../../lib/dates'
import type { MonthlySeries } from './aggregate'
import { savingsRate } from './insights'
import { savingsRateVerdict } from './verdicts'

interface Props {
  series: MonthlySeries
  labelOf: (key: MonthKey) => string
  /** Tháng đang chạy dở — bị loại khỏi câu kết luận (cột của nó vẫn vẽ). */
  currentKey?: MonthKey | null
}

const TREND_WORD = { up: 'đang lên', down: 'đang xuống', flat: 'đi ngang' } as const

/** Xu hướng tỷ lệ tiết kiệm (thu−chi)/thu theo từng tháng — cột xanh dương, âm thì đỏ. */
export function SavingsRateTrendCard({ series, labelOf, currentKey = null }: Props) {
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

  const verdict = savingsRateVerdict(series.points, currentKey)

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
              tick={{ fontSize: 11, fill: 'var(--fg-muted)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 11, fill: 'var(--fg-muted)' }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <ReferenceLine y={0} stroke="var(--fg-muted)" />
            <Bar dataKey="pct" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={i} fill={(d.pct ?? 0) < 0 ? '#ef4444' : '#0ea5e9'} />
              ))}
              <LabelList
                dataKey="pct"
                position="top"
                formatter={(v: unknown) => (typeof v === 'number' ? `${v}%` : '')}
                style={{ fontSize: 10, fill: 'var(--fg-muted)' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-center text-2xs text-fg-muted">
        Phần thu nhập giữ lại được mỗi tháng
      </p>

      {/* Mốc 20% là mốc của quy tắc 50/30/20 mà thẻ "Cơ cấu chi tiêu" đang dùng —
          hai thẻ phải cùng mốc, không thì cùng một con số mà chỗ khen chỗ cảnh báo. */}
      {verdict && (
        <div className="mt-2">
          <VerdictNote tone={verdict.tone}>
            {verdict.months} tháng đã xong: giữ lại <b>{Math.round(verdict.rate * 100)}%</b> thu nhập
            {verdict.tone === 'good' && ' — đạt mốc 20% của quy tắc 50/30/20'}
            {verdict.tone === 'warn' && ' — chưa tới mốc 20% của quy tắc 50/30/20'}
            {verdict.tone === 'bad' && ' — tức là chi vượt thu, đang phải rút vào tiền cũ'}
            {verdict.trend && verdict.trendDelta !== null && verdict.trend !== 'flat' ? (
              <>
                . Xu hướng {TREND_WORD[verdict.trend]}: nửa sau kỳ{' '}
                {verdict.trendDelta > 0 ? 'hơn' : 'kém'} nửa đầu{' '}
                <b>{Math.abs(Math.round(verdict.trendDelta * 100))} điểm %</b>.
              </>
            ) : (
              '.'
            )}
          </VerdictNote>
        </div>
      )}
    </section>
  )
}
