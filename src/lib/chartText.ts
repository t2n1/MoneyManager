// Cỡ chữ trong biểu đồ — bản sao JS của bậc chữ, cho những chỗ KHÔNG nhận được class.
//
// Cùng lý do tồn tại như `motion.ts`: Recharts nhận cỡ chữ qua PROP (`tick={{fontSize}}`,
// `label={{fontSize}}`, `contentStyle`), không qua className, nên không với tới token
// Tailwind được.
//
// Vì sao phải là CHUỖI rem chứ không phải SỐ:
//   `fontSize: 11` → React ghi ra `font-size="11"` → SVG hiểu là 11px CỨNG.
//   `--app-font-scale` (Cài đặt → Cỡ chữ) chỉ co giãn cái tính theo rem, nên số thuần
//   ĐỨNG YÊN. Đo thật ở scale 1.25: chữ thân 11 → 13,75px, nhãn trục vẫn 11px. Người
//   chọn cỡ chữ lớn nhất là người cần nhãn biểu đồ to nhất — và họ là người duy nhất
//   không được nó to lên.
//
// Ba hằng số dưới đây khớp ba bậc đã đặt tên trong index.css. designSystem.test.ts đọc
// index.css và so với chúng — lệch là đỏ, y như cách motion.ts được canh.

/** = text-3xs (10px ở cỡ Vừa). Sàn dưới — đừng đi thấp hơn. Nhãn trục dày, chú thích cột. */
export const CHART_TEXT_3XS = '0.625rem'

/** = text-2xs (11px ở cỡ Vừa). Nhãn trục mặc định. */
export const CHART_TEXT_2XS = '0.6875rem'

/** = text-xs (12px ở cỡ Vừa). Bảng chú giải nổi (tooltip) — đọc gần, cần lớn hơn trục. */
export const CHART_TEXT_XS = '0.75rem'
