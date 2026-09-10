// Dữ liệu cho biểu đồ "danh mục so với VN-Index" — thuần, test được.
//
// Component chỉ nối dây và vẽ; mọi phép quyết định hình dạng đường nằm ở đây. Repo không
// có test UI nào (không có @testing-library — xem docs/design-system.md), nên thứ gì có
// thể sai lặng lẽ thì phải bóc ra khỏi JSX mới khoá được bằng test.
import { addMonthsISO } from '../../lib/dates'
import { periodReturns, twrSeries, type NavFlow, type PeriodReturns } from './twr'

export type ChartRange = '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'all'

const SO_THANG: Record<Exclude<ChartRange, 'all'>, number> = {
  '3M': 3,
  '6M': 6,
  '1Y': 12,
  '3Y': 36,
  '5Y': 60,
}

/**
 * Mốc đầu để đi hỏi dữ liệu.
 *
 * 'all' trả 2015-01-01 chứ không trả ngày mở tài khoản: nguồn dchart có VNINDEX từ
 * 2017-08-24 và cổ phiếu từ 2016-01-04, nên một mốc sớm hơn cả hai là cách nói "cho tôi
 * tất cả" mà không phải đi tra xem tất cả bắt đầu từ đâu.
 */
export function rangeFrom(range: ChartRange, todayISO: string): string {
  if (range === 'all') return '2015-01-01'
  return addMonthsISO(todayISO, -SO_THANG[range])
}

/** Hàng lịch sử giá → `Map<mã, Map<ngày, đồng/cổ>>`, đúng hình dạng `navSeries` nhận. */
export function buildPriceMap(
  rows: { symbol: string; trading_date: string; close: number }[],
): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>()
  for (const r of rows) {
    const theoNgay = m.get(r.symbol) ?? new Map<string, number>()
    theoNgay.set(r.trading_date, r.close)
    m.set(r.symbol, theoNgay)
  }
  return m
}

/**
 * Có đủ giá để chuỗi NAV nói được điều gì chưa?
 *
 * `false` KHÔNG phải "hơi thiếu dữ liệu" — nó là một cái bẫy im lặng. `navSeries` tạm
 * tính mã thiếu giá theo GIÁ VỐN (nhánh cứu hộ đó viết cho ca thiếu VÀI mã), nên khi
 * thiếu HẾT thì `nav = giá vốn + tiền mặt`: mua cổ phiếu chỉ đổi tiền mặt thành giá vốn
 * 1:1, hai vế triệt tiêu, và đường còn lại chỉ là bậc thang những lần ĐÃ thực hiện —
 * bán chốt lời, cổ tức, phí. Nó trông y như một danh mục thật, `trimLeadingEmpty` còn
 * cắt đầu cho gọn gàng, nên không có gì để người xem nghi ngờ.
 *
 * Đã thấy trên app: `indexPrices` (~2.200 dòng) về trước `stockPriceHistory` (~10.000
 * dòng) chừng 1,2 giây, và trong 1,2 giây đó khu Hiệu quả in "+56,4% · 180 phiên" phẳng
 * lì rồi tự đổi thành "+3,1% · 248 phiên". Cả hai truy vấn đều KHÔNG persist (main.tsx),
 * nên mỗi lần mở trang Đầu tư là một lần nháy như vậy.
 *
 * `symbols` rỗng thì trả `true`: chưa có mã nào thì không có gì để mà thiếu giá, và
 * chuỗi rỗng lúc đó đã được nhánh "chưa có lệnh nào" nói đúng.
 */
export function hasUsablePrices(
  priceMap: Map<string, Map<string, number>>,
  symbols: string[],
): boolean {
  return symbols.length === 0 || priceMap.size > 0
}

/**
 * Bỏ những phiên ĐẦU mà danh mục còn trống.
 *
 * Chọn khung 5 năm cho một danh mục sáu tháng tuổi thì 90% biểu đồ là một đường 0% phẳng
 * — nó không sai, nhưng nó đẩy phần có thật vào một góc hẹp không đọc được. Chỉ cắt ở
 * ĐẦU: một phiên rỗng nằm giữa (bán sạch rồi mua lại) là một phần của câu chuyện, cắt đi
 * là nối hai đoạn không liền nhau thành một đường liền.
 */
export function trimLeadingEmpty(points: NavFlow[]): NavFlow[] {
  const i = points.findIndex((p) => p.nav > 0)
  return i < 0 ? [] : points.slice(i)
}

export interface ChartRow {
  date: string
  /** % lợi nhuận danh mục đã bóc dòng tiền, so với phiên đầu của khung */
  nav: number
  /** % thay đổi chỉ số so với phiên đầu của khung; null = phiên đó chỉ số không có bar */
  index: number | null
}

/**
 * Hai đường về CÙNG một mốc 0%: phiên đầu tiên của DANH MỤC trong khung.
 *
 * Mốc là phiên đầu của danh mục, không phải phiên đầu mà nguồn có chỉ số. Nếu chỉ số quy
 * về mốc riêng của nó thì hai đường không còn so được với nhau — người xem sẽ đọc khoảng
 * cách giữa chúng như "tôi hơn/kém thị trường bao nhiêu", mà con số đó chỉ đúng khi cả
 * hai cùng xuất phát.
 */
export function chartRows(
  points: NavFlow[],
  indexRows: { trading_date: string; close_x100: number }[],
): ChartRow[] {
  if (points.length === 0) return []

  const twr = twrSeries(points)
  const chiSo = new Map(indexRows.map((r) => [r.trading_date, r.close_x100]))
  const goc = chiSo.get(points[0].date) ?? null

  return twr.map((p) => {
    const c = chiSo.get(p.date)
    return {
      date: p.date,
      nav: p.percent,
      // Thiếu bar thì trả null để recharts NGẮT đường, không vẽ 0. Vẽ 0 ở một phiên
      // thiếu dữ liệu là dựng ra một cú sập rồi hồi phục chưa từng xảy ra.
      index: goc != null && goc > 0 && c != null ? (c / goc - 1) * 100 : null,
    }
  })
}

/**
 * MỘT cửa cho cả khu Hiệu quả: cắt phiên rỗng đầu, dựng hai đường, và tính năm con số —
 * tất cả từ CÙNG một chuỗi.
 *
 * Vì sao gộp thay vì để component gọi ba hàm: đã sai đúng một lần theo cách chỉ mở app mới
 * thấy. Component truyền `rows` (đã là %) vào `periodReturns` thay vì chuỗi tiền, nên trang
 * in "Tổng lợi nhuận −348,7%" ngay bên trên chú giải nói "Danh mục +6,7%". Hai hàm cùng
 * nhận `{date, nav, flow}[]` nên `tsc` không thấy gì sai. Một cửa thì không còn chỗ nhầm.
 */
export function investPerformance(
  points: NavFlow[],
  indexRows: { trading_date: string; close_x100: number }[],
): { rows: ChartRow[]; returns: PeriodReturns } {
  const cat = trimLeadingEmpty(points)
  return { rows: chartRows(cat, indexRows), returns: periodReturns(cat) }
}
