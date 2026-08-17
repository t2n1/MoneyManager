// "Việc cần làm" — khối ĐẦU TIÊN của Bản tin (§4.9 / bản vẽ 16a).
//
// ⚠️ Đây KHÔNG phải một engine mới. App đã có bộ luật sinh việc xuyên app
// (`features/notifications/rules/`) với đúng những thứ khó nhất: mã ổn định (một việc
// chỉ báo một lần), chống nói hai lần một ý (vượt trần rồi thì thôi báo nhịp), ngưỡng
// chống nhiễu (mục vặt dưới 5% tổng ngân sách không báo), và gộp dòng khi nhiều khoản
// cùng loại. Khối này chỉ ĐỌC RA và bày lại.
//
// Đừng tính lại bất cứ điều kiện nào ở đây. Muốn thêm một loại việc → viết một rule
// thuần trong `rules/`, nơi nó test được và chạy được cả trên edge function.
//
// Ba thứ khối này tôn trọng vì chúng đã nằm sẵn trong `useNotifications`:
//   · trần 5 việc (ACTION_LIMIT) và thứ hạng theo severity;
//   · cờ bật/tắt TỪNG LOẠI ở Cài đặt → Thông báo (arrangeNotifications lọc offTypes) —
//     người đã tắt một loại mà vẫn bị nhắc ở đây sẽ coi đó là lỗi;
//   · trạng thái đã ẩn của từng việc.
import { Link } from 'react-router-dom'
import { Check, ChevronRight } from 'lucide-react'
import { Card, StatusDot, iconButtonClass } from '../../components/ui'
import type { AppNotification, NotificationSeverity } from '../notifications/types'

const TONE: Record<NotificationSeverity, 'bad' | 'warn' | 'info'> = {
  high: 'bad',
  medium: 'warn',
  low: 'info',
}

const TONE_LABEL: Record<NotificationSeverity, string> = {
  high: 'Gấp',
  medium: 'Nên làm sớm',
  low: 'Khi rảnh',
}

interface Props {
  items: AppNotification[]
  /** Ẩn một việc. Bộ luật sinh lại nó khi tình huống tái diễn — xem state.ts. */
  onDismiss: (key: string) => void
}

export function TodoPanel({ items, onDismiss }: Props) {
  // Không có việc gì KHÔNG phải là trạng thái rỗng đáng vẽ một khối trống: khối này
  // biến mất hẳn, và Bản tin bắt đầu thẳng bằng câu kết luận. Một tấm thẻ ghi "không
  // có việc nào" mỗi ngày cũng là một dòng phải đọc.
  if (items.length === 0) return null

  return (
    <Card elevation="panel" padding="panel" as="section">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[0.8125rem] font-semibold text-fg-primary">
          Việc cần làm ({items.length})
        </h2>
        <Link to="/settings/notifications" className="text-2xs text-fg-muted hover:underline">
          Chọn loại nhắc
        </Link>
      </div>

      <ul className="mt-2 divide-y divide-border-subtle">
        {items.map((n) => (
          <li key={n.key} className="flex items-center gap-2">
            <Link to={n.to} className="flex min-w-0 flex-1 items-center gap-2.5 py-2">
              <StatusDot tone={TONE[n.severity]} label={TONE_LABEL[n.severity]} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] text-fg-primary">{n.title}</span>
                {n.detail && (
                  <span className="block truncate text-2xs text-fg-muted">{n.detail}</span>
                )}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
            </Link>
            {/* Nút ẩn tách khỏi vùng bấm chính: cả dòng là "đi làm việc này", riêng nút
                này là "thôi, đừng nhắc nữa". Gộp vào một chỗ bấm thì lỡ tay là mất việc. */}
            <button
              type="button"
              onClick={() => onDismiss(n.key)}
              aria-label={`Ẩn: ${n.title}`}
              title="Ẩn việc này"
              className={iconButtonClass('ghost', 'shrink-0')}
            >
              <Check className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
