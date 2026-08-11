// Bộ màu "tốt / cần chú ý / rủi ro / chưa rõ" — MỘT nguồn cho mọi cách vẽ ra trạng thái:
// thanh thang đo (HealthMetricCard), cung đồng hồ (ScoreGauge), chấm trạng thái
// (StatusDot) và chip kết luận (StatusChip, VerdictNote ở chế độ Gọn).
//
// Trước đây file này nằm ở features/health với tên zoneColors và chỉ có hai bộ, vì chỉ
// tab Sức khỏe cần. Chế độ Gọn (src/lib/density.ts) làm cho trạng thái phải vẽ được ở
// MỌI màn — nếu để mỗi chỗ tự chọn sắc độ thì đúng cái bẫy đã ghi ở docs/design-system.md:
// hai chỗ nói cùng một ý nghĩa mà lệch màu.
//
// ---- Vì sao là những bậc này ------------------------------------------------------
//
// Vì sao là bậc 600 ở light chứ không phải 400/500 như trước: vùng màu là ĐỒ HOẠ mang
// thông tin, WCAG 1.4.11 đòi 3:1. Đo thật trên nền trắng (vẽ ra pixel rồi đọc lại, vì
// getComputedStyle trả về oklab() mà canvas parse chuỗi thì ra sai):
//
//   red-400 2,89:1 · amber-400 1,72:1 · green-500 2,22:1  → cả ba đều TRƯỢT
//   red-600 4,77:1 · amber-600 3,20:1 · green-700 4,95:1  → đạt
//
// Vùng vàng là ca tệ nhất (1,72:1 — gần như biến mất với người thị lực kém), nên không
// thể chọn sắc độ theo "trông vừa mắt ở dark mode" như lần đầu.
//
// Vùng xanh dùng bậc 700 chứ không phải 600 (3,22:1 — cũng đủ 3:1): `bg-green-600` là
// chuỗi đang bị guardrail ban vì nút chữ trắng, và một sắc độ đậm hơn thì khỏi phải
// nới luật đó ra chỉ để lấy 1,7 điểm tương phản kém hơn.
//
// Ở dark mode phải ĐẢO CHIỀU sang bậc sáng hơn (cùng lý do với `fg-muted` — xem
// docs/design-system.md §"Ba cái bẫy đã đo"), và alpha 0,7 phải tính vào phép đo vì
// nó trộn thẳng với nền. Đo trên gray-900, ĐÃ composite alpha:
//
//   đỏ:   red-500/70 2,76:1 (trượt) → red-400/70 3,57:1 (đạt)
//   vàng: amber-500/70 4,56:1 · xanh: green-500/70 4,50:1 → giữ nguyên
//
// Nên hai chế độ dùng hai bậc khác nhau cho vùng đỏ. Đó không phải thiếu nhất quán:
// không bậc đỏ nào đạt 3:1 ở CẢ hai chế độ (red-400 chỉ 2,89:1 trên trắng, red-600 chỉ
// 2,27:1 trên gray-900 khi có alpha).
//
// Mức 'info' KHÔNG có ở hai bộ cũ vì một vùng thang đo luôn là một trong ba mức. Chấm
// và chip thì cần: "chưa đủ dữ liệu để chấm" là trạng thái thật. Xám bậc 500/400 chứ
// không 400/500 — chấm là đồ hoạ nên cũng cần 3:1, mà gray-400 trên trắng chỉ 2,0:1.
// Đo thật trên app đang chạy (2026-08-11), gray-500/gray-400:
//   light  4,84:1 trên surface · 4,39:1 trên surface-sunken
//   dark   6,82:1 trên surface · 5,64:1 trên surface-sunken
// Tức đạt cả bốn nền nó thật sự xuất hiện, sàn là 4,39:1.

/**
 * Bốn mức trạng thái. Trùng `Verdict` của features/health trừ cách gọi mức thứ tư
 * ('unknown' ở đó = 'info' ở đây): tầng primitive không biết gì về "chấm điểm", nó chỉ
 * biết "chưa có gì để nói". Chỗ nào có `Verdict` thì map một lần khi gọi.
 */
export type StatusTone = 'good' | 'warn' | 'bad' | 'info'

/** Nền đặc: thanh thang đo, chấm trạng thái, chú giải. Đạt 3:1 với nền thẻ. */
export const STATUS_FILL: Record<StatusTone, string> = {
  bad: 'bg-red-600 dark:bg-red-400/70',
  warn: 'bg-amber-600 dark:bg-amber-500/70',
  good: 'bg-green-700 dark:bg-green-500/70',
  info: 'bg-gray-500 dark:bg-gray-400',
}

/** Nét vẽ SVG. Cùng sắc độ với STATUS_FILL, chỉ khác thuộc tính. */
export const STATUS_STROKE: Record<StatusTone, string> = {
  bad: 'stroke-red-600 dark:stroke-red-400/70',
  warn: 'stroke-amber-600 dark:stroke-amber-500/70',
  good: 'stroke-green-700 dark:stroke-green-500/70',
  info: 'stroke-gray-500 dark:stroke-gray-400',
}

/**
 * Chip: nền nhạt + CHỮ trên nền đó, nên ngưỡng là 4,5:1 (chữ) chứ không phải 3:1 như
 * hai bộ trên — vì vậy sắc độ khác, không phải quên đồng bộ. Lấy đúng bộ đã dùng cho
 * huy hiệu Tốt/Cần chú ý/Rủi ro ở HealthMetricCard từ trước, để chip mới không mở ra
 * một cặp màu thứ hai cho cùng một ý nghĩa.
 */
// Đo thật trên app đang chạy (2026-08-11), chữ 11px trên nền chip đặt trên `--surface`:
//   light  good 4,50 · warn 4,52 · bad 5,27 · info 6,87
//   dark   good 10,17 · warn 10,19 · bad 8,09 · info 5,64
// Light là ca sát sàn: good 4,50 và warn 4,52 chỉ vừa đúng AA. Đổi green-700/amber-700
// sang bậc nhạt hơn cho "dịu mắt" là trượt ngay — chip 11px không được hưởng ngưỡng
// 3:1 của chữ lớn.
export const STATUS_CHIP: Record<StatusTone, string> = {
  good: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  bad: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  info: 'bg-surface-sunken text-fg-on-track',
}
