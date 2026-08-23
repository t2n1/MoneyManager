// Phần THUẦN của tab Lịch — bản vẽ 1a "Nhịp tháng". Không JSX, unit-test được.
//
// Trước bản này ô ngày chỉ có hai con số thu/chi, nên lưới trả lời được đúng một câu:
// "ngày nào tiêu bao nhiêu". Ba thứ nó KHÔNG trả lời được, và ba thứ đó là lý do file
// này ra đời:
//   1. "ngày nào NẶNG" — mắt không so được hai con số ở hai đầu lưới, nhưng so được
//      hai vạch dài ngắn. Đó là `heat`.
//   2. "còn phải trả gì" — ngày chưa tới đang rỗng hoàn toàn, trong khi tiền điện ngày
//      25 và thẻ tới hạn ngày 27 là thứ đáng biết nhất khi nhìn nửa sau tháng. Đó là `mark`.
//   3. "tuần này so tuần trước" — tháng có nhịp tuần (cuối tuần tiêu nhiều), mà lưới
//      theo ngày không cộng lại được. Đó là `weeks`.
//
// KHÔNG tự gom giao dịch: mức chi theo ngày lấy từ `monthHeatmap` (`ledgerHeat.ts`) —
// cùng một con số với lưới nhiệt ở cột phụ tab Ngày. Hai chỗ trên cùng một trang tự
// đếm riêng là hai con số khác nhau cho cùng một ngày.
import type { TagColorKey } from '../tags/colors'
import type { Heatmap } from './ledgerHeat'

/** Loại dấu trong ô ngày. Bốn loại vì bốn nguồn khác nhau, không phải bốn màu. */
export type DayMarkKind = 'recurring' | 'planned' | 'card' | 'payday'

export interface DayMark {
  kind: DayMarkKind
  /** Tên hiện trong chip. */
  title: string
  /** Tiền của khoản (base minor). 0 với 'payday' và với khoản chưa biết giá. */
  amount: number
  /** Khoản sắp chi ghi 0 = "chưa biết bao nhiêu", không phải miễn phí. */
  unknownAmount: boolean
}

export interface DayMarkInput extends DayMark {
  iso: string
}

export interface CalendarCell {
  iso: string
  day: number
  /** Nhãn in trong ô: "7", hoặc "8/1" ở ngày 1 khi kỳ vắt sang tháng dương lịch sau. */
  label: string
  income: number
  /**
   * Chi của ngày. ÂM = ngày đó hoàn tiền nhiều hơn chi (xem `HeatCell.netExpense`) —
   * ô in nó bằng màu tiền VÀO, vì đó là thứ đã xảy ra.
   */
  expense: number
  /** Sau hôm nay. Ô chưa tới vẽ viền nét đứt, không nền. */
  future: boolean
  /** Thu > chi trong ngày. */
  netIn: boolean
  /** Bề rộng vạch nhiệt, 0…1. 0 = không vẽ vạch nào. */
  heat: number
  /** Vạch nhiệt đang vẽ theo CAM KẾT chưa ra, không theo tiền đã ra. */
  heatFromMark: boolean
  /** Dấu trong ô. Nhiều dấu cùng ngày thì lấy khoản LỚN NHẤT — xem `pickMark`. */
  mark: DayMark | null
  /** Tổng số dấu của ngày; chip chỉ vẽ một, nên nhãn trợ năng phải nói đủ. */
  markCount: number
  /** Khoá màu nhãn của chi trong ngày, đã cắt còn `maxTagDots`. */
  tagColors: TagColorKey[]
  /** Ngày này có giao dịch mang nhãn đang lọc. Không lọc = true ở mọi ngày. */
  inFilter: boolean
}

