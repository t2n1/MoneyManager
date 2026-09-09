// Khung của vùng vẽ Tương lai — THUẦN, không React, không DOM.
//
// VÌ SAO TÁCH RA KHỎI `TimelinePlot.tsx`. Ba thứ phải khớp nhau đến từng pixel mà nằm ở
// BA component khác nhau: đường trong `<svg>` (TimelinePlot), icon mốc phủ lên nó
// (EventPins), và dải khối chặng ở hàng dưới (PhaseLane). Chúng khớp được chỉ khi cùng
// đọc MỘT bộ lề và MỘT phép chiếu năm→pixel. Để lề nằm trong file component thì file thứ
// hai phải chép lại con số, và một bản chép là một chỗ để lệch — dải chặng lệch trục năm
// nửa năm thì không có test nào thấy, chỉ có mắt người dùng thấy.
//
// LỀ Ở DẠNG PX, CÓ CHỦ ĐÍCH (spec §5 quy `3,25rem`). Đây là toạ độ TRONG hộp đã đo, không
// phải tiện ích bố cục: cả bề ngang lẫn chiều cao hộp đều đo bằng ResizeObserver, nên khi
// `rem` to ra vì Cài đặt → Cỡ chữ thì hộp to ra và mọi tỷ lệ đi theo. Ngược lại, khai lề
// bằng `rem` rồi trộn với px đo được là hai hệ đo trong một phép tính — đúng lỗi đã có ở
// dải chip tạm của `TuongLaiPage` (`ml-[3.25rem]` = 52px ở cỡ Vừa nhưng 65px ở 1,25×,
// trong khi `PLOT_LEFT` trong SVG vẫn 52).
//
// `MIN_PHASE_YEAR`/`clampPhaseStartYear` KHÔNG ở đây: đó là luật DỮ LIỆU của chặng đời
// (phaseYear.ts), còn đây là hình học. Hai thứ gặp nhau ở chỗ gọi, không trộn vào nhau.
import { packRows } from './chartGeom'

/**
 * Lề vùng vẽ, PIXEL trong hệ toạ độ của hộp đã đo. Bản vẽ: `pl` 52 · `pbot` H−26; lề
 * phải ở đây là 12 (bản vẽ trừ cả bề rộng dock vì dock của nó là lớp phủ — ở đây dock là
 * một cột thật, xem ConsoleFrame).
 */
export const PLOT_LEFT = 52
export const PLOT_RIGHT_GAP = 12
export const PLOT_BOTTOM_GAP = 26

/** Hàng icon mốc: mép trên 44px, mỗi hàng 26px (1,625rem), rồi 16px hở tới vùng vẽ. */
export const PIN_TOP = 44
export const PIN_ROW_H = 26
export const PIN_GAP = 16

/**
 * Hình của một icon mốc, PIXEL — và đây là chỗ CỐ Ý không quy về `rem`, nói ra vì spec §5
 * quy "icon mốc 24px / chốt 18px → 1,5rem / 1,125rem".
 *
 * Lý do: các hàng icon cách nhau `PIN_ROW_H` = 26 PIXEL, con số nằm trong hệ toạ độ của
 * hộp đã đo và nó vào cả `plotTop` (chừa chỗ phía trên vùng vẽ). Cho icon 1,5rem thì ở Cỡ
 * chữ 1,25× nó cao 30px trong một hàng 26px — hai hàng icon ĐÈ lên nhau, đúng cái mà phép
 * xếp hàng chống va chạm tồn tại để tránh. Hai đại lượng này phải cùng một hệ đo; hệ của
 * chúng là px, giống `PLOT_LEFT`.
 *
 * Điều đó KHÔNG mở đường cho px ở chỗ khác: hộp bọc vẫn khai bằng `rem` (`h-[35rem]`,
 * `h-[2.875rem]`) nên nó vẫn nở theo Cỡ chữ, và icon không chứa CHỮ nào — nó là hình vẽ
 * trên đồ thị, cùng loại với chấm FIRE `r=5`.
 */
export const PIN_W = 24
/** Chốt năm kết thúc (bản vẽ: 18px). Cùng hệ đo với `PIN_W` — xem lời ghi ở trên. */
export const PIN_END_W = 18

/** Mép phải vùng vẽ. Sàn `PLOT_LEFT + 10` để hộp hẹp bất thường không cho span âm. */
export function plotRightOf(boxWidth: number): number {
  return Math.max(PLOT_LEFT + 10, boxWidth - PLOT_RIGHT_GAP)
}

/** Khoảng zoom của bản vẽ: 10 năm · 20 năm · cả đời. */
export type PlotZoom = 10 | 20 | 'all'

