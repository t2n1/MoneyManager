// Trang Ngân sách — tab riêng ở nav (trước đây là tab con `?view=budget` của Báo cáo).
// Tách ra vì ngân sách là công cụ ĐIỀU KHIỂN trong tháng (đặt hạn mức, xem còn bao nhiêu),
// khác hẳn Báo cáo là NHÌN LẠI. Xem docs/information-architecture.md §2.2.
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton, PageHeader } from '../../components/ui'
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
      {/* Trước 2026-08-25 màn này KHÔNG có tiêu đề nhìn thấy được — chỉ một bộ đổi tháng
          canh giữa, và h1 thì sr-only. Đúng cái người dùng chỉ ra: "cái thì có tiêu đề to
          góc trái, cái thì không". Nay tên màn đứng bên trái như 24 màn còn lại, bộ đổi
          tháng dồn sang phải.
          Vẫn chỉ có ở mobile: từ bản 1a desktop đổi tháng bằng bộ ‹ › trên top bar; để cả
          hai cùng hiện là hai bộ điều khiển giống hệt nhau cách nhau 60px trên một màn. */}
      <PageHeader title="Ngân sách" flush mobileOnly>
        <div className="ml-auto flex items-center gap-1">
          <IconButton onClick={() => stepMonth(-1)} aria-label="Tháng trước">
            <ChevronLeft className="h-5 w-5" />
          </IconButton>
          <p aria-live="polite" className="font-mono text-sm text-fg-muted">
            {formatMonthLabel(activeMonthKey)}
          </p>
          <IconButton onClick={() => stepMonth(1)} aria-label="Tháng sau">
            <ChevronRight className="h-5 w-5" />
          </IconButton>
        </div>
      </PageHeader>

      {planning ? (
        <PlanningView monthKey={activeMonthKey} />
      ) : (
        <BudgetView monthKey={activeMonthKey} />
      )}
    </div>
  )
}
