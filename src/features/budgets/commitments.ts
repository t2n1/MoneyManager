// "Đã cam kết" — tiền chắc chắn ra trong tháng đang lập kế hoạch. Thuần, test được.
//
// Ba nguồn tiền-sẽ-ra của app nằm ở ba trang khác nhau (Định kỳ, Sắp chi, Khoản cần
// thanh toán), và tab Ngân sách tới nay không biết chúng tồn tại. Hệ quả: lập kế hoạch
// cho tháng sau là ngồi nhớ lại xem tháng sau phải trả những gì.
//
// Khối này KHÔNG cộng vào tổng đã phân bổ. Cam kết là THỰC TẾ, hạn mức là KẾ HOẠCH —
// việc của nó là chỉ ra chỗ kế hoạch không phủ nổi thực tế, xem `coverageGaps`.

import type { PlannedExpenseRow, RecurringRuleRow } from '../../types/database.types'
import { nthDueDate } from '../../lib/recurring'
import type { CurrencyCode } from '../../lib/money'

export interface Commitment {
  /** khoá dựng cho React; không phải id của bảng nào (một rule gộp nhiều kỳ) */
  key: string
  kind: 'recurring' | 'planned'
  title: string
  categoryId: string | null
  /** tổng tiền của khoản này trong tháng (base minor); 0 khi chưa biết bao nhiêu */
  amount: number
  /** số kỳ rơi vào tháng — khoản tuần có thể 4 hoặc 5 */
  times: number
  /** kỳ đầu tiên rơi vào tháng */
  dueISO: string
  /** khoản sắp chi ghi 0 = "chưa biết bao nhiêu", không phải miễn phí */
  unknownAmount: boolean
}

export interface CommitmentReport {
  /** giảm dần theo tiền; khoản chưa biết giá xuống cuối */
  items: Commitment[]
  total: number
  /** có khoản ngoại tệ chưa quy đổi được → `total` đang thiếu */
  hasMissingRate: boolean
  /** tổng cam kết theo danh mục — để đối chiếu với hạn mức */
  byCategory: Map<string, number>
}

/** Khoảng nửa mở [start, end) — đúng quy ước của `getMonthRange`. */
export interface Range {
  start: string
  end: string
}

/**
 * Các kỳ của một rule rơi vào [range.start, range.end).
 *
 * Đi từ kỳ 0 chứ không nhảy thẳng: `nthDueDate` clamp ngày về cuối tháng ngắn
 * (31 → 28/2), nên không có công thức đảo ngược đáng tin để tính "kỳ thứ mấy rơi vào
 * tháng này". Rule tuần chạy từ vài năm trước cũng chỉ vài trăm vòng.
 */
function dueDatesIn(rule: RecurringRuleRow, range: Range): string[] {
  if (rule.is_paused) return []
  const out: string[] = []
  for (let n = 0; ; n++) {
    const due = nthDueDate(rule.start_on, rule.frequency, n)
    if (due >= range.end) break
    if (rule.end_on && due > rule.end_on) break
    // Kỳ đã sinh giao dịch (hoặc đã xác nhận trả) rồi thì không còn là tiền sắp ra.
    if (rule.last_generated_on && due <= rule.last_generated_on) continue
    if (due >= range.start) out.push(due)
  }
  return out
}

/**
 * Gom mọi khoản chắc chắn phải chi trong `range`.
 *
 * Chỉ lấy rule `type = 'expense'`: chuyển khoản là tiền chạy giữa hai túi của chính
 * mình (không mất đi đâu), còn thu định kỳ là tiền vào — nhét vào đây thì khối "phải
 * lo bao nhiêu" tự trừ bớt chính nó.
 *
 * Cả `mode = 'auto'` lẫn `'remind'` đều tính: một khoản app tự ghi hộ và một khoản app
 * chỉ nhắc thì khác nhau ở chỗ AI GÕ, không khác nhau ở chỗ tiền có ra hay không.
 */
export function collectCommitments(
  rules: RecurringRuleRow[],
  planned: PlannedExpenseRow[],
  range: Range,
  currencyOf: (accountId: string) => CurrencyCode,
  convert: (amount: number, currency: CurrencyCode) => number | null,
): CommitmentReport {
  const items: Commitment[] = []
  let hasMissingRate = false

  for (const r of rules) {
    if (r.type !== 'expense') continue
    const dues = dueDatesIn(r, range)
    if (dues.length === 0) continue
    const one = convert(r.amount, currencyOf(r.account_id))
    if (one === null) {
      hasMissingRate = true
      continue
    }
    items.push({
      key: `rule:${r.id}`,
      kind: 'recurring',
      title: r.note.trim() || 'Khoản định kỳ',
      categoryId: r.category_id,
      amount: one * dues.length,
      times: dues.length,
      dueISO: dues[0],
      unknownAmount: false,
    })
  }

  for (const p of planned) {
    // Đã chi hoặc đã bỏ thì hết phải lo — cùng luật với `groupPlannedByMonth`.
    if (p.status !== 'planned') continue
    if (p.due_on < range.start || p.due_on >= range.end) continue
    const v = p.amount === 0 ? 0 : convert(p.amount, p.currency)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    items.push({
      key: `planned:${p.id}`,
      kind: 'planned',
      title: p.title,
      categoryId: p.category_id,
      amount: v,
      times: 1,
      dueISO: p.due_on,
      unknownAmount: p.amount === 0,
    })
  }

  // Chưa biết giá xuống cuối: xếp lẫn theo tiền thì nó nằm chung với khoản 0 đồng
  // thật, mà hai thứ đó không cùng nghĩa.
  items.sort((a, b) => {
    if (a.unknownAmount !== b.unknownAmount) return a.unknownAmount ? 1 : -1
    return b.amount - a.amount || a.dueISO.localeCompare(b.dueISO)
  })

  const byCategory = new Map<string, number>()
  let total = 0
  for (const it of items) {
    total += it.amount
    if (it.categoryId) {
      byCategory.set(it.categoryId, (byCategory.get(it.categoryId) ?? 0) + it.amount)
    }
  }

  return { items, total, hasMissingRate, byCategory }
}

export interface CoverageGap {
  categoryId: string
  committed: number
  /** hạn mức đang đặt cho danh mục này (0 = chưa đặt) */
  budgeted: number
  /** committed − budgeted, luôn > 0 */
  short: number
}

/**
 * Danh mục có cam kết vượt quá hạn mức đang đặt.
 *
 * Đối chiếu ở ĐÚNG danh mục của cam kết, không leo lên cha: một khoản cam kết ghi vào
 * danh mục con mà cha có trần chung thì trần cha vẫn có thể phủ được, nhưng ta không
 * biết phần còn lại của trần ấy đã hứa cho con nào. Báo dư còn sửa được; báo thiếu thì
 * người dùng yên tâm nhầm cho tới lúc tiền ra thật.
 *
 * Vắng mặt trong `budgetedByCat` = chưa đặt hạn mức = 0, tức là thiếu TOÀN BỘ.
 */
export function coverageGaps(
  byCategory: Map<string, number>,
  budgetedByCat: Map<string, number>,
): CoverageGap[] {
  const out: CoverageGap[] = []
  for (const [categoryId, committed] of byCategory) {
    const budgeted = budgetedByCat.get(categoryId) ?? 0
    if (committed > budgeted) {
      out.push({ categoryId, committed, budgeted, short: committed - budgeted })
    }
  }
  return out.sort((a, b) => b.short - a.short)
}
