// STUB của Task 7 (dàn dựng có chủ ý — không phải code chết bỏ quên). Task 11 điền
// thân hàm (bốn khối: kịch bản, chặng đời, sự kiện, "số này ở đâu ra"), xem
// docs/superpowers/plans/2026-07-29-lifetime.md. Component này TRẢ NULL cho tới lúc
// đó, nên nút bút chì ở header và banner cảnh báo tỷ giá ở LifetimePage ĐÃ nối dây tới
// đây (mở state, gọi component này) nhưng BẤM VÀO HIỆN CHƯA RA GÌ — đó là chủ ý chứ
// không phải lỗi, đừng đi tìm nguyên nhân ở Task 7/8/9/10. Giữ đúng chữ ký props Task
// 11 đã mô tả (`<ScenarioEditorSheet scenario phases events onClose />`) để khi điền
// thân hàm, LifetimePage không phải sửa lại chỗ gọi.
import type { LifeEventRow, LifePhaseRow, LifeScenarioRow } from '../../types/database.types'

interface Props {
  scenario: LifeScenarioRow
  phases: LifePhaseRow[]
  events: LifeEventRow[]
  onClose: () => void
}

export function ScenarioEditorSheet(_props: Props) {
  return null
}
