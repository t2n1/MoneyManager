// Đếm các kịch bản BỊ ẨN khỏi đồ thị khi bật "So sánh" — THUẦN, không React.
//
// VÌ SAO CÓ FILE NÀY. `chartSeriesPlan` (`chartSeries.ts`, xoá cùng màn Tương lai cũ ở
// Task 16) từng tách hai lý do ẩn đường so sánh thành hai câu chữ riêng — lệch đơn vị
// tiền, và bản chiếu RỖNG (0 năm, ví dụ kịch bản chưa có chặng đời nào hoặc tuổi kết
// thúc đã qua) — vì chúng hướng người dùng đi hai nơi khác nhau: khai tỷ giá/đơn vị
// tiền, hay thêm chặng đời. Console (`TuongLaiPage.tsx`) thay thế màn cũ nhưng chỉ mang
// theo NỬA luật: `comparisons` lọc `.filter((c) => c.rows.length > 0)` rồi lặng thinh,
// còn bộ đếm `compareSkipped` chỉ tính lệch đơn vị tiền. Kết quả: bật So sánh, một kịch
// bản chiếu 0 năm biến mất khỏi cả đồ thị lẫn mọi con số đếm — không có gì trên màn
// hình nói ra vì sao (phát hiện review 2026-09-09, Task 16 finding #2).
//
// Đếm ở đây SAU khi đã biết `rowCount` của từng kịch bản — `projectScenario`
// (useLifetime.ts) không thuần (đọc bản nháp/DB qua `buildInputFor`), nên hàm này
// không tự chiếu, chỉ nhận số dòng đã chiếu sẵn từ chỗ gọi.

export interface CompareSkipCandidate {
  /** `true` = lệch `display_currency` với kịch bản đang xem. Kịch bản này không được
   *  chiếu (xem `TuongLaiPage.tsx` — chiếu một kịch bản chắc chắn bị ẩn chỉ tốn công vô
   *  ích), nên `rowCount` của nó không có ý nghĩa và bị bỏ qua khi cờ này bật. */
  currencyMismatch: boolean
  /** Số dòng `projectScenario` trả về. Chỉ được đọc khi `currencyMismatch` là `false`. */
  rowCount: number
}

export interface CompareSkipCounts {
  /** Số kịch bản bị ẩn vì lệch đơn vị tiền. */
  currencyMismatch: number
  /** Số kịch bản ĐÚNG đơn vị tiền nhưng chiếu ra 0 năm — chưa có chặng đời nào, hoặc
   *  tuổi kết thúc đã qua so với năm hiện tại. */
  zeroYears: number
}

/**
 * Đếm hai lý do một kịch bản so sánh KHÔNG lên đồ thị. Hai lý do loại trừ nhau — một
 * kịch bản lệch đơn vị tiền không cần biết nó có chiếu ra năm nào hay không, vì nó đã
 * bị loại trước khi tới bước chiếu — nên thứ tự kiểm là lệch tiền TRƯỚC, rồi mới tới
 * 0 năm (đúng thứ tự `TuongLaiPage.tsx` đã lọc).
 *
 * `candidates` là danh sách kịch bản KHÔNG PHẢI kịch bản đang xem — chỗ gọi tự lọc
 * `s.id !== active.id` trước khi truyền vào đây, giống `chartSeriesPlan` cũ nhận
 * `compareRows` đã lọc sẵn.
 */
export function countCompareSkipped(
  candidates: readonly CompareSkipCandidate[],
): CompareSkipCounts {
  let currencyMismatch = 0
  let zeroYears = 0
  for (const c of candidates) {
    if (c.currencyMismatch) currencyMismatch++
    else if (c.rowCount === 0) zeroYears++
  }
  return { currencyMismatch, zeroYears }
}
