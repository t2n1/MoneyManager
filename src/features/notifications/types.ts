// Kiểu dữ liệu cho thông báo trong app (mục AO).
// KHÔNG import React / window / localStorage ở đây — file này còn phải chạy được
// trên Deno khi nối push ở đợt sau.
import type { CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { BudgetReport } from '../budgets/progress'
import type { TagBudgetLine } from '../tags/budget'
import type { LifetimeInput } from '../lifetime/project'
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
  // Hai luật về ĐỘ TIN CẬY của dữ liệu (§4.9) đứng CUỐI: chúng không gấp — không có
  // hạn chót nào — nhưng chúng nói rằng những con số phía trên đang được đo bằng một
  // cái thước thiếu vạch, nên vẫn thuộc nhóm việc-cần-làm chứ không phải tin-để-biết.
  'data-uncategorized',
  'data-reconcile',
]

export interface NotificationTypeMeta {
  kind: NotificationKind
  /** Tên loại ở trang cài đặt. */
  label: string
  /** Câu mô tả ngắn ở trang cài đặt. */
  hint: string
}

export const NOTIFICATION_META: Record<NotificationType, NotificationTypeMeta> = {
  'account-shortfall': {
    kind: 'action',
    label: 'Tài khoản sắp không đủ tiền',
    hint: 'Nhìn trước 14 ngày: tiền trong ví có đủ trả thẻ và các khoản định kỳ không.',
  },
  'account-negative': {
    kind: 'action',
    label: 'Tài khoản đang âm',
    hint: 'Số dư xuống dưới 0 — thường là ghi nhầm hoặc quên ghi một khoản thu.',
  },
  'debt-overdue': {
    kind: 'action',
    label: 'Nợ / cho vay quá hạn',
    hint: 'Đã qua ngày hẹn mà khoản đó chưa tất toán.',
  },
  'debt-due-soon': {
    kind: 'action',
    label: 'Nợ / cho vay sắp đến hạn',
    hint: 'Còn 7 ngày hoặc ít hơn là tới ngày hẹn.',
  },
  'bill-due': {
    kind: 'action',
    label: 'Khoản cần thanh toán',
    hint:
      'Quy tắc định kỳ kiểu NHẮC tới hạn mà chưa ghi (vd gửi tiền về nhà). Bám tới ' +
      'khi bạn xác nhận đã ghi — app không tự ghi hộ vì số tiền mỗi lần một khác.',
  },
  'planned-due': {
    kind: 'action',
    label: 'Khoản sắp chi tới hạn',
    hint:
      'Một khoản trong danh sách Sắp chi đã tới hạn (hoặc sắp tới, tuỳ bạn đặt nhắc ' +
      'trước mấy ngày). Bám tới khi bạn đánh dấu đã chi hoặc bỏ.',
  },
  'budget-over': {
    kind: 'action',
    label: 'Vượt ngân sách tháng',
    hint: 'Một mục đã tiêu quá hạn mức đặt cho tháng này.',
  },
  'budget-pace': {
    kind: 'action',
    label: 'Tiêu nhanh hơn nhịp',
    hint: 'Mới qua một phần ba tháng đã dùng gần hết hạn mức — báo sớm để còn kịp ghìm lại.',
  },
  'budget-parent-over': {
    kind: 'action',
    label: 'Nhóm vượt trần',
    hint: 'Cả nhóm đã tiêu quá trần đặt ở mục cha; kèm tối đa 2 mục con đang tiêu nhiều nhất.',
  },
  'tag-budget-over': {
    kind: 'action',
    label: 'Nhãn vượt trần',
    hint: 'Chi mang một nhãn đã quá trần đặt cho nhãn đó (cả đợt hoặc tháng này, tùy nhãn).',
  },
  'card-statement-day': {
    kind: 'info',
    label: 'Ngày chốt sao kê thẻ',
    hint: 'Hôm nay thẻ chốt kỳ — mua từ mai sẽ trả vào tháng sau.',
  },
  'recurring-suggestion': {
    kind: 'info',
    label: 'Gợi ý tạo quy tắc định kỳ',
    hint: 'Phát hiện một khoản trả đều đặn mà chưa có quy tắc.',
  },
  'stale-entry': {
    kind: 'info',
    label: 'Lâu chưa ghi sổ',
    hint: 'Từ 3 ngày không ghi giao dịch nào; nhiều nhất một lần mỗi tuần.',
  },
  'savings-milestone': {
    kind: 'info',
    label: 'Mục tiêu tiết kiệm chạm mốc',
    hint: 'Đạt 25%, 50%, 75% hoặc 100% mục tiêu.',
  },
  'networth-record': {
    kind: 'info',
    label: 'Tài sản ròng lập kỷ lục',
    hint: 'Cao nhất từ trước tới nay; nhiều nhất một lần mỗi tháng.',
  },
  'monthly-summary': {
    kind: 'info',
    label: 'Tổng kết tháng',
    hint: 'Vào ngày đầu kỳ mới: tháng vừa rồi chi bao nhiêu, thu bao nhiêu, để dành bao nhiêu.',
  },
  'lifetime-drift': {
    kind: 'action',
    label: 'Thu chi lệch kế hoạch Lifetime',
    hint:
      `Thu hoặc chi thực tế ${RECENT_TXS_DAYS} ngày gần đây lệch khỏi giả định của kịch bản ` +
      '(kể cả khi kế hoạch để thu 0 mà sổ có thu nhập), kèm mốc âm dịch bao nhiêu năm.',
  },
  'data-uncategorized': {
    kind: 'action',
    label: 'Giao dịch chưa gắn danh mục',
    hint: 'Khoản chưa có danh mục không vào được báo cáo hay ngân sách — nhắc khi dồn lại.',
  },
  'data-reconcile': {
    kind: 'action',
    label: 'Tài khoản lâu chưa đối chiếu',
    hint: 'Quá 30 ngày không so số dư sổ với số thật thì mọi tổng đều có thể đã lệch.',
  },
}

/** Dữ liệu đầu vào của bộ luật. Chỉ dữ liệu thuần + hàm thuần được tiêm vào. */
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
   * Bản chiếu Lifetime của kịch bản chính. undefined = chưa tải xong hoặc chưa có
   * kịch bản / chưa khai năm sinh → luật im, không đoán.
   */
  lifetime?: LifetimeInput
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
