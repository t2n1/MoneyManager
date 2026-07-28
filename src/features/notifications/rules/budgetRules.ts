// Luật ngân sách (mục 5, 6, 7 của spec) — THUẦN.
// Chu kỳ tháng theo month_start_day, KHÔNG phải ngày 1 dương lịch.
import { daysBetween, getMonthRange, monthKeyForDate } from '../../../lib/dates'
import type { AppNotification, NotificationInput } from '../types'

/** Tiêu vượt nhịp bao nhiêu điểm phần trăm thì báo. */
export const PACE_GAP = 0.25
/** Phải qua ít nhất bấy nhiêu phần của kỳ mới xét nhịp. */
export const PACE_MIN_ELAPSED = 1 / 3
/** Hạn mức phải chiếm ít nhất bấy nhiêu phần tổng hạn mức mới đáng báo. */
export const PACE_MIN_SHARE = 0.05

const BUDGET_ROUTE = '/reports?view=budget'

export function budgetRules(input: NotificationInput): AppNotification[] {
  const report = input.budgetReport
  if (!report) return [] // thiếu dữ liệu thì im, không đoán
  // Thiếu tỷ giá cho một loại tiền nào đó → buildBudgetReport (progress.ts) đã BỎ ÂM
  // THẦM giao dịch đó khỏi `spent`, tức mọi con số dưới đây đều là số THIẾU. Trang
  // Ngân sách mà thông báo này trỏ tới xử lý ca đó bằng một dòng vàng "Một phần chi
  // ngoại tệ chưa quy đổi được (đang chờ tỷ giá) nên có thể thiếu" (BudgetView.tsx);
  // một câu thông báo không có chỗ cho lời rào ấy, nên theo mục H của spec — thiếu dữ
  // liệu thì IM — giống hệt cách tổng kết tháng ở rhythmRules xử lý.
  //
  // Đây cũng là chốt thứ hai chặn lỗi C1: dù cổng dọn có mở sớm, bộ luật cũng không
  // sinh ra một mã tính từ số liệu thiếu, nên không có mã SAI để dọn dẹp lấy làm căn
  // cứ ("không thấy trong allKeys thì coi như xong").
  if (report.hasMissingRate) return []

  const out: AppNotification[] = []
  const nameOf = (id: string) =>
    input.categories.find((c) => c.id === id)?.name ?? 'Danh mục đã xóa'

  // Tỷ lệ ngày đã qua trong kỳ hiện tại.
  const monthKey = monthKeyForDate(input.todayISO, input.monthStartDay)
  const range = getMonthRange(monthKey, input.monthStartDay)
  const totalDays = daysBetween(range.start, range.end)
  const elapsedDays = daysBetween(range.start, input.todayISO)
  const elapsed = totalDays > 0 ? Math.min(1, Math.max(0, elapsedDays / totalDays)) : 0

  const realLines = report.lines.filter((l) => !l.isMarker && l.budgeted > 0)
  // Mẫu số của luật nhịp lấy THẲNG từ báo cáo, không tự cộng lại: report.totalBudgeted
  // (progress.ts) cộng đúng cùng tập dòng này, nên tự cộng chỉ tạo thêm một chỗ có thể
  // trôi lệch khỏi con số mà trang Ngân sách đang hiện.
  const totalBudgeted = report.totalBudgeted

  for (const l of realLines) {
    // Nhóm = mục có con CHƯA lưu trữ. Quyết định mục 5 hay mục 7, hai loại LOẠI TRỪ NHAU
    // tuyệt đối. Bỏ con đã lưu trữ là CỐ Ý: mục có đúng một con và con đó đã lưu trữ thì
    // thực chất là mục lá — nếu vẫn coi là nhóm thì (a) câu chữ ra "Nhóm X vượt trần" mà
    // không có phần "chủ yếu do" nào, và (b) nặng hơn: nó mang type budget-parent-over,
    // nên tắt "Vượt ngân sách tháng" trong cài đặt KHÔNG làm nó im.
    const children = input.categories.filter(
      (c) => c.parent_id === l.categoryId && !c.is_archived,
    )

    // --- Mục 5 (mục lá) / Mục 7 (nhóm): đã vượt ---
    // Dấu `>` chứ không phải `>=` (mục C.1 luật 5 của spec: chi tháng này > hạn mức).
    // Tiêu đúng bằng hạn mức thì chưa vượt — và nếu báo, câu chữ sẽ thành
    // "đã vượt ngân sách ¥0", một dòng đỏ vô nghĩa giữ chỗ suốt tháng. Ca đúng 100%
    // đã có mục 6 (tiêu nhanh hơn nhịp) lo, câu chữ hữu ích hơn.
    if (l.spent > l.budgeted) {
      const over = input.formatMoney(l.spent - l.budgeted, input.base)
      const usage = `Đã tiêu ${input.formatMoney(l.spent, input.base)} / ${input.formatMoney(l.budgeted, input.base)}`

      if (children.length > 0) {
        // Nêu tối đa 2 mục con tiêu nhiều nhất — thứ duy nhất mục 7 nói thêm được so với
        // mục 5. Không con nào tiêu (chi gán trực tiếp vào cha) → bỏ hẳn phần "chủ yếu do".
        const topChildren = children
          .map((c) => ({ name: c.name, spent: report.spentByCategory.get(c.id) ?? 0 }))
          .filter((c) => c.spent > 0)
          .sort((a, b) => b.spent - a.spent)
          .slice(0, 2)
        const blame =
          topChildren.length > 0
            ? ` — chủ yếu do ${topChildren.map((c) => c.name).join(' và ')}`
            : ''
        out.push({
          key: `budget-parent-over:${l.categoryId}`,
          kind: 'action',
          type: 'budget-parent-over',
          severity: 'high',
          title: `Nhóm ${nameOf(l.categoryId)} vượt trần ${over}${blame}`,
          detail: usage,
          to: BUDGET_ROUTE,
        })
      } else {
        out.push({
          key: `budget-over:${l.categoryId}`,
          kind: 'action',
          type: 'budget-over',
          severity: 'high',
          title: `${nameOf(l.categoryId)} đã vượt ngân sách ${over}`,
          detail: usage,
          to: BUDGET_ROUTE,
        })
      }
      continue // đã vượt thì không nói thêm chuyện nhịp
    }

    // --- Mục 6: tiêu nhanh hơn nhịp ---
    if (elapsed < PACE_MIN_ELAPSED) continue
    if (totalBudgeted > 0 && l.budgeted / totalBudgeted < PACE_MIN_SHARE) continue
    const spentRatio = l.spent / l.budgeted
    if (spentRatio - elapsed <= PACE_GAP) continue

    out.push({
      key: `budget-pace:${l.categoryId}`,
      kind: 'action',
      type: 'budget-pace',
      severity: 'medium',
      // Gọi tên y như nhánh "đã vượt" ở trên: cùng một danh mục mà lúc thì "Nhóm Sinh
      // hoạt", lúc thì "Sinh hoạt" thì người dùng tưởng là hai chỗ khác nhau.
      title: `${children.length > 0 ? 'Nhóm ' : ''}${nameOf(l.categoryId)} tiêu nhanh hơn nhịp`,
      detail: `Mới qua ${Math.round(elapsed * 100)}% tháng đã dùng ${Math.round(spentRatio * 100)}% hạn mức (${input.formatMoney(l.spent, input.base)} / ${input.formatMoney(l.budgeted, input.base)})`,
      to: BUDGET_ROUTE,
    })
  }

  return out
}
