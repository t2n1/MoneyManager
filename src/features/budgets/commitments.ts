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

/**
 * Tiền CÒN TIÊU ĐƯỢC = phần còn lại trong trần TRỪ phần đã hứa cho người khác.
 *
 * Vì sao phải có hàm này (B36): mặt theo dõi chia `totalRemaining` cho số ngày còn lại
 * để ra "mỗi ngày còn tiêu được bao nhiêu" — con số hành động nhiều nhất của cả trang.
 * Nhưng `totalRemaining` gồm cả hạn mức của những khoản CHẮC CHẮN phải trả mà chưa tới
 * ngày (tiền điện ngày 25, khoản định kỳ chưa sinh giao dịch). Chia cả phần đó ra là
 * nói dư đúng bằng số cam kết chưa ra.
 *
 * KHÔNG kẹp về 0. Số âm ở đây là một tin thật và là tin quan trọng nhất trong tháng:
 * "còn ¥12,000 trong trần mà ¥18,600 đã hứa" nghĩa là thiếu ¥6,600, và nơi gọi phải
 * in ra câu đó chứ không phải ẩn dòng đi (xem B36.2).
 *
 * `committedRemaining` phải là cam kết CHƯA RA. `dueDatesIn` đã bỏ kỳ có
 * `last_generated_on` và `collectCommitments` đã bỏ khoản sắp chi `status !== 'planned'`,
 * nên đừng cộng lại các giao dịch đã ghi — trừ hai lần là hạ số xuống quá thấp, mà sai
 * theo hướng đó thì người dùng thôi tin con số.
 */
export function spendableRemaining(
  totalRemaining: number,
  committedRemaining: number,
): number {
  return totalRemaining - committedRemaining
}

/** Cam kết chưa ra, chia theo chỗ đứng của nó so với HÔM NAY. */
export interface CommitmentSchedule {
  /** Tới hạn rồi mà chưa sinh giao dịch — hoặc quên trả, hoặc quên ghi. Cả hai đều cần biết. */
  overdue: Commitment[]
  /** Chưa tới hạn. */
  upcoming: Commitment[]
  overdueTotal: number
  upcomingTotal: number
}

/**
 * Chia cam kết thành QUÁ HẠN CHƯA GHI và CÒN PHẢI TRẢ (B37).
 *
 * Nhóm quá hạn là thứ mặt lập kế hoạch không thể có (tháng chưa xảy ra) và mặt theo dõi
 * tới nay không có chỗ nào nói: một khoản định kỳ tới hạn ngày 10 mà hôm nay 18 vẫn chưa
 * ghi thì hoặc bạn quên ghi, hoặc bạn quên trả.
 *
 * Khoản ĐÃ RA không có mặt ở đây, và không phải vì bị lọc: `collectCommitments` chỉ trả
 * về kỳ chưa sinh giao dịch, nên tiền đã ra vốn đã nằm trong `spent`.
 *
 * Giữ nguyên thứ tự `items` trong mỗi nhóm — nó đã sắp giảm dần theo tiền.
 */
export function classifyCommitments(
  items: Commitment[],
  todayISO: string,
): CommitmentSchedule {
  const overdue = items.filter((it) => it.dueISO < todayISO)
  const upcoming = items.filter((it) => it.dueISO >= todayISO)
  const sum = (xs: Commitment[]) => xs.reduce((s, x) => s + x.amount, 0)
  return {
    overdue,
    upcoming,
    overdueTotal: sum(overdue),
    upcomingTotal: sum(upcoming),
  }
}

export interface CoverageGap {
  /** danh mục MANG TRẦN đang hụt — nhóm cha nếu cam kết rơi vào con của nhóm có trần */
  categoryId: string
  /** tổng cam kết tính vào trần đó (đã gộp cam kết của các con) */
  committed: number
  /** hạn mức đang đặt cho danh mục này (0 = chưa đặt) */
  budgeted: number
  /** committed − budgeted, luôn > 0 */
  short: number
}

/**
 * Trần nào đang không phủ nổi cam kết.
 *
 * Cam kết LEO LÊN CHA đúng theo luật của `buildBudgetReport`: đặt trần ở nhóm cha nghĩa
 * là trần chung cho cả nhóm, và mọi khoản chi của các con đều tính vào đó. Nên cam kết
 * ghi ở con phải cộng vào trần cha, không so với con.
 *
 * Bản đầu cố ý so ở đúng danh mục của cam kết, lý do là "báo dư còn sửa được, báo thiếu
 * thì người dùng yên tâm nhầm". Lý do đó sai với người đặt trần theo NHÓM: mọi cam kết
 * của mọi con đều bị réo "chưa có hạn mức" trong khi trần nhóm phủ thừa sức — và một
 * cảnh báo lúc nào cũng kêu thì chẳng ai đọc nữa, tức là mất luôn cả lần nó đúng.
 *
 * Chỉ leo MỘT bậc: danh mục của app tối đa hai cấp (cùng lý do với `groupSpent`).
 *
 * Mốc con KHÔNG được xét: hạn mức đặt ở con của nhóm đã có trần chỉ là mốc theo dõi bên
 * trong trần ấy, không phải một ràng buộc riêng của kế hoạch. Vỡ mốc con mà trần nhóm
 * vẫn phủ đủ thì kế hoạch chưa hỏng — đó là chuyện của mặt theo dõi khi tiền ra thật.
 *
 * Vắng mặt trong `budgetedByCat` = chưa đặt hạn mức = 0, tức là thiếu TOÀN BỘ.
 */
export function coverageGaps(
  byCategory: Map<string, number>,
  budgetedByCat: Map<string, number>,
  parentOf: (categoryId: string) => string | null = () => null,
): CoverageGap[] {
  // Gộp về danh mục MANG TRẦN trước rồi mới so: hai con của cùng một nhóm mỗi đứa một
  // khoản, so lẻ từng đứa thì cả hai đều "lọt" trong khi cộng lại đã vượt trần nhóm.
  const rolled = new Map<string, number>()
  for (const [categoryId, committed] of byCategory) {
    const parent = parentOf(categoryId)
    const root = parent !== null && budgetedByCat.has(parent) ? parent : categoryId
    rolled.set(root, (rolled.get(root) ?? 0) + committed)
  }

  const out: CoverageGap[] = []
  for (const [categoryId, committed] of rolled) {
    const budgeted = budgetedByCat.get(categoryId) ?? 0
    if (committed > budgeted) {
      out.push({ categoryId, committed, budgeted, short: committed - budgeted })
    }
  }
  return out.sort((a, b) => b.short - a.short)
}
