import { firstOfMonth, initialPlannedDraft, type PlannedDraft } from './plannedFromEntry'
import type { CurrencyCode } from '../../lib/money'
import type { DuePrecision } from '../../types/database.types'

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

/**
 * MỘT cơ chế neo `dueOn` cho cả hai nơi `PlannedFields` cần neo: nút đổi "Chắc tới
 * đâu" (raw = `dueOn` hiện có, không có gì mới gõ) và ô ngày (raw = giá trị mới của
 * input — có thể RỖNG nếu người dùng xoá trắng bằng backspace hay nút xoá của
 * trình duyệt).
 *
 * `raw` rỗng → rơi về `previous` (giá trị TRƯỚC sự kiện này) thay vì để lọt `''`
 * hoặc, ở precision 'month', `firstOfMonth('') === '-01'` — một ngày ISO không hợp
 * lệ — xuống payload. Bug này lọt qua ở vòng đầu vì hai nơi neo từng là hai bản
 * chép tay khác cơ chế (một gọi `firstOfMonth`, một tự nối `-01`), và không có test
 * nào phủ đường "xoá trắng rồi lưu ngay" — chỉ có test dựng `PlannedDraft` bằng tay
 * rồi gọi `plannedFromEntry`, tức chỉ phủ neo lúc SUBMIT (Task 9), không phủ neo lúc
 * ĐỔI (Task 10).
 *
 * Idempotent ở precision 'month': neo một ngày ĐÃ neo (`'2026-10-01'`) vẫn ra đúng
 * nó — `firstOfMonth` chỉ cắt 7 ký tự đầu rồi nối `'-01'`, không quan tâm ngày cũ là
 * bao nhiêu.
 */
export function anchoredDueOn(precision: DuePrecision, raw: string, previous: string): string {
  const value = raw || previous
  if (!value) return value // cả raw và previous đều rỗng — chỉ xảy ra trước khi gieo lần đầu
  return precision === 'month' ? firstOfMonth(value) : value
}
