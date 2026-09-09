// Cột dock (24,5rem, LUÔN dựng — xem ConsoleFrame.tsx) — dispatch theo lựa chọn hiện tại
// trên đồ thị. Ba trạng thái (spec §10): không chọn gì → PlanSummaryCard (Task 8, xong ở
// đây) · chọn một chặng → PlanDockPhase (Task 9) · chọn một mốc → PlanDockEvent (Task 10).
//
// File này CHỈ dispatch, không biết gì về cách tính bảy hàng của thẻ tóm tắt hay cách sửa
// một chặng/mốc — mỗi nhánh nhận đủ dữ liệu qua prop từ `TuongLaiPage.tsx` và tự vẽ thân
// của mình. Việc thêm 'phase'/'event' ở Task 9/10 là THÊM một case, không phải viết lại
// component này.
import { Card, SectionTitle } from '../../components/ui'
import { PlanSummaryCard, type PlanSummaryCardProps } from './PlanSummaryCard'

export type DockSelectionType = 'none' | 'phase' | 'event'

export interface DockSelection {
  type: DockSelectionType
  id?: string
}

interface Props {
  sel: DockSelection
  /** Dữ liệu cho nhánh `'none'` — bảy hàng của PlanSummaryCard. */
  summary: PlanSummaryCardProps
}

export function PlanDock({ sel, summary }: Props) {
  switch (sel.type) {
    case 'phase':
      // Task 9. Chừa chỗ đúng khuôn dock (Card panel) để không có một nhịp "co giãn cột"
      // nào giữa hai đợt việc — xem PlaceholderRow trong TuongLaiPage.tsx, cùng lý do.
      return (
        <ComingSoonDock
          label="Chặng đời"
          note="Bảng sửa chặng (Task 9) sẽ nằm ở đây — thu/năm, chi/năm, tiền tệ, quốc gia."
        />
      )
    case 'event':
      return (
        <ComingSoonDock
          label="Mốc"
          note="Bảng sửa mốc (Task 10) sẽ nằm ở đây — loại mốc, các trường riêng, nâng cao."
        />
      )
    case 'none':
    default:
      return <PlanSummaryCard {...summary} />
  }
}

/** Thân tạm cho hai nhánh chưa tới lượt — CÙNG khuôn Card panel với PlanSummaryCard nên
 *  bề rộng/viền cột dock không đổi giữa ba trạng thái. */
function ComingSoonDock({ label, note }: { label: string; note: string }) {
  return (
    <Card as="section" padding="panel" elevation="panel">
      <SectionTitle role="micro">{label}</SectionTitle>
      <p className="mt-2 text-2xs text-fg-muted">{note}</p>
    </Card>
  )
}
