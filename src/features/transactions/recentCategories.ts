import { isAutoAssignedCategory } from '../categories/flowCategories'

/** Một viên chip ở hàng danh mục — dùng cho cả chip "Gần đây" và chip đang chọn. */
export interface CategoryChip {
  id: string
  parentId: string | null
  name: string
  icon: string
}

export interface RecentCategory extends CategoryChip {
  count: number
}

interface Transaction {
  // Chỉ `category_id`: lọc theo loại đi qua `cat.type` (danh mục), KHÔNG qua `tx.type` —
  // một danh mục chỉ thuộc một loại, nên đọc loại từ giao dịch là đọc lại cùng một điều
  // qua đường dài hơn. Khai `type` ở đây mà không đọc là hứa với người sau rằng hàm có
  // xét tới nó.
  category_id: string | null
}

interface Category {
  id: string
  name: string
  icon: string
  parent_id?: string | null
  type: string
  is_archived: boolean
}

/**
 * Trả về các danh mục dùng nhiều nhất theo từng loại giao dịch.
 * Kết quả bao gồm tối đa `limit` danh mục, được sắp theo số lần dùng
 * giảm dần. Loại bỏ danh mục tự gán (app tự tạo, không phải user chọn).
 *
 * Khi có tie (cùng count), sắp theo tên danh mục để kết quả ổn định.
 *
 * @param txs Danh sách giao dịch
 * @param categories Danh sách danh mục
 * @param type Loại giao dịch (expense, income, transfer...)
 * @param limit Số danh mục trả về (mặc định 3)
 * @returns Danh sách các danh mục dùng nhiều nhất
 */
export function recentCategories(
  txs: Transaction[],
  categories: Category[],
  type: string,
  limit: number = 3,
): RecentCategory[] {
  // Đếm lần dùng từng danh mục
  const counts = new Map<string, number>()
  for (const tx of txs) {
    if (tx.category_id !== null) {
      counts.set(tx.category_id, (counts.get(tx.category_id) ?? 0) + 1)
    }
  }

  // Xây dựng danh sách kết quả
  const result: RecentCategory[] = []

  for (const [categoryId, count] of counts) {
    const cat = categories.find((c) => c.id === categoryId)
    if (!cat) continue // Danh mục không tồn tại

    // Loại bỏ danh mục đã lưu trữ
    if (cat.is_archived) continue

    // Loại bỏ danh mục không khớp loại
    if (cat.type !== type) continue

    // Loại bỏ danh mục tự gán (app tự tạo, user không cần chọn tay)
    if (isAutoAssignedCategory(cat)) continue

    result.push({
      id: categoryId,
      parentId: cat.parent_id ?? null,
      name: cat.name,
      icon: cat.icon,
      count,
    })
  }

  // Sắp xếp: theo count giảm dần, rồi theo tên để ổn định khi tie
  result.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return a.name.localeCompare(b.name)
  })

  return result.slice(0, limit)
}

/**
 * Hàng chip của bộ chọn danh mục: danh mục ĐANG CHỌN đứng đầu, rồi tới chip "Gần đây" —
 * cả hàng cắt ở `limit` viên.
 *
 * **Vì sao phải chèn chip đang chọn.** Hàng chip là thứ DUY NHẤT còn lại trên màn sau khi
 * lưới danh mục thu lại, mà "Gần đây" tính theo số lần dùng của QUÁ KHỨ nên nó không biết
 * gì về lựa chọn vừa xong. Chọn một danh mục ngoài top-3 (mở "Khác" → vào một nhóm → chọn
 * con) là lưới đóng lại và trên màn không còn chữ nào nói mình đã chọn gì — `categoryId`
 * vẫn đúng trong state, nút Lưu vẫn mở, nhưng đọc màn thì thấy "mất luôn danh mục vừa
 * chọn" (báo 2026-08-24).
 *
 * **Vì sao ĐẦU hàng.** Hàng này cuộn ngang chứ không xuống dòng, nên chèn ở cuối là chèn
 * vào chỗ phải kéo mới thấy — đúng cái bệnh đang chữa.
 *
 * **Vì sao vẫn CẮT ở 3, không thành 4.** Đo trên máy thật ở 375px: hàng chip có 351px,
 * mà 3 chip + chip "Khác" đã ăn ~353px. Thêm viên thứ tư là 427px, tức chip "Khác" kết ở
 * x=439 trong khi hàng hết ở 363 — nó ra HẲN ngoài màn, phải kéo mới tìm lại được đường
 * mở lưới. Nên chip đang chọn ĐẨY chip "Gần đây" ít dùng nhất ra, không cộng thêm vào:
 * cái bị đẩy ra vẫn còn đường vào qua "Khác", còn "Khác" mà mất thì mất cả lối.
 *
 * @param recent Chip "Gần đây" (đầu ra của `recentCategories`, đã sắp theo số lần dùng)
 * @param selected Danh mục đang chọn, hoặc null
 * @param limit Số chip tối đa của cả hàng (mặc định 3 — xem đoạn đo ở trên)
 * @returns Hàng chip theo đúng thứ tự hiển thị
 */
export function categoryChips(
  recent: RecentCategory[],
  selected: CategoryChip | null,
  limit: number = 3,
): CategoryChip[] {
  if (!selected) return recent.slice(0, limit)
  // Đang chọn một chip có sẵn trong "Gần đây" → không chèn gì, chip đó tự sáng lên
  // (CategoryRow so `value === r.id`). Chèn nữa là hai viên chip cùng một danh mục.
  if (recent.some((r) => r.id === selected.id)) return recent.slice(0, limit)
  return [selected, ...recent].slice(0, limit)
}

/** Sườn tối thiểu cho `childCounts` — chỉ đòi hai field nó thật sự đọc, không đòi cả
 *  `Category` đầy đủ (`name`/`icon`/`type`): CategoryRow.tsx gọi hàm này với đúng danh
 *  mục nó nhận làm prop, không phải toàn bộ danh mục app. */
interface CountableCategory {
  parent_id?: string | null
  is_archived: boolean
}

/**
 * Số danh mục con (chưa lưu trữ) của từng nhóm cha — CHỈ có khóa cho nhóm CÓ con.
 *
 * Badge thay chevron 10px: tile CÓ con và tile KHÔNG con (Phí chuyển tiền · Phí thủ
 * tục · Khác) trước đây trông y hệt mà hành vi khác — bấm cái có con thì mở thêm một
 * tầng, bấm cái không con thì chọn xong luôn. Không có khóa (thay vì khóa mang giá trị
 * 0) để tile không con chắc chắn không vẽ badge — badge "0" đúng là sự mơ hồ này thay.
 *
 * @param categories Danh sách danh mục (cả nhóm cha và con)
 * @returns Map `parent_id` → số con còn hoạt động; không có khóa cho nhóm không con
 */
export function childCounts(categories: CountableCategory[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const c of categories) {
    if (c.is_archived) continue
    const parentId = c.parent_id
    if (!parentId) continue
    counts[parentId] = (counts[parentId] ?? 0) + 1
  }
  return counts
}
