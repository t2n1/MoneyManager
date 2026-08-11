// Mặt LẬP KẾ HOẠCH của tab Ngân sách — thuần, test được.
//
// Mặt theo dõi hỏi "còn bao nhiêu để tiêu". Mặt này hỏi câu song sinh: "còn bao nhiêu
// CHƯA CHIA". Lập ngân sách là chia thu nhập ra thành hạn mức, nên con số dẫn dắt cả
// màn là phần chưa chia, không phải phần đã tiêu.
//
// Chỗ quan trọng nhất của file: phần chưa phân bổ và dòng "Để dành" của khối cơ cấu
// KHÔNG phải hai phép tính. Chúng là một. Xem `planSummary`.

import type { BudgetRow, CategoryRow } from '../../types/database.types'
import { classificationBreakdown, type CategorySlice } from '../reports/aggregate'
import {
  axisProgress,
  axisSlices,
  type AxisProgress,
  type AxisTargets,
} from './axisTargets'

/** Mẫu số đến từ đâu — quyết định câu chú thích dưới con số thu. */
export type IncomeSource =
  /** người dùng tự khai cho tháng này (bảng month_plans) */
  | 'declared'
  /** trung bình các tháng đã hoàn tất */
  | 'baseline'
  /** không có gì để dựa vào — chưa lập kế hoạch được */
  | 'unknown'

export interface PlanSummary {
  /** mẫu số đang dùng (base minor); 0 khi `incomeSource = 'unknown'` */
  income: number
  incomeSource: IncomeSource
  /** tổng hạn mức đã đặt, KHÔNG gồm mốc con */
  allocated: number
  /** income − allocated; ÂM = chia quá tay đúng chừng đó */
  unallocated: number
  /** cơ cấu theo KẾ HOẠCH; null khi chưa có mẫu số */
  axis: AxisProgress | null
}

/**
 * Tháng đang xem đã bắt đầu chưa — quyết định trang Ngân sách bày mặt nào.
 *
 * So bằng NGÀY BẮT ĐẦU KỲ chứ không phải mùng 1: ai đặt `month_start_day = 25` thì
 * "tháng 9" của họ khởi động từ 25/8, và hôm 26/8 mà còn bày mặt lập kế hoạch là bày
 * kế hoạch cho một tháng đang tiêu dở.
 *
 * Tháng ĐANG CHẠY dùng mặt theo dõi kể cả trong vài ngày đầu: nó đã có băng "thu ước
 * tính" lo phần chưa tới ngày lương, và mọi hạn mức vẫn sửa được ở đó. Thêm một nút
 * gạt tay giữa hai mặt chỉ tổ đẻ ra câu hỏi "đang ở mặt nào".
 */
export function isPlanningMonth(rangeStartISO: string, todayISO: string): boolean {
  return rangeStartISO > todayISO
}

/**
 * Các hạn mức TÍNH VÀO TỔNG kế hoạch, dạng lát để đưa thẳng vào phép gộp trục.
 *
 * Bỏ mốc con theo đúng luật của `buildBudgetReport`: hạn mức đặt ở con của một nhóm
 * đã có trần cha chỉ là mốc theo dõi BÊN TRONG trần đó. Cộng cả hai là đếm một đồng
 * hai lần, và tổng kế hoạch sẽ phình ra vượt thu nhập trong khi chẳng có gì sai.
 *
 * Dùng `amount` GỐC chứ không phải `budgeted` của báo cáo (đã cộng phần dồn): phần
 * dồn từ tháng trước chỉ chốt được khi tháng trước đã đóng sổ. Lập kế hoạch cho tháng
 * sau mà cộng phần dồn của tháng đang còn dở là chia một khoản tiền chưa biết có hay
 * không.
 */
export function plannedSlices(
  budgets: BudgetRow[],
  parentOf: (categoryId: string) => string | null = () => null,
): CategorySlice[] {
  const budgetedIds = new Set(budgets.map((b) => b.category_id))
  const out: CategorySlice[] = []
  for (const b of budgets) {
    const parent = parentOf(b.category_id)
    if (parent != null && budgetedIds.has(parent)) continue
    out.push({ categoryId: b.category_id, amount: b.amount })
  }
  return out
}

/**
 * Gộp kế hoạch của một tháng: mẫu số, đã chia, chưa chia, và cơ cấu theo kế hoạch.
 *
 * `declaredIncome` thắng `baseline` kể cả khi nó bằng 0 — 0 ở đây là con số THẬT
 * (tháng nghỉ không lương), không phải "chưa khai". Chưa khai là `null`.
 *
 * Cơ cấu dùng lại `axisProgress` thay vì tự cộng lấy, và đó là chủ ý: hàm đó tính
 * `tiết kiệm = mẫu số − tổng chi`. Đưa TỔNG HẠN MỨC vào chỗ "tổng chi" thì dòng
 * "Để dành" ra đúng bằng `unallocated`. Nghĩa là mỗi lần người dùng nâng một hạn mức,
 * con số to trên đầu màn và thanh Để dành nhúc nhích cùng nhau vì chúng LÀ một phép
 * tính — không phải hai phép tính được canh cho khớp, thứ sớm muộn sẽ lệch.
 */
export function planSummary(
  declaredIncome: number | null,
  baseline: number | null,
  budgets: BudgetRow[],
  categories: CategoryRow[],
  targets: AxisTargets,
  parentOf: (categoryId: string) => string | null = () => null,
): PlanSummary {
  const slices = plannedSlices(budgets, parentOf)
  const allocated = slices.reduce((s, x) => s + x.amount, 0)

  const income = declaredIncome !== null ? declaredIncome : (baseline ?? 0)
  const incomeSource: IncomeSource =
    declaredIncome !== null ? 'declared' : baseline !== null ? 'baseline' : 'unknown'

  return {
    income,
    incomeSource,
    allocated,
    unallocated: income - allocated,
    axis: axisProgress(
      income,
      classificationBreakdown(slices, categories),
      targets,
      null,
      axisSlices(slices, categories),
    ),
  }
}
