// Luật nhắc lệch kế hoạch Lifetime — THUẦN.
// Năm hiện tại suy từ input.todayISO, KHÔNG đọc đồng hồ hệ thống.
import { daysBetween } from '../../../lib/dates'
import { firstNegativeYear } from '../../lifetime/insights'
import { phaseForYear, projectLifetime } from '../../lifetime/project'
// Cùng lý do như rhythmRules.ts: "chi tiêu" phải là CÙNG một định nghĩa ở mọi nơi, nên
// dùng CÙNG một hàm. reports/aggregate.ts thuần (không React, không localStorage) nên
// import này không phá purity.test.ts.
import { expenseSign } from '../../reports/aggregate'
import { RECENT_TXS_DAYS } from '../types'
import type { AppNotification, NotificationInput } from '../types'

/** Lệch quá bao nhiêu phần mới đáng báo. */
export const DRIFT_THRESHOLD = 0.15
/**
 * Cửa sổ chi thực tế dùng để so sánh — ĐÚNG bằng cửa sổ mà `input.recentTxs` chứa.
 * Trước đây chỗ này giữ 92 trong khi loader chỉ nạp 90 ngày, tức hai con số phải tự
 * khớp bằng tay và dòng 91–92 ngày tuổi không bao giờ tồn tại. Xem `RECENT_TXS_DAYS`.
 */
const WINDOW_DAYS = RECENT_TXS_DAYS
/**
 * Cửa sổ phải trải ít nhất bấy nhiêu ngày mới được mở miệng.
 *
 * Phép quy năm hoá ở dưới chia theo SỐ NGÀY thật rồi nhân 365. Đó là phép đúng, nhưng
 * nó chỉ đúng khi mẫu số đủ lớn: một suất cơm ¥20.000 ghi HÔM NAY, với mẫu số 1 ngày,
 * ra 7.300.000/năm và luật đi báo "chi cao hơn kế hoạch 83%, tài sản có thể âm từ
 * 2034" — một con số bịa kèm một cái năm rất cụ thể. Người ghi sổ thưa, người vừa bỏ
 * quên một tuần, người mới dùng app đều rơi vào đúng hình dạng đó.
 *
 * Hướng sai an toàn là IM (mục H của spec thông báo): thiếu dữ liệu thì không nói,
 * chứ không nói một con số phóng đại tới 365 lần.
 */
