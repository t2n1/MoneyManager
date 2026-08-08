// Tổng hợp chi tiêu theo NHÃN — thuần, không phụ thuộc React, unit-test được.
//
// Nhãn khác danh mục ở chỗ một giao dịch có thể mang NHIỀU nhãn, nên tổng các
// nhãn có thể lớn hơn tổng chi. Mọi nơi hiển thị phải nói rõ điều đó thay vì
// vẽ biểu đồ tròn giả vờ chúng cộng lại thành 100%.

import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { TagRow, TransactionRow, TransactionTagRow } from '../../types/database.types'
import { expenseSign, type CurrencyOf } from '../reports/aggregate'

export interface TagSlice {
  tagId: string
  name: string
  color: string
  /** tổng chi mang nhãn này (base minor) */
  amount: number
  /** số giao dịch mang nhãn */
  count: number
}

export interface TagBreakdown {
  slices: TagSlice[]
  /** tổng chi của những giao dịch CÓ ít nhất một nhãn (mỗi giao dịch đếm 1 lần) */
  taggedTotal: number
  /** tổng chi toàn kỳ, để biết phần đã gắn nhãn chiếm bao nhiêu */
  total: number
  hasMissingRate: boolean
}

/**
 * Chi theo nhãn trong một tập giao dịch. Giao dịch mang 2 nhãn được cộng đủ vào
 * CẢ HAI nhãn (đúng ý nghĩa "chuyến về VN" ∩ "quà cáp"), nhưng `taggedTotal`
 * chỉ đếm nó một lần để phần trăm không vượt quá 100%.
 */
export function tagBreakdown(
  txs: TransactionRow[],
  links: TransactionTagRow[],
  tags: TagRow[],
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
): TagBreakdown {
  const tagById = new Map(tags.map((t) => [t.id, t]))
  const tagsOfTx = new Map<string, string[]>()
  for (const l of links) {
    const list = tagsOfTx.get(l.transaction_id)
    if (list) list.push(l.tag_id)
    else tagsOfTx.set(l.transaction_id, [l.tag_id])
  }

  const sums = new Map<string, { amount: number; count: number }>()
  let taggedTotal = 0
  let total = 0
  let hasMissingRate = false

  for (const t of txs) {
    if (t.type !== 'expense' || t.is_debt_flow || t.exclude_from_stats) continue
    const raw = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (raw === null) {
      hasMissingRate = true
      continue
    }
    const v = raw * expenseSign(t)
    total += v
    const ids = tagsOfTx.get(t.id)
    if (!ids || ids.length === 0) continue
    taggedTotal += v
    // Nhãn trùng trên cùng giao dịch (dữ liệu lỗi) chỉ tính một lần
    for (const tagId of new Set(ids)) {
      if (!tagById.has(tagId)) continue
      const cur = sums.get(tagId) ?? { amount: 0, count: 0 }
      cur.amount += v
      cur.count += 1
      sums.set(tagId, cur)
    }
  }

  const slices: TagSlice[] = [...sums.entries()]
    .map(([tagId, s]) => {
      const tag = tagById.get(tagId)!
      return { tagId, name: tag.name, color: tag.color, amount: s.amount, count: s.count }
    })
    .filter((s) => s.amount > 0)
    .sort((a, b) => b.amount - a.amount)

  return { slices, taggedTotal, total, hasMissingRate }
}

/**
 * Nhãn của từng giao dịch, để danh sách Sổ vẽ được chip nhãn trên mỗi dòng.
 *
 * Thứ tự nhãn lấy theo thứ tự của `tags` (đã sắp `sort_order` từ repo) để hai
 * dòng mang cùng bộ nhãn luôn hiện giống nhau, chứ không theo thứ tự ngẫu nhiên
 * mà bảng liên kết trả về. Nhãn đã xóa (còn liên kết mồ côi) và nhãn trùng trên
 * cùng giao dịch bị bỏ, cùng quy ước với `tagBreakdown`.
 */
export function tagsByTransaction(
  links: TransactionTagRow[],
  tags: TagRow[],
): Map<string, TagRow[]> {
  const rank = new Map(tags.map((t, i) => [t.id, i]))
  const tagById = new Map(tags.map((t) => [t.id, t]))
  const out = new Map<string, TagRow[]>()

  for (const l of links) {
    const tag = tagById.get(l.tag_id)
    if (!tag) continue
    const list = out.get(l.transaction_id)
    if (!list) out.set(l.transaction_id, [tag])
    else if (!list.some((t) => t.id === tag.id)) list.push(tag)
  }
  for (const list of out.values()) {
    list.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
  }
  return out
}

export interface PickerTags {
  /** Nhãn hiện thẳng trong form nhập (hàng chip rút gọn). */
  shown: TagRow[]
  /** Nhãn còn lại — chỉ thấy khi bấm "Tất cả". */
  rest: TagRow[]
}

