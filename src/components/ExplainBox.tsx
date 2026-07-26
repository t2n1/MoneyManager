// Khối "cách đọc / cách tính" gấp mở được, dùng chung cho các thẻ báo cáo nâng cao.
// Mục đích: thẻ giữ được vẻ gọn, nhưng ai muốn hiểu con số ở đâu ra thì luôn có
// chỗ để mở — không phải đi tra tài liệu ngoài app.
import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

interface Props {
  /** Nhãn nút; mặc định "Cách tính & nên làm gì". */
  label?: string
  children: ReactNode
}

export function ExplainBox({ label = 'Cách tính & nên làm gì', children }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-md text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1 space-y-1.5 rounded-lg bg-gray-50 p-2.5 text-xs leading-relaxed text-gray-600 dark:bg-gray-950 dark:text-gray-400">
          {children}
        </div>
      )}
    </>
  )
}
