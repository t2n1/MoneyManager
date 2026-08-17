// Thẻ "Chi theo nhãn": cộng tiền của những việc CẮT NGANG danh mục — một chuyến
// về VN gồm vé máy bay (Đi lại), quà (Quà tặng), phong bì (Giao tế)… gắn cùng
// một nhãn thì cuối kỳ mới biết cả chuyến tốn bao nhiêu.
import { Link } from 'react-router-dom'
import { Guide } from '../../components/Guide'
import { useDensity } from '../../hooks/useDensity'
import { ChevronRight } from 'lucide-react'
import { ExplainBox } from '../../components/ExplainBox'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import { TAG_CHIP_CLASS, tagColor } from '../tags/colors'
import type { TagBreakdown } from '../tags/aggregate'

interface Props {
  data: TagBreakdown
  base: CurrencyCode
  periodNoun: string
  /** true = người dùng chưa tạo nhãn nào (hiện lời mời thay vì thẻ rỗng) */
  noTags: boolean
  /** đầu kỳ đang xem (ISO) — để bấm vào nhãn là xem được đúng những khoản đó */
  rangeFrom: string
  /** cuối kỳ đang xem (ISO, BAO GỒM ngày này) */
  rangeTo: string
}

export function TagBreakdownCard({
  data,
  base,
  periodNoun,
  noTags,
  rangeFrom,
  rangeTo,
}: Props) {
  const { visual } = useDensity()
  const money = (v: number) => formatMoney(Math.round(v), base)
  const max = data.slices[0]?.amount ?? 0

  if (noTags) {
    // Chưa có nhãn nào thì cả thẻ này CHỈ là lời mời — không có số nào để xem. Ở chế độ
    // Gọn mà chỉ ẩn đoạn chữ thì còn lại một thẻ trắng đúng một dòng tiêu đề, tức là
    // vẫn chiếm chỗ mà không nói gì. Bỏ hẳn cả thẻ. Bật Đầy đủ là lời mời quay lại.
    if (visual) return null
    return (
      <section className="rounded-xl bg-surface p-3 shadow-sm ">
        <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
          Chi theo nhãn
        </h2>
        <Guide className="text-xs text-fg-secondary">
          Nhãn dùng để gom những khoản cắt ngang nhiều danh mục — ví dụ “Về VN 2026” gồm vé máy bay,
          quà cáp và phong bì. Tạo nhãn ngay khi nhập giao dịch, hoặc{' '}
          <Link to="/settings/tags" className="font-medium text-fg-accent">
            quản lý nhãn trong Cài đặt
          </Link>
          .
        </Guide>
      </section>
    )
  }

  if (data.slices.length === 0) {
    return (
      <section className="rounded-xl bg-surface p-3 shadow-sm ">
        <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
          Chi theo nhãn
        </h2>
        <p className="text-xs text-fg-muted">
          Không có khoản chi nào mang nhãn {periodNoun}.
        </p>
      </section>
    )
  }

  const taggedPct = data.total > 0 ? Math.round((data.taggedTotal / data.total) * 100) : 0

  return (
    <section className="rounded-xl bg-surface p-3 shadow-sm ">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Chi theo nhãn</h2>
        <span className="shrink-0 text-2xs text-fg-muted">
          {taggedPct}% chi tiêu có nhãn
        </span>
      </div>

      <ul className="space-y-2">
        {data.slices.map((s) => (
          <li key={s.tagId}>
            <Link
              to={`/search?tags=${encodeURIComponent(s.tagId)}&from=${rangeFrom}&to=${rangeTo}`}
              aria-label={`Xem ${s.count} khoản mang nhãn ${s.name}`}
              className="block rounded-lg py-1 transition active:scale-[0.99] hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`min-w-0 truncate rounded-full px-2 py-0.5 text-xs font-medium ${TAG_CHIP_CLASS[tagColor(s.color)]}`}
                >
                  {s.name}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-fg-primary">
                  {money(s.amount)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className="h-full rounded-full bg-gray-400 dark:bg-gray-500"
                    style={{ width: `${max > 0 ? (s.amount / max) * 100 : 0}%` }}
                  />
                </div>
                <span className="flex w-24 shrink-0 items-center justify-end gap-0.5 text-2xs text-fg-muted">
                  {s.count} khoản
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <ExplainBox label="Cách đọc">
        <p>Bấm vào một nhãn để xem đúng những khoản đã tạo nên con số đó.</p>
        <p>
          Một giao dịch có thể mang NHIỀU nhãn, nên tổng các nhãn có thể lớn hơn tổng chi — đây
          không phải cơ cấu chia phần trăm như danh mục.
        </p>
        <p>
          Khoản hoàn tiền có cùng nhãn sẽ được trừ ra, nên con số là chi phí ròng thật của việc đó.
        </p>
      </ExplainBox>
    </section>
  )
}