/**
 * Chọn ra ít nhãn để form nhập không phình theo số nhãn. Đo trên 375×812: 40 nhãn
 * vẽ thẳng thành 11 hàng chip cao 476px, gần bằng cả vùng cuộn của form (514px).
 *
 * Xếp theo MỨC DÙNG (số liên kết) giảm dần, hòa thì theo thứ tự `tags` (repo đã
 * sắp `sort_order`) — nhãn tạo sau nhưng dùng hằng ngày phải lên trước, chứ không
 * chìm xuống cuối như khi xếp thuần thứ tự tạo.
 *
 * Ba quy ước quan trọng:
 *  - Nhãn ĐANG CHỌN nằm ngoài top vẫn được đưa vào `shown`, nhưng ở CUỐI chứ
 *    không hoán lên đầu: bấm một chip không được làm các chip khác nhảy chỗ.
 *  - Nhãn đã lưu trữ biến mất khỏi cả `shown` lẫn `rest`.
 *  - Trừ khi nó đang được chọn — sửa một giao dịch cũ mang nhãn đã lưu trữ thì
 *    vẫn phải thấy chip đó để bỏ được, không thì nhãn dính vào giao dịch vô hình.
 *
 * Mức dùng chỉ để xếp thứ tự nên liên kết trùng (demo không có UNIQUE) được đếm
 * nguyên, không lọc lại cho đỡ tốn.
 */
export function pickerTags(
  tags: TagRow[],
  links: TransactionTagRow[],
  selectedIds: string[],
  limit: number,
): PickerTags {
  const selected = new Set(selectedIds)
  const usage = new Map<string, number>()
  for (const l of links) usage.set(l.tag_id, (usage.get(l.tag_id) ?? 0) + 1)

  const ranked = tags
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => !t.is_archived || selected.has(t.id))
    .sort((a, b) => (usage.get(b.t.id) ?? 0) - (usage.get(a.t.id) ?? 0) || a.i - b.i)
    .map(({ t }) => t)

  const head = ranked.slice(0, Math.max(limit, 0))
  const tail = ranked.slice(head.length)
  return {
    shown: [...head, ...tail.filter((t) => selected.has(t.id))],
    rest: tail.filter((t) => !selected.has(t.id)),
  }
}

/** Khoá của "nhóm ảo" gom mọi nhãn ngoài nhóm (mục "Khác"). */
const OTHER_GROUP = '__other__'

/**
 * Lọc giao dịch theo nhãn: **HOẶC trong cùng nhóm, VÀ giữa các nhóm**.
 *
 * Chọn "Tokyo" + "Osaka" (cùng nhóm "Ở đâu?") nghĩa là "cho tôi xem cả hai nơi".
 * Chọn "Người yêu" + "Tokyo" (hai nhóm khác nhau) nghĩa là "khoản đi với người yêu
 * Ở Tokyo" — đây chính là câu hỏi mà nhãn phẳng không trả lời được, và là lý do
 * nhóm tồn tại.
 *
 * Nhãn ngoài nhóm (mục "Khác") gộp chung thành một nhóm ảo, tức OR với nhau — giữ
 * nguyên hành vi cũ cho sổ chưa xếp nhóm bao giờ, và giữ cho deep-link `?tags=a,b`
 * từ thẻ "Chi theo nhãn" không đổi nghĩa. Nhãn không có trong `tags` (liên kết mồ
 * côi) cũng rơi vào nhóm ảo đó.
 *
 * Lọc phía client vì bảng liên kết nhãn nhỏ và đã được tải sẵn cho báo cáo;
 * đẩy xuống SQL sẽ cần một vòng truy vấn nữa mà không nhanh hơn.
 */
export function filterByTags(
  txs: TransactionRow[],
  links: TransactionTagRow[],
  tagIds: string[],
  tags: TagRow[],
): TransactionRow[] {
  if (tagIds.length === 0) return txs

  const groupOf = new Map(tags.map((t) => [t.id, t.group_id ?? OTHER_GROUP]))
  const buckets = new Map<string, Set<string>>()
  for (const id of tagIds) {
    const key = groupOf.get(id) ?? OTHER_GROUP
    const set = buckets.get(key)
    if (set) set.add(id)
    else buckets.set(key, new Set([id]))
  }

  // Mỗi nhóm → tập giao dịch khớp BẤT KỲ nhãn nào của nhóm đó; rồi GIAO các tập.
  const hits = [...buckets.values()].map(
    (want) => new Set(links.filter((l) => want.has(l.tag_id)).map((l) => l.transaction_id)),
  )
  return txs.filter((t) => hits.every((h) => h.has(t.id)))
}
