// Ướm MỘT cơ cấu chi vào TỪNG phương pháp phân bổ — thuần, test được.
//
// Vì sao cần: ô chọn phương pháp trong Cài đặt chỉ có tên và một câu mô tả, người dùng
// phải đoán "với nếp chi của mình thì phương pháp này sẽ phán ra sao". Bảng ướm trả lời
// thẳng câu đó bằng số thật 3 tháng gần nhất, TRƯỚC khi bấm chọn.
//
// Dùng lại đúng `axisProgress` của tab Ngân sách chứ không tự cộng lấy: bảng ướm nói
// "lệch 2 mốc" thì sang tab Ngân sách phải thấy đúng 2 mốc đó lệch — hai phép tính
// riêng là sớm muộn hai con số cãi nhau.

import type { ClassificationBreakdown } from '../reports/aggregate'
import { axisProgress } from './axisTargets'
import { BUDGET_METHODS, type BudgetMethod } from './budgetMethods'

export interface MethodFit {
  method: BudgetMethod
  /** tổng số mốc của phương pháp */
  total: number
  /** NHÃN các mốc đang lệch, theo thứ tự khoản của phương pháp */
  missed: string[]
}

/**
 * Ướm cơ cấu `data` (trên thu nhập `income`) vào từng phương pháp trong `methods`.
 *
 * `null` khi không có thu nhập — không có mẫu số thì mọi tỷ lệ vô nghĩa, thà không
 * hiện còn hơn hiện số bịa (cùng luật với `axisProgress`).
 *
 * `methods` mặc định là bộ chuẩn; nơi gọi thay phần tử bằng bản đã qua `resolveMethod`
 * khi muốn dòng của phương pháp ĐANG DÙNG phản ánh mốc người dùng đã chỉnh.
 */
export function methodFit(
  income: number,
  data: ClassificationBreakdown,
  methods: readonly BudgetMethod[] = BUDGET_METHODS,
): MethodFit[] | null {
  if (income <= 0) return null
  return methods.map((method) => {
    // income > 0 và không truyền baseline → axisProgress không bao giờ null.
    const axis = axisProgress(income, data, method)!
    return {
      method,
      total: axis.lines.length,
      missed: axis.lines.filter((l) => !l.ok).map((l) => l.label),
    }
  })
}

/**
 * Một mệnh đề cho một dòng ướm: "đạt cả 5 mốc" · "lệch 2/5 mốc — Hưởng thụ, Để dành".
 *
 * Khác `axisMissSummary` (tiêu đề thẻ Cơ cấu): ở đây các dòng đứng CẠNH NHAU để so,
 * nên lệch mấy mốc cũng phải gọi đủ tên — chính danh sách tên là thứ người đọc so.
 */
export function fitPhrase(f: MethodFit): string {
  if (f.missed.length === 0) return `đạt cả ${f.total} mốc`
  return `lệch ${f.missed.length}/${f.total} mốc — ${f.missed.join(', ')}`
}
