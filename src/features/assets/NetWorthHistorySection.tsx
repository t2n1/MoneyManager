import { useEffect, useRef } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card } from '../../components/ui'
import { useNetWorthSnapshots, useUpsertNetWorthSnapshot } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { formatCompact } from '../../lib/money'
import type { MoneyView } from './moneyView'

interface Props {
  /** Tài sản ròng hiện tại (base minor); null = chưa tin cậy (thiếu tỷ giá) → không ghi. */
  currentNetWorth: number | null
  /** Bộ "xem thử bằng tiền khác" của trang Tài sản — mọi số hiển thị đi qua đây.
      Snapshot vẫn GHI theo base minor như cũ; chỉ lúc vẽ mới quy đổi. */
  view: MoneyView
}

/** Khu "Tài sản ròng theo thời gian" (mục AF): ghi snapshot/ngày + biểu đồ đường. */
export function NetWorthHistorySection({ currentNetWorth, view }: Props) {
  const { data: snapshots = [], isLoading } = useNetWorthSnapshots()
  const upsert = useUpsertNetWorthSnapshot()
  const recordedRef = useRef(false)

  // Ghi snapshot hôm nay (một lần mỗi lần mở) nếu chưa có hoặc giá trị đã đổi.
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

  if (snapshots.length < 2) {
    return (
      <Card as="section" padding="lg">
        <h2 className="text-sm font-semibold text-fg-secondary">
          Tài sản ròng theo thời gian
        </h2>
        <p className="mt-2 text-center text-xs text-fg-muted">
          Mở app đều đặn để app ghi lại tài sản ròng mỗi ngày — biểu đồ xu hướng sẽ hiện sau
          vài mốc.
        </p>
      </Card>
    )
  }

  const data = snapshots.map((s) => ({ date: s.snapshot_on.slice(5), value: s.net_worth }))
  const first = snapshots[0].net_worth
  const last = snapshots[snapshots.length - 1].net_worth
  const delta = last - first
  const up = delta >= 0

  return (
    <Card as="section" padding="lg">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-fg-secondary">
          Tài sản ròng theo thời gian
        </h2>
        <span className={`text-xs font-semibold ${up ? 'text-money-in' : 'text-money-out'}`}>
          {up ? '▲' : '▼'} {view.fmt(Math.abs(delta))}
        </span>
      </div>
      <div className="mt-2 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 14, bottom: 0, left: 0 }}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--fg-muted)' }} axisLine={false} tickLine={false} />
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
              stroke={up ? '#16a34a' : '#ef4444'}
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
