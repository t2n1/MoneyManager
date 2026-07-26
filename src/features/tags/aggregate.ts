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
