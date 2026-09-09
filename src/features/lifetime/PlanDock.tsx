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
import { PlanDockEvent, type PlanDockEventProps } from './PlanDockEvent'
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
  /** Dữ liệu cho nhánh `'event'`. */
  event?: PlanDockEventProps
}

export function PlanDock({ sel, summary, phase, event }: Props) {
  if (sel.type === 'phase' && phase) return <PlanDockPhase {...phase} />
  if (sel.type === 'event' && event) return <PlanDockEvent {...event} />
  return <PlanSummaryCard {...summary} />
}
