// Thẻ chỉ số sức khỏe tài chính — khuôn dùng chung cho MỌI chỉ số để đọc quen mắt:
//   tên · kết luận · số lớn · thang đo màu · một câu nghĩa là gì · "cách tính" mở ra được.
// Kết luận LUÔN có chữ (Tốt / Cần chú ý / Rủi ro) chứ không chỉ dựa vào màu.
import type { ReactNode } from 'react'
import { ExplainBox } from '../../components/ExplainBox'
import { VERDICT_LABELS, type Verdict } from './health'

export type Tone = 'bad' | 'warn' | 'good'

/** Một vùng trên thang đo, kéo dài tới mốc `upTo` (mốc tăng dần). */
export interface Zone {
  upTo: number
  tone: Tone
}

const BAR: Record<Tone, string> = {
  bad: 'bg-red-400 dark:bg-red-500/70',
  warn: 'bg-amber-400 dark:bg-amber-500/70',
  good: 'bg-green-500 dark:bg-green-500/70',
}

const BADGE: Record<Verdict, string> = {
  good: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  bad: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  unknown: 'bg-surface-sunken text-fg-on-track',
}

const VALUE: Record<Verdict, string> = {
  good: 'text-money-in',
  warn: 'text-amber-600 dark:text-amber-400',
  bad: 'text-money-out',
  unknown: 'text-fg-muted',
}

interface Props {
  title: string
  /** Giá trị đã format sẵn để đọc: "5,2 tháng", "38%", "≥ 60 tháng" */
  display: string
  verdict: Verdict
  /** Vị trí trên thang; null = không vẽ thang (chưa đủ dữ liệu) */
  value: number | null
  /** Các vùng của thang, mốc tăng dần. Bỏ trống = không vẽ thang. */
  zones?: Zone[]
  /** Nhãn đặt dưới thang, canh theo mốc kết thúc từng vùng (trừ vùng cuối). */
  zoneLabels?: string[]
  /** Một câu: con số này nghĩa là gì với cuộc sống của mình. */
  meaning: ReactNode
  /** Khối phụ giữa câu giải nghĩa và "cách tính" — vd kịch bản thứ hai. */
  extra?: ReactNode
  /** Cách tính + nên làm gì — giấu sau nút để thẻ không rối. */
  how: ReactNode
}

export function HealthMetricCard({
  title,
  display,
  verdict,
  value,
  zones,
  zoneLabels,
  meaning,
  extra,
  how,
}: Props) {
  const max = zones && zones.length > 0 ? zones[zones.length - 1].upTo : 0
  const showGauge = !!zones && zones.length > 0 && max > 0
  // Giá trị vượt trần thang thì ghim ở cuối (vd runway 80 tháng trên thang 0–24)
  const markerPct = value === null ? null : Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <section className="rounded-xl bg-surface p-3 shadow-sm ">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium ${BADGE[verdict]}`}>
          {VERDICT_LABELS[verdict]}
        </span>
      </div>

      <p className={`mt-1 text-2xl font-bold tabular-nums ${VALUE[verdict]}`}>{display}</p>

      {showGauge && (
        <div className="mt-2.5">
          <div
            className="relative flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
            role="img"
            aria-label={`Thang đo: ${display}, mức ${VERDICT_LABELS[verdict].toLowerCase()}`}
          >
            {zones.map((z, i) => {
              const from = i === 0 ? 0 : zones[i - 1].upTo
              return (
                <div
                  key={z.upTo}
                  className={`h-full ${BAR[z.tone]}`}
                  style={{ width: `${((z.upTo - from) / max) * 100}%` }}
                />
              )
            })}
            {markerPct !== null && (
              <div
                className="absolute top-0 h-2 w-1 -translate-x-1/2 rounded-full bg-gray-900 ring-2 ring-white dark:bg-white dark:ring-gray-900"
                style={{ left: `${markerPct}%` }}
              />
            )}
          </div>
          {zoneLabels && zoneLabels.length > 0 && (
            <div className="relative mt-1 h-3.5">
              {zoneLabels.map((label, i) => (
                <span
                  key={label + i}
                  className="absolute -translate-x-1/2 text-3xs tabular-nums text-fg-muted"
                  style={{ left: `${(zones[i].upTo / max) * 100}%` }}
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="mt-2 text-xs leading-relaxed text-fg-secondary">{meaning}</p>

      {extra}

      <ExplainBox>{how}</ExplainBox>
    </section>
  )
}
