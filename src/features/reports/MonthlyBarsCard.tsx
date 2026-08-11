import {
  Bar,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { VerdictNote } from '../../components/VerdictNote'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import type { MonthKey } from '../../lib/dates'
import type { MonthlySeries } from './aggregate'
import { savingsRate } from './insights'
import { expenseTrend, savingsRateVerdict } from './verdicts'

// MỘT nguồn cho cả cột và chấm chú giải. Trước đây cột dùng hex cứng còn chấm dùng
// class `bg-green-600`, nên từ hồi nâng Tailwind v3 → v4 (green-600 đổi từ #16a34a
// sang #00a63e) chú giải đã chỉ sai màu cột nó gán nhãn. Recharts nhận màu qua prop
// `fill` nên không dùng được biến CSS của token — phải là hằng số JS.
const INCOME = '#16a34a'
const EXPENSE = '#ef4444'
// Đường tỷ lệ là NÉT, cần 3:1 (WCAG 1.4.11). sky-500 (#0ea5e9 — màu thẻ tỷ lệ tiết kiệm
// cũ dùng làm cột) chỉ 2,77:1 trên trắng và đang bị guardrail ban làm nét. Biến của
// Tailwind v4 đi qua được prop của Recharts vì nó chỉ gán thẳng vào thuộc tính SVG —
// cùng cách `stroke="var(--fg-muted)"` đã dùng ở NetCashflowCard.
const RATE = 'var(--color-sky-600)'

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
  const barData = series.points.map((p) => {
    const r = savingsRate(p.income, p.expense)
    return {
      label: labelOf(p.key),
      income: p.income,
      expense: p.expense,
      // Tháng chưa có thu → null, KHÔNG phải 0: `connectNulls={false}` để đường đứt đoạn
      // ở đó thay vì cắm xuống 0% như thể tháng đó tiêu hết sạch thu nhập.
      rate: r === null ? null : Math.round(r * 100),
    }
  })
  const trend = expenseTrend(series.points, currentKey)
  const saving = savingsRateVerdict(series.points, currentKey)

  // Trục phải luôn bao 0–100% để mắt có mốc quen, và nới ra nếu dữ liệu vượt khỏi đó
  // (tháng chi gấp đôi thu là −100%). Không kẹp dữ liệu: tháng như thế là tín hiệu thật.
  const rates = barData.map((d) => d.rate).filter((v): v is number => v !== null)
  const hasRate = rates.length > 0
  // Mốc tự chọn của Recharts trên miền lẻ ra "−141%, −76%, −11%…" — đọc không ra gì.
  // Chốt bước tròn (50, rồi 100, 200… nếu miền quá rộng) để mốc luôn là số chẵn.
  const rateTicks = (() => {
    let step = 50
    const lo = () => Math.floor(Math.min(0, ...rates) / step) * step
    const hi = () => Math.ceil(Math.max(100, ...rates) / step) * step
    while ((hi() - lo()) / step > 5) step *= 2
    const ticks: number[] = []
    for (let v = lo(); v <= hi(); v += step) ticks.push(v)
    return ticks
  })()

  return (
    <section className="rounded-xl bg-surface p-3 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-fg-muted">{title}</h2>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={barData} margin={{ top: 8, right: 0, left: -8, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--fg-muted)' }} axisLine={false} tickLine={false} />
            <YAxis
              yAxisId="money"
              tickFormatter={(v: number) => formatCompact(v, base)}
              tick={{ fontSize: 11, fill: 'var(--fg-muted)' }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            {/* Trục phụ: TỶ LỆ, không phải tiền. Hai đơn vị trên cùng một khung chỉ đọc
                được khi mỗi bên có trục riêng — nếu nhét % vào trục tiền thì đường tỷ lệ
                sẽ nằm sát đáy và vô nghĩa. */}
            {hasRate && (
              <YAxis
                yAxisId="rate"
                orientation="right"
                domain={[rateTicks[0], rateTicks[rateTicks.length - 1]]}
                ticks={rateTicks}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 11, fill: 'var(--fg-muted)' }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
            )}
            {/* Mốc 0% của trục phụ — ranh giới "giữ lại được" và "chi vượt thu" */}
            {hasRate && rateTicks[0] < 0 && (
              <ReferenceLine yAxisId="rate" y={0} stroke="var(--fg-muted)" strokeDasharray="3 3" />
            )}
            <Tooltip
              formatter={(v, name) =>
                name === 'rate'
                  ? [`${Number(v)}%`, 'Giữ lại']
                  : [formatMoney(Number(v), base), name === 'income' ? 'Thu' : 'Chi']
              }
              labelFormatter={(l) => String(l)}
              // Nền/viền/chữ tooltip do index.css xử lý theo dark mode (.recharts-default-tooltip)
              contentStyle={{ borderRadius: 8, fontSize: 12 }}
              // Con trỏ hover trung tính, dịu ở CẢ nền sáng lẫn tối (mặc định recharts
              // là xám sáng, nháy chói trong dark mode)
              cursor={{ fill: 'rgba(148,163,184,0.15)' }}
            />
            <Bar yAxisId="money" dataKey="income" fill={INCOME} radius={[3, 3, 0, 0]} />
            <Bar yAxisId="money" dataKey="expense" fill={EXPENSE} radius={[3, 3, 0, 0]} />
            {hasRate && (
              <Line
                yAxisId="rate"
                type="monotone"
                dataKey="rate"
                stroke={RATE}
                strokeWidth={2}
                dot={{ r: 2.5, fill: RATE, stroke: RATE }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-fg-muted">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: INCOME }} /> Thu
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: EXPENSE }} /> Chi
        </span>
        {hasRate && (
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-4 rounded" style={{ backgroundColor: RATE }} /> Giữ lại (%,
            trục phải)
          </span>
        )}
      </div>

      {/* Kết luận nói về THÁNG HOÀN TẤT gần nhất, không phải tháng đang dở — nên có
          thể là cột kế cuối trên biểu đồ. Vì vậy câu chữ luôn gọi tên tháng ra. */}
      {trend && (
        <div className="mt-2">
          <VerdictNote
            tone={trend.tone}
            short={
              trend.tone === 'info'
                ? `${labelOf(trend.lastKey)} đi ngang`
                : `${labelOf(trend.lastKey)} chi ${
                    trend.delta > 0 ? '+' : '-'
                  }${Math.abs(Math.round(trend.delta * 100))}%`
            }
          >
            {labelOf(trend.lastKey)} chi{' '}
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

      {/* Kết luận thứ hai, cho đường tỷ lệ. Cùng cửa sổ "tháng đã hoàn tất" với câu trên. */}
      {saving && (
        <div className="mt-1.5">
          <VerdictNote
            tone={saving.tone}
            short={`Giữ lại ${Math.round(saving.rate * 100)}%${
              saving.trend && saving.trend !== 'flat'
                ? saving.trend === 'up'
                  ? ' · đang lên'
                  : ' · đang xuống'
                : ''
            }`}
          >
            {saving.months} tháng đã xong: giữ lại <b>{Math.round(saving.rate * 100)}%</b> thu nhập
            {saving.tone === 'good' && ' — đạt mốc 20% của quy tắc 50/30/20'}
            {saving.tone === 'warn' && ' — chưa tới mốc 20% của quy tắc 50/30/20'}
            {saving.tone === 'bad' && ' — tức là chi vượt thu, đang phải rút vào tiền cũ'}
            {saving.trend && saving.trendDelta !== null && saving.trend !== 'flat' ? (
              <>
                . Xu hướng {saving.trend === 'up' ? 'đang lên' : 'đang xuống'}: nửa sau kỳ{' '}
                {saving.trendDelta > 0 ? 'hơn' : 'kém'} nửa đầu{' '}
                <b>{Math.abs(Math.round(saving.trendDelta * 100))} điểm %</b>.
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
