// Cột dock (24,5rem, LUÔN dựng — xem ConsoleFrame.tsx) — dispatch theo lựa chọn hiện tại
// trên đồ thị. Ba trạng thái (spec §10): không chọn gì → PlanSummaryCard (Task 8) · chọn
// một chặng → PlanDockPhase (Task 9) · chọn một mốc → PlanDockEvent (Task 10).
//
// File này CHỈ dispatch, không biết gì về cách tính bảy hàng của thẻ tóm tắt hay cách sửa
// một chặng/mốc — mỗi nhánh nhận đủ dữ liệu qua prop từ `TuongLaiPage.tsx` và tự vẽ thân
// của mình.
//
// `phase`/`event` là TUỲ CHỌN dù `sel.type` đã nói đang chọn gì: id trong `sel` có thể
// trỏ vào một dòng vừa bị xoá (nút Xoá trong chính panel, hoặc một tab khác vừa ghi), và
// lúc đó trang không dựng nổi bộ prop. Rơi về thẻ tóm tắt thay vì render một panel rỗng —
// cột vẫn đúng bề rộng, và không có nhịp "co giãn cột" nào (spec §5).
import { Card, SectionTitle } from '../../components/ui'
import { PlanDockPhase, type PlanDockPhaseProps } from './PlanDockPhase'
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
  /** Dữ liệu cho nhánh `'phase'`. */
  phase?: PlanDockPhaseProps
}

export function PlanDock({ sel, summary, phase }: Props) {
  if (sel.type === 'phase' && phase) return <PlanDockPhase {...phase} />
  if (sel.type === 'event') {
    // Task 10. Chừa chỗ đúng khuôn dock (Card panel) để không có một nhịp "co giãn cột"
    // nào giữa hai đợt việc — xem PlaceholderRow trong TuongLaiPage.tsx, cùng lý do.
    return (
      <ComingSoonDock
        label="Mốc"
        note="Bảng sửa mốc (Task 10) sẽ nằm ở đây — loại mốc, các trường riêng, nâng cao."
      />
    )
  }
  return <PlanSummaryCard {...summary} />
}

/** Thân tạm cho nhánh chưa tới lượt — CÙNG khuôn Card panel với PlanSummaryCard nên
 *  bề rộng/viền cột dock không đổi giữa ba trạng thái. */
function ComingSoonDock({ label, note }: { label: string; note: string }) {
  return (
    <Card as="section" padding="panel" elevation="panel">
      <SectionTitle role="micro">{label}</SectionTitle>
      <p className="mt-2 text-2xs text-fg-muted">{note}</p>
    </Card>
  )
}