export interface CalendarWeek {
  /** Ngày đầu tiên của tuần CÓ TRONG KỲ — khoá React và nhãn trợ năng. */
  startISO: string
  /** Tổng chi của tuần (đã kẹp ≥ 0 theo từng ngày, cùng mẫu số với vạch nhiệt). */
  expense: number
  /** Cam kết chưa ra rơi vào tuần này. */
  marked: number
  /**
   * % lệch chi so với tuần TRƯỚC; null = không so được. Xem `weekDelta` để biết ba ca
   * cố ý trả null.
   */
  deltaPct: number | null
}

export interface CalendarMonth {
  cells: CalendarCell[]
  weeks: CalendarWeek[]
  /** Số ô trống chèn trước ngày đầu kỳ để cột thẳng với hàng thứ (CN đứng đầu). */
  leadingBlanks: number
  /** Ngày chi nhiều nhất của kỳ — mẫu số của mọi vạch nhiệt. 0 = kỳ chưa chi gì. */
  maxExpense: number
}

export interface CalendarMonthArgs {
  /** Chi/thu theo ngày của kỳ — `monthHeatmap` đã tính, đừng gom lại. */
  heat: Heatmap
  /** Ngày bắt đầu tháng tùy chỉnh; ≠ 1 thì ngày 1 phải in kèm tháng. */
  monthStartDay: number
  /** Cam kết chưa ra + thẻ tới hạn + ngày lương, đã gộp thành một danh sách. */
  marks: DayMarkInput[]
  /** Khoá màu nhãn theo ngày, đã sắp theo thứ tự nhãn của người dùng. */
  tagColorsByDay?: Map<string, TagColorKey[]>
  /** Ngày có giao dịch mang nhãn đang lọc; null = không lọc nhãn nào. */
  filterDays?: Set<string> | null
  /** Số chấm nhãn tối đa in trong một ô (desktop 3, mobile 2, 320px 1). */
  maxTagDots?: number
  /** Hôm nay — mốc để tuần đang chạy không hiện % lệch (xem `weekDelta`). */
  todayISO: string
}

/** Sàn của vạch nhiệt: một ngày CÓ tiêu không được trông giống ngày trắng. */
const HEAT_FLOOR = 0.06

/**
 * Dấu hiện trong ô khi một ngày có nhiều dấu.
 *
 * Ưu tiên theo TIỀN, không theo loại: chip chỉ đủ chỗ cho một dòng, và giữa "Netflix
 * 1,490" với "Thẻ Rakuten 42,300" cùng ngày thì con số lớn mới là thứ làm người ta đổi
 * kế hoạch. Ngày lương xuống cuối vì nó không mang tiền phải trả (`amount` = 0) — nó
 * chỉ đứng khi ngày đó không có gì phải trả.
 *
 * Khoản chưa biết giá (`unknownAmount`) đứng TRÊN ngày lương nhưng dưới mọi khoản có
 * giá: "chưa biết bao nhiêu" vẫn là tiền sắp ra, chỉ là chưa đo được.
 */
export function pickMark(marks: DayMark[]): DayMark | null {
  if (marks.length === 0) return null
  const rank = (m: DayMark) => (m.kind === 'payday' ? 0 : m.unknownAmount ? 1 : 2)
  return marks.reduce((best, m) => {
    const dr = rank(m) - rank(best)
    if (dr !== 0) return dr > 0 ? m : best
    return m.amount > best.amount ? m : best
  })
}

/**
 * % lệch chi của một tuần so với tuần liền trước. Ba ca trả null, cả ba là CỐ Ý:
 *
 *  - `prev` = 0 — chia cho 0. "Tăng vô hạn" không phải một tin dùng được.
 *  - tuần chứa HÔM NAY — nó mới đi được vài ngày, đem so với một tuần đủ 7 ngày thì
 *    con số luôn là "▼ giảm mạnh" cho tới thứ Bảy. Đúng loại số làm người ta thôi tin
 *    cả cột.
 *  - tuần CHƯA TỚI — chưa có gì để so.
 */
