// Trần chi theo NHÃN — thuần, không phụ thuộc React, test được.
//
// Hạn mức danh mục hỏi "tháng này ăn uống bao nhiêu là đủ". Nhãn hỏi câu khác:
// "cả chuyến về VN cho phép tiêu bao nhiêu" — tiền nằm rải ở vé máy bay, quà,
// phong bì, tức ba danh mục khác nhau, nên không hạn mức danh mục nào chặn được.
//
// Hai kiểu kỳ do từng nhãn tự chọn (xem migration 0036):
//   'total'   — trần cho cả đời nhãn, không reset.
//   'monthly' — trần mỗi tháng, hết tháng reset.
//
// Ngưỡng ok/warn/over dùng chung `statusOf` của ngân sách danh mục: hai khối nằm
// cùng một màn hình, mà "vàng" ở khối này lại nghĩa khác khối kia thì người đọc
// phải học hai bảng màu.

import type { CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { TagBudgetPeriod, TagRow, TagSpendRow } from '../../types/database.types'
import { statusOf, type BudgetStatus } from '../budgets/progress'
import type { CurrencyOf } from '../reports/aggregate'

export interface TagBudgetLine {
  tagId: string
  name: string
  color: string
  period: TagBudgetPeriod
  /** đã chi (base minor) trong kỳ tương ứng với `period` */
  spent: number
  /** trần (base minor) */
  budget: number
  /** spent / budget */
  ratio: number
  /** còn tiêu được; ÂM = đã vượt bấy nhiêu */
  remaining: number
  status: BudgetStatus
  /**
   * Số danh mục nhãn này đang phủ, tính trên CẢ ĐỜI nhãn.
   *
   * Vì sao cả đời chứ không theo kỳ: trần kỳ 'monthly' ở tháng chưa tới có `spent = 0`,
   * nên đếm theo kỳ sẽ ra 0 danh mục — đúng con số vô dụng nhất. Câu cần trả lời là
   * "nhãn này chồng lên những hạn mức nào", và đó là một tính chất của nhãn, không phải
   * của tháng. Giao dịch chưa gắn danh mục không được đếm.
   */
  categoryCount: number
}

export interface TagBudgetReport {
  lines: TagBudgetLine[]
  /** true = có khoản ngoại tệ thiếu tỷ giá nên tổng đang thiếu */
  hasMissingRate: boolean
}

/** Dấu của một khoản chi: hoàn tiền trả lại phần đã tiêu nên mang dấu âm. */
const spendSign = (r: TagSpendRow) => (r.is_refund ? -1 : 1)

/**
 * Tổng chi theo nhãn từ các dòng `getTagSpend()`, quy về base.
 *
 * `within` lọc theo ngày — truyền hàm luôn-true cho kỳ 'total', truyền khoảng
 * tháng cho kỳ 'monthly'. Lọc ở đây chứ không ở truy vấn vì cùng một rổ dữ liệu
 * phải phục vụ cả hai kiểu kỳ trong một lần tải.
 *
 * Giao dịch mang HAI nhãn được cộng đủ vào CẢ HAI — đúng nghĩa "chuyến về VN" ∩
 * "quà cáp", giống hệt `tagBreakdown`. Nhãn trùng trên cùng giao dịch (dữ liệu
 * lỗi) chỉ tính một lần.
 */
export function tagSpendTotals(
  rows: TagSpendRow[],
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
  within: (occurredOn: string) => boolean = () => true,
): {
  byTag: Map<string, number>
  /** Danh mục đã phát sinh dưới mỗi nhãn — nguồn của `categoryCount`. */
  catsByTag: Map<string, Set<string>>
  hasMissingRate: boolean
} {
  const byTag = new Map<string, number>()
  const catsByTag = new Map<string, Set<string>>()
  const seen = new Set<string>()
  let hasMissingRate = false

  for (const r of rows) {
    if (!within(r.occurred_on)) continue
    const pair = `${r.tag_id}\0${r.transaction_id}`
    if (seen.has(pair)) continue
    seen.add(pair)

    const raw = convertToBase(r.amount, currencyOf(r.account_id), base, rates)
    if (raw === null) {
      hasMissingRate = true
      continue
    }
    byTag.set(r.tag_id, (byTag.get(r.tag_id) ?? 0) + raw * spendSign(r))
    if (r.category_id) {
      const set = catsByTag.get(r.tag_id) ?? new Set<string>()
      set.add(r.category_id)
      catsByTag.set(r.tag_id, set)
    }
  }

  return { byTag, catsByTag, hasMissingRate }
}

export interface TagBudgetInput {
  tags: TagRow[]
  rows: TagSpendRow[]
  currencyOf: CurrencyOf
  base: CurrencyCode
  rates: Rates
  /** Khoảng [start, end) của tháng đang xem — cho nhãn kỳ 'monthly'. */
  monthStart: string
  monthEnd: string
}

/**
 * Tiến độ của MỌI nhãn có đặt trần. Nhãn chưa đặt trần không có dòng nào.
 *
 * Nhãn đã LƯU TRỮ vẫn được tính: lưu trữ chỉ ẩn nhãn khỏi ô chọn khi nhập, số liệu
 * giữ nguyên (migration 0033). Một chuyến đi đã xong mà vẫn muốn xem tổng cuối cùng
 * so với dự trù là chuyện bình thường — giấu đi mới là mất dữ liệu người ta cần.
 *
 * Xếp theo `ratio` giảm dần: cái sắp vượt / đã vượt phải nằm trên đầu.
 */
export function buildTagBudgetReport({
  tags,
  rows,
  currencyOf,
  base,
  rates,
  monthStart,
  monthEnd,
}: TagBudgetInput): TagBudgetReport {
  const budgeted = tags.filter((t) => t.budget_amount != null && t.budget_amount > 0)
  if (budgeted.length === 0) return { lines: [], hasMissingRate: false }

  const inMonth = (iso: string) => iso >= monthStart && iso < monthEnd
  const all = tagSpendTotals(rows, currencyOf, base, rates)
  const month = tagSpendTotals(rows, currencyOf, base, rates, inMonth)

  const lines = budgeted.map((t): TagBudgetLine => {
    const period = t.budget_period
    const spent = (period === 'monthly' ? month.byTag : all.byTag).get(t.id) ?? 0
    const budget = t.budget_amount as number
    const ratio = spent / budget
    return {
      tagId: t.id,
      name: t.name,
      color: t.color,
      period,
      spent,
      budget,
      ratio,
      remaining: budget - spent,
      status: statusOf(ratio),
      categoryCount: all.catsByTag.get(t.id)?.size ?? 0,
    }
  })

  lines.sort((a, b) => b.ratio - a.ratio)
  return { lines, hasMissingRate: all.hasMissingRate || month.hasMissingRate }
}

export interface TagPlanLine {
  tagId: string
  name: string
  color: string
  period: TagBudgetPeriod
  /** số danh mục nhãn này đang phủ — xem `TagBudgetLine.categoryCount` */
  categoryCount: number
  /** trần gốc */
  budget: number
  /** đã tiêu tính vào trần đó — kỳ 'monthly' ở tháng chưa tới luôn là 0 */
  spent: number
  /** tiêu được bao nhiêu trong tháng đang lập; 0 = hết sạch, không bao giờ âm */
  available: number
  /** kỳ 'total' đã cạn hoặc vượt — không còn đồng nào để lập kế hoạch */
  exhausted: boolean
}

/**
 * Trần nhãn quy về câu hỏi của mặt LẬP KẾ HOẠCH: "tháng đang lập còn tiêu được bao
 * nhiêu trong trần này".
 *
 * Hai kiểu kỳ trả lời khác hẳn nhau, và đó là toàn bộ lý do hàm này tồn tại:
 *   'monthly' — reset đầu kỳ, nên tháng chưa tới có NGUYÊN trần để chia.
 *   'total'   — không reset, nên cái còn dùng được là phần chưa tiêu của cả đợt.
 *               Một chuyến đi đã tiêu 250k/300k thì tháng sau chỉ còn 50k, dù trần
 *               vẫn ghi 300k.
 *
 * `available` kẹp ở 0: đợt đã vượt trần thì tháng tới có 0 đồng để lập kế hoạch, chứ
 * không phải "âm 20k" — số âm ở ô hạn mức không tiêu được, chỉ làm phép cộng sai.
 * Phần vượt vẫn đọc được từ `spent` và `budget`.
 *
 * Nơi gọi phải đưa báo cáo dựng cho ĐÚNG tháng đang lập; hàm không tự đoán kỳ.
 */
export function tagPlanLines(lines: TagBudgetLine[]): TagPlanLine[] {
  return lines
    .map((l): TagPlanLine => ({
      tagId: l.tagId,
      name: l.name,
      color: l.color,
      period: l.period,
      categoryCount: l.categoryCount,
      budget: l.budget,
      spent: l.spent,
      available: Math.max(0, l.remaining),
      exhausted: l.period === 'total' && l.remaining <= 0,
    }))
    // Tự sắp chứ không tin thứ tự người gọi đưa vào: đợt sắp cạn phải nằm trên đầu,
    // vì đó là thứ bóp kế hoạch tháng tới. Trần tháng luôn đầy nên tự trôi xuống dưới.
    .sort((a, b) => {
      const ra = a.budget > 0 ? a.spent / a.budget : 0
      const rb = b.budget > 0 ? b.spent / b.budget : 0
      return rb - ra
    })
}
