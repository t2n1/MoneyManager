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

/**
 * Số trang xin CÙNG LÚC sau trang đầu. Sổ 11.000 giao dịch là 12 trang: xin nối đuôi là
 * 12 lượt khứ hồi (~vài giây trên mạng di động), xin theo lô là 4. Giá phải trả: khi dữ
 * liệu vừa khớp hết ở giữa lô, các trang sau điểm dừng bị xin thừa — chúng rỗng nên rẻ,
 * và PostgREST trả range rỗng bằng một phản hồi tức thì.
 */
const BATCH = 4

export type Page<T> = { data: T[] | null; error: { message: string } | null }

/**
 * Gọi `page(from, to)` cho tới khi nhận được trang ngắn hơn `PAGE_SIZE`: trang đầu xin
 * MỘT MÌNH (đa số bảng gọn hơn 1.000 dòng — xong ngay một lượt), các trang sau xin theo
 * lô `BATCH` trang song song, ghép lại THEO ĐÚNG THỨ TỰ chỉ số trang. Lỗi ở bất kỳ trang
 * nào cũng ném ra — thà không có dữ liệu còn hơn có một nửa mà tưởng là đủ.
 *
 * Người gọi phải sắp xếp truy vấn theo một khoá **đơn trị** (thường thêm `id` làm chốt
 * cuối): thiếu thứ tự ổn định thì hai request có thể trả về cùng một dòng hai lần và bỏ
 * sót dòng khác, vì Postgres không hứa giữ nguyên thứ tự giữa các truy vấn — với tải
 * song song, chốt này càng là bắt buộc chứ không phải khuyến nghị.
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => Promise<Page<T>>,
  opts: { maxPages?: number } = {},
): Promise<T[]> {
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES

  const layTrang = async (i: number): Promise<T[]> => {
    const from = i * PAGE_SIZE
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    return data ?? []
  }

  const out: T[] = []
  const trangDau = await layTrang(0)
  out.push(...trangDau)
  if (trangDau.length < PAGE_SIZE) return out

  let i = 1
  while (i < maxPages) {
    const soTrang = Math.min(BATCH, maxPages - i)
    const lo = await Promise.all(
      Array.from({ length: soTrang }, (_, k) => layTrang(i + k)),
    )
    // Ghép theo thứ tự chỉ số; gặp trang ngắn là ĐÃ HẾT — các trang sau nó trong cùng lô
    // (đã lỡ xin) chỉ có thể là phần rỗng phía sau, bỏ qua chứ không ghép.
    for (const rows of lo) {
      out.push(...rows)
      if (rows.length < PAGE_SIZE) return out
    }
    i += soTrang
  }
  throw new Error(
    `Đọc dữ liệu vượt quá nhiều trang (> ${maxPages * PAGE_SIZE} dòng) — dừng để không lặp vô hạn.`,
  )
}
