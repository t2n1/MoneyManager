// Bản sao JS của token chuyển động §12 — chỉ cho những chỗ KHÔNG nhận được CSS.
//
// Recharts nhận `animationDuration` là một SỐ ms qua prop, không nhận `var(--motion-*)`,
// nên thời lượng của nó phải tồn tại hai lần: một lần trong index.css cho mọi thứ khác,
// một lần ở đây. Hai bản sao thì sớm muộn lệch nhau, nên designSystem.test.ts đọc
// index.css và so với con số dưới đây — lệch là đỏ.
//
// Cùng lý do như docs/design-system.md mục "Màu biểu đồ: hằng số JS, không phải token":
// thư viện biểu đồ đứng ngoài tầm với của CSS, nên nó cần một hằng số JS chứ không phải
// một token bị bỏ qua trong im lặng. Đừng thêm gì vào đây nếu CSS làm được.

/** Thả tay khỏi thanh trượt giả định (13b) → đường mới nội suy trong bấy nhiêu ms. */
export const MOTION_ASSUME_MS = 220

/**
 * Ẩn một việc cần làm: gạch ngang + co chiều cao về 0 hết bấy nhiêu ms, XONG mới gọi
 * `onDismiss`. Con số phải có mặt trong JS vì thứ tự là: CSS chạy trước, React tháo hàng
 * sau — mà React không đọc được `transition-duration` của chính nó.
 *
 * Dùng hẹn giờ thay vì `transitionend`: transitionend không nổ khi transition không chạy
 * (hàng vừa vẽ lại vì lý do khác, hoặc trình duyệt gộp khung), và lúc đó hàng nằm mãi ở
 * trạng thái gạch ngang — một việc người dùng tưởng đã ẩn mà vẫn còn đó.
 */
export const MOTION_TODO_MS = 200
