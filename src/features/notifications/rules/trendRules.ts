// Điểm gãy mức chi (§4.9 — hạng mục "mới" cuối cùng của bảng việc-phải-làm).
//
// Câu hỏi nó trả lời: "hạn mức đang đặt theo nếp sống nào?". Ngân sách thường được đặt
// một lần rồi để đó; nếp sống thì đổi — chuyển nhà, có con, đổi việc. Khi mức chi hằng
// tháng bước sang một bậc khác VÀ Ở YÊN đó vài tháng, cái trần cũ không còn là một mục
// tiêu nữa, nó chỉ là một con số bị vượt mỗi tháng cho tới khi người ta thôi nhìn.
//
// KHÔNG tính lại gì: `detectChangePoints` của reports/trends.ts đã làm phần thống kê
// (chia đôi đệ quy, thống kê t hai mẫu). §4.9 nói rõ "đừng tính lại bất cứ điều kiện nào
// ở tầng UI" — ở đây cũng vậy, luật chỉ gọi hàm đã có rồi diễn đạt kết quả.
//
// THUẦN như mọi file trong rules/: không React, không window, không Date.now(). Ngày hôm
// nay đến từ `input.todayISO`. `tests/…/purity.test.ts` canh theo cả đồ thị import, và
// `reports/trends.ts` thuần nên import được — nó chỉ nhận number[] và trả number.
//
// KHÔNG BAO GIỜ ĐẨY QUA PUSH, và đây là CHỦ Ý chứ không phải tình cờ.
// `supabase/functions/push-notify/loadInput.ts` đọc ba cửa sổ giao dịch (tháng này,
// tháng trước, `recentDays`) — không có cửa sổ nào 12 tháng — nên `input.monthlyExpense`
// bên đó là undefined và luật trả về mảng rỗng. Giữ nguyên như vậy: việc này không có
// hạn chót nào, và đánh thức điện thoại ai đó để bảo họ "ngồi xuống sửa lại ngân sách"
// là dùng sai kênh gấp nhất mà app có. Nếu sau này có người nới cửa sổ của loadInput vì
// một luật khác, luật này sẽ TỰ ĐỘNG bật lên qua push — lúc đó phải chặn bằng danh sách
// loại được đẩy, đừng để nó lặng lẽ đi ra.
import { detectChangePoints } from '../../reports/trends'
import type { AppNotification, NotificationInput } from '../types'

/**
 * Số tháng tối thiểu trong chuỗi.
 *
 * `minSegment: 4` cần ít nhất 8 tháng để có một chỗ cắt hợp lệ, nhưng 8 thì cú cắt duy
 * nhất có thể nằm đúng giữa và không còn chỗ nào để so — nó luôn "tìm ra" một điểm gãy.
 * 12 tháng cho chỗ cắt chạy được từ tháng 4 tới tháng 8, tức có thật một phép chọn.
 */
export const LEVEL_SHIFT_MIN_MONTHS = 12

/**
 * Mỗi đoạn ít nhất 4 tháng.
 *
 * Mặc định của `detectChangePoints` là 3 — đủ cho biểu đồ Xu hướng, nơi người dùng đang
 * NHÌN cả đường và tự đánh giá. Ở đây thì khác: đây là một việc app CHỦ ĐỘNG đẩy vào mặt
 * người dùng kèm đề nghị sửa ngân sách, nên nó phải chắc hơn. Ba tháng cao liền nhau có
 * thể chỉ là một chuyến đi; bốn tháng thì đã là một nếp.
 */
export const LEVEL_SHIFT_MIN_SEGMENT = 4

/**
 * Dưới mức này thì im, dù thống kê có chắc tới đâu.
 *
 * `detectChangePoints` đo độ CHẮC CHẮN (thống kê t), không đo độ LỚN: một người chi rất
 * đều, tháng nào cũng ¥200.000 ± 2.000, mà nhích lên ¥210.000 thì t rất cao — gãy thật
 * về mặt thống kê, nhưng 5% không đáng để ai mở ngân sách ra sửa. Cùng tinh thần với
 * ngưỡng chống nhiễu sẵn có của budgetRules.
 */
export const LEVEL_SHIFT_MIN_PCT = 15

/** Làm tròn nửa lên, giữ dấu — chỉ dùng cho phần trăm hiển thị. */
const pct = (before: number, after: number) =>
  before === 0 ? null : Math.round(((after - before) / Math.abs(before)) * 100)

