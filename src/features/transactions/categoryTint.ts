// Màu lót cho Ô EMOJI danh mục trên dòng giao dịch + màu thanh "Top danh mục"
// (redesign 2). Danh mục KHÔNG có cột màu trong DB (xem CategoryRow), nên màu suy
// DETERMINISTIC từ id: cùng một danh mục thì mọi màn, mọi máy ra cùng một màu, nhưng
// không phải đẻ thêm cột và màn chọn màu.
//
// Vì sao rgba viết trần ở .ts chứ không phải class Tailwind: nền ô là màu PHA LOÃNG
// (alpha ~14%) đè lên bề mặt thẻ, cùng một chuỗi rgba cho ra pastel đúng ý ở cả hai
// chế độ — trên trắng ra pastel nhạt, trên #121613 ra tint tối. Hex/rgba trần trong
// file .ts dữ liệu là quy ước sẵn của repo (TAG_HEX ở features/tags/colors.ts);
// guardrail cấm hex trong .tsx, không cấm ở tầng hằng số.
//
// Thanh so sánh thì là màu ĐẶC nên phải lật theo chế độ → cặp class Tailwind
// (bậc 600 ở light cho đủ 3:1 đồ hoạ trên nền trắng, bậc 400 ở dark) — cùng khuôn
// với TAG_CHIP_CLASS.

interface CategoryTint {
  /** Nền ô emoji — rgba pha loãng, dùng qua style (không phải class). */
  tile: string
  /** Thanh so sánh — cặp class light/dark, màu đặc. */
  bar: string
}

/** Bảy sắc của bản vẽ redesign 2 (vàng, đỏ, lam, ngọc, tím, hồng, lục). */
const TINTS: readonly CategoryTint[] = [
  { tile: 'rgba(255, 200, 77, 0.14)', bar: 'bg-amber-600 dark:bg-amber-400' },
  { tile: 'rgba(255, 122, 118, 0.14)', bar: 'bg-red-600 dark:bg-red-400' },
  { tile: 'rgba(122, 162, 255, 0.14)', bar: 'bg-blue-600 dark:bg-blue-400' },
  { tile: 'rgba(94, 222, 214, 0.14)', bar: 'bg-teal-600 dark:bg-teal-400' },
  { tile: 'rgba(186, 148, 255, 0.14)', bar: 'bg-violet-600 dark:bg-violet-400' },
  { tile: 'rgba(255, 143, 171, 0.14)', bar: 'bg-pink-600 dark:bg-pink-400' },
  // Sắc lục đi bằng token accent (đã lật sẵn light/dark) — luật "không viết tay
  // bg-green-700" trong designSystem.test.ts.
  { tile: 'rgba(92, 224, 138, 0.14)', bar: 'bg-accent' },
] as const

/** Không có danh mục (hàng nhập CSV/Zaim, chuyển khoản): xám trung tính của thang. */
const NEUTRAL: CategoryTint = {
  tile: 'rgba(154, 166, 155, 0.14)',
  bar: 'bg-gray-600 dark:bg-gray-400',
}

/** Băm id (uuid) → chỉ số ổn định. Cộng mã ký tự là đủ: uuid phân bố đều sẵn. */
function hash(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * (i + 1)) % 997
  return h
}

export function categoryTint(categoryId: string | null | undefined): CategoryTint {
  if (!categoryId) return NEUTRAL
  return TINTS[hash(categoryId) % TINTS.length]
}
