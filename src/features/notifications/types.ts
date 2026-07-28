// Kiểu dữ liệu cho thông báo trong app (mục AO).
// KHÔNG import React / window / localStorage ở đây — file này còn phải chạy được
// trên Deno khi nối push ở đợt sau.
import type { CurrencyCode } from '../../lib/money'
import type { Rates } from '../../lib/rates'
import type { BudgetReport } from '../budgets/progress'
import type {
  AccountBalanceRow,
  CategoryRow,
  DebtRow,
  NetWorthSnapshotRow,
  RecurringRuleRow,
  SavingsGoalRow,
  TransactionRow,
} from '../../types/database.types'

export type NotificationType =
  | 'account-shortfall'
  | 'account-negative'
  | 'debt-overdue'
  | 'debt-due-soon'
  | 'budget-over'
  | 'budget-pace'
  | 'budget-parent-over'
  | 'card-statement-day'
  | 'recurring-suggestion'
  | 'stale-entry'
  | 'savings-milestone'
  | 'networth-record'
  | 'monthly-summary'

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
  'budget-over',
  'budget-pace',
  'budget-parent-over',
  'card-statement-day',
  'recurring-suggestion',
  'stale-entry',
  'savings-milestone',
  'networth-record',
  'monthly-summary',
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
  savingsGoals: SavingsGoalRow[]
  networthSnapshots: NetWorthSnapshotRow[]
  /** Giao dịch 90 ngày gần nhất. */
  recentTxs: TransactionRow[]
  /** Loại đã tắt trong cài đặt. */
  offTypes: NotificationType[]
}

export interface NotificationResult {
  /** Việc cần làm, đã xếp thứ tự và cắt trần (phần hiện lúc còn thu gọn). */
  actions: AppNotification[]
  /** Tin để biết, đã xếp thứ tự và cắt trần (phần hiện lúc còn thu gọn). */
  infos: AppNotification[]
  /**
   * Việc cần làm ĐẦY ĐỦ, chưa cắt trần — để tấm trượt xổ được phần thừa ra
   * (mục C.4: "bấm mới xổ"). `actions` luôn là đoạn đầu của mảng này.
   */
  actionsAll: AppNotification[]
  /** Tin để biết ĐẦY ĐỦ, chưa cắt trần. `infos` luôn là đoạn đầu của mảng này. */
  infosAll: AppNotification[]
  /**
   * Số VIỆC CẦN LÀM bị cắt vì quá trần. Tách riêng khỏi tin-để-biết vì hai nhóm hiện
   * ở hai chỗ khác nhau — gộp một số rồi in dưới nhóm "Tin để biết" là nói dối người
   * dùng: việc cần làm bị ẩn lại bị báo như thể chỉ là một mẹo nhỏ.
   */
  hiddenActionCount: number
  /** Số TIN ĐỂ BIẾT bị cắt vì quá trần. */
  hiddenInfoCount: number
  /** MỌI mã sinh ra ở lượt này, kể cả tin bị cắt trần — dùng cho vòng đời trạng thái. */
  allKeys: string[]
}
