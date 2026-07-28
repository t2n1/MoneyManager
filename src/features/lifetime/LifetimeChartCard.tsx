// STUB của Task 7 (dàn dựng có chủ ý — không phải code chết bỏ quên). Task 8 điền
// thân hàm vẽ đồ thị (dải dao động + đường chiếu nét đứt + lịch sử thật), xem
// docs/superpowers/plans/2026-07-29-lifetime.md. Component này TRẢ NULL cho tới lúc
// đó — mở /lifetime ở Task 7/8 chưa xong sẽ thấy CHƯA RA ĐỒ THỊ GÌ Ở ĐÂY, đó là chủ ý
// chứ không phải lỗi. Giữ đúng chữ ký props Task 8 đã mô tả để khi điền thân hàm,
// LifetimePage không phải sửa lại chỗ gọi.
import type { CurrencyCode } from '../../lib/currencies'
import type { NetWorthSnapshotRow } from '../../types/database.types'
import type { YearRow } from './project'

interface Props {
  rows: YearRow[]
  historyRows: NetWorthSnapshotRow[]
  currency: CurrencyCode
  compare: YearRow[] | null
}

export function LifetimeChartCard(_props: Props) {
  return null
}
