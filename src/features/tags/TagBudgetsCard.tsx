// Khối "Ngân sách theo nhãn" ở tab Ngân sách.
//
// Dùng chung khuôn với danh sách hạn mức danh mục ngay bên dưới (tên · % · thanh
// tiến độ · số tiền / trần) để mắt không phải học lại cách đọc — chỉ khác một chữ
// nhỏ nói kỳ của trần, vì đó mới là thứ phân biệt hai khối.
import { Link } from 'react-router-dom'
import { Guide } from '../../components/Guide'
import { Card, Money } from '../../components/ui'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { BudgetStatus } from '../budgets/progress'
import type { TagBudgetReport } from './budget'
import { TAG_CHIP_CLASS, tagColor } from './colors'
import { STATUS_FILL } from '../../components/ui/statusColors'

const BAR: Record<BudgetStatus, string> = {
  ok: STATUS_FILL.good,
  warn: STATUS_FILL.warn,
  over: STATUS_FILL.bad,
}
const TEXT: Record<BudgetStatus, string> = {
  ok: 'text-fg-primary',
  warn: 'text-fg-warn',
  over: 'text-money-out',
}

interface Props {
  data: TagBudgetReport
  base: CurrencyCode
}

export function TagBudgetsCard({ data, base }: Props) {
  if (data.lines.length === 0) return null

  return (
    <Card as="section">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg-muted">Ngân sách theo nhãn</h2>
        {/* -my-3 để vùng chạm 44px không đẩy hàng tiêu đề giãn ra — cùng mẹo với
            "Đổi mốc" ở AxisTargetsCard. Để trần thì đo được 41×16, không bấm nổi. */}
        <Link
          to="/settings/tags"
          className="-my-3 inline-flex min-h-11 shrink-0 items-center text-2xs font-medium text-fg-accent"
        >
          Đổi trần
        </Link>
      </div>

      <ul className="space-y-3">
        {data.lines.map((l) => (
          <li key={l.tagId}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium ${TAG_CHIP_CLASS[tagColor(l.color)]}`}
                >
                  {l.name}
                </span>
                <span className="shrink-0 text-2xs text-fg-muted">
                  {l.period === 'monthly' ? 'tháng này' : 'cả đợt'}
                </span>
              </span>
              <span className={`shrink-0 text-xs font-semibold ${TEXT[l.status]}`}>
                {Math.round(l.ratio * 100)}%
              </span>
            </div>

            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-sunken">
              <div
                // Vượt trần thì thanh dừng ở 100%: kéo dài ra ngoài khung là vẽ sai,
                // còn vượt bao nhiêu đã nói bằng chữ ngay dưới.
                className={`h-full rounded-full ${BAR[l.status]}`}
                style={{ width: `${Math.min(l.ratio * 100, 100)}%` }}
              />
            </div>

            <div className="mt-0.5 flex justify-between gap-2 text-xs text-fg-muted">
              <span>
                <Money
                  amount={Math.round(l.spent)}
                  currency={base}
                  tone={l.status === 'over' ? 'out' : 'neutral'}
                />
                {' / '}
                {formatMoney(l.budget, base)}
              </span>
              <span className={l.status === 'over' ? 'text-money-out' : ''}>
                {l.status === 'over' ? 'vượt ' : 'còn '}
                {formatMoney(Math.abs(Math.round(l.remaining)), base)}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {data.hasMissingRate && (
        <p className="mt-2 text-2xs text-fg-muted">
          Thiếu tỷ giá cho vài khoản ngoại tệ nên tổng đang tính thiếu.
        </p>
      )}

      {/* Nhãn chồng nhau được: một khoản mang hai nhãn thì cả hai đều tính đủ khoản
          đó. Không nói ra thì người dùng cộng các dòng lại rồi thấy nhiều hơn tổng
          chi và tưởng app sai. */}
      <Guide className="mt-2 text-2xs text-fg-muted">
        Một khoản mang nhiều nhãn được tính đủ cho từng nhãn, nên các dòng ở đây cộng
        lại có thể lớn hơn tổng chi.
      </Guide>
    </Card>
  )
}
