// Kiểu dữ liệu cho thông báo trong app (mục AO).
// KHÔNG import React / window / localStorage ở đây — file này còn phải chạy được
// trên Deno khi nối push ở đợt sau.
import type { CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { BudgetReport } from '../budgets/progress'
import type { TagBudgetLine } from '../tags/budget'
import type { LifetimeInput } from '../lifetime/project'
import type { KetLuan } from '../quyen-loi/ketLuan'
import type {
  AccountBalanceRow,
  CategoryRow,
  DebtRow,
  NetWorthSnapshotRow,
  PlannedExpenseRow,
  RecurringRuleRow,
  SavingsGoalRow,
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
  'budget-over',
  'budget-pace',
  'budget-parent-over',
  'tag-budget-over',
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
  // Hai luật về ĐỘ TIN CẬY của dữ liệu (§4.9) đứng CUỐI: chúng không gấp — không có
  // hạn chót nào — nhưng chúng nói rằng những con số phía trên đang được đo bằng một
  // cái thước thiếu vạch, nên vẫn thuộc nhóm việc-cần-làm chứ không phải tin-để-biết.
  'data-uncategorized',
  'data-reconcile',
  // Cuối cùng: điểm gãy mức chi nói về NHIỀU THÁNG, không có hạn chót nào, và việc nó
  // đề nghị (sửa hạn mức) là việc ngồi xuống mới làm được. Đứng trên hai luật độ-tin-cậy
  // thì nó đẩy một việc "khi nào rảnh" lên trên một việc đang làm sai số liệu hôm nay.
  'trend-level-shift',
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
    cta: 'Xem thẻ',
    badge: 'THIẾU TIỀN',
    source: 'Tài sản · thẻ tín dụng',
    kind: 'action',
    label: 'Tài khoản sắp không đủ tiền',
    hint: 'Nhìn trước 14 ngày: tiền trong ví có đủ trả thẻ và các khoản định kỳ không.',
  },
  'account-negative': {
    cta: 'Mở tài khoản',
    badge: 'SỐ DƯ',
    source: 'Tài sản',
    kind: 'action',
    label: 'Tài khoản đang âm',
    hint: 'Số dư xuống dưới 0 — thường là ghi nhầm hoặc quên ghi một khoản thu.',
  },
  'debt-overdue': {
    cta: 'Xem khoản nợ',
    badge: 'QUÁ HẠN',
    source: 'Nợ / cho vay',
    kind: 'action',
    label: 'Nợ / cho vay quá hạn',
    hint: 'Đã qua ngày hẹn mà khoản đó chưa tất toán.',
  },
  'debt-due-soon': {
    cta: 'Xem khoản nợ',
    badge: 'NỢ',
    source: 'Nợ / cho vay',
    kind: 'action',
    label: 'Nợ / cho vay sắp đến hạn',
    hint: 'Còn 7 ngày hoặc ít hơn là tới ngày hẹn.',
  },
  'bill-due': {
    cta: 'Ghi ngay',
    badge: 'ĐỊNH KỲ',
    source: 'Định kỳ',
    kind: 'action',
    label: 'Khoản cần thanh toán',
    hint:
      'Quy tắc định kỳ kiểu NHẮC tới hạn mà chưa ghi (vd gửi tiền về nhà). Bám tới ' +
      'khi bạn xác nhận đã ghi — app không tự ghi hộ vì số tiền mỗi lần một khác.',
  },
  'planned-due': {
    cta: 'Xem khoản sắp chi',
    badge: 'SẮP CHI',
    source: 'Sắp chi',
    kind: 'action',
    label: 'Khoản sắp chi tới hạn',
    hint:
      'Một khoản trong danh sách Sắp chi đã tới hạn (hoặc sắp tới, tuỳ bạn đặt nhắc ' +
      'trước mấy ngày). Bám tới khi bạn đánh dấu đã chi hoặc bỏ.',
  },
  'budget-over': {
    cta: 'Xem ngân sách',
    badge: 'HẠN MỨC',
    source: 'Ngân sách',
    kind: 'action',
    label: 'Vượt ngân sách tháng',
    hint: 'Một mục đã tiêu quá hạn mức đặt cho tháng này.',
  },
  'budget-pace': {
    cta: 'Xem ngân sách',
    badge: 'NHỊP',
    source: 'Ngân sách',
    kind: 'action',
    label: 'Tiêu nhanh hơn nhịp',
    hint: 'Mới qua một phần ba tháng đã dùng gần hết hạn mức — báo sớm để còn kịp ghìm lại.',
  },
  'budget-parent-over': {
    cta: 'Xem ngân sách',
    badge: 'TRẦN NHÓM',
    source: 'Ngân sách · trần nhóm',
    kind: 'action',
    label: 'Nhóm vượt trần',
    hint: 'Cả nhóm đã tiêu quá trần đặt ở mục cha; kèm tối đa 2 mục con đang tiêu nhiều nhất.',
  },
  'tag-budget-over': {
    cta: 'Xem ngân sách',
    badge: 'TRẦN NHÃN',
    source: 'Ngân sách · trần nhãn',
    kind: 'action',
    label: 'Nhãn vượt trần',
    hint: 'Chi mang một nhãn đã quá trần đặt cho nhãn đó (cả đợt hoặc tháng này, tùy nhãn).',
  },
  'card-statement-day': {
    badge: 'CHỐT SAO KÊ',
    source: 'Tài sản · thẻ tín dụng',
    kind: 'info',
    label: 'Ngày chốt sao kê thẻ',
    hint: 'Hôm nay thẻ chốt kỳ — mua từ mai sẽ trả vào tháng sau.',
  },
  'recurring-suggestion': {
    cta: 'Tạo quy tắc',
    badge: 'ĐỊNH KỲ',
    source: 'Sổ',
    kind: 'info',
    label: 'Gợi ý tạo quy tắc định kỳ',
    hint: 'Phát hiện một khoản trả đều đặn mà chưa có quy tắc.',
  },
  'stale-entry': {
    cta: 'Ghi giao dịch',
    badge: 'GHI SỔ',
    source: 'Sổ',
    kind: 'info',
    label: 'Lâu chưa ghi sổ',
    hint: 'Từ 3 ngày không ghi giao dịch nào; nhiều nhất một lần mỗi tuần.',
  },
  'savings-milestone': {
    badge: 'MỤC TIÊU',
    source: 'Tài sản · mục tiêu',
    kind: 'info',
    label: 'Mục tiêu tiết kiệm chạm mốc',
    hint: 'Đạt 25%, 50%, 75% hoặc 100% mục tiêu.',
  },
  'networth-record': {
    badge: 'KỶ LỤC',
    source: 'Tài sản',
    kind: 'info',
    label: 'Tài sản ròng lập kỷ lục',
    hint: 'Cao nhất từ trước tới nay; nhiều nhất một lần mỗi tháng.',
  },
  'monthly-summary': {
    badge: 'TỔNG KẾT',
    source: 'Báo cáo · tháng này',
    kind: 'info',
    label: 'Tổng kết tháng',
    hint: 'Vào ngày đầu kỳ mới: tháng vừa rồi chi bao nhiêu, thu bao nhiêu, để dành bao nhiêu.',
  },
  'lifetime-drift': {
    cta: 'Xem kế hoạch',
    badge: 'KẾ HOẠCH',
    source: 'Tài sản · Tương lai',
    kind: 'action',
    label: 'Thu chi lệch kế hoạch Lifetime',
    hint:
      `Thu hoặc chi thực tế ${RECENT_TXS_DAYS} ngày gần đây lệch khỏi giả định của kịch bản ` +
      '(kể cả khi kế hoạch để thu 0 mà sổ có thu nhập), kèm mốc âm dịch bao nhiêu năm.',
  },
  'benefit-fuyo-shortfall': {
    cta: 'Xem',
    badge: 'QUYỀN LỢI',
    source: 'Quyền lợi · năm nay',
    kind: 'action',
    label: 'Người phụ thuộc chưa đủ 38万',
    hint: 'Người thân 30–69 tuổi ở VN cần nhận đủ ¥380.000/năm để được khấu trừ — nhắc khi còn thiếu.',
  },
  'benefit-remit-unassigned': {
    cta: 'Gán người',
    badge: 'QUYỀN LỢI',
    source: 'Quyền lợi · năm nay',
    kind: 'action',
    label: 'Lần gửi tiền chưa gán người nhận',
    hint: 'Chưa gán thì khấu trừ người phụ thuộc đang tính thiếu.',
  },
  'benefit-refund-years': {
    cta: 'Xem năm cũ',
    badge: 'QUYỀN LỢI',
    source: 'Quyền lợi · năm cũ',
    kind: 'action',
    label: 'Năm cũ còn đòi lại được',
    hint: 'Nộp 還付申告 trong 5 năm cho khấu trừ chưa khai — nhắc khi có năm đủ điều kiện.',
  },
  'benefit-year-end': {
    badge: 'CUỐI NĂM',
    source: 'Quyền lợi · năm nay',
    kind: 'info',
    label: 'Furusato / NISA còn hạn mức',
    hint: 'Từ tháng 10: phần ふるさと納税 và NISA chưa dùng, mất khi hết 31/12.',
  },
  'data-uncategorized': {
    cta: 'Phân loại',
    badge: 'PHÂN LOẠI',
    source: 'Sổ',
    kind: 'action',
    label: 'Giao dịch chưa gắn danh mục',
    hint: 'Khoản chưa có danh mục không vào được báo cáo hay ngân sách — nhắc khi dồn lại.',
  },
  'data-reconcile': {
    cta: 'Đối chiếu',
    badge: 'ĐỐI CHIẾU',
    source: 'Tài sản',
    kind: 'action',
    label: 'Tài khoản lâu chưa đối chiếu',
    hint: 'Quá 30 ngày không so số dư sổ với số thật thì mọi tổng đều có thể đã lệch.',
  },
  'trend-level-shift': {
    cta: 'Xem hạn mức',
    badge: 'MỨC CHI',
    source: 'Báo cáo · Dài hạn',
    kind: 'action',
    label: 'Mức chi đổi hẳn so với trước',
    hint:
      'Khi mức chi hằng tháng bước sang một bậc khác và ở yên đó vài tháng — dấu hiệu ' +
      'hạn mức đang đặt theo nếp sống cũ. Không báo cho dao động vặt của một tháng.',
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