const MIN_WINDOW_DAYS = 30

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
  // `sorted.length === 0` đã return ở trên nên hàm này luôn trả một chặng ở đây; vẫn
  // để `!phase` cho khớp chữ ký `T | undefined` của nó, và im thì đúng luật mục H.
  const phase = phaseForYear(sorted, currentYear)
  if (!phase || phase.annualExpenseMinor <= 0) return []

  // Chỉ lấy chi thật CÙNG loại tiền với chặng: quy đổi ở đây cần Rates, mà thiếu tỷ
  // giá thì con số sẽ THIẾU ÂM THẦM — theo mục H của spec thông báo, thiếu dữ liệu
  // thì im chứ không báo số sai.
  //
  // Bốn điều kiện dưới đây phải khớp ĐÚNG bộ LỌC của `suggestBaseline` (Task 5) — tức
  // cùng một định nghĩa "giao dịch nào được tính là chi tiêu". Luật này so con số thực
  // tế với `phase.annualExpenseMinor`, mà con số ấy thường do `suggestBaseline` sinh ra;
  // lệch một điều kiện là so hai định nghĩa "chi tiêu" khác nhau rồi báo lệch oan:
  //   - `TransactionRow` KHÔNG có cột `currency`. Loại tiền nằm ở TÀI KHOẢN, tra qua
  //     `input.currencyOf(t.account_id)` — đúng cách mọi hàm gộp ở reports/aggregate.ts làm.
  //   - `expenseSign(t)`: hoàn tiền là chi ÂM. Lấy `Math.abs` thẳng là cộng khoản trả
  //     hàng vào chi, thổi `actualAnnual` lên rồi báo "chi cao hơn kế hoạch".
  //   - `!t.is_debt_flow`: cho vay / trả nợ gốc không phải chi tiêu (giống rhythmRules.ts).
  //   - `days >= 0`: chặn biên dưới. Không có nó, một khoản ghi ngày tương lai vừa lọt
  //     vào tổng, vừa kéo `oldest` xuống làm mẫu số `days` sai theo.
  //
  // NHƯNG phép QUY NĂM HOÁ bên dưới thì CỐ Ý KHÁC `suggestBaseline`, và đừng "sửa" cho
  // giống: hàm kia làm tròn quãng dữ liệu về SỐ THÁNG (`Math.round(days / 30.44)`), nên
  // 44 ngày thành "1 tháng" và nó phóng chi lên 45%. Chỗ này chia theo SỐ NGÀY thật —
  // chính xác hơn. Được phép khác vì `phase.annualExpenseMinor` là một số ĐÃ LƯU và
  // người dùng SỬA ĐƯỢC, không phải một lệnh gọi `suggestBaseline` trực tiếp: cái phải
  // khớp là định nghĩa "chi tiêu", còn con số thì phải ĐÚNG chứ không phải GIỐNG. Cái
  // giá của phép chia theo ngày là mẫu số nhỏ thì kết quả nổ — xem `MIN_WINDOW_DAYS`.
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
  // KHÔNG `Math.max(1, …)` nữa: một sàn 1 ngày không cứu được gì, nó chỉ biến "không
  // đủ dữ liệu" thành "một con số phóng 365 lần". Đủ dữ liệu thì nói, không thì im.
  const days = daysBetween(oldest, input.todayISO)
  if (days < MIN_WINDOW_DAYS) return []

  // `t.amount * expenseSign(t)`, KHÔNG bọc `Math.abs`: `amount` có `check (amount > 0)`
  // nên hai lối cho cùng kết quả, nhưng bộ lọc trên hứa khớp `suggestBaseline` và hàm
  // đó viết đúng như dòng này — để lệch là bắt người đọc sau đi truy một khác biệt
  // không tồn tại.
  const windowSum = windowTxs.reduce((s, t) => s + t.amount * expenseSign(t), 0)
  // Hoàn tiền nhiều hơn chi (mua trước cửa sổ, trả hàng trong cửa sổ) làm tổng ÂM.
  // KHÔNG kẹp về 0: "cả quý không chi gì" cũng là một lời khẳng định sai, và số âm
  // nếu để chảy tiếp thì `drift` xuống dưới −100% (vô nghĩa về mặt số học) rồi
  // `projectLifetime` biến chặng đó thành NGUỒN THU, làm câu hệ quả nói ngược hẳn.
  if (windowSum <= 0) return []
  const actualAnnual = Math.round((windowSum / days) * 365)

  const planned = phase.annualExpenseMinor
  const drift = (actualAnnual - planned) / planned
  if (Math.abs(drift) < DRIFT_THRESHOLD) return []

  // Chiếu lại lần hai với chi phí THẬT để nói được hệ quả, không chỉ con số lệch.
  const planRows = projectLifetime(lt)
  const actualRows = projectLifetime({
    ...lt,
    // So bằng THAM CHIẾU (`p === phase`), không bằng `p.startYear`: `sorted` là bản sao
    // của mảng nên nó giữ ĐÚNG các object của `lt.phases`, và `phase` là một trong số
    // đó — so tham chiếu vừa chính xác vừa rẻ hơn. So theo giá trị chỉ an toàn nhờ
    // `unique (scenario_id, start_year)` của Postgres; `demoRepo` không ràng buộc gì,
    // nên dữ liệu demo có hai chặng cùng `start_year` sẽ bị GHI ĐÈ CẢ HAI.
    phases: lt.phases.map((p) => (p === phase ? { ...p, annualExpenseMinor: actualAnnual } : p)),
  })
  // 'low' = biên DƯỚI của dải, ĐÚNG nhánh mà mọi màn hình thông báo này dẫn tới đang
  // đọc (LifetimeChartCard, InsightCards). Đọc 'center' ở đây là bấm
  // vào thông báo "âm từ 2034" rồi rơi vào một trang ghi năm khác — với mặc định
  // `band_spread_bps = 150` của migration 0031, hai nhánh lệch nhau hẳn nhiều năm.
  const planNeg = firstNegativeYear(planRows, 'low')
  const actualNeg = firstNegativeYear(actualRows, 'low')

  const pct = Math.abs(Math.round(drift * 100))
  const direction = drift > 0 ? 'cao hơn' : 'thấp hơn'
  const title = `Chi thực tế ${direction} kế hoạch ${pct}%`

  // XÉT `planNeg` TRƯỚC: nếu hỏi `actualNeg === null` trước thì ca đáng nói nhất của cả
  // luật này — chi thật thấp hơn kế hoạch đủ để mốc âm BIẾN MẤT — bị trả lời bằng câu
  // "vẫn không năm nào âm", tức phủ nhận đúng cái tin tốt vừa xảy ra.
  let consequence: string
  if (actualNeg === null && planNeg !== null) consequence = `Mốc âm ${planNeg} biến mất.`
  else if (actualNeg === null) consequence = 'Bản chiếu vẫn không năm nào âm.'
  else if (planNeg === null) consequence = `Với mức chi này, tài sản có thể âm từ ${actualNeg}.`
  else if (actualNeg !== planNeg) consequence = `Mốc âm dịch từ ${planNeg} sang ${actualNeg}.`
  else consequence = `Mốc âm vẫn ở ${actualNeg}.`

  // Nói RA con số và cửa sổ đã dùng. Không có nó thì "cao hơn 83%" là một tỷ lệ không
  // ai kiểm lại được: người dùng không biết luật đã lấy bao nhiêu ngày và ra bao nhiêu
  // một năm, nên cũng không phát hiện được lúc nó tính sai.
  const detail =
    `Quy năm ${input.formatMoney(actualAnnual, phase.currency)} theo ${days} ngày gần đây. ` +
    consequence

  return [
    {
      // Việc-cần-làm → mã KHÔNG chứa kỳ, để một việc chỉ báo một lần tới khi hết.
      key: 'lifetime-drift:current',
      kind: 'action',
      type: 'lifetime-drift',
      severity: 'low',
      title,
      detail,
      to: '/assets?view=future',
    },
  ]
}
