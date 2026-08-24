// Sáu chỉ số sức khỏe trong MỘT bảng — bản 27b.
//
// VÌ SAO DỰNG LẠI
// Bản trước: sáu thẻ, mỗi thẻ ~165–225px, cộng lại ~1000px cuộn cho sáu con số. Và thang
// màu ĐẢO CHIỀU giữa các thẻ — "Quỹ dự phòng" đi đỏ→xanh, "Nợ trên thu nhập" đi xanh→đỏ —
// nên mắt phải đọc lại thang mỗi lần, tức thang màu không còn làm được việc của nó.
//
// Ở đây: một bảng, 44px một dòng, và thang LUÔN trái-xấu-phải-tốt ở cả sáu dòng nhờ
// `scaleGeometry` (xem health.ts: đảo GIÁ TRỊ, không đảo ý nghĩa vùng).
//
// Trọng số gộp thành MỘT dòng chân bảng thay vì in cạnh từng nhãn: in cạnh nhãn làm chỉ số
// rủi ro trông ít quan trọng vì nó chỉ nặng 10%.

import type { ReactNode } from 'react'
import { Card, Num, StatusChip } from '../../components/ui'
import { STATUS_FILL } from '../../components/ui/statusColors'
import { Guide } from '../../components/Guide'
import { scaleGeometry, type Verdict, type Zone } from './health'

const VERDICT_TONE: Record<Verdict, 'good' | 'warn' | 'bad' | 'info'> = {
  good: 'good',
  warn: 'warn',
  bad: 'bad',
  unknown: 'info',
}

const VERDICT_LABEL: Record<Verdict, string> = {
  good: 'Tốt',
  warn: 'Cần chú ý',
  bad: 'Rủi ro',
  unknown: 'Chưa đủ dữ liệu',
}

export interface HealthRow {
  key: string
  /** Tên chỉ số. */
  label: string
  /** Rổ / mẫu số, in nhỏ sau nhãn — hai chỉ số quỹ-dự-phòng và cầm-cự BẮT BUỘC có. */
  note?: string
  /** Đã định dạng sẵn: "5,0 th" · "13%" · "≥ 60 th". */
  display: string
  value: number | null
  zones: readonly Zone[]
  verdict: Verdict
  /** Cách đọc chỉ số này — một câu, hiện khi mở dòng. */
  meaning: ReactNode
  /** Trọng số trong điểm tổng, phần trăm. In ở CHÂN bảng, không cạnh nhãn. */
  weight: number
}

/** Thang: dải vùng màu + kim. Kim nằm NGOÀI phần `overflow-hidden` để không bị cắt. */
function Scale({ value, zones, label }: { value: number | null; zones: readonly Zone[]; label: string }) {
  const g = scaleGeometry(value, zones)
  if (g.bands.length === 0) return null
  return (
    <span className="block" role="img" aria-label={label}>
      <span className="relative block h-2">
        {/* Bo góc đặt trên chính khối này, và kim là phần tử TÁCH RIÊNG nằm sau nó: bọc
            kim trong một khối overflow-hidden thì đúng lúc kim ở mép 0% hoặc 100% nó bị
            cắt mất một nửa, và đó là hai vị trí đáng thấy nhất. */}
        <span className="absolute inset-0 flex overflow-hidden rounded-full">
          {g.bands.map((b, i) => (
            <span key={i} className={STATUS_FILL[b.tone]} style={{ width: `${b.widthPct}%` }} />
          ))}
        </span>
        {g.markerPct !== null && (
          <span
            aria-hidden
            className="absolute -top-0.5 h-3 w-0.5 rounded-full bg-fg-primary ring-1 ring-surface"
            style={{ left: `calc(${g.markerPct}% - 1px)` }}
          />
        )}
      </span>
      {/* Nhãn mốc: chỉ hai mốc trong, không in mốc cuối (nó là mép thang). */}
      <span aria-hidden className="mt-1 flex text-2xs text-fg-muted">
        {g.bands.map((b, i) => (
          <span key={i} style={{ width: `${b.widthPct}%` }} className="relative">
            {b.upTo !== null && (
              <span className="absolute -right-1 top-0">{formatTick(b.upTo, g.max)}</span>
            )}
          </span>
        ))}
      </span>
    </span>
  )
}

