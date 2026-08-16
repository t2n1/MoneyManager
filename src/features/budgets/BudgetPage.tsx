// Trang Ngân sách — tab riêng ở nav (trước đây là tab con `?view=budget` của Báo cáo).
// Tách ra vì ngân sách là công cụ ĐIỀU KHIỂN trong tháng (đặt hạn mức, xem còn bao nhiêu),
// khác hẳn Báo cáo là NHÌN LẠI. Xem docs/information-architecture.md §2.2.
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from '../../components/ui'
import { useProfile } from '../../hooks/queries'
import { useMonthKey } from '../../hooks/useMonthKey'
import { formatMonthLabel, getMonthRange, toISODate } from '../../lib/dates'
import { BudgetView } from './BudgetView'
import { isPlanningMonth } from './planning'
import { PlanningView } from './PlanningView'

export function BudgetPage() {
  // Kỳ đang xem là state DÙNG CHUNG cả app (src/hooks/useMonthKey) chứ không còn của
  // riêng trang: bộ đổi tháng trên top bar đứng ngoài trang, và bấm từ Sổ sang đây phải
  // giữ nguyên tháng đang xem. Đường vào `?ym=` vẫn còn — provider đọc nó.
  const { activeMonthKey, stepMonth } = useMonthKey()
  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const todayISO = toISODate(new Date())

  // Hai mặt của cùng một trang: tháng chưa bắt đầu thì LẬP kế hoạch, tháng đã bắt đầu
  // thì THEO DÕI. Chuyển tự động theo tháng đang đứng — xem `isPlanningMonth`.
  const planning = isPlanningMonth(
    getMonthRange(activeMonthKey, monthStartDay).start,
    todayISO,
  )

  return (
    <div className="flex flex-col gap-4 p-3 lg:p-6">
      {/* Tiêu đề tài liệu. sr-only vì tên màn đã hiện ở top bar (desktop) — nhưng top
          bar là <p>, nên không có dòng này thì trang KHÔNG có <h1> nào. Trước bản 1a,
          h1 của trang là nhãn tháng; nhãn tháng là "đang xem kỳ nào", không phải tên
          màn, nên nó thành <p> ở dưới. */}
      <h1 className="sr-only">Ngân sách</h1>
      {/* Header điều hướng tháng — chỉ còn ở mobile. Từ bản 1a, desktop đổi tháng bằng
          bộ ‹ › trên top bar; để cả hai cùng hiện là hai bộ điều khiển giống hệt nhau
          cách nhau 60px trên cùng một màn. Bản vẽ mobile (17a) thì mỗi màn tự mang
          tiêu đề của nó, đúng cái header này. */}
      <div className="flex items-center justify-between lg:hidden">
        <IconButton onClick={() => stepMonth(-1)} aria-label="Tháng trước">
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
        <p aria-live="polite" className="text-lg font-bold text-fg-primary">
          {formatMonthLabel(activeMonthKey)}
        </p>
        <IconButton onClick={() => stepMonth(1)} aria-label="Tháng sau">
          <ChevronRight className="h-5 w-5" />
        </IconButton>
      </div>

      {planning ? (
        <PlanningView monthKey={activeMonthKey} />
      ) : (
        <BudgetView monthKey={activeMonthKey} />
      )}
    </div>
  )
}
