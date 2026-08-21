// "Chi từng ngày trong tháng" — đường chi mỗi ngày, để thấy ngày nào vọt lên.
//
// Vì sao ở Bản tin mà không ở Ngân sách: Bản tin trả lời "tình hình thế nào", đúng câu
// hỏi này; Ngân sách trả lời "có vượt trần không". Nó cũng ghép cặp thu-phóng với "Dòng
// tiền 8 tháng" ngay trên — thẻ kia mỗi cột một tháng, thẻ này mỗi điểm một ngày, và cả
// hai đọc cùng `activeMonthKey` nên bấm một cột là đường này đổi theo.
//
// Thẻ này THAY "Lịch chi tiêu trong tháng" (heatmap ô vuông) đã xoá: cùng một bộ số, mà
// đường thì đọc ra đỉnh ngay còn lịch chỉ đọc ra đậm/nhạt.
//
// Ba quyết định về hình:
//   1. Đỉnh nói bằng CHỮ ở trên biểu đồ, chỉ đánh một chấm ở dưới. Nhãn chữ vẽ trong svg
//      thì đỉnh rơi vào ngày 1 hay ngày 31 là chữ tràn ra ngoài vùng vẽ và bị cắt — cùng
//      lỗi mà chú thích `right: 14` ở monthPace.tsx nói tới, nhưng nhãn đỉnh dài gấp ba
//      nhãn trục nên không kê thêm lề nào cứu được.
//   2. Mấy khoản lớn nhất của ngày đỉnh in thành chữ dưới biểu đồ (tối đa hai dòng),
//      LUÔN hiện. Tooltip chỉ có khi trỏ/chạm được, mà câu hỏi "ngày đó có biến động gì"
//      là câu hỏi chính của thẻ — nó không được phụ thuộc vào việc chạm đúng một điểm
//      rộng 8px.
//   3. Đường ngang là TRUNG VỊ ngày có chi, không phải trung bình (xem dailySpike.ts).
import {
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, Money } from '../../components/ui'
import { formatCompact, type CurrencyCode } from '../../lib/money'
import type { CategoryRow } from '../../types/database.types'
import { dayLabel, type DailySpendSeries, type DayTopExpense } from '../reports/dailySpike'

// recharts nhận màu qua prop, nhưng `var(--…)` đi thẳng vào thuộc tính SVG nên token vẫn
// dùng được — cùng cách SpendVsBudgetCard đặt màu đường ngân sách.
const SPEND = 'var(--money-out)'
const TYPICAL = 'var(--fg-muted)'

interface Props {
  series: DailySpendSeries
  /** Ngày cuối được vẽ: hôm nay nếu đang xem tháng này, ngày cuối tháng nếu tháng đã qua.
   *  Không cắt thì tháng hiện tại có một đoạn phẳng bằng 0 kéo tới cuối tháng, đọc ra
   *  thành "mấy ngày tới không tiêu gì". */
  cutoffISO: string
  base: CurrencyCode
  /** Tra danh mục để đặt tên cho khoản — dùng lại đúng hàm Bản tin đưa cho dòng giao dịch. */
  categoryOf: (id: string | null) => CategoryRow | undefined
  /** Có khoản chưa quy đổi được → mọi số trong thẻ là ước chừng */
  approx: boolean
}

/** Tên một khoản chi: ghi chú của người dùng nếu có, không thì tên danh mục. */
function labelOf(t: DayTopExpense, categoryOf: Props['categoryOf']): string {
  const note = t.note?.trim()
  if (note) return note
  const cat = categoryOf(t.categoryId)
  return cat ? `${cat.icon} ${cat.name}` : 'Chưa phân loại'
}

interface TipProps {
  active?: boolean
  payload?: { payload: { date: string } }[]
  byDate: Map<string, DailySpendSeries['days'][number]>
  base: CurrencyCode
  categoryOf: Props['categoryOf']
  approx: boolean
}

