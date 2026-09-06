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
      // Viền cùng tông (redesign 2): ở dark nền banner chỉ hơn nền trang ~1,2:1 nên
      // viền mới là thứ vẽ ra hình cái banner. "Xem →" nói thẳng đây là chỗ bấm được —
      // trước đây cả dải trông như một dòng trạng thái tĩnh.
      className="mb-3 flex items-center gap-2.5 rounded-xl border border-state-bad-border bg-state-bad-bg px-3.5 py-2.5 text-sm font-medium text-state-bad-fg hover:bg-red-100 dark:hover:bg-red-900/50"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      {/* 2 dòng chứ không cắt ở 1. Lý do ban đầu là câu của `budget-parent-over`
          ("… chủ yếu do A và B") — nhưng loại đó đã xuống 'medium' nên không còn vào
          dải này nữa. Vẫn giữ 2 dòng: câu dài nhất trong nhóm đỏ bây giờ là của
          Quyền lợi, lấy thẳng `ketLuan.viec` (vd "Còn 2 năm cũ đủ điều kiện nộp
          還付申告, hạn 31/12"). Cắt một dòng trên điện thoại là mất đúng nửa sau. */}
      <span className="min-w-0 flex-1 line-clamp-2">{top.title}</span>
      <span className="shrink-0 text-2xs font-semibold">Xem →</span>
    </Link>
  )
}
