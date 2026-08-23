// Thứ tự các mốc trên dải "Mốc cuộc đời" (TimelineStrip.tsx) — thuần, không JSX.
//
// Ở file riêng chứ không nằm trong component: quy ước của repo là toán/luật đứng ngoài
// React để có phép thử riêng, và fast refresh chỉ chạy khi một file .tsx chỉ xuất
// component (oxlint react(only-export-components) bắt đúng chỗ này).
import type { LifeEventRow, LifePhaseRow } from '../../types/database.types'

/** Một mốc trên dải, đã gộp hai loại về chung một hình dạng để sắp theo năm. */
export type Marker =
  | { year: number; kind: 'phase'; phase: LifePhaseRow }
  | { year: number; kind: 'event'; event: LifeEventRow }

/**
 * Gộp chặng + sự kiện, sắp theo NĂM.
 *
 * Cùng năm thì CHẶNG đứng trước: chặng là thứ bắt đầu năm đó (đổi nước, đổi việc), sự
 * kiện là khoản tiền xảy ra trong lòng nó. Đọc ngược lại thì dải kể chuyện sai thứ tự.
 *
 * Sự kiện sắp theo `start_year`, không theo `end_year`: đó là năm nó XUẤT HIỆN, và cũng
 * đúng năm mà đồ thị vẽ vạch mốc (xem `newEventLabelsByYear` trong LifetimeChartCard).
 *
 * Tự sắp chứ không tin thứ tự mảng đầu vào: `getLifePhases()`/`getLifeEvents()` không
 * hứa thứ tự nào và `demoRepo` không có `order by` — cùng cái bẫy đã ghi ở `pickActive`
 * (buildInput.ts), nơi một luật tưởng là của tầng dữ liệu hoá ra không có ai canh.
 */
export function buildMarkers(phases: LifePhaseRow[], events: LifeEventRow[]): Marker[] {
  const out: Marker[] = [
    ...phases.map((p): Marker => ({ year: p.start_year, kind: 'phase', phase: p })),
    ...events.map((e): Marker => ({ year: e.start_year, kind: 'event', event: e })),
  ]
  return out.sort((a, b) => a.year - b.year || (a.kind === 'phase' ? -1 : 1))
}
