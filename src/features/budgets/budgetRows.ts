// Ba phép tính thuần cho danh sách "Hạn mức từng mục" (mặt theo dõi) — không React.
//
// Vì sao tách khỏi BudgetView: cả ba đều là luật đọc ra được thành câu, và câu đó phải
// kiểm được bằng test không cần render. Component chỉ bày ra kết quả.
//
//  1. `splitQuiet` — gấp các mục CHƯA CHI GÌ vào một dòng. Ngày 2/30 danh sách có 13 mục
//     mà 10 mục là "¥0 / … 0%": ba mục có chuyện để xem bị chôn giữa mười mục không có gì.
//  2. `childState` — một mục con đang ở trạng thái nào: đã trả xong (khoản cố định, không
//     còn gì để phanh), có mốc, hay chưa đặt mốc.
//  3. `applyDraftLimit` — báo cáo NHÌN THẤY trong lúc đang kéo thanh trượt, trước khi ghi.
//     Áp luôn luật "trần cha = tổng con" (xem `parentsToResync`) để số trên màn lúc kéo
//     bằng đúng số sẽ có sau khi nhả tay — kéo mà số nhảy lúc lưu là app nói dối trong
//     lúc kéo.

import type { CategoryRow } from '../../types/database.types'
import type { BudgetChildRow, BudgetDisplayItem } from './budgetDisplay'
import { spentOf } from './budgetSort'
import { statusOf, type BudgetLine, type BudgetReport } from './progress'

/** Từ bao nhiêu mục "yên" trở lên thì mới gấp — một mục thì gấp cũng tốn đúng một dòng. */
export const QUIET_MIN_FOLD = 2

export interface QuietSplit {
  /** Mục còn hiện từng dòng — giữ thứ tự đầu vào. */
  shown: BudgetDisplayItem[]
  /** Mục gấp vào dòng "chưa chi gì" — giữ thứ tự đầu vào. */
  quiet: BudgetDisplayItem[]
  /** Tổng hạn mức của các mục gấp — dòng gấp nói "còn ¥X" bằng số này. */
  quietBudgeted: number
}

/**
 * Mục "yên" = chưa chi một đồng nào trong tháng, và không nằm trong danh sách cần để ý
 * (`keep`). Mục cần để ý không bao giờ bị gấp, dù luật hiện tại không thể chọn một mục
 * chưa chi gì — giữ điều kiện này để luật kia đổi sau không kéo theo lỗi ở đây.
 */
export function splitQuiet(
  items: BudgetDisplayItem[],
  keep: ReadonlySet<string>,
  minFold = QUIET_MIN_FOLD,
): QuietSplit {
  const quiet = items.filter((i) => spentOf(i) === 0 && !keep.has(i.cat.id))
  if (quiet.length < minFold) return { shown: items, quiet: [], quietBudgeted: 0 }
  const quietIds = new Set(quiet.map((i) => i.cat.id))
  return {
    shown: items.filter((i) => !quietIds.has(i.cat.id)),
    quiet,
    quietBudgeted: quiet.reduce(
      (s, i) => s + (i.kind === 'leaf' ? i.line.budgeted : i.budgeted),
      0,
    ),
  }
}

export type ChildState = 'paid' | 'marker' | 'unset'

/**
 * "Đã trả" chỉ dành cho khoản CỐ ĐỊNH đã chi ĐÚNG BẰNG mốc: tiền nhà ¥112,760 / ¥112,760.
 * Khoản biến đổi chi đúng bằng mốc thì vẫn là "vừa hết hạn mức" — nó không phải việc đã
 * xong, nó là việc phải dừng. Chi QUÁ mốc dù cố định cũng không phải "đã trả": có gì đó
 * sai (mốc đặt thấp, hoặc trả hai lần) và người dùng cần thấy số vượt.
 */
export function childState(child: BudgetChildRow): ChildState {
  const m = child.marker
  if (!m) return 'unset'
  const rest = Math.round(m.budgeted - m.spent)
  if (child.cat.cost_type === 'fixed' && m.budgeted > 0 && rest === 0) return 'paid'
  return 'marker'
}

function relined(l: BudgetLine, budgeted: number): BudgetLine {
  const ratio = budgeted > 0 ? l.spent / budgeted : 0
  return { ...l, budgeted, ratio, status: statusOf(ratio) }
}

/**
 * Báo cáo với hạn mức của `categoryId` tạm thay bằng `amount` (số ĐẶT TAY, chưa cộng dồn).
 *
 * Nếu danh mục là CON của một nhóm có trần riêng, trần cha cũng đổi theo thành tổng các
 * con — đúng việc `parentsToResync` sẽ làm lúc ghi. Tổng đó cộng số đặt tay của từng con
 * (dòng của con có `budgeted` đã gồm phần dồn, nên phải trừ `carried` ra trước).
 *
 * Không đụng `totalBudgeted`/`overCount`…: thẻ tổng ở trên vẫn nói số ĐÃ LƯU. Kéo một
 * mục mà con số to nhất của trang cũng nhảy theo thì mắt không biết nhìn đâu.
 *
 * Danh mục không có dòng hạn mức thì trả nguyên báo cáo: thanh trượt chỉ mở trên dòng đã
 * có hạn mức, nên đây là nhánh phòng hờ, không phải nhánh thật.
 */
export function applyDraftLimit(
  report: BudgetReport,
  categories: readonly CategoryRow[],
  categoryId: string,
  amount: number,
): BudgetReport {
  const own = report.lines.find((l) => l.categoryId === categoryId)
  if (!own) return report
  const lines = report.lines.map((l) =>
    l.categoryId === categoryId ? relined(l, amount + l.carried) : l,
  )

  const parentId = categories.find((c) => c.id === categoryId)?.parent_id ?? null
  const parentLine = parentId ? lines.find((l) => l.categoryId === parentId) : undefined
  if (parentId && parentLine) {
    const siblingIds = new Set(
      categories.filter((c) => c.parent_id === parentId && !c.is_archived).map((c) => c.id),
    )
    const total = lines.reduce(
      (s, l) => (siblingIds.has(l.categoryId) ? s + (l.budgeted - l.carried) : s),
      0,
    )
    const i = lines.indexOf(parentLine)
    lines[i] = relined(parentLine, total + parentLine.carried)
  }
  return { ...report, lines }
}