export function weekDelta(cur: number, prev: number, comparable: boolean): number | null {
  if (!comparable || prev <= 0) return null
  return Math.round(((cur - prev) / prev) * 100)
}

/**
 * Lưới của kỳ đang xem: ô ngày + cột Tuần.
 *
 * Mẫu số của vạch nhiệt là NGÀY CHI NHIỀU NHẤT của chính kỳ này, cùng luật với
 * `monthHeatmap` — hai tháng cạnh nhau không so được bằng độ dài vạch, và đó là đánh
 * đổi đã nhận: lưới trả lời "trong tháng này ngày nào nặng". Cam kết chưa ra cũng chia
 * theo mẫu số đó (không có mẫu số thứ hai), nên một cam kết lớn hơn mọi ngày đã chi sẽ
 * chạm 100% và dừng ở đó.
 */
export function buildCalendarMonth(args: CalendarMonthArgs): CalendarMonth {
  const {
    heat,
    monthStartDay,
    marks,
    tagColorsByDay,
    filterDays = null,
    maxTagDots = 3,
    todayISO,
  } = args

  const marksByDay = new Map<string, DayMark[]>()
  for (const m of marks) {
    const list = marksByDay.get(m.iso)
    if (list) list.push(m)
    else marksByDay.set(m.iso, [m])
  }

  /**
   * Tiền SẼ TIÊU của một ngày — mẫu số của vạch nhiệt tương lai và của dòng "+ ¥X lịch"
   * ở cột Tuần.
   *
   * Chỉ đếm cam kết CHI (`recurring` / `planned`). Hai loại kia cố ý đứng ngoài:
   *
   *   'payday' — không mang tiền phải trả (`amount` = 0), cộng vào cũng bằng 0.
   *   'card'   — kỳ thẻ tới hạn là CHUYỂN KHOẢN (thẻ → ngân hàng), không phải một
   *              khoản tiêu mới: từng lần quẹt đã là một giao dịch chi trong sổ từ lúc
   *              nó xảy ra. Cộng ngày rút thẻ vào đây là đếm cùng số tiền hai lần —
   *              cùng lý do `collectCommitments` không nhận rule `type = 'transfer'`.
   *              Thẻ vẫn có CHIP trong ô (lịch là màn của ngày, và "ngày nào thẻ bị
   *              rút" là câu chỉ lịch trả lời được), chỉ không vào phép tính nào.
   */
  const owedOf = (iso: string) =>
    (marksByDay.get(iso) ?? []).reduce(
      (s, m) => s + (m.kind === 'recurring' || m.kind === 'planned' ? m.amount : 0),
      0,
    )

  const maxExpense = heat.cells.reduce((m, c) => Math.max(m, c.expense), 0)

  const cells: CalendarCell[] = heat.cells.map((c) => {
    const dayMarks = marksByDay.get(c.iso) ?? []
    const owed = owedOf(c.iso)
    // Ngày ĐÃ QUA vẽ theo tiền đã ra, kể cả khi nó cũng có cam kết chưa ghi: cái đã
    // xảy ra thắng cái được hẹn. Ngày CHƯA TỚI thì chỉ có cam kết để vẽ.
    const fromMark = c.expense === 0 && owed > 0
    const raw = fromMark ? owed : c.expense
    return {
      iso: c.iso,
      day: c.day,
      label: dayLabel(c.iso, monthStartDay),
      income: c.income,
      expense: c.netExpense,
      future: c.future,
      netIn: c.netIn,
      heat: raw > 0 && maxExpense > 0 ? Math.min(1, Math.max(HEAT_FLOOR, raw / maxExpense)) : 0,
      heatFromMark: fromMark,
      mark: pickMark(dayMarks),
      markCount: dayMarks.length,
      tagColors: (tagColorsByDay?.get(c.iso) ?? []).slice(0, maxTagDots),
      inFilter: filterDays === null || filterDays.has(c.iso),
    }
  })

  // Chia hàng theo ĐÚNG lưới đang vẽ: hàng đầu bị các ô trống đẩy sang, nên tuần đầu
  // của kỳ có thể chỉ vài ngày. Cột Tuần phải khớp từng hàng chứ không phải "tuần
  // ISO" — nó đứng cạnh lưới và mắt đọc nó theo hàng.
  const rows: CalendarCell[][] = []
  for (let i = 0; i < cells.length + heat.leadingBlanks; i += 7) {
    rows.push(cells.slice(Math.max(0, i - heat.leadingBlanks), i + 7 - heat.leadingBlanks))
  }

  const weeks: CalendarWeek[] = []
  for (const row of rows) {
    if (row.length === 0) continue
    const expense = row.reduce((s, c) => s + Math.max(0, c.expense), 0)
    // Cùng luật với `heatFromMark`: chỉ ngày KHÔNG có chi thật mới đếm cam kết, để một
    // khoản đã ghi không bị cộng hai lần (một lần ở `expense`, một lần ở đây).
    const marked = row.reduce(
      (s, c) => s + (Math.max(0, c.expense) === 0 ? owedOf(c.iso) : 0),
      0,
    )
    const hasToday = row.some((c) => c.iso === todayISO)
    const allPast = row.every((c) => !c.future)
    const prev = weeks[weeks.length - 1]
    weeks.push({
      startISO: row[0].iso,
      expense,
      marked,
      deltaPct: weekDelta(expense, prev?.expense ?? 0, !hasToday && allPast),
    })
  }

  return { cells, weeks, leadingBlanks: heat.leadingBlanks, maxExpense }
}