/**
 * `[x0, x1]` — khoảng năm ĐANG XEM. Bản vẽ: `viewRange()` (dòng 1182).
 *
 * Ở đây chứ không trong `TimelinePlot` vì dải chặng đời phải xem đúng khoảng đó: hai chỗ
 * tự tính lấy một khoảng là hai khoảng có thể lệch, và lệch một năm nghĩa là khối chặng
 * không còn nằm dưới đúng đoạn đường của nó.
 */
export function viewRange(
  currentYear: number,
  lastYear: number,
  zoom: PlotZoom,
): [number, number] {
  return [
    currentYear,
    zoom === 'all'
      ? Math.max(currentYear + 1, lastYear)
      : Math.min(lastYear, currentYear + zoom),
  ]
}

/** Một khối chặng trên dải, đã quy ra pixel trong hệ toạ độ của hộp đã đo. */
export interface LaneBlock {
  id: string
  /** Mép trái, pixel. */
  left: number
  width: number
  startYear: number
  /** Năm CUỐI còn thuộc chặng — `chặng kế − 1`, hoặc `x1` với chặng cuối. */
  endYear: number
  /** Chặng ĐẦU không có mép trái (năm của nó bị Bất biến 1 khoá, xem phaseYear.ts). */
  first: boolean
  /** Chặng CUỐI không có mép phải — không có chặng kế nào để dời. */
  last: boolean
}

/**
 * Dải khối chặng: KÍN TRỤC, KHÔNG HỞ, KHÔNG CHỒNG.
 *
 * Bất biến đó đến từ đúng một dòng: mép phải của khối `i` là `xs(chặng[i+1].startYear)`,
 * tức HAI khối liền nhau dùng CHUNG một biên. Tính mỗi khối một bề rộng riêng (theo số
 * năm nó phủ) là cách để hở/chồng lọt vào, vì hai phép làm tròn khác nhau ở cùng một
 * biên.
 *
 * KHÁC BẢN VẼ MỘT CHỖ, và nói ra vì nó ngược lại file `.dc.html`: bản vẽ ép
 * `width = max(56, …)` để khối hẹp còn đọc được (dòng 1520). Sàn đó phá đúng bất biến
 * trên — hai chặng cách nhau 1 năm ở khung nhìn "Cả đời" sẽ CHỒNG lên nhau 40px. Ở đây
 * không có sàn: khối hẹp thì `overflow-hidden` cắt chữ, còn hai mép kéo thì chỗ gọi tự
 * ẩn khi khối quá hẹp để chứa chúng (xem PhaseLane). Bất biến thắng, vì nó là thứ người
 * dùng đọc ra "các chặng nối tiếp nhau kín cả đời".
 *
 * `phases` không cần sắp trước — hàm tự sắp bản sao, vì thứ tự QUYẾT ĐỊNH ai là chặng
 * đầu/cuối và ai dùng chung biên với ai.
 */
export function laneBlocks(
  phases: readonly { id: string; startYear: number }[],
  x0: number,
  x1: number,
  xs: (year: number) => number,
): LaneBlock[] {
  const sorted = [...phases].sort((a, b) => a.startYear - b.startYear)
  const out: LaneBlock[] = []
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]
    const next = sorted[i + 1]
    // Chặng bắt đầu TRƯỚC khung nhìn vẫn phủ khung nhìn — cắt ở `x0`, không bỏ đi. Bỏ đi
    // là để hở đúng đoạn đầu trục, mà đoạn đầu trục là "hôm nay".
    const from = Math.max(p.startYear, x0)
    const toBoundary = next ? Math.min(next.startYear, x1) : x1
    if (toBoundary <= from) continue // nằm ngoài khung nhìn, hoặc dí sát mép phải
    const left = xs(from)
    const width = xs(toBoundary) - left
    if (width <= 0) continue
    out.push({
      id: p.id,
      left,
      width,
      startYear: p.startYear,
      endYear: next ? next.startYear - 1 : x1,
      first: i === 0,
      last: next === undefined,
    })
  }
  return out
}

/** Khoảng nam châm khi kéo một mốc: ±1 năm quanh mỗi `startYear` của chặng (bản vẽ). */
export const MAGNET_YEARS = 1

/**
 * Bám năm vào ranh giới chặng gần nhất trong ±`span` năm; ngoài khoảng đó thì để nguyên.
 *
 * Vì sao có: mốc "Mua nhà" đặt đúng năm chuyển chặng là ý người dùng gần như luôn muốn
 * (đổi nước rồi mua nhà), mà một pixel lệch trên trục 40 năm là một năm lệch trong dữ
 * liệu. Nam châm làm cái ý đó bấm được mà không phải phóng to.
 *
 * Chọn ranh giới GẦN NHẤT, không phải cái đầu tiên trong ±`span` (bản vẽ dò tuần tự và
 * lấy cái đầu tiên, dòng 1256): với `span` rộng hơn 1 thì "cái đầu tiên trong mảng" là một
 * câu trả lời phụ thuộc thứ tự sắp xếp chứ không phụ thuộc con trỏ.
 *
 * CÁCH ĐỀU hai ranh giới thì giữ cái ĐỨNG TRƯỚC trong danh sách (`<`, không `<=`) — chỗ
 * gọi truyền danh sách đã sắp tăng nên hoà cho ra năm SỚM hơn, cùng chiều với `namTrong`
 * của `phaseYear.ts` là "hoà thì nghiêng về một phía cố định, đừng để nó tuỳ dữ liệu".
 */
