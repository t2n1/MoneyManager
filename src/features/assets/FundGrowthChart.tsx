// Ba đường của một quỹ: quỹ tự chạy · tiền của bạn · máy mua đều.
//
// Bản CÓ HÌNH của ba con số ngay phía trên nó trong cùng thẻ. Ba con số nói khoảng cách
// BAO NHIÊU; ba đường nói nó MỞ RA Ở ĐÂU — và với một sổ lệnh có lần bán lớn giữa đường,
// chỗ mở ra là toàn bộ câu chuyện.
//
// ĐƠN VỊ KHÁC ba con số trên: đây là **% tích luỹ**, kia là **%/năm**. Nhãn ngay trên biểu
// đồ nói ra điều đó, và nói ra là bắt buộc: hôm nay tôi đã ship đúng một lỗi cùng họ (khu
// Hiệu quả in "Tổng lợi nhuận −348,7%" ngay trên chú giải nói "Danh mục +6,7%") vì hai đại
// lượng khác nhau nằm cạnh nhau mà không ai nói chúng khác nhau.
//
// Màu giữ ĐÚNG nghĩa đã dùng ở biểu đồ cổ phiếu: xanh lá = thứ của mình, xanh dương = mốc
// để so, xám = cái máy (trung tính — máy mua đều không phải "tốt" hay "xấu", nó là mốc).
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Num } from '../../components/ui'
import { CHART_TEXT_3XS } from '../../lib/chartText'
import { dayMonthLabel } from '../../lib/dates'
import { fundGrowth, type GrowthTrade } from './fundGrowth'
import { heSo } from './investFormat'

const MAU_QUY = 'var(--color-sky-500)'
const MAU_TOI = 'var(--color-green-600)'
const MAU_MAY = 'var(--fg-muted)'

interface Props {
  trades: GrowthTrade[]
  /** ngày → 基準価額 (¥/1万口) của ĐÚNG quỹ này. */
  navByDate: Map<string, number>
}

export function FundGrowthChart({ trades, navByDate }: Props) {
  const { points, hasDca } = fundGrowth({ trades, navByDate })

  // Dưới hai phiên thì không có gì để vẽ. Im lặng chứ không hiện trạng thái rỗng: ba con
  // số ngay trên đã nói đủ, thêm một dòng "chưa vẽ được" chỉ làm thẻ dài ra.
  if (points.length < 2) return null

  const cuoi = points.at(-1)!

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {/* Nhãn NÀY là chỗ duy nhất nói ra rằng biểu đồ khác đơn vị với ba con số trên. */}
        <span className="text-2xs text-fg-muted">Tích luỹ từ ngày mua đầu</span>
        <ChuGiai mau={MAU_QUY} nhan="Quỹ tự chạy" pct={cuoi.fund} />
        <ChuGiai mau={MAU_TOI} nhan="Tiền của bạn" pct={cuoi.mine} />
        {hasDca && <ChuGiai mau={MAU_MAY} nhan="Máy mua đều" pct={cuoi.dca} />}
      </div>

      <div className="mt-1 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 5, right: 12, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="date"
              tickFormatter={dayMonthLabel}
              tick={{ fontSize: CHART_TEXT_3XS, fill: 'var(--fg-muted)' }}
              axisLine={false}
              tickLine={false}
              minTickGap={30}
            />
            <YAxis
              tick={{ fontSize: CHART_TEXT_3XS, fill: 'var(--fg-muted)' }}
              axisLine={false}
              tickLine={false}
              width={40}
              tickFormatter={(v: number) => `${Math.round(v)}%`}
            />
            {/* Vạch 0% là mốc cả ba đường xuất phát — không có nó thì "đang lãi hay lỗ"
                phải đọc bằng cách dò trục. */}
            <ReferenceLine y={0} stroke="var(--fg-muted)" strokeDasharray="2 3" />
            <Tooltip
              formatter={(v, name) => [
                v == null ? '—' : `${heSo(Number(v), 1)}%`,
                name === 'fund' ? 'Quỹ tự chạy' : name === 'mine' ? 'Tiền của bạn' : 'Máy mua đều',
              ]}
              labelFormatter={(l) => (typeof l === 'string' ? `Phiên ${dayMonthLabel(l)}` : '')}
            />
            {/* Vẽ máy trước, rồi quỹ, rồi MÌNH sau cùng — đường của người dùng nằm trên
                khi ba đường chồng nhau. */}
            {hasDca && (
              <Line
                type="monotone"
                dataKey="dca"
                stroke={MAU_MAY}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
            <Line
              type="monotone"
              dataKey="fund"
              stroke={MAU_QUY}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="mine"
              stroke={MAU_TOI}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function ChuGiai({ mau, nhan, pct }: { mau: string; nhan: string; pct: number | null }) {
  return (
    <span className="flex items-center gap-1.5 text-2xs text-fg-muted">
      {/* Màu chú giải trỏ vào ĐÚNG hằng số đã tô cho đường (docs/design-system.md). */}
      <span className="h-0.5 w-3.5 shrink-0" style={{ backgroundColor: mau }} aria-hidden />
      {nhan}{' '}
      <Num tone={pct == null || pct === 0 ? 'neutral' : pct > 0 ? 'in' : 'out'}>
        {pct == null ? '—' : `${heSo(pct, 1)}%`}
      </Num>
    </span>
  )
}
