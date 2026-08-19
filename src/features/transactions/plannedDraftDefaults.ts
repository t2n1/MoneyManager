import { initialPlannedDraft, type PlannedDraft } from './plannedFromEntry'
import type { CurrencyCode } from '../../lib/money'

/**
 * Bản khởi tạo `PlannedDraft` cho màn NHẬP — khác `PlannedFormSheet` (nơi
 * `initialPlannedDraft` của Task 9 được viết cho): sheet đó luôn hiện ô ngày ngay
 * khi mở, còn ở màn Nhập người dùng bật "Sẽ chi" rồi có thể bấm Lưu NGAY (chỉ tên là
 * bắt buộc) TRƯỚC KHI chạm vào ô ngày.
 *
 * `initialPlannedDraft()` gieo `dueOn: ''` — đúng cho sheet, nhưng ở đây là một LỖ
 * HỔNG: `firstOfMonth('')` (dùng ở `plannedFromEntry` lúc submit) trả về `'-01'`, một
 * ngày ISO không hợp lệ, nếu người dùng bấm Lưu ở "Khoảng tháng" trước khi chọn
 * tháng nào. Gieo NGAY hôm nay ở đây — đúng mặc định của `PlannedFormSheet` thật
 * (`planned?.due_on ?? toISODate(new Date())`) — thì lỗ hổng không tồn tại: `dueOn`
 * luôn là một ngày ISO thật, ở cả hai `precision`, kể cả khi người dùng chưa từng
 * chạm vào ô ngày.
 *
 * `today` nhận qua tham số (không tự gọi `new Date()` bên trong) để hàm thuần và
 * test được — không cần giả (mock) đồng hồ hệ thống.
 */
export function initialPlannedDraftForEntry(currency: CurrencyCode, today: string): PlannedDraft {
  return { ...initialPlannedDraft(currency), dueOn: today }
}
