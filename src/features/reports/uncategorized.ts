// "Còn tồn theo tháng, cũ nhất trước" — mượn cách permtrack liệt kê hồ sơ tồn đọng:
// mỗi dòng một tháng, kèm phần trăm đã xong, tháng cũ nhất lên đầu.
//
// LƯU Ý TÊN GỌI: `unclassifiedCount` trong ReportsPage là số DANH MỤC thiếu
// need_level/cost_type. Chỗ này đếm GIAO DỊCH chưa gắn danh mục — hai thứ khác nhau,
// đừng nối nhầm.

export interface MonthBacklogRow {
  /** "2026-08" */
  monthKey: string
  pending: number
  total: number
  /** 0..1 — phần đã gắn xong. */
  doneRatio: number
}

interface TxLike {
  occurred_on: string
  category_id: string | null
  type: string
}

/**
 * Gom theo tháng, chỉ giữ tháng còn khoản chưa gắn, xếp tháng CŨ NHẤT lên trước — việc
 * tồn lâu nhất là việc nên làm trước, và cũng là việc khó nhất (để càng lâu càng không
 * nhớ ra đã tiêu vào gì).
 *
 * Chuyển khoản bị loại HẲN, không chỉ khỏi phần `pending`: nó vốn không có danh mục nên
 * đếm vào mẫu số sẽ làm mọi tháng trông như đã gắn xong nhiều hơn thực tế.
 */
export function uncategorizedByMonth(txs: TxLike[]): MonthBacklogRow[] {
  const byMonth = new Map<string, { pending: number; total: number }>()

  for (const t of txs) {
    if (t.type === 'transfer') continue
    const key = t.occurred_on.slice(0, 7)
    const cur = byMonth.get(key) ?? { pending: 0, total: 0 }
    cur.total += 1
    if (t.category_id === null) cur.pending += 1
    byMonth.set(key, cur)
  }

  return [...byMonth.entries()]
    .filter(([, v]) => v.pending > 0)
    .map(([monthKey, v]) => ({
      monthKey,
      pending: v.pending,
      total: v.total,
      doneRatio: (v.total - v.pending) / v.total,
    }))
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
}
