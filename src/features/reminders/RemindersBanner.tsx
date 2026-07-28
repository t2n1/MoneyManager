import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useNotifications } from '../notifications/useNotifications'

/**
 * Dải nhắc ở đầu trang Sổ giao dịch — CHỈ MỘT DÒNG, chỉ dành cho việc mức đỏ
 * (mục D.3 của spec). Mọi thứ còn lại nằm trong chuông.
 *
 * Không có nút ✕: cái nút đó chính là chỗ người ta bấm cho khuất mắt rồi quên
 * mất là đang thiếu tiền. Nạp tiền / trả nợ là nó tự hết.
 */
export function RemindersBanner() {
  const { actions } = useNotifications()
  const top = actions.find((n) => n.severity === 'high')
  if (!top) return null

  return (
    <Link
      to={top.to}
      className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{top.title}</span>
    </Link>
  )
}
