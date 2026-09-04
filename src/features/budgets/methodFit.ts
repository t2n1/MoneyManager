// Ướm MỘT cơ cấu chi vào TỪNG phương pháp phân bổ — thuần, test được.
//
// Vì sao cần: danh sách phương pháp trong sheet "Phân bổ ngân sách" phải trả lời được
// "với nếp chi của TÔI thì phương pháp này sẽ phán ra sao" NGAY TRÊN TỪNG TẤM THẺ,
// trước khi bấm chọn — không phải sau khi chọn rồi mới sang tab Ngân sách xem.
//
// Dùng lại đúng `axisProgress` của tab Ngân sách chứ không tự cộng lấy: thẻ ướm nói
// "Hưởng thụ 40% — quá trần 20%" thì sang tab Ngân sách phải thấy đúng con số đó —
// hai phép tính riêng là sớm muộn hai con số cãi nhau.

import type { CategoryRow } from '../../types/database.types'
import type { CategorySlice, ClassificationBreakdown } from '../reports/aggregate'
import { axisProgress, axisSlices, shareLabel, sharePct, type AxisProgress } from './axisTargets'
import { BUDGET_METHODS, type BudgetMethod } from './budgetMethods'

export interface MethodFit {
  method: BudgetMethod
  /** cơ cấu của kỳ ướm TÍNH THEO phương pháp này — dòng khoản, mốc, ok/lệch, slices */
  axis: AxisProgress
}

/**
 * Ướm cơ cấu `data` (trên thu nhập `income`) vào từng phương pháp trong `methods`.
 *
 * `null` khi không có thu nhập — không có mẫu số thì mọi tỷ lệ vô nghĩa, thà không
 * hiện còn hơn hiện số bịa (cùng luật với `axisProgress`).
 *
 * `methods` mặc định là bộ chuẩn; nơi gọi thay phần tử bằng bản đã qua `resolveMethod`
 * khi muốn thẻ của phương pháp ĐANG DÙNG phản ánh mốc người dùng đã chỉnh.
 *
 * Có `slices` + `categories` thì mỗi dòng khoản mang luôn danh mục đã góp vào —
 * sheet Phân bổ dùng chúng làm câu ví dụ "Của bạn: Tiền nhà, Cơm ngoài…".
 */
export function methodFit(
  income: number,
  data: ClassificationBreakdown,
  methods: readonly BudgetMethod[] = BUDGET_METHODS,
  slices: CategorySlice[] = [],
  categories: CategoryRow[] = [],
): MethodFit[] | null {
  if (income <= 0) return null
  return methods.map((method) => ({
    method,
    // income > 0 và không truyền baseline → axisProgress không bao giờ null.
    axis: axisProgress(income, data, method, null, axisSlices(slices, categories, method))!,
  }))
}

export interface FitBadge {
  tone: 'good' | 'warn'
  text: string
}

/**
 * Huy hiệu ướm của MỘT phương pháp, viết bằng lời thường kèm số — không thuật ngữ
 * "mốc/trục". Mỗi mốc lệch một huy hiệu ("Hưởng thụ 40% — quá trần 20%"); đạt hết
 * thì đúng một huy hiệu khen.
 *
 * Khoản sàn (Để dành) đi qua `shareLabel` để số âm ra chữ "Âm" — dấu trừ ở cỡ chữ
 * huy hiệu là thứ mắt trượt qua (xem lý do ở `shareLabel`).
 */
export function fitBadges(axis: AxisProgress): FitBadge[] {
  const missed = axis.lines.filter((l) => !l.ok)
  if (missed.length === 0) {
    return [{ tone: 'good', text: `hợp nếp chi hiện tại — đạt cả ${axis.lines.length} mốc` }]
  }
  return missed.map((l) => ({
    tone: 'warn' as const,
    text:
      l.direction === 'cap'
        ? `${l.label} ${sharePct(l.share)}% — quá trần ${Math.round(l.targetShare * 100)}%`
        : `giữ lại ${shareLabel(l.share)} — chưa tới sàn ${Math.round(l.targetShare * 100)}%`,
  }))
}