/** Mốc in gọn: thang phần trăm (max ≤ 1) in "%", còn lại in số. */
function formatTick(upTo: number, max: number): string {
  if (max <= 1) return `${Math.round(upTo * 100)}%`
  return upTo % 1 === 0 ? String(upTo) : upTo.toFixed(1).replace('.', ',')
}

export function HealthTable({ rows }: { rows: readonly HealthRow[] }) {
  // Rủi ro trước, rồi cần chú ý, rồi tốt — thứ tự này là câu trả lời cho "cái gì đang
  // kéo điểm xuống", tức đúng câu người ta mở tab để hỏi. Chỉ số chưa đủ dữ liệu xuống
  // cuối: nó không phải tin xấu, nó là chỗ trống.
  const ORDER: Record<Verdict, number> = { bad: 0, warn: 1, good: 2, unknown: 3 }
  const sorted = [...rows].sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict])
  const GRID =
    'grid grid-cols-[minmax(0,1fr)_minmax(4.5rem,auto)_minmax(6rem,auto)] items-center gap-x-3 lg:grid-cols-[minmax(0,1fr)_minmax(4.5rem,auto)_minmax(9rem,10rem)_minmax(6rem,auto)]'

  return (
    <Card as="section" elevation="panel" padding="none">
      <div role="table" aria-label="Sáu chỉ số sức khỏe tài chính">
        <div
          role="row"
          className={`${GRID} border-b border-border-panel bg-surface-chrome px-4 py-2.5 text-2xs uppercase tracking-label text-fg-muted`}
        >
          <span role="columnheader">Chỉ số</span>
          <span role="columnheader" className="text-right">
            Hiện tại
          </span>
          <span role="columnheader" className="hidden lg:block">
            Thang · xấu → tốt
          </span>
          <span role="columnheader" className="text-right">
            Trạng thái
          </span>
        </div>
        <ul>
          {sorted.map((row) => (
            <li key={row.key} className="border-b border-border-subtle last:border-0">
              <div role="row" className={`${GRID} min-h-11 px-4 py-2`}>
                <span role="cell" className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                  <span className="min-w-0 truncate text-sm text-fg-primary">
                    {row.label}
                  </span>
                  {row.note && <span className="text-2xs text-fg-muted">· {row.note}</span>}
                </span>
                <span role="cell" className="text-right text-sm">
                  <Num tone={row.value === null ? 'muted' : 'neutral'}>{row.display}</Num>
                </span>
                <span role="cell" className="hidden lg:block">
                  <Scale
                    value={row.value}
                    zones={row.zones}
                    label={`${row.label}: ${row.display}, thang trái xấu phải tốt`}
                  />
                </span>
                <span role="cell" className="flex justify-end">
                  <StatusChip tone={VERDICT_TONE[row.verdict]}>
                    {VERDICT_LABEL[row.verdict]}
                  </StatusChip>
                </span>
              </div>
              {/* Thang xuống dòng riêng dưới `lg`: ở 390px bốn cột không vừa, mà thang là
                  cột duy nhất co được mà không mất thông tin (nó là hình, không phải số). */}
              <div className="px-4 pb-2 lg:hidden">
                <Scale
                  value={row.value}
                  zones={row.zones}
                  label={`${row.label}: ${row.display}, thang trái xấu phải tốt`}
                />
              </div>
              <Guide className="px-4 pb-2 text-2xs text-fg-muted">{row.meaning}</Guide>
            </li>
          ))}
        </ul>
      </div>

      {/* Trọng số: MỘT dòng chân bảng. In cạnh mỗi nhãn (như bản trước) làm chỉ số rủi ro
          trông ít quan trọng vì nó chỉ nặng 10% — trong khi nó là chỉ số duy nhất đang đỏ. */}
      <p className="border-t border-border-panel px-4 py-2.5 text-2xs text-fg-muted">
        Trọng số trong điểm tổng:{' '}
        {[...rows]
          .sort((a, b) => b.weight - a.weight)
          .map((row) => `${row.label.toLowerCase()} ${row.weight}%`)
          .join(' · ')}
        .
      </p>
    </Card>
  )
}
