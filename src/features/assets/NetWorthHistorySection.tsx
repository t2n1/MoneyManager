// Khối "Tài sản ròng" theo thời gian (mục AF): ghi ảnh chụp mỗi phiên + vẽ đường đi.
//
// Bản 2b đổi hai điều:
//
//   1. Chuỗi để vẽ do `netWorthSeries` dựng, không phải mảng snapshot thô. Nó cắt theo
//      khoảng đang chọn và LOẠI những mốc nghi sai quy đổi — trên trục 23 tháng của sổ
//      này, ba mốc bị nhân sai một cỡ kéo cả trục dãn ra đến mức phần còn lại thành một
//      đường phẳng. Xem netWorthSeries.ts để biết luật loại (và vì sao nó hẹp).
//   2. Mọi thứ bị loại hoặc bị cắt đều được NÓI RA ngay trên biểu đồ: số mốc đã loại,
//      khoảng ngày của chúng, và câu "ảnh chụp mỗi lần mở app, không phải mỗi tháng" —
//      trước đó trục X in "07-28, 08-03, 08-10…" mà không có gì nói vì sao khoảng cách
//      giữa các mốc không đều.
import { useEffect, useRef } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, Money, StatusChip } from '../../components/ui'
import { useNetWorthSnapshots, useUpsertNetWorthSnapshot } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { formatCompact } from '../../lib/money'
import { monthLabel } from './assetsRange'
import type { MoneyView } from './moneyView'
import type { NetWorthSeries } from './netWorthSeries'

interface Props {
  /** Tài sản ròng hiện tại (base minor); null = chưa tin cậy (thiếu tỷ giá) → không ghi. */
  currentNetWorth: number | null
  /** Bộ "xem thử bằng tiền khác"; ảnh chụp vẫn GHI theo base minor, chỉ lúc vẽ mới quy đổi. */
  view: MoneyView
  /** Chuỗi đã cắt & đã lọc — dựng ở AssetsTrendView để ô KPI dùng chung cùng con số. */
  series: NetWorthSeries
  /** "từ đầu" / "12 tháng"… — để câu chú thích nói đúng khoảng đang xem. */
  rangeNoun: string
}

export function NetWorthHistorySection({
  currentNetWorth,
  view,
  series,
  rangeNoun,
}: Props) {
  const { data: snapshots = [], isLoading } = useNetWorthSnapshots()
  const upsert = useUpsertNetWorthSnapshot()
  const recordedRef = useRef(false)

  // Ghi ảnh chụp hôm nay (một lần mỗi lần mở) nếu chưa có hoặc giá trị đã đổi.
  useEffect(() => {
    if (isLoading || currentNetWorth == null || recordedRef.current) return
    const today = toISODate(new Date())
    const todaySnap = snapshots.find((s) => s.snapshot_on === today)
    if (!todaySnap || todaySnap.net_worth !== currentNetWorth) {
      recordedRef.current = true
      upsert.mutate({ snapshotOn: today, netWorth: currentNetWorth })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, currentNetWorth, snapshots])

  if (series.points.length < 2) {
    return (
      <Card as="section" elevation="panel" padding="lg">
        <h2 className="text-sm font-semibold text-fg-primary">Tài sản ròng</h2>
        <p className="mt-2 text-center text-xs text-fg-muted">
          {snapshots.length >= 2
            ? `Khoảng ${rangeNoun} chưa có đủ hai mốc — chọn khoảng rộng hơn.`
            : 'Mở app đều đặn để app ghi lại tài sản ròng — biểu đồ xu hướng sẽ hiện sau vài mốc.'}
        </p>
      </Card>
    )
  }

  const data = series.points.map((p) => ({ date: p.dateISO.slice(5), value: p.value }))
  const up = (series.delta ?? 0) >= 0
  const boMoc = series.dropped.reduce((n, d) => n + d.count, 0)

  return (
    <Card as="section" elevation="panel" padding="lg">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-fg-primary">Tài sản ròng</h2>
        {/* Khối TỰ KHAI mốc đầu và số mốc của mình, không lấy số tháng từ dải chọn: ảnh
            chụp ghi mỗi lần MỞ APP, nên số mốc không bằng số tháng và mốc đầu của chuỗi
            không nhất thiết là mốc đầu của cửa sổ. In "23 tháng" cạnh một chuỗi 6 mốc là
            mời người đọc tưởng mình đang xem 23 điểm dữ liệu. */}
        <span className="text-2xs text-fg-muted">
          {rangeNoun} · {series.points.length} mốc từ {monthLabel(series.points[0].dateISO)} ·
          ảnh chụp mỗi lần mở app, không phải mỗi tháng
        </span>
        {/* Loại mốc trong IM LẶNG là đúng cái "lỗ đen" mà bản vẽ 2b đặt tên: người dùng
            thấy trục đẹp hơn mà không biết vì sao ba ngày biến mất. */}
        {boMoc > 0 && (
          <StatusChip tone="warn">
            {boMoc} mốc {monthLabel(series.dropped[0].fromISO)}
            {series.dropped.length > 1 && '…'} nghi sai quy đổi — đã loại khỏi trục
          </StatusChip>
        )}
        {series.delta != null && (
          <span className="ml-auto shrink-0 text-xs font-semibold">
            <Money
              amount={view.view(Math.abs(series.delta)).amount}
              currency={view.cur}
              tone={up ? 'in' : 'out'}
            />
          </span>
        )}
      </div>
      <div className="mt-2 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 14, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: 'var(--fg-muted)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--fg-muted)' }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v: number) => {
                const t = view.view(v)
                return formatCompact(t.amount, t.currency)
              }}
            />
            <Tooltip formatter={(v) => view.fmt(Number(v))} labelFormatter={(l) => `Ngày ${l}`} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={up ? 'var(--color-green-600)' : 'var(--color-red-600)'}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
