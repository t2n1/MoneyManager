// Phép tính của màn Bản tin — tách khỏi component để test được, và vì cùng một con số
// (Thu / Chi / Giữ lại / Tài sản ròng, kèm so tháng trước) sẽ còn được khối "Việc cần
// làm" đọc lại ở PR 9.
//
// KHÔNG tự tính lại gì đã có: chuỗi tháng đến từ `reports/aggregate.monthlySeries`, tỷ lệ
// giữ lại từ `reports/insights.savingsRate`, tài sản ròng từ `assets/useAssetsData`. Ở
// đây chỉ có phần Bản tin thật sự thêm vào — so với tháng liền trước, và cắt chuỗi thành
// dữ liệu cho đường tí hon.
import type { MonthlySeries } from '../reports/aggregate'
import { daysBetween, type MonthKey } from '../../lib/dates'
import type { TransactionRow } from '../../types/database.types'

/** Số tháng vẽ trong khối Dòng tiền (§4.1). Cũng là độ dài đường tí hon của ô KPI. */
export const BULLETIN_MONTHS = 8

/** Số thứ tự tháng tuyệt đối — để trừ hai MonthKey cho ra khoảng cách tháng. */
const ordinal = (k: MonthKey) => k.year * 12 + k.month

/**
 * Tháng ĐỨNG CUỐI dải 8 cột.
 *
 * Không phải lúc nào cũng là tháng đang xem, và đây là điểm dễ làm sai: neo dải vào
 * tháng đang xem thì bấm cột thứ 5 sẽ kéo cả dải trượt sang phải để cột vừa bấm thành
 * cột cuối — người dùng bấm một cái bar rồi thấy tám cái bar khác hẳn. Đã dựng đúng lỗi
 * đó rồi mới sửa.
 *
 * Luật: dải neo vào THÁNG NÀY, trừ khi tháng đang xem nằm ngoài dải (đi lùi quá 8 tháng
 * bằng nút ‹ trên top bar, hoặc mở link `?ym=` cũ) — lúc đó mới trượt để tháng đang xem
 * hiện ra. Hệ quả: bấm cột chỉ đổi cột được tô, dải đứng yên.
 *
 * Tháng ở TƯƠNG LAI cũng phải kéo dải theo, không thì bấm › đi tới tháng sau là mất
 * luôn cột đang chọn.
 */
export function seriesAnchor(active: MonthKey, current: MonthKey): MonthKey {
  const diff = ordinal(current) - ordinal(active)
  return diff >= 0 && diff <= BULLETIN_MONTHS - 1 ? current : active
}

export interface Kpi {
  /** Giá trị của tháng đang xem, minor units base. */
  value: number
  /** Cùng chỉ số ở tháng liền trước; null khi không có tháng trước trong chuỗi. */
  prev: number | null
  /**
   * Lệch so tháng trước, %. null khi KHÔNG so được — tháng trước bằng 0 thì mọi mức đều
   * là "tăng vô hạn". Cùng quy ước với `headlineOf`: thà không nói còn hơn nói sai.
   */
  deltaPct: number | null
  /** Chuỗi cho <Sparkline>, cũ → mới. */
  spark: number[]
}

/** Lệch phần trăm, làm tròn. null khi mẫu số ≤ 0. */
export function deltaPct(current: number, prev: number | null): number | null {
  if (prev === null || prev <= 0) return null
  return Math.round(((current - prev) / prev) * 100)
}

/**
 * Cắt một chuỗi tháng thành ô KPI.
 *
 * `values` xếp cũ → mới và PHẢI kết thúc ở tháng đang xem — `monthlySeries` sinh ra đúng
 * thứ tự đó cho khoảng đã yêu cầu.
 */
export function kpiFromSeries(values: number[]): Kpi {
  const value = values.at(-1) ?? 0
  const prev = values.length >= 2 ? (values.at(-2) ?? null) : null
  return { value, prev, deltaPct: deltaPct(value, prev), spark: values }
}

export interface BulletinSeries {
  labels: string[]
  income: number[]
  expense: number[]
}

/** Ba mảng song song từ MonthlySeries — dạng mà cả biểu đồ lẫn ô KPI cùng cần. */
export function seriesArrays(series: MonthlySeries, labelOf: (i: number) => string): BulletinSeries {
  return {
    labels: series.points.map((_, i) => labelOf(i)),
    income: series.points.map((p) => p.income),
    expense: series.points.map((p) => p.expense),
  }
}

/**
 * Bề rộng thanh "giữ lại" (§4.1: thanh 4px có mốc 20%), tính theo phần trăm.
 *
 * Kẹp vào [0, 100] chứ không để tràn: tỷ lệ giữ lại ÂM là chuyện thật (chi vượt thu) và
 * một thanh dài âm sẽ vẽ ngược ra ngoài khung. Chiều âm đã được nói bằng CHỮ ở dòng
 * ngay trên, thanh chỉ còn việc hiện "gần như không giữ được gì".
 */
export function keptBarPct(ratePct: number | null): number {
  if (ratePct === null) return 0
  return Math.max(0, Math.min(100, ratePct))
}

/**
 * N giao dịch mới nhất. Sắp theo NGÀY GHI NHẬN rồi mới tới thời điểm tạo: hai khoản cùng
 * ngày thì cái nhập sau đứng trên, vì đó là cái người dùng vừa động vào.
 *
 * Bỏ khoản đã loại khỏi thống kê? KHÔNG — đây là "vừa ghi gì", không phải một con số
 * tổng. Giấu đi thì người dùng ghi xong không thấy nó đâu và tưởng mất.
 */
