import { useEffect, useRef } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useNetWorthSnapshots, useUpsertNetWorthSnapshot } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'

interface Props {
  base: CurrencyCode
  /** Tài sản ròng hiện tại (base minor); null = chưa tin cậy (thiếu tỷ giá) → không ghi. */
  currentNetWorth: number | null
}

/** Khu "Tài sản ròng theo thời gian" (mục AF): ghi snapshot/ngày + biểu đồ đường. */
export function NetWorthHistorySection({ base, currentNetWorth }: Props) {
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
      <section className="rounded-2xl bg-white dark:bg-gray-900 p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Tài sản ròng theo thời gian
        </h2>
        <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
          Mở app đều đặn để app ghi lại tài sản ròng mỗi ngày — biểu đồ xu hướng sẽ hiện sau
          vài mốc.
        </p>
      </section>
    )
  }

  const data = snapshots.map((s) => ({ date: s.snapshot_on.slice(5), value: s.net_worth }))
  const first = snapshots[0].net_worth
  const last = snapshots[snapshots.length - 1].net_worth
  const delta = last - first
  const up = delta >= 0

  return (
    <section className="rounded-2xl bg-white dark:bg-gray-900 p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Tài sản ròng theo thời gian
        </h2>
        <span className={`text-xs font-semibold ${up ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {up ? '▲' : '▼'} {formatMoney(Math.abs(delta), base)}
        </span>
      </div>
      <div className="mt-2 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v: number) => formatCompact(v, base)}
            />
            <Tooltip formatter={(v) => formatMoney(Number(v), base)} labelFormatter={(l) => `Ngày ${l}`} />
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
    </section>
  )
}
