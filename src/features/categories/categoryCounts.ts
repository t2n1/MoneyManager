// Con số "14 chi · 3 thu" ở tiêu đề trang Danh mục (bản vẽ 22e).
//
// File này từng tên `costBadge.ts` và mang thêm hai hàm: `costBadge` (nhãn CỐ ĐỊNH /
// BIẾN ĐỔI / CHƯA GẮN cho từng dòng) và `missingCostCount` (đếm dòng chưa gắn). Cả hai
// chết khi hai màn Danh mục · Phân loại gộp làm một (06/09/2026): nhãn từng dòng nay là
// `summaryLabel` — nói CẢ HAI trục chứ không riêng Cố định/Biến đổi — và con số báo động
// đếm bằng `isClassified` trên tập `classifiableExpenses`, tập đã loại sẵn danh mục dòng
// chảy và `kind = 'transfer'`.

/**
 * "14 chi · 3 thu" — đếm ở tiêu đề trang.
 *
 * Đếm danh mục CHA, không phải mọi dòng: con nằm trong cha, cộng cả hai vào một số làm nó
 * to lên gấp ba mà không nói thêm gì. Bỏ danh mục đã lưu trữ — nơi gọi tự lọc trước.
 */
export function categoryCounts(cats: readonly { type: string; parent_id: string | null }[]): {
  expense: number
  income: number
} {
  const goc = cats.filter((c) => c.parent_id === null)
  return {
    expense: goc.filter((c) => c.type === 'expense').length,
    income: goc.filter((c) => c.type === 'income').length,
  }
}
