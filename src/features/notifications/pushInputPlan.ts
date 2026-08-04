// Hai quyết định của edge function mà nếu sai thì SAI ÂM THẦM — THUẦN, để test được.
//
// `supabase/functions/push-notify/loadInput.ts` chỉ còn việc đọc bảng. Hai phép dưới đây
// từng nằm trong đó, và đó là chỗ tệ nhất để đặt chúng: sai một chỗ thì push vẫn gửi,
// vẫn 201, chỉ là con số trong thông báo thiếu — không lỗi, không log, không ai biết.
//
// Không import gì của Supabase hay Deno ở file này.
import { addDaysISO, getMonthRange, monthKeyForDate } from '../../lib/dates'

/**
 * Loại tiền có tài khoản nhưng KHÔNG có tỷ giá để quy về `base`.
 *
 * Vì sao phải chặn: `buildBudgetReport` gặp giao dịch không quy đổi được thì BỎ QUA nó
 * và chỉ bật cờ `hasMissingRate`. Nên nếu cứ gửi, thông báo sẽ nói "Ăn uống vượt hạn mức
 * ¥3.000" khi thật ra là ¥30.000. Trên trình duyệt chuyện này đã bị chặn bằng cổng
 * `ratesOk` (mục E của spec); đây là cổng tương ứng phía server.
 *
 * `base` không bao giờ cần tỷ giá (1 đổi 1) nên luôn bị loại khỏi kết quả.
 */
export function missingRateCurrencies(
  accountCurrencies: string[],
  base: string,
  rates: Record<string, number>,
): string[] {
  const canKiem = new Set(accountCurrencies)
  canKiem.delete(base)
  return [...canKiem].filter((c) => !Number.isFinite(rates[c])).sort()
}

/** Ba cửa sổ giao dịch mà bộ luật cần, cắt từ MỘT lần đọc. */
export interface TxWindows<T> {
  /** Giao dịch thuộc "tháng này" theo `monthStartDay`. */
  monthTxs: T[]
  /** Tháng trước — chỉ dùng để tính phần hạn mức dồn sang (mục AH). */
  prevMonthTxs: T[]
  /** `recentDays` ngày gần nhất, cho các luật nhịp/lệch kế hoạch. */
  recentTxs: T[]
}

/**
 * Ngày sớm nhất cần đọc để phủ CẢ ba cửa sổ.
 *
 * Phải đi qua `getMonthRange`, KHÔNG được ghép `'<YYYY-MM>-01'`: với
 * `month_start_day = 25` thì "tháng trước" bắt đầu ngày 25 của tháng trước nữa, tức là
 * SỚM HƠN ngày 01 — ghép chuỗi là đọc thiếu giao dịch và phần dồn hạn mức bị tính hụt.
 * Người dùng đặt kỳ theo ngày lương thì gặp ngay.
 */
export function earliestNeededDate(
  todayISO: string,
  monthStartDay: number,
  recentDays: number,
): string {
  const thisMonth = monthKeyForDate(todayISO, monthStartDay)
  const prevMonthStart = getMonthRange(
    monthKeyForDate(addDaysISO(getMonthRange(thisMonth, monthStartDay).start, -1), monthStartDay),
    monthStartDay,
  ).start
  const recentStart = addDaysISO(todayISO, -recentDays)
  return prevMonthStart < recentStart ? prevMonthStart : recentStart
}

/**
 * Cắt một mẻ giao dịch thành ba cửa sổ. Đọc một lần rồi cắt trong bộ nhớ, thay vì ba
 * lần đi mạng cho ba khoảng chồng nhau.
 */
export function splitTxWindows<T extends { occurred_on: string }>(
  txs: T[],
  todayISO: string,
  monthStartDay: number,
  recentDays: number,
): TxWindows<T> {
  const thisMonth = monthKeyForDate(todayISO, monthStartDay)
  const prevMonth = monthKeyForDate(
    addDaysISO(getMonthRange(thisMonth, monthStartDay).start, -1),
    monthStartDay,
  )
  const recentStart = addDaysISO(todayISO, -recentDays)

  const monthTxs: T[] = []
  const prevMonthTxs: T[] = []
  const recentTxs: T[] = []

  for (const t of txs) {
    const key = monthKeyForDate(t.occurred_on, monthStartDay)
    if (key.year === thisMonth.year && key.month === thisMonth.month) monthTxs.push(t)
    else if (key.year === prevMonth.year && key.month === prevMonth.month) prevMonthTxs.push(t)
    // `recentTxs` KHÔNG phải nhánh else: nó chồng lên hai cửa sổ trên, một giao dịch
    // hôm nay vừa thuộc "tháng này" vừa thuộc "90 ngày gần đây".
    if (t.occurred_on >= recentStart) recentTxs.push(t)
  }

  return { monthTxs, prevMonthTxs, recentTxs }
}
