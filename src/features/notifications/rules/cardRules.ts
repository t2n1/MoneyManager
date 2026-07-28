// Luật thẻ tín dụng (mục 8 của spec) — THUẦN.
//
// CỐ Ý LỆCH KHỎI MỤC B của spec. Mục B nói phần kỳ trong mã tin-để-biết dùng `MonthKey`
// (chu kỳ theo `month_start_day`), nhưng mã ở đây dùng THÁNG DƯƠNG LỊCH `<y>-<mm>`. Lý do:
// kỳ sao kê là của nhà phát hành thẻ, không liên quan gì tới chu kỳ tháng người dùng tự
// đặt trong app — thẻ Rakuten chốt ngày 31 thì nó chốt ngày 31 dương lịch, dù người dùng
// khai tháng bắt đầu từ 25. Lấy MonthKey ở đây là để một con số của app quyết định một
// mốc của ngân hàng.
//
// An toàn về hành vi: một ngày-trong-tháng bất kỳ xuất hiện đúng MỘT lần mỗi tháng dương
// lịch VÀ cũng đúng một lần mỗi kỳ MonthKey, nên không thể báo hai lần trong cùng kỳ theo
// cả hai cách đánh mã. Nhưng ĐỪNG "dọn cho nhất quán" thành `monthKeyForDate`: mã đổi là
// mọi dòng "đã tắt" của người dùng hiện tại mất tác dụng và tin đã tắt sống lại. Có phép
// thử với monthStartDay = 25 ghim đúng chuyện này ở cardRules.test.ts.
import type { AppNotification, NotificationInput } from '../types'

const pad = (n: number) => String(n).padStart(2, '0')
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate()

export function cardRules(input: NotificationInput): AppNotification[] {
  const [y, m, d] = input.todayISO.split('-').map(Number)
  const lastDay = daysInMonth(y, m)
  const out: AppNotification[] = []

  for (const a of input.accounts) {
    if (a.type !== 'card' || a.is_archived) continue
    if (a.statement_day == null) continue
    // Ngày chốt của tháng dương lịch này, kẹp về cuối tháng khi tháng ngắn hơn.
    const closeDay = Math.min(a.statement_day, lastDay)
    if (d !== closeDay) continue

    out.push({
      key: `card-statement-day:${a.id}:${y}-${pad(m)}`,
      kind: 'info',
      type: 'card-statement-day',
      severity: 'low',
      title: `Hôm nay ${a.name} chốt sao kê`,
      detail: 'Mua từ mai sẽ trả vào kỳ tháng sau.',
      onISO: input.todayISO,
      to: `/assets/${a.id}`,
    })
  }

  return out
}
