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
import { dailyAllowance } from '../budgets/dailyAllowance'

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
//   Bản tin  — TỚI NGÀY LƯƠNG        : còn mấy ngày nữa tiền vào, hạn mức kỳ này còn đủ
//   Sức khỏe — NẾU MẤT VIỆC          : mất nguồn thu thì trụ được mấy tháng
//   Quỹ dự phòng — ĐỆM CHO VIỆC BẤT NGỜ : đủ đỡ một cú bất ngờ cỡ nào
// Hai cái sau đã có ở HealthView; đây là cái còn thiếu.
//
// ĐỊNH NGHĨA "còn lại" — đọc kỹ, vì đây là chỗ dễ thành con số nguy hiểm.
// `conLai` = TỔNG HẠN MỨC − ĐÃ TIÊU của kỳ này (`BudgetReport.totalBudgeted/totalSpent`),
// tức phần còn được tiêu theo kế hoạch chính người dùng đặt ra.
//
// Bản đầu lấy THU − CHI, và đó là sai — sai theo đúng cái R1 cấm. Thu của kỳ là cả tháng
// lương, trong đó phần lớn đã có chủ: tiết kiệm, tiền trả thẻ, tiền dồn cho khoản lớn.
// Chia cả cục đó cho số ngày còn lại là app tự tay mời tiêu hết lương. Khối chú thích cũ
// ở đây từng biện hộ rằng chỉ cần nói "kỳ này còn" thay vì "bạn tiêu được" là đủ rào —
// không đủ: một con số kèm "/ngày" thì không còn nghĩa nào khác ngoài mức tiêu cho phép,
// dù câu chữ quanh nó cẩn thận tới đâu.
//
// Hạn mức thì trả lời đúng câu hỏi, và app đã có sẵn: `BudgetPanel` ngay cùng trang hiện
// đúng hai con số đó. Hai dòng cách nhau 400px thì phải nói CÙNG một "còn lại".
//
// PHẠM VI phải khớp: `daTieu` là chi của riêng các mục CÓ hạn mức, không phải tổng chi —
// cùng kỷ luật với `budgetDaily` của useMonthPace. Đem tổng chi so với tổng hạn mức thì
// ai chỉ đặt vài hạn mức cũng thấy báo vượt khổng lồ, rồi thôi tin cả thẻ.
// Chưa đặt hạn mức nào → `chuaDatHanMuc`, và UI im hẳn về tiền (§14 "chưa biết ≠ 0").
//
// Ngày lương = mốc `end` của kỳ hiện tại (`getMonthRange().end` chính là ngày bắt đầu kỳ
// sau, mà kỳ trong app này bắt đầu vào ngày lương — đó là ý nghĩa của "Tháng bắt đầu vào
// ngày" ở Cài đặt). Không thêm một trường "ngày lương" thứ hai vào hồ sơ: hai nguồn cho
// cùng một mốc là hai nguồn để lệch nhau.

export interface ToiNgayLuong {
  /**
   * Số ngày còn lại tới ngày lương, KỂ CẢ HÔM NAY — vì `ngayLuongISO` là mốc loại trừ
   * (đầu kỳ sau), nên hôm nay là một trong `soNgay` ngày còn tiêu được. Cùng quy ước với
   * `daysLeft` của dailyAllowance. 0 = hôm nay đã là ngày lương, và chỉ xảy ra khi gọi
   * hàm trực tiếp: trang Bản tin luôn neo vào kỳ CHỨA hôm nay nên ở đó soNgay ≥ 1.
   */
  soNgay: number
  /** Tổng hạn mức − đã tiêu, trong kỳ này (minor units, base). Âm = đã vượt trần. */
  conLai: number
  /** Cam kết CHƯA RA của kỳ (định kỳ chưa sinh giao dịch + khoản sắp chi). */
  camKet: number
  /**
   * Chia đều phần TỰ DO (conLai − camKet) cho số ngày còn lại — CÙNG phép tính với
   * trang Ngân sách và tab Lịch (spendableRemaining + dailyAllowance). null khi
   * không còn gì để chia. Ba màn in ba con số "mỗi ngày còn" khác nhau là lỗi tệ
   * nhất khối này có thể mắc — xem chú thích ở CalendarView.
   */
  moiNgay: number | null
  /** Nhịp chi thực tế mỗi ngày trong PHẠM VI hạn mức, từ đầu kỳ tới hôm nay. */
  nhipHienTai: number
  /** Giữ nhịp này thì cạn hạn mức TRƯỚC ngày lương. */
  hutTruocLuong: boolean
  /**
   * Giữ nhịp hiện tại thì hạn mức cạn TRƯỚC mốc lương bấy nhiêu ngày. null khi không
   * hụt (`hutTruocLuong = false`) — §14 "chưa biết ≠ 0": không hụt thì không có con số
   * nào để in, chứ không phải "cạn trước 0 ngày".
   */
  canTruocLuong: number | null
  /**
   * Số ngày ĐÃ QUA của kỳ, kể cả hôm nay — tử số của thanh "Thời gian" và cũng là mẫu
   * số của `nhipHienTai`. Hai chỗ phải cùng một cách đếm, không thì thanh nói 12 ngày
   * mà nhịp chia cho 11.
   */
  ngayDaQua: number
  /**
   * Tổng số ngày của kỳ — mẫu số thanh "Thời gian". Bằng `ngayDaQua + soNgay − 1` vì
   * HÔM NAY nằm trong cả hai vế (đã qua kể cả hôm nay, còn lại kể cả hôm nay).
   */
  tongNgay: number
  /** Kỳ này chưa đặt hạn mức nào — mọi kết luận về "còn lại" đều vô nghĩa. */
  chuaDatHanMuc: boolean
}