/**
 * Nhãn ô ngày. Ngày 1 in kèm tháng ("9/1") khi `monthStartDay` ≠ 1: kỳ đó vắt sang
 * tháng dương lịch sau, nên trong cùng một lưới có hai ngày mang số nhỏ.
 */
export function dayLabel(iso: string, monthStartDay: number): string {
  const day = Number(iso.slice(8, 10))
  return day === 1 && monthStartDay !== 1 ? `${Number(iso.slice(5, 7))}/1` : String(day)
}

/**
 * Chi trung bình mỗi ngày trong `days` ngày gần nhất (kể cả hôm nay).
 *
 * Vì sao không dùng "chi tháng / số ngày đã qua": con số đó bị một ngày mua sắm lớn
 * đầu tháng kéo lệch suốt ba tuần sau, nên nó nói về quá khứ chứ không nói "đà HIỆN
 * TẠI". Khối "Còn được tiêu" cần cái thứ hai để đặt cạnh mức cho phép.
 *
 * Nhận ĐIỂM CHI THEO NGÀY (`dailyExpenseTotals`) chứ không nhận ô lịch, và đó là một
 * quyết định về PHẠM VI, không phải về kiểu dữ liệu: con số này đứng cạnh "còn tiêu được
 * ¥X/ngày", mà mức cho phép chỉ tính trên những mục ĐÃ ĐẶT HẠN MỨC. Lấy tổng chi mọi
 * danh mục làm nhịp thì hai con số cạnh nhau đo hai thứ khác nhau — ai chỉ đặt vài hạn
 * mức cũng đọc ra "đang tiêu gấp ba mức cho phép".
 *
 * Mẫu số là số ngày TRONG CỬA SỔ, không phải số ngày có chi: ngày không tiêu đồng nào là
 * một phần thật của nhịp. null khi cửa sổ rỗng.
 */
export function recentPace(
  points: readonly { date: string; expense: number }[],
  todayISO: string,
  days = 7,
): number | null {
  const inWindow = points.filter((p) => p.date <= todayISO).slice(-days)
  if (inWindow.length === 0) return null
  const total = inWindow.reduce((s, p) => s + Math.max(0, p.expense), 0)
  return Math.round(total / inWindow.length)
}
