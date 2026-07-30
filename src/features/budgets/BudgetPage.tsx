// Trang Ngân sách — tab riêng ở nav (trước đây là tab con `?view=budget` của Báo cáo).
// Tách ra vì ngân sách là công cụ ĐIỀU KHIỂN trong tháng (đặt hạn mức, xem còn bao nhiêu),
// khác hẳn Báo cáo là NHÌN LẠI. Xem docs/information-architecture.md §2.2.
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from '../../components/ui'
import { useProfile } from '../../hooks/queries'
import {
  addMonths,
  formatMonthLabel,
  monthKeyForDate,
  toISODate,
  type MonthKey,
} from '../../lib/dates'
import { BudgetView } from './BudgetView'

/** Đọc 'YYYY-MM' thành MonthKey; null nếu không hợp lệ. Giống Báo cáo để link `?ym=`
 *  cũ (kể cả link chuyển tiếp từ `/reports?view=budget&ym=…`) vẫn mở đúng tháng. */
function parseYm(s: string | null): MonthKey | null {
  if (!s) return null
  const [y, m] = s.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return null
  return { year: y, month: m }
}

export function BudgetPage() {
  const [searchParams] = useSearchParams()
  // null = "kỳ hiện tại": tính lazy theo month_start_day (profile tải async, khởi tạo
  // cứng trong useState sẽ chốt nhầm kỳ với ngày bắt đầu ≠ 1)
  const [monthKey, setMonthKey] = useState<MonthKey | null>(() => parseYm(searchParams.get('ym')))
  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const activeMonthKey = monthKey ?? monthKeyForDate(toISODate(new Date()), monthStartDay)

  return (
    <div className="flex flex-col gap-4 p-3 lg:p-6">
      {/* Header điều hướng tháng — trước đây dùng chung với Báo cáo, nay của riêng trang này */}
      <div className="flex items-center justify-between">
        <IconButton
          onClick={() => setMonthKey((k) => addMonths(k ?? activeMonthKey, -1))}
          aria-label="Tháng trước"
        >
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
        <h1 className="text-lg font-bold text-fg-primary">{formatMonthLabel(activeMonthKey)}</h1>
        <IconButton
          onClick={() => setMonthKey((k) => addMonths(k ?? activeMonthKey, 1))}
          aria-label="Tháng sau"
        >
          <ChevronRight className="h-5 w-5" />
        </IconButton>
      </div>

      <BudgetView monthKey={activeMonthKey} />
    </div>
  )
}
