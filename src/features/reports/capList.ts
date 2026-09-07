// "Top N + phần còn lại" — thuần, không phụ thuộc React, để unit-test được.
//
// VÌ SAO CÓ FILE NÀY: bảng danh mục của một tháng thật có 20–25 dòng, thẻ nhãn có thể
// hơn. Liệt kê hết thì ba dòng đầu — thứ quyết định — bị trôi ngang hàng với dòng ¥210,
// và trên điện thoại phải cuộn hai màn mới thấy hết. Cắt ở top N rồi gộp đuôi lại giữ
// nguyên TỔNG mà đưa phần đáng đọc lên trước.
//
// CẮT THEO SỐ DÒNG, KHÔNG THEO NGƯỠNG %: ngưỡng % làm số dòng nhảy giữa các tháng, nên
// cùng một màn hình lúc 4 dòng lúc 11 dòng — mắt phải học lại bố cục mỗi lần mở. Số dòng
// cố định thì bảng giữ nguyên dáng.
//
// KHÔNG cắt khi phần đuôi chỉ có MỘT dòng: lúc đó "1 mục khác" chiếm đúng chỗ của chính
// dòng nó thay thế, mà lại giấu mất tên — đổi một dòng có nghĩa lấy một dòng vô nghĩa.

export interface CapResult<T> {
  /** Những mục hiện ra. */
  head: T[]
  /** Những mục bị gộp. Rỗng = không cắt gì. */
  tail: T[]
  /** Tổng giá trị của phần bị gộp. */
  tailTotal: number
}

/**
 * Cắt danh sách ĐÃ SẮP giảm dần thành phần hiện và phần gộp.
 *
 * Không tự sắp: nơi gọi đã sắp theo tiêu chí của nó (số tiền, tên, chênh lệch…), sắp lại
 * ở đây là âm thầm đổi thứ tự người dùng đang thấy.
 */
export function capList<T>(
  items: readonly T[],
  cap: number,
  valueOf: (item: T) => number,
): CapResult<T> {
  // `cap + 1`: đuôi đúng một mục thì không cắt — xem ghi chú đầu file.
  if (cap <= 0 || items.length <= cap + 1) {
    return { head: [...items], tail: [], tailTotal: 0 }
  }
  const head = items.slice(0, cap)
  const tail = items.slice(cap)
  return { head, tail, tailTotal: tail.reduce((s, x) => s + valueOf(x), 0) }
}
