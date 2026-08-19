import { isAutoAssignedCategory } from '../categories/flowCategories'

export interface RecentCategory {
  id: string
  parentId: string | null
  name: string
  icon: string
  count: number
}

interface Transaction {
  category_id: string | null
  type: string
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
