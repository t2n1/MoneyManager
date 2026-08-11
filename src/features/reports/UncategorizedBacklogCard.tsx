// Bảng "khoản chưa gắn danh mục, tháng cũ nhất trước".
//
// Khuôn lấy từ permtrack: mỗi dòng một tháng, kèm phần trăm đã xong, tháng cũ nhất lên
// đầu, bấm dòng là mở đúng tháng đó. Thứ nó thêm vào app: một việc còn tồn thì phải có
// chỗ NHÌN THẤY nó còn tồn, chứ không nằm im trong sổ.
//
// Ẩn hẳn khi không còn gì — không hiện "đã xong hết" cho một việc người dùng không hỏi.
import { Link } from 'react-router-dom'
import { Guide } from '../../components/Guide'
import { Card } from '../../components/ui'
import { formatMonthLabel, getMonthRange, parseMonthKey } from '../../lib/dates'
import type { MonthBacklogRow } from './uncategorized'

interface Props {
  rows: MonthBacklogRow[]
  /**
   * Số tháng dữ liệu đang xét. Phải nói ra: thẻ chỉ thấy được những tháng đã tải, nên
   * "hết dòng" KHÔNG có nghĩa là cả sổ đã gắn xong.
   */
  monthsWindow: number
}

/** Khoảng ngày của tháng, dạng bao gồm cả hai đầu — đúng thứ trang Tìm kiếm chờ. */
function rangeOf(monthKey: string): { from: string; to: string } {
  const r = getMonthRange(parseMonthKey(monthKey), 1)
  // getMonthRange trả `end` là ngày ĐẦU tháng sau (nửa mở), còn ô "đến ngày" của trang
  // Tìm kiếm là ngày cuối CÙNG được tính — lùi một ngày.
  const to = new Date(r.end)
  to.setDate(to.getDate() - 1)
  return { from: r.start, to: to.toISOString().slice(0, 10) }
}

export function UncategorizedBacklogCard({ rows, monthsWindow }: Props) {
  if (rows.length === 0) return null

  return (
    <Card as="section">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg-muted">Khoản chưa gắn danh mục</h2>
        <span className="shrink-0 text-2xs text-fg-muted">{rows.length} tháng</span>
      </div>

      <ul className="space-y-1.5">
        {rows.map((row) => {
          const { from, to } = rangeOf(row.monthKey)
          const donePct = Math.round(row.doneRatio * 100)
          return (
            <li key={row.monthKey}>
              <Link
                to={`/search?uncat=1&from=${from}&to=${to}`}
                className="block rounded-lg bg-surface-page px-2.5 py-2 active:scale-[0.99]"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-fg-secondary">
                    {formatMonthLabel(parseMonthKey(row.monthKey))}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-fg-primary">
                    còn {row.pending} khoản
                  </span>
                </div>
                {/* Thanh tiến độ có nhãn chữ đi kèm: ai không phân biệt được màu vẫn đọc
                    được phần trăm. */}
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${donePct}%` }} />
                  </div>
                  <span className="shrink-0 text-2xs text-fg-muted">đã gắn {donePct}%</span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>

      <Guide className="mt-2 text-2xs text-fg-muted">
        Xếp tháng cũ nhất lên trước — khoản để lâu thường khó nhớ ra đã tiêu vào việc gì. Bấm một
        dòng để mở đúng tháng đó, đã lọc sẵn. Chỉ xét {monthsWindow} tháng gần nhất.
      </Guide>
    </Card>
  )
}