export function magnetToPhaseStart(
  year: number,
  phaseStarts: readonly number[],
  span = MAGNET_YEARS,
): number {
  let best: number | null = null
  let bestD = Infinity
  for (const s of phaseStarts) {
    const d = Math.abs(s - year)
    if (d <= span && d < bestD) {
      best = s
      bestD = d
    }
  }
  return best ?? year
}

/**
 * Bề rộng CHỖ mà một icon mốc chiếm khi xếp hàng — công thức nguyên văn của bản vẽ
 * (`max(52, xs(endYear) − xs(startYear) + 42)`).
 *
 * KHÔNG phải bề rộng HÌNH (icon chỉ 24px): con số này gồm cả thanh độ dài chạy tới năm
 * kết thúc, cái chốt 18px ở đuôi nó, và một khoảng thở. Bơm bề rộng hình vào phép xếp hàng
 * thì hai mốc dài chồng thanh lên nhau mà vẫn được coi là "không va chạm".
 */
export function pinSpanWidth(startX: number, endX: number): number {
  return Math.max(52, endX - startX + 42)
}

/**
 * Khoảng hở tối thiểu giữa icon và chốt, PIXEL. Không có nó thì mốc dài 1–2 năm có chốt
 * rơi đúng dưới icon của chính nó — đo trên app thật ở 375px thì 2 trong 4 chốt không bấm
 * được (lời ghi ở `LifetimeChartCard.tsx:1253`).
 */
export const PIN_END_MIN_GAP = 30

/**
 * Toạ độ x của CHỐT năm kết thúc: `xs(endYear)`, nhưng đẩy ra tối thiểu `PIN_END_MIN_GAP`
 * khỏi icon VÀ kẹp trong mép phải vùng vẽ.
 *
 * Phần kẹp là chỗ dễ quên nhất, và nó không phải giả thuyết: ở zoom 10 năm, một mốc kết
 * thúc năm 2053 có `xs(2053)` nằm xa BÊN NGOÀI mép phải — hộp vẽ không `overflow-hidden`
 * nên cái chốt sẽ hiện đè lên cột dock. Mốc đó vẫn được vẽ (nó BẮT ĐẦU trong khung nhìn),
 * nên không thể dựa vào phép lọc để tránh.
 *
 * Kẹp thắng cả sàn khoảng hở: mốc bắt đầu sát mép phải thì chốt nằm ngay trên icon, và đó
 * vẫn tốt hơn một cái chốt trôi ra ngoài vùng vẽ.
 */
export function pinEndX(startX: number, endX: number, rightEdge: number): number {
  return Math.min(Math.max(endX, startX + PIN_END_MIN_GAP), rightEdge)
}

/**
 * Chỉ số HÀNG của từng icon mốc, cùng thứ tự đầu vào.
 *
 * Chỉ là lớp bơm bề rộng cho `packRows` (chartGeom.ts) — phép xếp hàng chống va chạm đã có
 * ở đó và spec §10 dặn thẳng "dùng lại, KHÔNG viết bản thứ hai". Việc của hàm này là dịch
 * mốc→hình chữ nhật: mép trái là `xs(startYear) − PIN_W/2` vì icon đặt GIỮA năm.
 *
 * `items` phải ĐÃ SẮP theo `startYear` tăng dần — `packRows` đòi vậy, và kết quả trả về
 * theo chỉ số nên chỗ gọi phải sắp TRƯỚC rồi mới bơm vào.
 *
 * `lastYear` là năm cuối khung nhìn: mốc "tới hết đời" (`endYear === null`) chiếm chỗ tới
 * hết trục, đúng như thanh của nó được vẽ.
 */
export function pinRowsOf(
  items: readonly { startYear: number; endYear: number | null }[],
  xs: (year: number) => number,
  lastYear: number,
): number[] {
  return packRows(
    items.map((e) => {
      const a = xs(e.startYear)
      const b = xs(e.endYear ?? lastYear)
      return { left: a - PIN_W / 2, width: pinSpanWidth(a, b) }
    }),
  )
}

/** Số HÀNG icon mốc phải chừa chỗ. Tối thiểu 1: vạch mốc vẫn cần một hàng để không dán
 *  vào mép trên vùng vẽ, kể cả khi không có mốc nào. */
export function pinRowCount(rows: readonly number[]): number {
  let max = 0
  for (const r of rows) max = Math.max(max, r + 1)
  return Math.max(1, max)
}
