// Đọc HẾT một bảng qua PostgREST.
//
// Vì sao cần: Supabase giới hạn số dòng trả về mỗi request (mặc định 1.000) và **cắt im
// lặng** — không lỗi, không cảnh báo, chỉ là thiếu dòng. Với sổ vài trăm giao dịch thì không
// ai thấy; sau khi nạp 9 năm lịch sử từ Zaim (~14.000 giao dịch) thì mọi truy vấn không phân
// trang đều trả về một phần. Nguy nhất là `exportAll`: backup thiếu dòng, mà **Khôi phục
// ghi đè toàn bộ** — khôi phục từ file bị cắt là xoá thật phần còn lại.

/** Cỡ trang. Bằng giới hạn mặc định của Supabase để mỗi request lấy được nhiều nhất. */
export const PAGE_SIZE = 1000

/** Trần số trang, chặn vòng lặp vô hạn nếu nguồn cứ trả về trang đầy. */
const DEFAULT_MAX_PAGES = 200

export type Page<T> = { data: T[] | null; error: { message: string } | null }

/**
 * Gọi `page(from, to)` liên tiếp cho tới khi nhận được trang ngắn hơn `PAGE_SIZE`.
 * Lỗi ở bất kỳ trang nào cũng ném ra — thà không có dữ liệu còn hơn có một nửa mà
 * tưởng là đủ.
 *
 * Người gọi phải sắp xếp truy vấn theo một khoá **đơn trị** (thường thêm `id` làm chốt
 * cuối): thiếu thứ tự ổn định thì hai request liền nhau có thể trả về cùng một dòng hai
 * lần và bỏ sót dòng khác, vì Postgres không hứa giữ nguyên thứ tự giữa các truy vấn.
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => Promise<Page<T>>,
  opts: { maxPages?: number } = {},
): Promise<T[]> {
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES
  const out: T[] = []
  for (let i = 0; i < maxPages; i++) {
    const from = i * PAGE_SIZE
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE_SIZE) return out
  }
  throw new Error(
    `Đọc dữ liệu vượt quá nhiều trang (> ${maxPages * PAGE_SIZE} dòng) — dừng để không lặp vô hạn.`,
  )
}