export interface ToiNgayLuongInput {
  todayISO: string
  /** Mốc đầu kỳ hiện tại (ISO). */
  kyBatDauISO: string
  /** Mốc ngày lương kế tiếp (ISO) — chính là đầu kỳ sau, nên là mốc LOẠI TRỪ. */
  ngayLuongISO: string
  /** Tổng hạn mức của kỳ — `BudgetReport.totalBudgeted`, minor units base. */
  hanMuc: number
  /** Đã tiêu trong phạm vi các hạn mức đó — `BudgetReport.totalSpent`. */
  daTieu: number
  /**
   * Cam kết chưa ra của kỳ — `collectCommitments(...).total`, cùng nguồn với khối
   * "Còn phải trả" của trang Ngân sách. Không truyền = 0 (tương thích ngược).
   */
  camKet?: number
}

/**
 * Trả null khi không nói được gì thật: hôm nay nằm ngoài kỳ đang xét (người dùng đang
 * xem tháng khác), hoặc mốc ngày vô lý. Trả null chứ không trả số 0 — §14: "chưa biết
 * ≠ 0".
 */
export function toiNgayLuong(input: ToiNgayLuongInput): ToiNgayLuong | null {
  const { todayISO, kyBatDauISO, ngayLuongISO, hanMuc, daTieu, camKet = 0 } = input
  const soNgay = daysBetween(todayISO, ngayLuongISO)
  const daQua = daysBetween(kyBatDauISO, todayISO)
  // Ngoài kỳ, hoặc mốc ngược đời.
  if (soNgay < 0 || daQua < 0 || !Number.isFinite(soNgay) || !Number.isFinite(daQua)) return null

  const conLai = hanMuc - daTieu
  // Phần chia được cho các ngày còn lại là phần TỰ DO: trừ nốt cam kết chưa ra, cùng
  // phép `spendableRemaining` của trang Ngân sách. Chia cả phần đã hứa (tiền điện ngày
  // 25, khoản định kỳ chưa sinh giao dịch) là nói dư đúng bằng số cam kết — và Bản tin
  // in ¥5,294/ngày trong khi Ngân sách in ¥4,413/ngày cho CÙNG một kỳ (đo được).
  const tuDo = conLai - camKet
  // `daQua + 1` kể cả hôm nay: hôm nay đã tiêu rồi thì nó là một ngày có thật trong nhịp.
  // Cùng quy ước với `paceDaysElapsed` của useMonthPace và `daysElapsed` của
  // dailyAllowance — ba chỗ đếm khác nhau là ba con số "mỗi ngày" khác nhau trên cùng
  // một app.
  const nhipHienTai = Math.round(daTieu / (daQua + 1))
  // KHÔNG tự chia: `dailyAllowance` đã là đúng phép "còn bao nhiêu / mấy ngày nữa" của
  // trang Ngân sách, kể cả quyết định làm tròn XUỐNG và trả null khi đã vượt trần. Hai
  // mẫu số khớp nhau chứ không phải trùng hợp: `ngayLuongISO` là mốc loại trừ, nên
  // `daysLeft = (daQua + soNgay) − (daQua + 1) + 1 = soNgay`.
  const moiNgay = dailyAllowance(tuDo, daQua + 1, daQua + soNgay)?.perDay ?? null
  // Nhịp 0 (chưa tiêu gì) thì không thể hụt — tránh chia cho 0 ra Infinity.
  const hutTruocLuong = tuDo > 0 && nhipHienTai > 0 && tuDo / nhipHienTai < soNgay
  // "Cạn trước lương mấy ngày": phần tự do đủ cho floor(tuDo/nhịp) ngày nữa, phần thiếu
  // là số ngày trắng trước mốc. `hutTruocLuong` đã bảo đảm thương < soNgay nên hiệu ≥ 1.
  const canTruocLuong = hutTruocLuong ? soNgay - Math.floor(tuDo / nhipHienTai) : null

  return {
    soNgay,
    conLai,
    camKet,
    moiNgay,
    nhipHienTai,
    hutTruocLuong,
    canTruocLuong,
    ngayDaQua: daQua + 1,
    tongNgay: daQua + soNgay,
    chuaDatHanMuc: hanMuc <= 0,
  }
}
