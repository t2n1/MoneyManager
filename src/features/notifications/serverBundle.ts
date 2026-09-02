// Mặt tiếp xúc DUY NHẤT giữa app và edge function push-notify.
//
// Vì sao cần một file chỉ để xuất lại: edge function chạy trên Deno, mà Deno đòi
// đường dẫn tương đối phải có đuôi `.ts`, còn cả repo này viết `import './foo'` không
// đuôi. Thay vì sửa hàng trăm chỗ import hoặc bật cờ không chuẩn của Deno,
// `scripts/bundle-rules.mjs` gom đúng file này (và mọi thứ nó kéo theo) thành một file
// JS phẳng cho Deno dùng.
//
// Danh sách xuất ở đây = giao kèo. Thêm thứ gì vào edge function thì thêm vào đây,
// KHÔNG import lung tung từ src/ trong function — mỗi import mới là một cơ hội kéo
// theo React hoặc localStorage vào chỗ không có trình duyệt.
//
// Chỉ được xuất lại thứ THUẦN. Đừng đưa `formatMoney` vào: nó đọc trạng thái chế độ
// riêng tư toàn cục (mục J của spec), nên edge function phải tự tiêm bản của nó.

// Bộ luật thông báo + phần chọn tin để đẩy
export { buildNotifications } from './rules'

// Hai quyết định của edge function từng nằm trong loadInput.ts, nơi sai là sai âm thầm.
// Kéo về src/ để có test canh — xem pushInputPlan.ts.
export { earliestNeededDate, missingRateCurrencies, splitTxWindows } from './pushInputPlan'
export { planPush, PUSH_TAG, PUSH_LIST_ROUTE } from './pushPlan'
export type { PushPayload } from './pushPlan'
export { RECENT_TXS_DAYS } from './types'
export type { AppNotification, NotificationInput, NotificationType } from './types'

// Đã tới giờ gửi cho người này chưa
export { dueForPush, localPartsIn } from '../../lib/pushSchedule'

// Dựng lại `budgetReport` — trên trình duyệt việc này do useBudgetReport làm, nhưng
// hai hàm bên dưới mới là phần thuần, và edge function gọi thẳng chúng.
export { buildBudgetReport, carryFromPreviousMonth } from '../budgets/progress'

// Trần theo nhãn. Edge function phải tự dựng: trần kiểu 'total' cần chi CẢ ĐỜI nhãn,
// mà cửa sổ giao dịch của push chỉ có RECENT_TXS_DAYS ngày.
export { buildTagBudgetReport } from '../tags/budget'

// Dựng lại `lifetime` từ kịch bản/chặng/biến cố (đúng hàm useNotifications dùng).
export { buildLifetimeInput } from '../lifetime/buildInput'

// Ngày tháng: bắt buộc đi qua đây, không tự cộng trừ ngày ở edge function.
export {
  addDaysISO,
  addMonths,
  getMonthRange,
  monthKeyForDate,
  monthKeyString,
  toISODate,
} from '../../lib/dates'

// Đọc HẾT bảng, không để PostgREST cắt im lặng ở dòng thứ 1.000. Sổ đã nạp 9 năm
// Zaim (~14.000 giao dịch) nên cửa sổ 90 ngày vẫn có thể vượt trần — và cắt ở đây là
// bộ luật tính chi tháng bằng một phần dữ liệu rồi báo sai số tiền.
export { fetchAllPages, PAGE_SIZE } from '../../data/paging'

// Quyền lợi thuế (spec 2026-09-03): edge function dựng `benefits` bằng ĐÚNG hàm gom mà
// useQuyenLoi dùng, để push và chuông không nói khác nhau về cùng một khoản.
export { tinhQuyenLoi } from '../quyen-loi/quyenLoi'
export { FURUSATO_CATEGORY_NAME } from '../quyen-loi/furusato'
export { SO_NAM_HOAN_THUE } from '../quyen-loi/refund'
export { taxCategoryIds } from '../tax/categories'
export { calendarYearOf } from '../../lib/dates'