export function recentTransactions(txs: TransactionRow[], limit: number): TransactionRow[] {
  return [...txs]
    .sort((a, b) => {
      if (a.occurred_on !== b.occurred_on) return a.occurred_on < b.occurred_on ? 1 : -1
      return (a.created_at ?? '') < (b.created_at ?? '') ? 1 : -1
    })
    .slice(0, limit)
}

// ---------------------------------------------------------------------------------
// Tới ngày lương (§4.9 — "đổi tên theo tình huống")
//
// "Cầm cự được bao lâu" từng có ba đáp án đúng ở ba màn, và ba cái tên giống nhau nên
// không ai biết chúng là ba câu hỏi khác nhau. §4.9 bắt tách tên:
//   Bản tin  — TỚI NGÀY LƯƠNG        : còn mấy ngày nữa tiền vào, kỳ này còn đủ không
//   Sức khỏe — NẾU MẤT VIỆC          : mất nguồn thu thì trụ được mấy tháng
//   Quỹ dự phòng — ĐỆM CHO VIỆC BẤT NGỜ : đủ đỡ một cú bất ngờ cỡ nào
// Hai cái sau đã có ở HealthView; đây là cái còn thiếu.
//
// ĐỊNH NGHĨA "còn lại" — đọc kỹ, vì đây là chỗ dễ thành con số nguy hiểm.
// `conLai` = THU − CHI trong chính kỳ lương này, tức phần còn lại của DÒNG TIỀN kỳ này.
// Nó KHÔNG phải "tiền bạn tiêu được", và cố ý không phải:
//   • Số dư tài khoản thì lẫn tiền đã có chủ (tiết kiệm, tiền để trả thẻ, đầu tư). Muốn
//     lọc ra phần tiêu được thì cần đúng hai mảnh mà R1/§4.4 nói app CHƯA có — cờ *tài
//     khoản dùng hằng ngày* và nợ có ngày đến hạn. Đoán bừa là app khuyến khích tiêu
//     quá tay, đúng cái R1 cấm.
//   • Ngược lại, dòng tiền kỳ này thì tính được CHÍNH XÁC từ dữ liệu đã có, và trả lời
//     đúng câu hỏi của màn này: "lương tháng này còn lại bao nhiêu".
// Vì thế mọi chữ hiển thị phải nói "kỳ này", không nói "bạn còn tiêu được".
//
// Ngày lương = mốc `end` của kỳ hiện tại (`getMonthRange().end` chính là ngày bắt đầu kỳ
// sau, mà kỳ trong app này bắt đầu vào ngày lương — đó là ý nghĩa của "Tháng bắt đầu vào
// ngày" ở Cài đặt). Không thêm một trường "ngày lương" thứ hai vào hồ sơ: hai nguồn cho
// cùng một mốc là hai nguồn để lệch nhau.

export interface ToiNgayLuong {
  /** Số ngày từ hôm nay tới ngày lương. 0 = hôm nay là ngày lương. */
  soNgay: number
  /** Thu − chi trong kỳ lương này (minor units, base). Có thể âm. */
  conLai: number
  /** Chia đều số còn lại cho số ngày còn lại. null khi không còn gì để chia. */
  moiNgay: number | null
  /** Nhịp chi thực tế mỗi ngày, tính từ đầu kỳ tới hôm nay. */
  nhipHienTai: number
  /** Giữ nhịp này thì hết tiền TRƯỚC ngày lương. */
  hutTruocLuong: boolean
  /** Kỳ này chưa thấy khoản thu nào — mọi kết luận về "còn lại" đều vô nghĩa. */
  chuaCoThu: boolean
}

export interface ToiNgayLuongInput {
  todayISO: string
  /** Mốc đầu kỳ hiện tại (ISO). */
  kyBatDauISO: string
  /** Mốc ngày lương kế tiếp (ISO) — chính là đầu kỳ sau. */
  ngayLuongISO: string
  /** Thu và chi ĐÃ GHI trong kỳ này, minor units base. */
  thu: number
  chi: number
}

/**
 * Trả null khi không nói được gì thật: hôm nay nằm ngoài kỳ đang xét (người dùng đang
 * xem tháng khác), hoặc mốc ngày vô lý. Trả null chứ không trả số 0 — §14: "chưa biết
 * ≠ 0".
 */
export function toiNgayLuong(input: ToiNgayLuongInput): ToiNgayLuong | null {
  const { todayISO, kyBatDauISO, ngayLuongISO, thu, chi } = input
  const soNgay = daysBetween(todayISO, ngayLuongISO)
  const daQua = daysBetween(kyBatDauISO, todayISO)
  // Ngoài kỳ, hoặc mốc ngược đời.
  if (soNgay < 0 || daQua < 0 || !Number.isFinite(soNgay) || !Number.isFinite(daQua)) return null

  const conLai = thu - chi
  // `daQua + 1` kể cả hôm nay: hôm nay đã tiêu rồi thì nó là một ngày có thật trong nhịp.
  // Cùng quy ước với `paceDaysElapsed` của useMonthPace và `daysElapsed` của
  // dailyAllowance — ba chỗ đếm khác nhau là ba con số "mỗi ngày" khác nhau trên cùng
  // một app.
  const nhipHienTai = Math.round(chi / (daQua + 1))
  const moiNgay = conLai > 0 && soNgay > 0 ? Math.floor(conLai / soNgay) : null
  // Nhịp 0 (chưa tiêu gì) thì không thể hụt — tránh chia cho 0 ra Infinity.
  const hutTruocLuong = conLai > 0 && nhipHienTai > 0 && conLai / nhipHienTai < soNgay

  return { soNgay, conLai, moiNgay, nhipHienTai, hutTruocLuong, chuaCoThu: thu <= 0 }
}
