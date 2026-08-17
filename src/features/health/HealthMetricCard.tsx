// Thẻ chỉ số sức khỏe tài chính — khuôn dùng chung cho MỌI chỉ số để đọc quen mắt:
//   tên · kết luận · số lớn · thang đo màu · một câu nghĩa là gì · "cách tính" mở ra được.
// Kết luận LUÔN có chữ (Tốt / Cần chú ý / Rủi ro) chứ không chỉ dựa vào màu.
//
// Ở chế độ Gọn (src/lib/density.ts) thẻ rút về bốn thứ đầu: tên, huy hiệu, số lớn,
// thang màu. Đó cũng là lý do khuôn này chịu được chế độ Gọn mà không phải thiết kế
// lại — nó vốn đã đặt kết luận vào huy hiệu và đồ hoạ, chữ chỉ là phần diễn giải thêm.
import type { ReactNode } from 'react'
import { ExplainBox } from '../../components/ExplainBox'
import { Guide } from '../../components/Guide'
import { VERDICT_LABELS, type Tone, type Verdict, type Zone } from './health'
import { STATUS_CHIP, STATUS_FILL } from '../../components/ui/statusColors'

// Thang đo khai ở health.ts vì điểm tổng chấm trên đúng mốc đang vẽ ở đây. Vẫn
// xuất lại từ file này để các chỗ đang import `type Zone` từ thẻ không phải đổi.
export type { Tone, Zone }

// Huy hiệu Tốt/Cần chú ý/Rủi ro. Bộ màu này TỪNG khai tại đây; đã dời sang tầng
// primitive (components/ui/statusColors) khi chế độ Gọn cần đúng dáng pill đó ở nhiều
// màn khác. 'unknown' của thang sức khỏe = 'info' của primitive: nó không biết gì về
// việc chấm điểm, chỉ biết "chưa có gì để nói".
const BADGE: Record<Verdict, string> = {
  good: STATUS_CHIP.good,
  warn: STATUS_CHIP.warn,
  bad: STATUS_CHIP.bad,
  unknown: STATUS_CHIP.info,
}

const VALUE: Record<Verdict, string> = {
  good: 'text-money-in',
  warn: 'text-fg-warn',
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
  zones?: readonly Zone[]
  /** Nhãn đặt dưới thang, canh theo mốc kết thúc từng vùng (trừ vùng cuối). */
  zoneLabels?: string[]
  /** Một câu: con số này nghĩa là gì với cuộc sống của mình. */
  meaning: ReactNode
  /** Khối phụ giữa câu giải nghĩa và "cách tính" — vd kịch bản thứ hai. */
  extra?: ReactNode
  /** Cách tính + nên làm gì — giấu sau nút để thẻ không rối. */
  how: ReactNode
  /**
   * Trọng số (%) của chỉ số này trong điểm tổng — bản vẽ 15b in nó ngay cạnh mỗi chỉ số.
   *
   * Vì sao đáng một dòng: sáu chỉ số KHÔNG bằng nhau (25/20/20/15/10/10), mà trước đây
   * con số ấy chỉ nằm trong ExplainBox của thẻ điểm — tức phải mở một khối khác mới biết
   * chỉ số đang đỏ trước mắt mình nặng 10% hay 25%. Hai tình huống đó cần ưu tiên khác
   * nhau hẳn.
   */
  weight?: number
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
  weight,
}: Props) {
  const max = zones && zones.length > 0 ? zones[zones.length - 1].upTo : 0
  const showGauge = !!zones && zones.length > 0 && max > 0
  // Giá trị vượt trần thang thì ghim ở cuối (vd runway 80 tháng trên thang 0–24)
  const markerPct = value === null ? null : Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <section className="rounded-xl bg-surface p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg-primary">{title}</h3>
        <span className="flex shrink-0 items-baseline gap-1.5">
          {weight != null && (
            <span className="tabular-nums text-2xs text-fg-muted" title="Trọng số trong điểm tổng">
              {weight}%
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-2xs font-medium ${BADGE[verdict]}`}>
            {VERDICT_LABELS[verdict]}
          </span>
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
                  className={`h-full ${STATUS_FILL[z.tone]}`}
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

      {/* Chế độ Gọn bỏ câu giải nghĩa — nhưng CHỈ khi thẻ đã tự nói được: có số lớn,
          thang màu và huy hiệu thì câu đó là phần "nghĩa là gì", đúng loại chữ để dạy.
          Chỉ số CHƯA chấm được thì phải giữ: lúc đó thẻ chỉ có "—", và câu này là chỗ
          duy nhất nói vì sao cùng đường đi sửa (thường là một <Link> phân loại danh
          mục). Ẩn nó đi là để lại một thẻ trắng không cách nào thoát. */}
      {verdict === 'unknown' ? (
        <p className="mt-2 text-xs leading-relaxed text-fg-secondary">{meaning}</p>
      ) : (
        <Guide className="mt-2 text-xs leading-relaxed text-fg-secondary">{meaning}</Guide>
      )}

      {extra}

      <ExplainBox>{how}</ExplainBox>
    </section>
  )
}
