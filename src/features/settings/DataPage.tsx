import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, FileUp } from 'lucide-react'
import { BackupSection } from './BackupSection'

export function DataPage() {
  return (
    <div className="flex flex-col gap-4 p-3 lg:p-6">
      <div className="flex items-center gap-2">
        <Link
          to="/settings"
          className="rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 text-lg shadow-sm active:scale-95"
          aria-label="Quay lại"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-lg font-bold text-gray-800 dark:text-gray-100">
          Dữ liệu &amp; sao lưu
        </h1>
      </div>

      {/* Khối A (Xuất CSV/PDF) sẽ thêm ở Task 2 */}

      <BackupSection />

      <section className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-900">
        <h2 className="px-3 pt-3 text-sm font-semibold text-gray-500 dark:text-gray-400">
          Nhập dữ liệu
        </h2>
        <div className="mt-1">
          <Link
            to="/settings/import"
            className="flex items-center gap-3 px-3 py-3 text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            <FileUp className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <span className="flex-1">Nhập giao dịch từ CSV</span>
            <ChevronRight className="h-5 w-5 text-gray-300 dark:text-gray-600" />
          </Link>
        </div>
      </section>
    </div>
  )
}
