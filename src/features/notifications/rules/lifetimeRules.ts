// Luật nhắc lệch kế hoạch Lifetime — THUẦN.
// Năm hiện tại suy từ input.todayISO, KHÔNG đọc đồng hồ hệ thống.
import { daysBetween } from '../../../lib/dates'
import { firstNegativeYear } from '../../lifetime/insights'
import { phaseForYear, projectLifetime } from '../../lifetime/project'
// Cùng lý do như rhythmRules.ts: "chi tiêu" phải là CÙNG một định nghĩa ở mọi nơi, nên
// dùng CÙNG một hàm. reports/aggregate.ts thuần (không React, không localStorage) nên
// import này không phá purity.test.ts.
import { expenseSign } from '../../reports/aggregate'
import type { AppNotification, NotificationInput } from '../types'

/** Lệch quá bao nhiêu phần mới đáng báo. */
export const DRIFT_THRESHOLD = 0.15
/** Cửa sổ chi thực tế dùng để so sánh. */
const WINDOW_DAYS = 92

export function lifetimeRules(input: NotificationInput): AppNotification[] {
  const lt = input.lifetime
  if (!lt) return [] // chưa có kịch bản / chưa khai năm sinh → im, không đoán

  // Năm hiện tại suy từ todayISO, KHÔNG đọc đồng hồ hệ thống (mục A của spec thông báo).
  const currentYear = Number(input.todayISO.slice(0, 4))
  const sorted = [...lt.phases].sort((a, b) => a.startYear - b.startYear)
  if (sorted.length === 0) return []
  // Chặng đang hiệu lực HÔM NAY, không phải chặng cuối danh sách. Lấy `.at(-1)` của cả
  // mảng là đi so chi tiêu 2026 với giả định của chặng Mỹ 2029 — sai hoàn toàn với
  // người dùng có kế hoạch chuyển nước. Dùng `phaseForYear` của project.ts chứ không
  // chép lại luật đó lần thứ tư — xem JSDoc của hàm ấy.
  const phase = phaseForYear(sorted, currentYear)
  if (phase.annualExpenseMinor <= 0) return []

  // Chỉ lấy chi thật CÙNG loại tiền với chặng: quy đổi ở đây cần Rates, mà thiếu tỷ
  // giá thì con số sẽ THIẾU ÂM THẦM — theo mục H của spec thông báo, thiếu dữ liệu
  // thì im chứ không báo số sai.
  //
  // Bốn điều kiện dưới đây phải khớp ĐÚNG bộ lọc của `suggestBaseline` (Task 5), vì
  // luật này so con số thực tế với chính giả định nền mà hàm đó sinh ra. Lệch một
  // điều kiện là so hai định nghĩa "chi tiêu" khác nhau rồi báo lệch oan:
  //   - `TransactionRow` KHÔNG có cột `currency`. Loại tiền nằm ở TÀI KHOẢN, tra qua
  //     `input.currencyOf(t.account_id)` — đúng cách mọi hàm gộp ở reports/aggregate.ts làm.
  //   - `expenseSign(t)`: hoàn tiền là chi ÂM. Lấy `Math.abs` thẳng là cộng khoản trả
  //     hàng vào chi, thổi `actualAnnual` lên rồi báo "chi cao hơn kế hoạch".
  //   - `!t.is_debt_flow`: cho vay / trả nợ gốc không phải chi tiêu (giống rhythmRules.ts).
  //   - `days >= 0`: chặn biên dưới. Không có nó, một khoản ghi ngày tương lai vừa lọt
  //     vào tổng, vừa kéo `oldest` xuống làm mẫu số `days` sai theo.
  // CỐ Ý không đặt tên biến này là `window`: file bộ luật phải chạy được trên Deno và
  // purity.test.ts cấm token `window.` ở bất kỳ đâu trong file engine — `window.length`
  // của một biến cục bộ vẫn khớp lệnh cấm đó (đã thấy đỏ thật khi đặt tên như vậy).
  const windowTxs = input.recentTxs.filter((t) => {
    const days = daysBetween(t.occurred_on, input.todayISO)
    return (
      t.type === 'expense' &&
      !t.exclude_from_stats &&
      !t.is_debt_flow &&
      input.currencyOf(t.account_id) === phase.currency &&
      days >= 0 &&
      days <= WINDOW_DAYS
    )
  })
  if (windowTxs.length === 0) return []

  const oldest = windowTxs.reduce(
    (m, t) => (t.occurred_on < m ? t.occurred_on : m),
    windowTxs[0].occurred_on,
  )
  const days = Math.max(1, daysBetween(oldest, input.todayISO))
  const actualAnnual = Math.round(
    (windowTxs.reduce((s, t) => s + Math.abs(t.amount) * expenseSign(t), 0) / days) * 365,
  )

  const planned = phase.annualExpenseMinor
  const drift = (actualAnnual - planned) / planned
  if (Math.abs(drift) < DRIFT_THRESHOLD) return []

  // Chiếu lại lần hai với chi phí THẬT để nói được hệ quả, không chỉ con số lệch.
  const planRows = projectLifetime(lt)
  const actualRows = projectLifetime({
    ...lt,
    phases: lt.phases.map((p) =>
      p.startYear === phase.startYear ? { ...p, annualExpenseMinor: actualAnnual } : p,
    ),
  })
  const planNeg = firstNegativeYear(planRows, 'center')
  const actualNeg = firstNegativeYear(actualRows, 'center')

  const pct = Math.abs(Math.round(drift * 100))
  const direction = drift > 0 ? 'cao hơn' : 'thấp hơn'
  const title = `Chi thực tế ${direction} kế hoạch ${pct}%`

  let detail: string
  if (actualNeg === null) detail = 'Bản chiếu vẫn không năm nào âm.'
  else if (planNeg === null) detail = `Với mức chi này, tài sản có thể âm từ ${actualNeg}.`
  else if (actualNeg !== planNeg) detail = `Mốc âm dịch từ ${planNeg} sang ${actualNeg}.`
  else detail = `Mốc âm vẫn ở ${actualNeg}.`

  return [
    {
      // Việc-cần-làm → mã KHÔNG chứa kỳ, để một việc chỉ báo một lần tới khi hết.
      key: 'lifetime-drift:current',
      kind: 'action',
      type: 'lifetime-drift',
      severity: 'low',
      title,
      detail,
      to: '/lifetime',
    },
  ]
}