/** Tooltip: ngày, tổng chi, và mấy khoản lớn nhất — đủ để biết hôm đó có gì. */
function DayTip({ active, payload, byDate, base, categoryOf, approx }: TipProps) {
  if (!active || !payload?.length) return null
  const day = byDate.get(payload[0].payload.date)
  if (!day) return null
  return (
    // Dùng lại `Card` dáng panel làm hộp tooltip, không viết tay nền + viền: 1a phân cấp
    // bằng nền + viền chứ không đổ bóng, và bảng bán kính/viền đó nằm trong Card.
    <Card elevation="panel" padding="sm">
      <p className="font-mono text-2xs text-fg-muted">{dayLabel(day.date)}</p>
      <p className="text-[0.8125rem] font-semibold text-fg-primary">
        <Money amount={day.total} currency={base} tone="out" approx={approx} />
      </p>
      {day.top.length > 0 && (
        <ul className="mt-1 space-y-0.5 border-t border-border-subtle pt-1">
          {day.top.map((t, i) => (
            <li key={i} className="flex gap-2 text-2xs text-fg-secondary">
              <span className="max-w-[9rem] truncate">{labelOf(t, categoryOf)}</span>
              {/* <Money> chứ không tự viết `font-mono tabular-nums`: designSystem.test.ts
                  canh chỗ này, và đây đúng là tiền. */}
              <Money amount={t.amount} currency={base} tone="out" className="ml-auto" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function DailySpendPanel({ series, cutoffISO, base, categoryOf, approx }: Props) {
  const { days, typical, peakIndex } = series
  const peak = peakIndex >= 0 ? days[peakIndex] : null

  const data = days.map((d) => ({
    label: dayLabel(d.date),
    date: d.date,
    // `null` chứ không 0 cho ngày chưa tới: 0 là một con số ("hôm đó không tiêu gì"),
    // ngày chưa tới thì không có số nào. `connectNulls={false}` cắt đường ở đó.
    spend: d.date <= cutoffISO ? d.total : null,
  }))
  const byDate = new Map(days.map((d) => [d.date, d]))

  // Gấp mấy lần ngày thường — con số duy nhất nói được "đỉnh này có đáng để ý không".
  const ratio = peak && typical > 0 ? peak.total / typical : 0

  return (
    <Card elevation="panel" padding="panel" as="section" className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[0.8125rem] font-semibold text-fg-primary">Chi từng ngày</h2>
        {typical > 0 && (
          <p className="font-mono text-2xs text-fg-muted">
            thường ngày{' '}
            <Money amount={typical} currency={base} tone="out" approx={approx} compact />
          </p>
        )}
      </div>

      {peak === null ? (
        <p className="mt-3 text-[0.8125rem] text-fg-muted">
          Chưa ghi khoản chi nào trong tháng này.
        </p>
      ) : (
        <>
          {/* Kết luận trước, biểu đồ sau (§14). Đây cũng là nội dung của hình nói bằng
              chữ — cái mà người đọc bằng trình đọc màn hình nhận được. */}
          <p className="mt-1 text-[0.8125rem] text-fg-secondary">
            Cao nhất <b className="text-fg-primary">{dayLabel(peak.date)}</b> —{' '}
            <Money amount={peak.total} currency={base} tone="out" approx={approx} />
            {ratio >= 2 && <>, gấp {Math.round(ratio)} lần ngày thường</>}
          </p>

          <div className="mt-2 h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {/* right: 18, không phải 14 như hai biểu đồ đường ở trang Ngân sách. Cùng
                  lỗi (điểm cuối nằm ĐÚNG mép phải vùng vẽ nên nửa nhãn tràn ra ngoài svg
                  và bị cắt) nhưng nhãn ở đây là "31/08" — đo trên máy ra 31px, tức nửa
                  nhãn 16px, trong khi bên kia là "8/31" hẹp hơn. Với right: 14 đo được
                  cắt 2px. 18 = 16 + 2px đệm. */}
              <LineChart data={data} margin={{ top: 8, right: 18, left: -8, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--fg-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  interval={4}
                />
                <YAxis
                  tickFormatter={(v: number) => formatCompact(v, base)}
                  tick={{ fontSize: 11, fill: 'var(--fg-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                {typical > 0 && (
                  <ReferenceLine y={typical} stroke={TYPICAL} strokeDasharray="4 4" />
                )}
                <Tooltip
                  cursor={{ stroke: 'var(--fg-muted)', strokeDasharray: '3 3' }}
                  content={
                    <DayTip
                      byDate={byDate}
                      base={base}
                      categoryOf={categoryOf}
                      approx={approx}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="spend"
                  stroke={SPEND}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                {/* Chấm đánh dấu đỉnh, KHÔNG kèm chữ — chữ đã ở trên. */}
                <ReferenceDot
                  x={dayLabel(peak.date)}
                  y={peak.total}
                  r={4}
                  fill={SPEND}
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* `line-clamp-2`, KHÔNG `truncate`: đo ở 375px thì một dòng chỉ chứa hết khoản
              ĐẦU, hai khoản sau mất im lặng. Cắt ở hai dòng là có cận trên mà vẫn đủ chỗ
              cho cả ba khoản của ngày đỉnh. */}
          {peak.top.length > 0 && (
            <p className="mt-1 line-clamp-2 text-2xs text-fg-muted">
              {dayLabel(peak.date)}:{' '}
              {peak.top.map((t, i) => (
                <span key={i}>
                  {i > 0 && ' · '}
                  {labelOf(t, categoryOf)} <Money amount={t.amount} currency={base} />
                </span>
              ))}
            </p>
          )}
        </>
      )}
    </Card>
  )
}
