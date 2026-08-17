// Khối "cách đọc / cách tính" gấp mở được, dùng chung cho các thẻ báo cáo nâng cao.
// Mục đích: thẻ giữ được vẻ gọn, nhưng ai muốn hiểu con số ở đâu ra thì luôn có
// chỗ để mở — không phải đi tra tài liệu ngoài app.
//
// Ở chế độ Gọn (src/lib/density.ts) thì KHÔNG hiện gì cả. Đây là định nghĩa của "chữ
// chỉ để dạy": nội dung bên trong luôn là cách tính và nên làm gì, không bao giờ là dữ
// liệu. Ẩn ngay trong component nên 15 thẻ đang gọi không phải sửa từng chỗ.
import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useDensity } from '../hooks/useDensity'
import { Collapse } from './ui'

interface Props {
  /** Nhãn nút; mặc định "Cách tính & nên làm gì". */
  label?: string
  children: ReactNode
}

export function ExplainBox({ label = 'Cách tính & nên làm gì', children }: Props) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const { visual } = useDensity()
  // Sau useState để thứ tự hook không đổi giữa hai chế độ
  if (visual) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-md text-xs font-medium text-fg-muted hover:text-fg-secondary"
      >
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {/* Lề trên nằm ở lớp NỘI DUNG, không ở lớp lưới: đặt ngoài thì lúc đóng vẫn còn
          8px trống dưới nút, và cả 15 thẻ đang gọi đều hở thêm một khoảng vô cớ. */}
      <Collapse
        open={open}
        id={bodyId}
        className="text-xs leading-relaxed text-fg-muted"
      >
        <div className="mt-1 space-y-1.5 rounded-lg bg-surface-page p-2.5">{children}</div>
      </Collapse>
    </>
  )
}
