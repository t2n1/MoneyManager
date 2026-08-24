// "Độ tin cậy dữ liệu" — khối CUỐI của Bản tin (§4.9).
//
// Một con số % thay cho hàng chục dòng "ước chừng" rải khắp app. Bấm vào từng dòng
// thiếu là đi thẳng tới chỗ làm nó tăng — §4.9 ghi rõ "bấm vào ra đúng các việc làm nó
// tăng", nên mỗi dòng phải là một LIÊN KẾT, không phải một câu than.
//
// Phép tính ở `notifications/reliability.ts` (thuần, có test). Ở đây chỉ bày.
import { Link } from 'react-router-dom'
import { Card, SectionTitle } from '../../components/ui'
import type { Reliability } from '../notifications/reliability'

/** Mỗi thành phần thiếu dẫn đi đâu để sửa. */
const TO: Record<string, string> = {
  categorized: '/so',
  reconciled: '/assets',
  history: '/so',
  assumptions: '/assets',
}

export function ReliabilityPanel({ data }: { data: Reliability }) {
  const thieu = data.parts.filter((p) => p.gap !== '')

  return (
    <Card elevation="panel" padding="panel" as="section">
      <div className="flex items-baseline justify-between gap-2">
        <SectionTitle>Độ tin cậy dữ liệu</SectionTitle>
        <span
          className={`font-mono text-lg font-medium leading-none ${
            data.pct >= 80 ? 'text-money-in' : data.pct >= 50 ? 'text-fg-warn' : 'text-money-out'
          }`}
        >
          {data.pct}%
        </span>
      </div>

      {/* Thanh gộp bốn phần theo đúng TRỌNG SỐ: mắt đọc được ngay phần nào đang kéo
          điểm xuống, thay vì phải so bốn con số rời. */}
      <div className="mt-2 flex h-1.5 gap-px overflow-hidden rounded-full bg-surface-sunken">
        {data.parts.map((p) => (
          <span
            key={p.key}
            className="h-full"
            style={{ width: `${p.weight * 100}%` }}
            aria-hidden
          >
            <span
              className={`block h-full rounded-full ${p.score >= 0.99 ? 'bg-money-in' : 'bg-fg-warn'}`}
              style={{ width: `${Math.max(p.score, 0) * 100}%` }}
            />
          </span>
        ))}
      </div>

      {thieu.length === 0 ? (
        <p className="mt-2.5 text-sm text-fg-muted">
          Không còn chỗ nào thiếu — mọi con số trong app đang tính trên dữ liệu đủ.
        </p>
      ) : (
        <ul className="mt-2.5 flex flex-col gap-1">
          {thieu.map((p) => (
            <li key={p.key}>
              <Link
                to={TO[p.key] ?? '/'}
                className="-my-1 flex items-baseline gap-2 py-1 text-sm text-fg-secondary hover:underline"
              >
                <span className="shrink-0 text-2xs uppercase tracking-label text-fg-muted">
                  {p.label}
                </span>
                <span className="min-w-0 flex-1 truncate">{p.gap}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
