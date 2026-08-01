// Sắc độ ba vùng của thang đo sức khỏe — MỘT nguồn cho cả thanh ngang (HealthMetricCard)
// và cung đồng hồ (ScoreGauge). Hai chỗ vẽ cùng một ý nghĩa thì không được lệch màu.
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
import type { Tone } from './health'

/** Thanh ngang trên thẻ chỉ số. */
export const ZONE_BAR: Record<Tone, string> = {
  bad: 'bg-red-600 dark:bg-red-400/70',
  warn: 'bg-amber-600 dark:bg-amber-500/70',
  good: 'bg-green-700 dark:bg-green-500/70',
}

/** Cung của đồng hồ điểm. Cùng sắc độ với ZONE_BAR, chỉ khác thuộc tính vẽ. */
export const ZONE_STROKE: Record<Tone, string> = {
  bad: 'stroke-red-600 dark:stroke-red-400/70',
  warn: 'stroke-amber-600 dark:stroke-amber-500/70',
  good: 'stroke-green-700 dark:stroke-green-500/70',
}