/**
 * Một việc duy nhất, cho cú gãy GẦN NHẤT.
 *
 * Chỉ cú gần nhất: chuỗi 12 tháng có thể chứa hai bậc, nhưng bậc cũ thì người dùng đã
 * sống qua rồi — cái đang làm hạn mức sai là bậc hiện hành.
 *
 * Mã chứa THÁNG GÃY (`trend-level-shift:2026-03`) chứ không phải một mã cố định. Đây là
 * lựa chọn có chủ đích, ngược với `data-uncategorized:all`:
 *   · ở đó, mã phải cố định vì "thêm một khoản chưa phân loại" không phải tình huống
 *     mới — vẫn đúng một việc đó;
 *   · ở đây, một cú gãy MỚI là một tình huống MỚI đáng nói lại, còn cú gãy cũ mà người
 *     dùng đã ẩn thì phải ở yên trong kho đã-ẩn. Mã theo tháng cho cả hai điều đó.
 */
export function levelShiftRule(input: NotificationInput): AppNotification[] {
  const series = input.monthlyExpense
  if (!series || series.length < LEVEL_SHIFT_MIN_MONTHS) return []

  const values = series.map((p) => p.value)
  const points = detectChangePoints(values, {
    minSegment: LEVEL_SHIFT_MIN_SEGMENT,
    maxPoints: 1,
  })
  if (points.length === 0) return []

  const cp = points[points.length - 1]
  const doi = pct(cp.before, cp.after)
  // before = 0 (cả nửa đầu không chi đồng nào) là dữ liệu mới nhập chứ không phải nếp
  // sống đổi — không có phần trăm nào nói được điều đó cho tử tế.
  if (doi === null || Math.abs(doi) < LEVEL_SHIFT_MIN_PCT) return []

  // "ĐỔI HẲN **VÀ Ở YÊN**" — thống kê t một mình không nói được vế thứ hai.
  //
  // Ca dựng ra lỗi: chín tháng ¥200k rồi ba tháng ¥400k. `minSegment: 4` buộc chỗ cắt
  // lùi về tháng thứ 9, nên đoạn sau thành [200, 400, 400, 400] — trung bình ¥350k, t
  // rất cao, và luật báo "mức chi đổi hẳn từ tháng 9" trong khi tháng 9 vẫn y như cũ.
  // Một chuyến đi ba tháng bị đọc thành một nếp sống mới.
  //
  // Điều kiện thêm: MỌI tháng của đoạn sau phải nằm hẳn về phía mức mới, lấy trung điểm
  // giữa hai mức làm ranh giới. Rẻ, giải thích được bằng một câu, và loại đúng ca trên
  // (200 < 275) mà không đụng tới cú gãy thật (mọi tháng đều ≥ 251).
  const len = cp.after > cp.before
  const ranh = (cp.before + cp.after) / 2
  const doanSau = values.slice(cp.index)
  const oYen = len ? doanSau.every((v) => v >= ranh) : doanSau.every((v) => v <= ranh)
  if (!oYen) return []

  const thangGay = series[cp.index].month
  const soThang = values.length - cp.index

  // Có ngân sách thì so mức mới với chính cái trần — đó là "đề nghị sửa hạn mức" mà §4.9
  // yêu cầu. Chưa có thì vẫn báo cú gãy, nhưng không bịa ra một cái trần để so.
  const tran = input.budgetReport?.totalBudgeted
  const vuotTran = tran != null && tran > 0 && cp.after > tran
  const detail = vuotTran
    ? `Mức mới ${input.formatMoney(Math.round(cp.after), input.base)}/tháng, cao hơn tổng hạn mức ` +
      `${input.formatMoney(tran, input.base)}. Hạn mức đang đặt theo nếp cũ.`
    : `Trung bình ${soThang} tháng gần đây ${input.formatMoney(Math.round(cp.after), input.base)}/tháng, ` +
      `trước đó ${input.formatMoney(Math.round(cp.before), input.base)}.`

  return [
    {
      key: `trend-level-shift:${thangGay}`,
      kind: 'action',
      type: 'trend-level-shift',
      // Không bao giờ 'high': không có hạn chót nào, và một việc "ngồi xuống rồi sửa
      // ngân sách" mà xếp ngang với "mai bị trừ tiền thẻ" là làm hỏng cả thang mức độ.
      severity: 'medium',
      title: `Mức chi đổi hẳn từ ${thangGay} — ${len ? 'tăng' : 'giảm'} ${Math.abs(doi)}%`,
      detail,
      to: '/budget',
    },
  ]
}
