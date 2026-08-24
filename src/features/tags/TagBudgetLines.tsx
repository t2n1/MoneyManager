// Danh sách tiến độ trần nhãn — chip nhãn · % · thanh · "đã chi / trần" · "còn/vượt".
//
// Tách khỏi `TagBudgetsCard` khi tab Lịch cần đúng danh sách này trong cột phụ (bản vẽ
// 1a, khối "Chi theo nhãn"). Không chép sang đó vì phần dễ lệch nhất không phải khung
// thẻ mà là BA thứ bên trong: ngưỡng ok/warn/over, bảng màu thanh, và luật "vượt trần
// thì thanh dừng ở 100%". Hai bản chép tay sẽ lệch ở đúng chỗ người đọc so hai màn.
//
// `size` chỉ đổi MẬT ĐỘ, không đổi cách đọc: 'md' là thẻ của tab Ngân sách (thanh 8px,
// chữ 12px), 'panel' là cột phụ 420px của 1a (thanh 6px, chữ 11px — §1.4).
import { Money } from '../../components/ui'
import { STATUS_FILL } from '../../components/ui/statusColors'
import { formatMoney, type CurrencyCode } from '../../lib/money'
import type { BudgetStatus } from '../budgets/progress'
import type { TagBudgetLine } from './budget'
import { TAG_CHIP_CLASS, tagColor } from './colors'

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
  lines: TagBudgetLine[]
  base: CurrencyCode
  size?: 'md' | 'panel'
}

export function TagBudgetLines({ lines, base, size = 'md' }: Props) {
  const panel = size === 'panel'
  return (
    <ul className={panel ? 'flex flex-col gap-2.5' : 'space-y-3'}>
      {lines.map((l) => (
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
            <span className={`shrink-0 text-sm font-semibold ${TEXT[l.status]}`}>
              {Math.round(l.ratio * 100)}%
            </span>
          </div>

          <div
            className={`mt-1 overflow-hidden rounded-full bg-surface-sunken ${panel ? 'h-1.5' : 'h-2'}`}
          >
            <div
              // Vượt trần thì thanh dừng ở 100%: kéo dài ra ngoài khung là vẽ sai,
              // còn vượt bao nhiêu đã nói bằng chữ ngay dưới.
              className={`h-full rounded-full ${BAR[l.status]}`}
              style={{ width: `${Math.min(l.ratio * 100, 100)}%` }}
            />
          </div>

          <div
            className={`mt-0.5 flex justify-between gap-2 text-fg-muted ${panel ? 'text-2xs' : 'text-sm'}`}
          >
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
  )
}
