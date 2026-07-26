// Thẻ "Chi theo nhãn": cộng tiền của những việc CẮT NGANG danh mục — một chuyến
// về VN gồm vé máy bay (Đi lại), quà (Quà tặng), phong bì (Giao tế)… gắn cùng
// một nhãn thì cuối kỳ mới biết cả chuyến tốn bao nhiêu.
import { Link } from 'react-router-dom'
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
}

export function TagBreakdownCard({ data, base, periodNoun, noTags }: Props) {
  const money = (v: number) => formatMoney(Math.round(v), base)
  const max = data.slices[0]?.amount ?? 0

  if (noTags) {
    return (
      <section className="rounded-xl bg-white p-3 shadow-sm dark:bg-gray-900">
        <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
          Chi theo nhãn
        </h2>
        <p className="text-xs text-gray-600 dark:text-gray-300">
          Nhãn dùng để gom những khoản cắt ngang nhiều danh mục — ví dụ “Về VN 2026” gồm vé máy bay,
          quà cáp và phong bì. Tạo nhãn ngay khi nhập giao dịch, hoặc{' '}
          <Link to="/settings/tags" className="font-medium text-green-700 dark:text-green-400">
            quản lý nhãn trong Cài đặt
          </Link>
          .
        </p>
      </section>
    )
  }

  if (data.slices.length === 0) {
    return (
      <section className="rounded-xl bg-white p-3 shadow-sm dark:bg-gray-900">
        <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
          Chi theo nhãn
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Không có khoản chi nào mang nhãn {periodNoun}.
        </p>
      </section>
    )
  }

  const taggedPct = data.total > 0 ? Math.round((data.taggedTotal / data.total) * 100) : 0

  return (
    <section className="rounded-xl bg-white p-3 shadow-sm dark:bg-gray-900">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Chi theo nhãn</h2>
        <span className="shrink-0 text-[11px] text-gray-400 dark:text-gray-500">
          {taggedPct}% chi tiêu có nhãn
        </span>
      </div>

      <ul className="space-y-2">
        {data.slices.map((s) => (
          <li key={s.tagId}>
            <div className="flex items-center justify-between gap-2">
              <span
                className={`min-w-0 truncate rounded-full px-2 py-0.5 text-xs font-medium ${TAG_CHIP_CLASS[tagColor(s.color)]}`}
              >
                {s.name}
              </span>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-gray-800 dark:text-gray-100">
                {money(s.amount)}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className="h-full rounded-full bg-gray-400 dark:bg-gray-500"
                  style={{ width: `${max > 0 ? (s.amount / max) * 100 : 0}%` }}
                />
              </div>
              <span className="w-16 shrink-0 text-right text-[11px] text-gray-400 dark:text-gray-500">
                {s.count} khoản
              </span>
            </div>
          </li>
        ))}
      </ul>

      <ExplainBox label="Cách đọc">
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
