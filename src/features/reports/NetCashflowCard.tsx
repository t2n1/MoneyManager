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
import { VerdictNote } from '../../components/VerdictNote'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import type { MonthKey } from '../../lib/dates'
import { netFlowSeries, netFlowSummary, type MonthlySeries } from './aggregate'
import { netFlowVerdict } from './verdicts'
import { Card } from '../../components/ui'

interface Props {
  series: MonthlySeries
  base: CurrencyCode
  title: string
  labelOf: (key: MonthKey) => string
  /** Tháng đang chạy dở — bị loại khỏi câu kết luận (biểu đồ và dòng tổng vẫn có nó). */
  currentKey?: MonthKey | null
}

const POSITIVE = '#16a34a'
const NEGATIVE = '#ef4444'
const CUMULATIVE = '#6366f1'

export function NetCashflowCard({ series, base, title, labelOf, currentKey = null }: Props) {
  const points = netFlowSeries(series)
  const summary = netFlowSummary(points)
  const verdict = netFlowVerdict(series.points, currentKey)
  // Cả kỳ không có giao dịch nào → thẻ rỗng, ẩn đi cho gọn (giống SavingsRateTrendCard).
  const hasAny = points.some((p) => p.net !== 0)
  if (!hasAny) return null

  const data = points.map((p) => ({
    label: labelOf(p.key),
    net: p.net,
    cumulative: p.cumulative,
  }))

  return (
    <Card as="section">
      <h2 className="mb-2 text-sm font-semibold text-fg-muted">{title}</h2>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
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
            {/* Mốc 0 phải rõ: đây là ranh giới dư / thâm hụt */}
            <ReferenceLine y={0} stroke="var(--fg-muted)" />
            <Tooltip
              formatter={(v, name) => [
                formatMoney(Number(v), base),
                name === 'net' ? 'Ròng tháng' : 'Tích lũy',
              ]}
              labelFormatter={(l) => String(l)}
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

      <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-fg-muted">
        {/* Chấm/vạch chú giải lấy ĐÚNG hằng số đã tô cho biểu đồ, không dùng class
            Tailwind: bảng màu v4 khác v3 nên class và hex cứng đã lệch nhau. */}
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: POSITIVE }} /> Ròng
          dương
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: NEGATIVE }} /> Ròng âm
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-4 rounded" style={{ backgroundColor: CUMULATIVE }} /> Tích lũy
        </span>
      </div>

      {/* Tóm tắt bằng CHỮ — không để người dùng phải suy ra từ màu cột (a11y) */}
      <p className="mt-2 text-center text-2xs text-fg-muted">
        Tổng ròng{' '}
        <span
          className={
            summary.total < 0
              ? 'font-semibold text-money-out'
              : 'font-semibold text-money-in'
          }
        >
          {formatMoney(summary.total, base)}
        </span>{' '}
        · trung bình {formatMoney(summary.avg, base)}/tháng
        {summary.negativeMonths > 0 && ` · ${summary.negativeMonths} tháng thâm hụt`}
      </p>

      {/* Dòng trên là SỐ (gồm cả tháng đang dở, khớp với biểu đồ). Dòng dưới là KẾT
          LUẬN nên chỉ tính tháng đã hoàn tất — hai dòng có thể lệch nhau, và đó là
          cố ý: "tổng ròng" phải khớp cái mắt đang thấy, còn kết luận thì không được
          dựa vào một tháng mới đi được 3 ngày. */}
      {verdict && (
        <div className="mt-2">
          <VerdictNote
            tone={verdict.tone}
            short={
              verdict.tone === 'bad'
                ? `Âm ${formatMoney(Math.abs(verdict.total), base)} / ${verdict.months} tháng`
                : verdict.tone === 'warn'
                  ? `Dư ${formatMoney(verdict.total, base)} nhưng ${verdict.negativeMonths}/${verdict.months} tháng âm`
                  : `Dư ${formatMoney(verdict.total, base)} / ${verdict.months} tháng`
            }
          >
            {/* Luôn mở đầu bằng "N tháng đã xong": con số ở đây gần như chắc chắn KHÁC
                dòng tổng phía trên (dòng đó gồm cả tháng đang dở, để khớp biểu đồ), nên
                phải nói ngay phạm vi, không thì trông như app tính sai. */}
            {verdict.months} tháng đã xong:{' '}
            {verdict.tone === 'bad' && (
              <>
                chi nhiều hơn thu <b>{formatMoney(Math.abs(verdict.total), base)}</b> — tài sản đang
                bị bào mòn chứ không cộng dồn.
              </>
            )}
            {verdict.tone === 'warn' && (
              <>
                dư <b>{formatMoney(verdict.total, base)}</b>, nhưng {verdict.negativeMonths} trong{' '}
                {verdict.months} tháng thâm hụt — phần dư đến từ tháng thu trội, chưa phải từ nếp
                chi tiêu đều đặn.
              </>
            )}
            {verdict.tone === 'good' && (
              <>
                dư <b>{formatMoney(verdict.total, base)}</b>
                {verdict.negativeMonths === 0
                  ? ', không tháng nào thâm hụt.'
                  : `, chỉ ${verdict.negativeMonths} tháng thâm hụt.`}
              </>
            )}
          </VerdictNote>
        </div>
      )}
    </Card>
  )
}
