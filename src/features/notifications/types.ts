// Kiểu dữ liệu cho thông báo trong app (mục AO).
// KHÔNG import React / window / localStorage ở đây — file này còn phải chạy được
// trên Deno khi nối push ở đợt sau.
import { tr, trx } from '../../i18n'
import type { CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { BudgetReport } from '../budgets/progress'
import type { TagBudgetLine } from '../tags/budget'
import type { LifetimeInput } from '../lifetime/project'
import type { KetLuan } from '../quyen-loi/ketLuan'
import type { FundAlert } from '../sharedFund/sharedFund'
import type {
  AccountBalanceRow,
  CategoryRow,
  DebtRow,
  NetWorthSnapshotRow,
  PlannedExpenseRow,
  RecurringRuleRow,
  SavingsGoalRow,
  TripRow,
  TransactionRow,
} from '../../types/database.types'

export type NotificationType =
  | 'account-shortfall'
  | 'account-negative'
  | 'debt-overdue'
  | 'debt-due-soon'
  | 'bill-due'
  | 'planned-due'
  | 'budget-over'
  | 'budget-pace'
  | 'budget-parent-over'
  | 'tag-budget-over'
  | 'card-statement-day'
  | 'recurring-suggestion'
  | 'stale-entry'
  | 'savings-milestone'
  | 'networth-record'
  | 'monthly-summary'
  | 'lifetime-drift'
  | 'data-uncategorized'
  | 'data-reconcile'
  | 'trend-level-shift'
  | 'benefit-fuyo-shortfall'
  | 'benefit-remit-unassigned'
  | 'benefit-refund-years'
  | 'benefit-year-end'
  | 'benefit-iryohi'
  | 'trip-gap'
  | 'price-step'
  | 'fund-part-short'
  | 'fund-part-surplus'

/**
 * Cửa sổ giao dịch mà `NotificationInput.recentTxs` CHỨA THẬT.
 *
 * Một hằng số DUY NHẤT cho cả nơi NẠP (`useNotifications.ts`) và nơi ĐỌC
 * (`rules/lifetimeRules.ts`, `rules/rhythmRules.ts`…). Trước đây hai chỗ giữ hai số
 * (loader 90, luật 92) nên luật hứa một cửa sổ dài hơn dữ liệu thật sự có: dòng 91–92
 * ngày tuổi không bao giờ tồn tại, mà hằng số và câu mô tả ở trang cài đặt vẫn nói
 * như thể có. Đặt ở types.ts vì đây là file cả hai bên đã import, và nó thuần (chạy
 * được trên Deno) nên bộ luật vẫn không chạm gì của trình duyệt.
 */
export const RECENT_TXS_DAYS = 90

/** 'action' = việc cần làm (bám tới khi tình huống hết) · 'info' = tin để biết (đọc là mất). */
export type NotificationKind = 'action' | 'info'
export type NotificationSeverity = 'high' | 'medium' | 'low'

export interface AppNotification {
  /** Mã ổn định. Việc-cần-làm: '<type>:<id>'. Tin-để-biết: '<type>:<id>:<kỳ>'. */
  key: string
  kind: NotificationKind
  type: NotificationType
  severity: NotificationSeverity
  title: string
  detail?: string
  /** Ngày liên quan (ngày trừ tiền, ngày hẹn nợ…). */
  onISO?: string
  /**
   * 'month' = việc chỉ biết THÁNG ("sửa nhà tháng 9"): `onISO` là NGÀY CUỐI tháng đó —
   * hạn chót thật — nên nhãn nói "THÁNG 9" chứ không đếm "N NGÀY", và chỉ quá hạn khi
   * cả tháng đã qua. Vắng = `onISO` là một ngày cụ thể.
   */
  onPrecision?: 'month'
  /** Bấm vào thì đi đâu. */
  to: string
}

/**
 * Thứ tự ưu tiên TRONG CÙNG một mức severity — khớp thứ tự đánh số ở mục C của spec.
 * Đổi thứ tự mảng này là đổi thứ tự hiển thị.
 */
export const NOTIFICATION_TYPES: NotificationType[] = [
  'account-shortfall',
  'account-negative',
  'debt-overdue',
  'debt-due-soon',
  'bill-due',
  'planned-due',
  // 'budget-pace' đứng TRƯỚC 'budget-over' — cố ý ngược thứ tự đánh số của spec.
  // Cả bốn dòng ngân sách giờ cùng mức 'medium' (xem budgetRules.ts), nên thứ tự ở
  // đây là thứ duy nhất còn quyết định dòng nào lên trước. Mục 6 là dòng DUY NHẤT
  // của nhóm này đến lúc còn ghìm lại được ("mới qua 40% tháng đã dùng 78% hạn
  // mức"); ba dòng còn lại đều nói về số tiền đã tiêu xong. Để mục 5 lên đầu là mỗi
  // tháng người dùng đọc "đã quá muộn" trước khi đọc "vẫn còn kịp".
  'budget-pace',
  'budget-over',
  'budget-parent-over',
  'tag-budget-over',
  // Quỹ chung (0073): cùng họ "tiền đã góp có đủ cho nhịp chi không" với ngân sách, nên
  // đứng ngay sau nhóm đó.
  'fund-part-short',
  'fund-part-surplus',
  'card-statement-day',
  'recurring-suggestion',
  'stale-entry',
  'savings-milestone',
  'networth-record',
  'monthly-summary',
  // Cuối mảng = hiển thị sau cùng trong nhóm việc-cần-làm: đây là tin ít gấp nhất
  // (lệch kế hoạch cả đời, không phải "hết tiền tuần này").
  'lifetime-drift',
  // Quyền lợi thuế (spec 2026-09-03): không gấp theo ngày nhưng có hạn thật (31/12) — cùng
  // lý lẽ với lifetime-drift ở trên, nên đứng ngay sau nó và trước hai luật độ-tin-cậy.
  'benefit-fuyo-shortfall',
  'benefit-refund-years',
  'benefit-remit-unassigned',
  'benefit-year-end',
  'benefit-iryohi',
  // Hai luật về ĐỘ TIN CẬY của dữ liệu (§4.9) đứng CUỐI: chúng không gấp — không có
  // hạn chót nào — nhưng chúng nói rằng những con số phía trên đang được đo bằng một
  // cái thước thiếu vạch, nên vẫn thuộc nhóm việc-cần-làm chứ không phải tin-để-biết.
  // Chuyến đi (spec chuyen-di): cùng họ độ-tin-cậy — một dải ngày trống chưa được gọi
  // tên nghĩa là mọi phép so sánh phía trên đang lấy nhầm mốc. Đứng đầu nhóm này vì
  // trả lời nó chỉ mất một cú bấm, còn hai luật dưới đòi ngồi phân loại/đối chiếu.
  'trip-gap',
  'data-uncategorized',
  'data-reconcile',
  // Cuối cùng: điểm gãy mức chi nói về NHIỀU THÁNG, không có hạn chót nào, và việc nó
  // đề nghị (sửa hạn mức) là việc ngồi xuống mới làm được. Đứng trên hai luật độ-tin-cậy
  // thì nó đẩy một việc "khi nào rảnh" lên trên một việc đang làm sai số liệu hôm nay.
  'trend-level-shift',
  // Bậc giá của MỘT khoản lặp đều (spec gia-doi-bac): cùng họ tin nhiều-tháng với
  // trend-level-shift ở trên, nhưng hẹp hơn (một khoản, không phải cả mức chi) nên
  // đứng sau cùng.
  'price-step',
]

export interface NotificationTypeMeta {
  kind: NotificationKind
  /** Tên loại ở trang cài đặt. */
  label: string
  /** Câu mô tả ngắn ở trang cài đặt. */
  hint: string
  /**
   * MÀN NÀO sinh ra việc này — in ở khối Việc cần làm ("Từ Tài sản · thẻ tín dụng").
   *
   * Bản vẽ 16a đặt dòng này vào từng việc, và đó là luận điểm chính của cả 16a: bệnh
   * cần chữa là "mỗi kết luận chết tại chỗ nó sinh ra", nên khi gom hết về một danh
   * sách thì phải nói được nó ĐẾN TỪ ĐÂU — không thì người dùng mất luôn đường quay
   * về chỗ có đầy đủ ngữ cảnh.
   *
   * Ở ĐÂY chứ không ở một bảng riêng trong bulletin/: đây là bảng duy nhất đã có mỗi
   * loại một dòng, và hai bảng song song thì sớm muộn lệch nhau.
   */
  source: string
  /**
   * Nhãn ngắn in ở đầu mỗi việc KHI việc đó không có ngày (16a/17a).
   *
   * Có ngày thì nhãn là khoảng cách tới ngày đó ("4 NGÀY", "HÔM NAY", "QUÁ HẠN") —
   * xem `todoBadge`. Không có ngày thì nó nói LOẠI, để mắt phân loại được cả danh sách
   * mà chưa cần đọc câu nào.
   *
   * CHỮ IN HOA và ngắn: nó là một nhãn phân loại, không phải một câu. Mock dùng
   * "HẠN MỨC", "14 MỤC", "34 NGÀY". Bản này KHÔNG lấy con số từ tiêu đề — muốn vậy phải
   * regex trên văn xuôi, mà văn xuôi do 20 luật viết ra và mỗi luật một cách.
   */
  badge: string
  /**
   * Chữ trên NÚT đi kèm tin — "mỗi tin một nút đúng ngữ cảnh" (bản vẽ 22a).
   *
   * KHÔNG BẮT BUỘC, và chỗ trống là có chủ ý: 22a chỉ vẽ nút cho những tin có việc để
   * làm, còn hai tin thuần-để-biết của nó (thẻ chốt sao kê, mục tiêu chạm mốc) thì
   * không có nút nào. Một cái nút "Xem thẻ" trên tin không có việc gì làm chỉ thêm một
   * ô để mắt phải loại trừ. Cả dòng vẫn là link, nên không mất đường đi.
   *
   * Chữ phải nói ĐÚNG cái màn sẽ mở ra, không nói cái người dùng ước có: mock ghi
   * "Chuyển tiền" cho tin thiếu tiền thẻ, nhưng app không có form chuyển tiền điền sẵn
   * — nó mở Chi tiết thẻ (nơi có khối "Nguồn trả" nói thiếu bao nhiêu), nên nút ghi
   * "Xem thẻ". Hứa một form rồi mở ra một trang là làm người dùng bấm hai lần và mất
   * niềm tin vào mọi nút còn lại.
   *
   * Mọi loại `kind: 'action'` PHẢI có — một việc cần làm mà không nói được bước kế tiếp
   * thì nó là tin để biết. Test giữ điều này.
   */
  cta?: string
}

export const NOTIFICATION_META: Record<NotificationType, NotificationTypeMeta> = {
  'account-shortfall': {
    cta: tr('Xem thẻ'),
    badge: tr('THIẾU TIỀN'),
    source: tr('Tài sản · thẻ tín dụng'),
    kind: 'action',
    label: tr('Tài khoản sắp không đủ tiền'),
    hint: tr('Nhìn trước 14 ngày: tiền trong ví có đủ trả thẻ và các khoản định kỳ không.'),
  },
  'account-negative': {
    cta: tr('Mở tài khoản'),
    badge: tr('SỐ DƯ'),
    source: tr('Tài sản'),
    kind: 'action',
    label: tr('Tài khoản đang âm'),
    hint: tr('Số dư xuống dưới 0 — thường là ghi nhầm hoặc quên ghi một khoản thu.'),
  },
  'debt-overdue': {
    cta: tr('Xem khoản nợ'),
    badge: tr('QUÁ HẠN'),
    source: tr('Nợ / cho vay'),
    kind: 'action',
    label: tr('Nợ / cho vay quá hạn'),
    hint: tr('Đã qua ngày hẹn mà khoản đó chưa tất toán.'),
  },
  'debt-due-soon': {
    cta: tr('Xem khoản nợ'),
    badge: tr('NỢ'),
    source: tr('Nợ / cho vay'),
    kind: 'action',
    label: tr('Nợ / cho vay sắp đến hạn'),
    hint: tr('Còn 7 ngày hoặc ít hơn là tới ngày hẹn.'),
  },
  'bill-due': {
    cta: tr('Ghi ngay'),
    badge: tr('ĐỊNH KỲ'),
    source: tr('Định kỳ'),
    kind: 'action',
    label: tr('Khoản cần thanh toán'),
    hint: tr(
      'Quy tắc định kỳ kiểu NHẮC tới hạn mà chưa ghi (vd gửi tiền về nhà). Bám tới khi bạn xác nhận đã ghi — app không tự ghi hộ vì số tiền mỗi lần một khác.',
    ),
  },
  'planned-due': {
    cta: tr('Xem khoản sắp chi'),
    badge: tr('SẮP CHI'),
    source: tr('Sắp chi'),
    kind: 'action',
    label: tr('Khoản sắp chi tới hạn'),
    hint: tr(
      'Một khoản trong danh sách Sắp chi đã tới hạn (hoặc sắp tới, tuỳ bạn đặt nhắc trước mấy ngày). Bám tới khi bạn đánh dấu đã chi hoặc bỏ.',
    ),
  },
  'budget-over': {
    cta: tr('Xem ngân sách'),
    badge: tr('HẠN MỨC'),
    source: tr('Ngân sách'),
    kind: 'action',
    label: tr('Vượt ngân sách tháng'),
    hint: tr('Một mục đã tiêu quá hạn mức đặt cho tháng này.'),
  },
  'budget-pace': {
    cta: tr('Xem ngân sách'),
    badge: tr('NHỊP'),
    source: tr('Ngân sách'),
    kind: 'action',
    label: tr('Tiêu nhanh hơn nhịp'),
    hint: tr('Mới qua một phần ba tháng đã dùng gần hết hạn mức — báo sớm để còn kịp ghìm lại.'),
  },
  'budget-parent-over': {
    cta: tr('Xem ngân sách'),
    badge: tr('TRẦN NHÓM'),
    source: tr('Ngân sách · trần nhóm'),
    kind: 'action',
    label: tr('Nhóm vượt trần'),
    hint: tr('Cả nhóm đã tiêu quá trần đặt ở mục cha; kèm tối đa 2 mục con đang tiêu nhiều nhất.'),
  },
  'tag-budget-over': {
    cta: tr('Xem ngân sách'),
    badge: tr('TRẦN NHÃN'),
    source: tr('Ngân sách · trần nhãn'),
    kind: 'action',
    label: tr('Nhãn vượt trần'),
    hint: tr('Chi mang một nhãn đã quá trần đặt cho nhãn đó (cả đợt hoặc tháng này, tùy nhãn).'),
  },
  'fund-part-short': {
    cta: tr('Mở Quỹ chung'),
    badge: tr('QUỸ CHUNG'),
    source: tr('Quỹ chung'),
    kind: 'action',
    label: tr('Phần quỹ chung đang thiếu'),
    hint: tr('Một phần của quỹ chung đang âm, hoặc 3 tháng liền chi nhiều hơn góp — nên tăng mức góp.'),
  },
  'fund-part-surplus': {
    badge: tr('QUỸ CHUNG'),
    source: tr('Quỹ chung'),
    kind: 'info',
    label: tr('Phần quỹ chung dư nhiều'),
    hint: tr('3 tháng liền góp dư và phần dư đã hơn một tháng góp — có thể giảm mức góp.'),
  },
  'card-statement-day': {
    badge: tr('CHỐT SAO KÊ'),
    source: tr('Tài sản · thẻ tín dụng'),
    kind: 'info',
    label: tr('Ngày chốt sao kê thẻ'),
    hint: tr('Hôm nay thẻ chốt kỳ — mua từ mai sẽ trả vào tháng sau.'),
  },
  'price-step': {
    badge: tr('ĐỔI GIÁ'),
    source: tr('Báo cáo · Dài hạn'),
    kind: 'info',
    label: tr('Khoản lặp đều vừa đổi giá'),
    hint: tr('Một khoản trả đều đặn vừa chuyển sang mức giá mới — tăng hay giảm đều báo, mỗi bậc đúng một lần.'),
  },
  'benefit-iryohi': {
    cta: tr('Xem quyền lợi'),
    badge: tr('Y TẾ'),
    source: tr('Quyền lợi'),
    kind: 'action',
    label: tr('Chi y tế vượt ngưỡng khấu trừ'),
    hint: tr('Chi y tế trong năm đã vượt ngưỡng — giữ hoá đơn và khai 医療費控除 trong 確定申告.'),
  },
  'trip-gap': {
    cta: tr('Xem lại'),
    badge: tr('ĐI VẮNG?'),
    source: tr('Sổ · dải ngày trống'),
    kind: 'action',
    label: tr('Dải ngày không có giao dịch nào'),
    hint: tr('Đánh dấu là chuyến đi thì các phép so sánh bỏ những ngày này ra — tháng đó thôi trông rẻ giả.'),
  },
  'recurring-suggestion': {
    cta: tr('Tạo quy tắc'),
    badge: tr('ĐỊNH KỲ'),
    source: tr('Sổ'),
    kind: 'info',
    label: tr('Gợi ý tạo quy tắc định kỳ'),
    hint: tr('Phát hiện một khoản trả đều đặn mà chưa có quy tắc.'),
  },
  'stale-entry': {
    cta: tr('Ghi giao dịch'),
    badge: tr('GHI SỔ'),
    source: tr('Sổ'),
    kind: 'info',
    label: tr('Lâu chưa ghi sổ'),
    hint: tr('Từ 3 ngày không ghi giao dịch nào; nhiều nhất một lần mỗi tuần.'),
  },
  'savings-milestone': {
    badge: tr('MỤC TIÊU'),
    source: tr('Tài sản · mục tiêu'),
    kind: 'info',
    label: tr('Mục tiêu tiết kiệm chạm mốc'),
    hint: tr('Đạt 25%, 50%, 75% hoặc 100% mục tiêu.'),
  },
  'networth-record': {
    badge: tr('KỶ LỤC'),
    source: tr('Tài sản'),
    kind: 'info',
    label: tr('Tài sản ròng lập kỷ lục'),
    hint: tr('Cao nhất từ trước tới nay; nhiều nhất một lần mỗi tháng.'),
  },
  'monthly-summary': {
    badge: tr('TỔNG KẾT'),
    source: tr('Báo cáo · tháng này'),
    kind: 'info',
    label: tr('Tổng kết tháng'),
    hint: tr('Vào ngày đầu kỳ mới: tháng vừa rồi chi bao nhiêu, thu bao nhiêu, để dành bao nhiêu.'),
  },
  'lifetime-drift': {
    cta: tr('Xem kế hoạch'),
    badge: tr('KẾ HOẠCH'),
    source: tr('Tài sản · Tương lai'),
    kind: 'action',
    label: tr('Thu chi lệch kế hoạch Lifetime'),
    hint: tr(
      'Thu hoặc chi thực tế {n} ngày gần đây lệch khỏi giả định của kịch bản (kể cả khi kế hoạch để thu 0 mà sổ có thu nhập), kèm mốc âm dịch bao nhiêu năm.',
      { n: RECENT_TXS_DAYS },
    ),
  },
  'benefit-fuyo-shortfall': {
    cta: tr('Xem'),
    badge: tr('QUYỀN LỢI'),
    source: tr('Quyền lợi · năm nay'),
    kind: 'action',
    label: tr('Người phụ thuộc chưa đủ 38万'),
    hint: tr('Người thân 30–69 tuổi ở VN cần nhận đủ ¥380.000/năm để được khấu trừ — nhắc khi còn thiếu.'),
  },
  'benefit-remit-unassigned': {
    cta: tr('Gán người'),
    badge: tr('QUYỀN LỢI'),
    source: tr('Quyền lợi · năm nay'),
    kind: 'action',
    label: tr('Lần gửi tiền chưa gán người nhận'),
    hint: tr('Chưa gán thì khấu trừ người phụ thuộc đang tính thiếu.'),
  },
  'benefit-refund-years': {
    cta: tr('Xem năm cũ'),
    badge: tr('QUYỀN LỢI'),
    source: tr('Quyền lợi · năm cũ'),
    kind: 'action',
    label: tr('Năm cũ còn đòi lại được'),
    hint: tr('Nộp 還付申告 trong 5 năm cho khấu trừ chưa khai — nhắc khi có năm đủ điều kiện.'),
  },
  'benefit-year-end': {
    badge: tr('CUỐI NĂM'),
    source: tr('Quyền lợi · năm nay'),
    kind: 'info',
    label: tr('Furusato / NISA còn hạn mức'),
    hint: tr('Từ tháng 10: phần ふるさと納税 và NISA chưa dùng, mất khi hết 31/12.'),
  },
  'data-uncategorized': {
    cta: trx('categorize', 'Phân loại'),
    badge: tr('PHÂN LOẠI'),
    source: tr('Sổ'),
    kind: 'action',
    label: tr('Giao dịch chưa gắn danh mục'),
    hint: tr('Khoản chưa có danh mục không vào được báo cáo hay ngân sách — nhắc khi dồn lại.'),
  },
  'data-reconcile': {
    cta: tr('Đối chiếu'),
    badge: tr('ĐỐI CHIẾU'),
    source: tr('Tài sản'),
    kind: 'action',
    label: tr('Tài khoản lâu chưa đối chiếu'),
    hint: tr('Quá 30 ngày không so số dư sổ với số thật thì mọi tổng đều có thể đã lệch.'),
  },
  'trend-level-shift': {
    cta: tr('Xem hạn mức'),
    badge: tr('MỨC CHI'),
    source: tr('Báo cáo · Dài hạn'),
    kind: 'action',
    label: tr('Mức chi đổi hẳn so với trước'),
    hint: tr(
      'Khi mức chi hằng tháng bước sang một bậc khác và ở yên đó vài tháng — dấu hiệu hạn mức đang đặt theo nếp sống cũ. Không báo cho dao động vặt của một tháng.',
    ),
  },
}

/** Dữ liệu đầu vào của bộ luật. Chỉ dữ liệu thuần + hàm thuần được tiêm vào. */
/** Một tháng trong chuỗi chi — nhãn tháng đi kèm để mã việc nhắc tới đúng tháng gãy. */
export interface MonthlyExpensePoint {
  /** 'YYYY-MM' của tháng tài chính (theo `monthStartDay`). */
  month: string
  /** Tổng chi của tháng, minor units, đã quy đổi về base. */
  value: number
}

export interface NotificationInput {
  /** Hôm nay, 'YYYY-MM-DD'. KHÔNG được lấy từ đồng hồ hệ thống bên trong bộ luật. */
  todayISO: string
  monthStartDay: number
  base: CurrencyCode
  rates: Rates
  /**
   * Định dạng tiền — TIÊM VÀO, không import.
   * `formatMoney` thật đọc trạng thái chế độ riêng tư toàn cục, import thẳng là
   * kéo trạng thái trình duyệt vào bộ luật (mục J của spec).
   */
  formatMoney: (minor: number, currency: CurrencyCode) => string
  /** Loại tiền của một tài khoản; tài khoản không tồn tại → base. Hàm thuần, tiêm vào. */
  currencyOf: (accountId: string) => CurrencyCode
  accounts: AccountBalanceRow[]
  categories: CategoryRow[]
  debts: DebtRow[]
  recurringRules: RecurringRuleRow[]
  /** undefined = chưa tải xong; các luật ngân sách im. */
  budgetReport?: BudgetReport
  /**
   * Tiến độ trần theo nhãn, đã tính sẵn ở nơi gọi. undefined = chưa tải xong (hoặc
   * chưa nhãn nào đặt trần) → luật nhãn im.
   *
   * Tính sẵn chứ không tự tính trong luật: trần kiểu 'total' cần chi CẢ ĐỜI nhãn, mà
   * `recentTxs` chỉ có 90 ngày. Tự tính ở đây là lặng lẽ ra một con số nhỏ hơn thật.
   */
  tagBudgets?: TagBudgetLine[]
  /** Khoản sắp chi. undefined = chưa tải xong → luật im. */
  plannedExpenses?: PlannedExpenseRow[]
  savingsGoals: SavingsGoalRow[]
  /**
   * Chuyến đi đã lưu — KỂ CẢ hàng dismissed, vì luật cần biết dải nào đã hỏi rồi.
   * undefined = chưa tải xong; luật chuyến đi im (cùng mẫu với tagBudgets).
   */
  trips?: TripRow[]
  networthSnapshots: NetWorthSnapshotRow[]
  /** Giao dịch `RECENT_TXS_DAYS` ngày gần nhất. */
  recentTxs: TransactionRow[]
  /**
   * Tổng CHI mỗi tháng, đã quy đổi về `base`, xếp theo thời gian và KẾT THÚC Ở THÁNG
   * ĐỦ GẦN NHẤT — tháng đang chạy không được có mặt. undefined = chưa tải xong → luật
   * điểm gãy im.
   *
   * Tính sẵn ở nơi gọi, cùng lý do với `tagBudgets`: `recentTxs` chỉ có
   * `RECENT_TXS_DAYS` ngày (90), tức ba tháng — tự dựng chuỗi từ nó là lặng lẽ trả về
   * một chuỗi quá ngắn để nói được điều gì, và `detectChangePoints` trên ba điểm thì
   * mọi dao động vặt đều thành "điểm gãy".
   *
   * Vì sao BỎ tháng đang chạy: nó mới đi được vài ngày nên tổng của nó nhỏ hơn hẳn các
   * tháng đủ. Để nó trong chuỗi là mỗi đầu tháng app lại báo "mức chi vừa giảm hẳn" —
   * một cú gãy giả, đều đặn, mười hai lần một năm.
   */
  monthlyExpense?: MonthlyExpensePoint[]
  /**
   * Bản chiếu Lifetime của kịch bản chính. undefined = chưa tải xong hoặc chưa có
   * kịch bản / chưa khai năm sinh → luật im, không đoán.
   */
  lifetime?: LifetimeInput
  /**
   * Năm kết luận Quyền lợi (features/quyen-loi/quyenLoi.ts), ĐÃ TÍNH SẴN ở nơi gọi —
   * useQuyenLoi trên trình duyệt, loadInput.ts phía server. undefined = chưa tải → luật im.
   * Tính sẵn cùng lý do với `tagBudgets`: cần 6 năm lần gửi tiền, `recentTxs` chỉ có 90 ngày.
   */
  benefits?: KetLuan[]
  /**
   * Lời nhắc quỹ chung (features/sharedFund/sharedFund.ts `fundAlertsFor`), ĐÃ TÍNH SẴN ở
   * nơi gọi — cần cả lịch sử của tài khoản quỹ (còn lại là LUỸ KẾ), mà `recentTxs` chỉ có
   * 90 ngày. undefined = chưa bật hai người / chưa đặt quỹ / chưa tải xong → luật im.
   */
  sharedFund?: { alerts: FundAlert[]; currency: CurrencyCode }
  /** Loại đã tắt trong cài đặt. */
  offTypes: NotificationType[]
}

/**
 * Kết quả của bộ luật: hai danh sách ĐẦY ĐỦ đã xếp thứ tự, CHƯA cắt trần và chưa
 * lọc theo đã đọc/đã tắt-từng-tin. Bộ luật thuần không biết trạng thái đã đọc, nên
 * phần thu gọn (ACTION_LIMIT/INFO_LIMIT) phải do useNotifications cắt SAU khi lọc.
 */
export interface NotificationResult {
  /** Việc cần làm, đầy đủ. */
  actionsAll: AppNotification[]
  /** Tin để biết, đầy đủ. */
  infosAll: AppNotification[]
  /** MỌI mã sinh ra ở lượt này, kể cả tin bị cắt trần — dùng cho vòng đời trạng thái. */
  allKeys: string[]
}
