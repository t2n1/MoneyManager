// Lợi nhuận đã BÓC dòng tiền nạp/rút (time-weighted return) — thuần, không React.
//
// Vì sao không lấy thẳng % thay đổi giá trị: nạp thêm 100 triệu vào tài khoản làm giá trị
// nhảy 100 triệu, mà đó không phải lãi. Đặt một đường như thế cạnh VN-Index là so một con
// số "tôi bỏ vào bao nhiêu" với một con số "thị trường đi bao nhiêu" — hai thứ khác nhau.
// Bóc dòng tiền ra rồi thì hai đường mới cùng đơn vị: "một đồng để trong đó thì thành mấy".
//
// Quy ước: dòng tiền coi như xảy ra ở CUỐI phiên, nên lợi suất phiên t là
// (V_t − F_t) / V_{t−1}. Với dữ liệu giá đóng cửa thì tiền nạp trong ngày có thể đã kịp
// mua hay chưa — không biết được, và chọn "cuối phiên" là chọn KHÔNG ghi công cho khoản
// tiền vừa vào. Thà kể ít hơn còn hơn kể công cho một khoản chưa làm gì.
import { addDaysISO, addMonthsISO } from '../../lib/dates'

/** Một phiên: giá trị danh mục cuối phiên, và tiền từ ngoài vào/ra trong phiên đó. */
export interface NavFlow {
  date: string
  /** đồng */
  nav: number
  /** đồng; dương = nạp, âm = rút */
  flow: number
}

export interface TwrPoint {
  date: string
  /** Chỉ số tích luỹ; phiên đầu = 1. */
  index: number
  /** % so với phiên đầu = (index − 1) × 100. Phiên đầu = 0. */
  percent: number
}

export interface PeriodReturns {
  /** % — trọn khung đang xem */
  total: number | null
  week: number | null
  /** % — từ phiên cuối của năm trước; danh mục mở giữa năm thì từ phiên đầu tiên có thật */
  ytd: number | null
  year: number | null
  /** %/năm — lãi kép bình quân; null khi khung chưa đủ một năm */
  cagr: number | null
}

/** Ngày trong một năm, tính cả năm nhuận — để năm hoá không lệch dần theo thời gian. */
const NGAY_MOT_NAM = 365.25

export function twrSeries(points: NavFlow[]): TwrPoint[] {
  const out: TwrPoint[] = []
  let index = 1

  for (let i = 0; i < points.length; i++) {
    if (i > 0) {
      const truoc = points[i - 1].nav
      // Danh mục còn rỗng (chưa mua gì, hoặc đã bán sạch) thì phiên đó KHÔNG có lợi suất.
      // Chia cho 0 ra Infinity, mà "0 đồng thành 1.000 đồng" cũng không phải lãi vô hạn —
      // đó là một lần nạp tiền. Giữ chỉ số đứng yên là cách kể đúng.
      if (truoc > 0) index *= (points[i].nav - points[i].flow) / truoc
    }
    out.push({ date: points[i].date, index, percent: (index - 1) * 100 })
  }

  return out
}

/** Chỉ số của phiên GẦN NHẤT không muộn hơn `moc`; null khi chuỗi chưa lùi tới đó. */
function chiSoTai(series: TwrPoint[], moc: string): number | null {
  let found: number | null = null
  for (const p of series) {
    if (p.date > moc) break
    found = p.index
  }
  return found
}

const phanTram = (cuoi: number, dau: number): number | null =>
  dau > 0 ? (cuoi / dau - 1) * 100 : null

export function periodReturns(points: NavFlow[]): PeriodReturns {
  const rong: PeriodReturns = { total: null, week: null, ytd: null, year: null, cagr: null }
  if (points.length === 0) return rong

  const series = twrSeries(points)
  const cuoi = series.at(-1)!
  const dau = series[0]

  const tuan = chiSoTai(series, addDaysISO(cuoi.date, -7))
  const nam = chiSoTai(series, addMonthsISO(cuoi.date, -12))

  // Từ đầu năm: mốc là phiên CUỐI của năm trước, vì phiên đầu năm nay đã chứa biến động
  // của chính nó. Danh mục mở giữa năm thì không có phiên nào của năm trước — lúc đó lấy
  // phiên đầu tiên có thật. Đó không phải "từ 01/01" đúng nghĩa, nhưng là con số duy nhất
  // có thật, và cũng là con số mọi công ty chứng khoán hiện ở chỗ này.
  const dauNam = chiSoTai(series, `${cuoi.date.slice(0, 4)}-01-01`) ?? dau.index

  // Năm hoá một khung ngắn là bịa: 3% trong một tháng thành "42%/năm" chỉ vì phép lũy thừa.
  const soNgay = Math.round(
    (Date.parse(`${cuoi.date}T00:00:00Z`) - Date.parse(`${dau.date}T00:00:00Z`)) / 86_400_000,
  )
  const soNam = soNgay / NGAY_MOT_NAM
  const cagr = soNam >= 1 && cuoi.index > 0 ? (cuoi.index ** (1 / soNam) - 1) * 100 : null

  return {
    total: phanTram(cuoi.index, dau.index),
    week: tuan == null ? null : phanTram(cuoi.index, tuan),
    ytd: phanTram(cuoi.index, dauNam),
    year: nam == null ? null : phanTram(cuoi.index, nam),
    cagr,
  }
}

/**
 * Lợi suất TỪNG PHIÊN, đã bóc dòng tiền — nguyên liệu của biến động và Sharpe.
 *
 * Phiên mà danh mục còn rỗng KHÔNG góp một số 0 vào chuỗi: những ngày chưa mua gì sẽ pha
 * loãng độ lệch chuẩn, và biến động đo ra sẽ thấp hơn thật đúng bằng phần thời gian mình
 * chưa vào thị trường. Cùng lý lẽ với `twrSeries` (giữ chỉ số đứng yên ở những phiên đó),
 * chỉ khác chỗ ở đây phải BỎ HẲN phần tử thay vì đẩy vào một số 0.
 */
export function dailyReturnsOf(points: NavFlow[]): number[] {
  const out: number[] = []
  for (let i = 1; i < points.length; i++) {
    const truoc = points[i - 1].nav
    if (truoc > 0) out.push((points[i].nav - points[i].flow) / truoc - 1)
  }
  return out
}
