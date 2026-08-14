// Dòng "số trên màn này lấy lúc nào". Bấm vào xổ ra từng nguồn.
//
// Đặt ở đầu trang chứ không cạnh từng con số: ba nguồn cùng cũ thì ba nhãn cảnh báo
// cạnh nhau chỉ làm rối, trong khi điều người ta cần biết trước là "có gì đang cũ
// không". Dấu ≈ của EstimateMark mới là thứ đi kèm từng con số, và nó nói chuyện khác:
// "số này do app suy ra", không phải "số này cũ".
import { useState } from 'react'
import type { FreshnessSummary } from '../lib/freshness'

export function DataFreshness({ summary }: { summary: FreshnessSummary | null }) {
  const [open, setOpen] = useState(false)
  if (!summary) return null

  // Chấm là NỀN nên amber-500 dùng được; chữ cảnh báo phải là amber-700/300
  // (amber-600/500 làm chữ trượt AA ở light mode — designSystem.test.ts cấm cứng).
  //
  // Chiều "ổn" dùng token `bg-accent` chứ không bg-green-600: green-600 nằm trong danh
  // sách ban cứng, và đọc token thì đổi một chỗ là đổi cả app.
  const dot = summary.tone === 'warn' ? 'bg-amber-500' : 'bg-accent'

  // Chấm đầu dòng là tone GỘP, nên nó chuyển hổ phách khi bất kỳ nguồn nào cũ. Nếu dòng
  // chữ cũng tô một màu theo tone gộp thì "Tỷ giá hôm qua" nằm trong dòng hổ phách trông
  // y như chính tỷ giá đang có vấn đề, trong khi thủ phạm có thể là giá cổ phiếu. Vì vậy
  // mỗi nguồn tự mang màu của mình — nhìn một cái là biết phải xử cái nào, khỏi bấm xổ.
  const warnText = 'font-medium text-amber-700 dark:text-amber-300'

  return (
    <div className="print:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-8 items-center gap-1.5 text-xs text-fg-muted"
        aria-expanded={open}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
        <span className="text-left">
          {summary.details.map((d, i) => (
            <span key={d.label}>
              {/* Dấu phân cách để NGOÀI span màu: tô nó theo nguồn đứng trước sẽ kéo
                  màu cảnh báo lan sang khoảng giữa hai nguồn. */}
              {i > 0 && ' · '}
              <span className={d.tone === 'warn' ? warnText : undefined}>
                {d.label} {d.age}
              </span>
            </span>
          ))}
        </span>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <ul className="mt-1.5 space-y-1 rounded-lg bg-surface-sunken p-2">
          {summary.details.map((d) => (
            <li key={d.label} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-fg-secondary">{d.label}</span>
              <span
                className={d.tone === 'warn' ? `shrink-0 ${warnText}` : 'shrink-0 text-fg-muted'}
              >
                {d.age}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
