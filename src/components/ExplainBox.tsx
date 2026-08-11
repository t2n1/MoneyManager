// Khối "cách đọc / cách tính" gấp mở được, dùng chung cho các thẻ báo cáo nâng cao.
// Mục đích: thẻ giữ được vẻ gọn, nhưng ai muốn hiểu con số ở đâu ra thì luôn có
// chỗ để mở — không phải đi tra tài liệu ngoài app.
//
// Ở chế độ Gọn (src/lib/density.ts) thì KHÔNG hiện gì cả. Đây là định nghĩa của "chữ
// chỉ để dạy": nội dung bên trong luôn là cách tính và nên làm gì, không bao giờ là dữ
// liệu. Ẩn ngay trong component nên 15 thẻ đang gọi không phải sửa từng chỗ.
import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useDensity } from '../hooks/useDensity'

interface Props {
  /** Nhãn nút; mặc định "Cách tính & nên làm gì". */
  label?: string
  children: ReactNode
}

export function ExplainBox({ label = 'Cách tính & nên làm gì', children }: Props) {
  const [open, setOpen] = useState(false)
  const { visual } = useDensity()
  // Sau useState để thứ tự hook không đổi giữa hai chế độ
  if (visual) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-md text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1 space-y-1.5 rounded-lg bg-surface-page p-2.5 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
          {children}
        </div>
      )}
    </>
  )
}
