// Nút quay lại dùng chung cho mọi trang con.
//
// Vì sao không để mỗi trang tự viết một <Link> tới trang cha: đường cứng đó là cha trong
// SƠ ĐỒ MENU, không phải trang người dùng vừa rời. Nhãn mở từ tab Ngân sách mà bấm quay
// lại thì rơi sang Cài đặt. Xem src/lib/appHistory.ts.
//
// Vẫn render ra <Link> thật chứ không phải <button>: chuột phải "mở tab mới", Ctrl+bấm,
// và thanh trạng thái hiện đích — những thứ của thẻ <a> — đều còn dùng được, với đích là
// `to`. Bấm thường thì mới chặn lại để lùi lịch sử.
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { hasAppHistory } from '../lib/appHistory'
import { iconButtonClass } from './ui/IconButton'

interface Props {
  /** Đích khi KHÔNG lùi được: mở thẳng link, bấm thông báo, hoặc tab mới. */
  to: string
  /** Bắt buộc — nút thường chỉ có mũi tên, trình đọc màn hình không có chữ nào. */
  'aria-label': string
  className?: string
  /** Mặc định là mũi tên trái; truyền vào khi cần thêm chữ ("Đóng"). */
  children?: ReactNode
}

export function BackLink({ to, className, children, ...rest }: Props) {
  const navigate = useNavigate()

  return (
    <Link
      {...rest}
      to={to}
      className={className ?? iconButtonClass()}
      onClick={(e) => {
        // Bấm có phím bổ trợ / chuột giữa = người dùng muốn mở tab mới. <Link> tự biết
        // buông tay ở những ca này, nhưng onClick của ta chạy TRƯỚC nó nên phải tự xét.
        if (e.defaultPrevented) return
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        if (!hasAppHistory(window.history.state)) return
        e.preventDefault()
        navigate(-1)
      }}
    >
      {children ?? <ChevronLeft className="h-5 w-5" />}
    </Link>
  )
}
