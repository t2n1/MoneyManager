import { Link } from 'react-router-dom'
import { AlertTriangle, Bell, Settings2, X } from 'lucide-react'
import type { AppNotification } from './types'

interface Props {
  actions: AppNotification[]
  infos: AppNotification[]
  hiddenCount: number
  readKeys: Set<string>
  onDismiss: (key: string) => void
  onClose: () => void
}

function Row({
  n,
  read,
  onDismiss,
  onClose,
}: {
  n: AppNotification
  read: boolean
  onDismiss?: () => void
  onClose: () => void
}) {
  const tone =
    n.severity === 'high'
      ? 'bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-900'
      : n.severity === 'medium'
        ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900'
        : 'bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700'

  return (
    <div className={`flex gap-2 rounded-lg border px-3 py-2 ${tone} ${read ? 'opacity-50' : ''}`}>
      {n.severity === 'high' ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
      ) : (
        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
      )}
      <Link to={n.to} onClick={onClose} className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{n.title}</p>
        {n.detail && (
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">{n.detail}</p>
        )}
      </Link>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Bỏ qua tin này"
          className="shrink-0 self-start rounded p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

/**
 * Nội dung tấm trượt. Việc-cần-làm KHÔNG có nút ✕ — nạp tiền/trả nợ/hết tháng thì
 * nó tự biến mất. Muốn khỏi thấy hẳn thì tắt cả loại trong cài đặt (mục D.2 spec).
 */
export function NotificationSheet({
  actions,
  infos,
  hiddenCount,
  readKeys,
  onDismiss,
  onClose,
}: Props) {
  const empty = actions.length === 0 && infos.length === 0

  return (
    <div className="flex max-h-[70vh] flex-col">
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">Thông báo</h2>
        {actions.length > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {actions.length} việc cần làm
          </span>
        )}
        <Link
          to="/settings/notifications"
          onClick={onClose}
          aria-label="Cài đặt thông báo"
          className="ml-auto rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <Settings2 className="h-4 w-4" />
        </Link>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto px-1 pb-1">
        {empty && (
          <p className="rounded-lg bg-green-50 py-3 text-center text-sm font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-400">
            Không có gì cần để ý 👍
          </p>
        )}

        {actions.length > 0 && (
          <p className="pt-1 text-[0.625rem] font-bold uppercase tracking-wide text-gray-400">
            Việc cần làm
          </p>
        )}
        {actions.map((n) => (
          <Row key={n.key} n={n} read={readKeys.has(n.key)} onClose={onClose} />
        ))}

        {infos.length > 0 && (
          <p className="pt-2 text-[0.625rem] font-bold uppercase tracking-wide text-gray-400">
            Tin để biết
          </p>
        )}
        {infos.map((n) => (
          <Row
            key={n.key}
            n={n}
            read={false}
            onDismiss={() => onDismiss(n.key)}
            onClose={onClose}
          />
        ))}

        {hiddenCount > 0 && (
          <p className="py-2 text-center text-xs text-gray-500 dark:text-gray-400">
            Còn {hiddenCount} tin khác — xử lý bớt rồi sẽ hiện tiếp
          </p>
        )}
      </div>
    </div>
  )
}
