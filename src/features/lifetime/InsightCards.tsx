// STUB của Task 7 (dàn dựng có chủ ý — không phải code chết bỏ quên). Task 9 điền
// thân hàm (lưới 2×2: nhánh xấu âm từ, lợi suất tối thiểu, tài sản lúc N tuổi, tự do
// tài chính), xem docs/superpowers/plans/2026-07-29-lifetime.md. Component này TRẢ
// NULL cho tới lúc đó — mở /lifetime ở Task 7/8/9 chưa xong sẽ thấy CHƯA RA THẺ NÀO Ở
// ĐÂY, đó là chủ ý chứ không phải lỗi. Giữ đúng chữ ký props Task 9 đã mô tả để khi
// điền thân hàm, LifetimePage không phải sửa lại chỗ gọi.
import type { CurrencyCode } from '../../lib/currencies'
import type { LifetimeInput, YearRow } from './project'

interface Props {
  rows: YearRow[]
  input: LifetimeInput
  birthYear: number
  currency: CurrencyCode
}

export function InsightCards(_props: Props) {
  return null
}
