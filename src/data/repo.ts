import type { RecurringFrequency, RecurringMode } from '../lib/recurring'
import type { CurrencyCode } from '../lib/money'
import type { Rates } from '../lib/rates'
import type {
  AccountBalanceRow,
  AccountRow,
  AccountType,
  AccountValuationRow,
  AssetGroupSettingRow,
  BudgetRow,
  CategoryRow,
  CategoryKind,
  CategoryType,
  CostType,
  DebtDirection,
  DebtOrigin,
  DebtPaymentRow,
  DebtRow,
  LifeEventRow,
  LifePhaseRow,
  LifeScenarioRow,
  NeedLevel,
  MonthPlanRow,
  HealthSnapshotRow,
  LifetimeVerdictSnapshotRow,
  NetWorthSnapshotRow,
  PlannedExpenseRow,
  NotificationStateRow,
  DuePrecision,
  FxHistoryRow,
  FundPriceRow,
  FundRow,
  FundTradeKind,
  FundTradeRow,
  PlannedStatus,
  ProfileRow,
  PushSubscriptionRow,
  RecurringRuleRow,
  RecurringRuleTagRow,
  PlannedExpenseTagRow,
  RelativeRow,
  Relationship,
  SavingsGoalRow,
  TripRow,
  StockPriceRow,
  StockTradeKind,
  StockTradeRow,
  TagBudgetPeriod,
  TagGroupRow,
  TagRow,
  TagSpendRow,
  TaxShelter,
  TransactionRow,
  TransactionTagRow,
  TransactionType,
} from '../types/database.types'

/** Dòng kết luận cần ghi — không có id/user_id/thời gian, repo tự điền. */
export type NewLifetimeVerdictSnapshot = Pick<
  LifetimeVerdictSnapshotRow,
  | 'scenario_id'
  | 'month_on'
  | 'fire_year'
  | 'negative_year'
  | 'end_age'
  | 'assets_end_minor'
  | 'display_currency'
>

/** Ảnh chụp toàn bộ dữ liệu người dùng để sao lưu / khôi phục (mục Z). */
export interface BackupData {
  /** Phiên bản định dạng file (tăng khi schema đổi cách nghiêm trọng). */
  version: number
  /** ISO timestamp lúc xuất. */
  exported_at: string
  profile: ProfileRow
  accounts: AccountRow[]
  categories: CategoryRow[]
  transactions: TransactionRow[]
  budgets: BudgetRow[]
  assetGroupSettings: AssetGroupSettingRow[]
  debts: DebtRow[]
  debtPayments: DebtPaymentRow[]
  recurringRules: RecurringRuleRow[]
  /** Đầu tư (mục AE); vắng mặt ở backup v1. */
  accountValuations?: AccountValuationRow[]
  /** Mục tiêu tiết kiệm (mục AD); vắng mặt ở backup v1/v2. */
  savingsGoals?: SavingsGoalRow[]
  /** Người thân nhận tiền (migration 0056); vắng mặt ở mọi backup trước đó. */
  relatives?: RelativeRow[]
  /** Chuyến đi (migration 0058); vắng mặt ở mọi backup trước đó. */
  trips?: TripRow[]
  /** Lịch sử tài sản ròng (mục AF); vắng mặt ở backup v1–v3. */
  networthSnapshots?: NetWorthSnapshotRow[]
  /**
   * Lịch sử điểm sức khỏe (migration 0048); vắng mặt ở mọi backup trước đó.
   *
   * PHẢI có trong file sao lưu, cùng lý do như `networthSnapshots`: điểm quá khứ KHÔNG tính
   * lại được (tỷ giá quá khứ, số dư neo vào hôm nay, ngưỡng có thể đã đổi). Bỏ nó ra thì
   * khôi phục là xoá sạch xu hướng — khác hẳn `stock_prices`, thứ server hút lại được.
   */
  healthSnapshots?: HealthSnapshotRow[]
  /**
   * Lịch sử kết luận tab Tương lai (migration 0055); vắng mặt ở mọi backup trước đó.
   * PHẢI có trong file sao lưu, cùng lý do như `healthSnapshots`: kết luận quá khứ
   * không chiếu lại được (kịch bản đã đổi, tỷ giá quá khứ không dựng lại).
   */
  lifetimeVerdictSnapshots?: LifetimeVerdictSnapshotRow[]
  /** Nhãn giao dịch; vắng mặt ở backup v1–v4. */
  tags?: TagRow[]
  /** Liên kết giao dịch ↔ nhãn; vắng mặt ở backup v1–v4. */
  transactionTags?: TransactionTagRow[]
  /** Lifetime — kịch bản (mục Lifetime); vắng mặt ở backup v1–v5. */
  lifeScenarios?: LifeScenarioRow[]
  /** Lifetime — chặng đời; vắng mặt ở backup v1–v5. */
  lifePhases?: LifePhaseRow[]
  /** Lifetime — sự kiện; vắng mặt ở backup v1–v5. */
  lifeEvents?: LifeEventRow[]
  /** Sổ lệnh cổ phiếu Việt Nam; vắng mặt ở backup v1–v6. */
  stockTrades?: StockTradeRow[]
  /** Nhóm nhãn (migration 0039); vắng mặt ở backup v1–v7. */
  tagGroups?: TagGroupRow[]
  /** Thu dự kiến từng tháng (migration 0041); vắng mặt ở backup v1–v8. */
  monthPlans?: MonthPlanRow[]
  /** Liên kết quy tắc định kỳ ↔ nhãn (migration 0042); vắng mặt ở backup v1–v9. */
  recurringRuleTags?: RecurringRuleTagRow[]
  /**
   * Khoản sắp chi (migration 0038) — TRƯỚC v11 backup không mang bảng này, nên khôi
   * phục là mất sạch lời nhắc. Vắng mặt ở backup v1–v10.
   */
  plannedExpenses?: PlannedExpenseRow[]
  /** Liên kết khoản sắp chi ↔ nhãn (migration 0044); vắng mặt ở backup v1–v10. */
  plannedExpenseTags?: PlannedExpenseTagRow[]
  /** Sổ lệnh quỹ đầu tư Nhật (migration 0045); vắng mặt ở backup v1–v11. */
  fundTrades?: FundTradeRow[]
}

/**
 * Phiên bản định dạng backup hiện hành. v11: thêm plannedExpenses + nhãn của chúng.
 * v12: thêm fundTrades — sổ lệnh quỹ đầu tư Nhật.
 */
export const BACKUP_VERSION = 12

export interface NewTransaction {
  type: TransactionType
  /** minor units theo currency của tài khoản nguồn */
  amount: number
  /** CK xuyên tệ: minor units của tài khoản đích; null = cùng loại tiền */
  to_amount: number | null
  category_id: string | null
  account_id: string
  to_account_id: string | null
  occurred_on: string
  note: string
  /** Gửi tiền về VN: đánh dấu giao dịch là một lần gửi tiền. Bỏ trống = giao dịch thường. */
  is_remittance?: boolean
  /** Gửi tiền về VN: dịch vụ chuyển. */
  remit_service?: string | null
  /** Gửi tiền về VN: phí dịch vụ (minor units JPY). */
  remit_fee_jpy?: number | null
  /** Gửi tiền về VN: số VND người nhận nhận được (minor units VND). */
  remit_received_vnd?: number | null
  /** Gửi tiền về VN: người thân nhận (migration 0056). */
  remit_recipient_id?: string | null
  /** Dòng tiền nợ/cho vay/trả hộ: true = báo cáo Chi/Thu bỏ qua (số dư vẫn tính). */
  is_debt_flow?: boolean
  /** true = loại khỏi mọi thống kê (số dư vẫn tính). Mục AM/X. */
  exclude_from_stats?: boolean
  /**
   * Lệnh cổ phiếu sinh ra dòng tiền này (migration 0054).
   * Chỉ repo đặt trường này — giao diện nhập giao dịch không bao giờ đặt.
   */
  stock_trade_id?: string | null
  /**
   * Quy tắc định kỳ mà bút toán này thuộc về (migration 0008 đã có cột + index, nhưng tới
   * giờ chưa có gì ghi vào).
   *
   * Đây là cờ "khoản này định kỳ" mà bản vẽ 26a cần để tách thu định kỳ khỏi thu một lần —
   * và nó là cờ THẬT, do người dùng khai một quy tắc, chứ không phải suy từ số tiền.
   */
  recurring_rule_id?: string | null
  /** Hoàn tiền: giao dịch CHI mang dấu âm (tiền về ví, không phải thu nhập). */
  is_refund?: boolean
  /** Nhãn gắn kèm (ghi đè toàn bộ nhãn hiện có khi patch). Bỏ trống = không đổi. */
  tag_ids?: string[]
}

/**
 * `recurring_rule_id` bị LOẠI khỏi patch có chủ ý: liên kết tới quy tắc định kỳ được đặt
 * MỘT LẦN lúc tạo (EntryPage, khi form mở từ `?rule=`). Cho phép sửa nó nghĩa là cho phép
 * trỏ một bút toán sang một quy tắc khác — không ai cần việc đó, và nó làm cờ "thu định kỳ"
 * của khối 01 tab Tháng này thành một thứ sửa được sau lưng phép tính.
 */
export type TransactionPatch = Partial<Omit<NewTransaction, 'recurring_rule_id'>>

/** Khoảng ngày ISO, end LOẠI TRỪ — luôn lấy từ getMonthRange. */
export interface DateRange {
  start: string
  end: string
}

export interface NewAccount {
  name: string
  type: AccountType
  currency: CurrencyCode
  /** minor units theo currency đã chọn */
  initial_balance: number
  /** Nhóm tài sản tự đặt (Tiêu dùng, Tiết kiệm, Đầu tư…); null = chưa phân nhóm */
  asset_group: string | null
  /** true = ẩn khỏi trang Tài sản */
  is_hidden: boolean
  /** false = không cộng vào Tổng tài sản */
  include_in_totals: boolean
  /** Thẻ tín dụng: hạn mức (minor units theo currency thẻ); null = không đặt */
  credit_limit?: number | null
  /** Thẻ tín dụng: ngày chốt sao kê (1..31); null = chưa đặt */
  statement_day?: number | null
  /** Thẻ tín dụng: ngày đến hạn thanh toán (1..31); null = chưa đặt */
  payment_due_day?: number | null
  /** Thẻ tín dụng: tài khoản nguồn tự trả thẻ (cùng currency); null = không tự trả */
  payment_account_id?: string | null
  /**
   * Tài khoản đầu tư: ví tiền — nơi tiền THẬT SỰ đi ra khi mua cổ phiếu (migration 0054).
   * Cùng currency, không phải chính nó. null/bỏ trống = không khai → không ghi dòng tiền nào.
   */
  cash_account_id?: string | null
  /** Thẻ tín dụng: con trỏ kỳ đã tự trả; null = chưa sinh kỳ nào */
  card_autopay_through?: string | null
  /** Tài sản cố định: số tháng khấu hao tuyến tính; null = không khấu hao */
  depreciation_months?: number | null
  /** Tài sản cố định: ngày mua (mốc khấu hao); null = chưa đặt */
  depreciation_from?: string | null
  /** Tài sản cố định: giá trị còn lại cuối vòng đời (minor units) */
  salvage_value?: number
  /** Ưu đãi thuế Nhật (NISA/iDeCo); null = tài khoản thường */
  tax_shelter?: TaxShelter | null
  /** Hạn mức nạp mỗi năm (minor units); null = chưa đặt */
  shelter_annual_limit?: number | null
  /** Rút ra tiêu được ngay? null/bỏ trống = để app suy từ `type` (xem liquidity.ts). */
  is_liquid?: boolean | null
}

/**
 * `last_reconciled_at` sửa được nhưng KHÔNG tạo được: lúc tạo tài khoản thì chưa có lần
 * đối chiếu nào, nên nó không thuộc `NewAccount`. Sheet Đối chiếu là nơi duy nhất ghi nó.
 */
export type AccountPatch = Partial<
  NewAccount & { is_archived: boolean; last_reconciled_at: string | null }
>

export interface NewCategory {
  name: string
  type: CategoryType
  icon: string
  /** null/bỏ trống = danh mục chính; id cha = danh mục con của cha đó */
  parent_id?: string | null
  /** Chỉ danh mục Chi lá — xem CategoryRow */
  need_level?: NeedLevel | null
  cost_type?: CostType | null
  /** 'transfer' = chuyển tài sản, không vào tổng chi / hạn mức. Mặc định 'expense'. */
  kind?: CategoryKind
}

export type CategoryPatch = Partial<NewCategory & { is_archived: boolean }>

/** Bộ lọc tìm kiếm giao dịch. Khoảng ngày [start, end) bắt buộc; còn lại tùy chọn. */
export interface TxFilter {
  start: string
  end: string
  /** Khớp ghi chú (không phân biệt hoa/thường & dấu tiếng Việt). */
  text?: string
  types?: TransactionType[]
  categoryIds?: string[]
  /** Khớp account_id HOẶC to_account_id (cho chuyển khoản). */
  accountIds?: string[]
  /** Lọc theo số tiền GỐC của giao dịch (minor units, theo currency tài khoản nguồn). */
  amountMin?: number
  amountMax?: number
  /**
   * Chỉ lấy giao dịch CHƯA gắn danh mục (category_id null), KHÔNG tính chuyển khoản.
   *
   * Chuyển khoản bị loại vì nó vốn không có danh mục — gộp vào đây thì danh sách "việc
   * còn phải làm" luôn có sẵn một đống việc không thể làm.
   *
   * Đứng riêng chứ không nhét vào `categoryIds` bằng một giá trị đặc biệt kiểu 'null':
   * `categoryIds` dịch thành `.in('category_id', ...)` ở phía Supabase, mà SQL không so
   * NULL bằng IN được — phải là `.is('category_id', null)`.
   */
  uncategorized?: boolean
}

/** Cố ý KHÔNG có base_currency (đổi tiền gốc sẽ làm sai mọi số đã quy đổi). */
export type ProfilePatch = Partial<
  Pick<
    ProfileRow,
    | 'display_name'
    | 'month_start_day'
    | 'hourly_wage'
    | 'annual_inflation_bps'
    | 'capital_gains_tax_bps'
    | 'budget_method'
    | 'budget_targets'
    | 'notif_off'
    // Hai tham số của 企業年金 (migration 0051): 給付利率 và ba điểm hiệu chuẩn từ
    // sheet của 基金. Người dùng sửa được vì 基金 đổi cả hai theo thời gian.
    | 'kikin_give_rate_bps'
    | 'kikin_sheet'
    // birth_year (mục Lifetime, migration 0031): cột đã có ở DB Update type từ đầu,
    // nhưng sót khỏi Pick này — không thêm thì màn Lifetime không lưu được năm sinh.
    | 'birth_year'
    // Giờ gửi push (migration 0034). KHÔNG có push_last_sent_at: cột đó chỉ edge
    // function ghi bằng service role. Cho client sửa được là tự tay mở đường tắt
    // push của chính mình (lùi mốc về tương lai) mà không nút nào giải thích nổi.
    | 'push_hour'
    | 'push_tz'
    // Cách trình bày Gọn/Đầy đủ (migration 0040)
    | 'density_pref'
    // Năm đã khai khấu trừ người phụ thuộc ở nước ngoài (migration 0056).
    | 'fuyo_claimed_years'
  >
>

/**
 * Đăng ký nhận thông báo của một thiết bị. Ba trường đầu do trình duyệt cấp
 * (`PushSubscription.toJSON()`), `userAgent` chỉ để người dùng nhận ra máy nào.
 */
export interface NewPushSubscription {
  endpoint: string
  p256dh: string
  auth: string
  userAgent: string | null
}

/** Thuộc tính nhóm tài sản có thể chỉnh (không đổi tên qua đây — dùng renameAssetGroup). */
export type AssetGroupSettingPatch = Partial<
  Pick<AssetGroupSettingRow, 'sort_order' | 'include_in_totals' | 'is_hidden'>
>

export interface NewDebt {
  counterparty: string
  direction: DebtDirection
  currency: CurrencyCode
  /** minor units theo currency của khoản nợ */
  principal: number
  due_on: string | null
  note: string
  /** lãi suất năm theo basis points (550 = 5.50%/năm); null = nợ thường (mục AG) */
  interest_bps?: number | null
  /** số kỳ trả góp (tháng); null = không trả góp (mục AG) */
  term_months?: number | null
  /** Chỉ dạng `owed` (Khách nợ công) truyền 'earned'; mọi đường khác bỏ trống = null. */
  origin?: DebtOrigin | null
  /** Bắt buộc khi origin = 'earned' — ràng buộc DB chặn hàng thiếu nó (0049). */
  income_category_id?: string | null
  /** Giải ngân có chuyển tiền thật → giao dịch cần tạo (cho vay = chi, mình nợ = thu);
   *  null = chỉ ghi nhận khoản nợ, không đổi số dư. */
  transaction: NewTransaction | null
}

export type DebtPatch = Partial<NewDebt & { status: 'open' | 'settled' }>

export interface NewDebtPayment {
  debt_id: string
  /** minor units theo currency của khoản nợ */
  amount: number
  paid_on: string
  note: string
  /** Có chuyển tiền thật → giao dịch cần tạo (đi qua createTransaction); null = ghi nhận suông. */
  transaction: NewTransaction | null
}

export interface NewRecurringRule {
  type: TransactionType
  /** minor units theo currency của tài khoản nguồn */
  amount: number
  /** CK xuyên tệ: minor units của tài khoản đích; null = cùng loại tiền */
  to_amount: number | null
  category_id: string | null
  account_id: string
  to_account_id: string | null
  /** chép vào giao dịch sinh ra */
  note: string
  frequency: RecurringFrequency
  /** kỳ đến hạn đầu tiên (anchor) */
  start_on: string
  /** null = vô hạn */
  end_on: string | null
  /** Bỏ trống = 'auto' (tới hạn tự sinh giao dịch). Xem migration 0037. */
  mode?: RecurringMode
  /**
   * Nhãn của quy tắc (migration 0042). Engine chép xuống từng giao dịch nó sinh ra.
   * Bỏ trống khi patch = KHÔNG đổi nhãn; mảng rỗng = bỏ hết nhãn.
   */
  tag_ids?: string[]
  /** Hoàn tiền lặp lại (migration 0043); chỉ hợp lệ với type = 'expense'. */
  is_refund?: boolean
  /** Chỉ dùng với mode = 'remind'; bỏ trống = 0 (nhắc đúng ngày đến hạn). */
  remind_days_before?: number
}

export type RecurringRulePatch = Partial<
  NewRecurringRule & { is_paused: boolean; last_generated_on: string | null }
>

/** Giao dịch do engine catch-up sinh — luôn mang recurring_rule_id. */
export type NewRecurringOccurrence = NewTransaction & { recurring_rule_id: string }

/** Đầu tư (mục AE): cập nhật giá trị thị trường của một tài khoản tại một ngày. */
export interface NewValuation {
  account_id: string
  valued_on: string
  /** minor units theo currency của tài khoản; ≥ 0 */
  market_value: number
  note: string
}

/** Một lệnh mua/bán/điều chỉnh cổ phiếu (migration 0035). Mọi số ở đồng. */
export interface NewStockTrade {
  account_id: string
  /** mã cổ phiếu, chữ in (vd 'FPT') */
  symbol: string
  kind: StockTradeKind
  traded_on: string
  /** số cổ; âm chỉ hợp lệ với kind='adjust' */
  quantity: number
  /** đồng/cổ; 0 với kind='adjust' */
  price: number
  fee: number
  tax: number
  note: string
}

/** Không cho đổi account_id: chuyển lệnh sang tài khoản khác thì xoá rồi ghi lại. */
export type StockTradePatch = Partial<Omit<NewStockTrade, 'account_id'>>

/**
 * Một lệnh mua/bán/điều chỉnh quỹ đầu tư Nhật (migration 0045). Mọi số ở yên.
 *
 * Giữ CẢ `units` lẫn `amount` là CỐ Ý: đo trên sao kê Rakuten thật,
 * 28.429 口 × 17.588 ÷ 10.000 = 50.000,93 trong khi số tiền bị trừ là 50.000. Rakuten tính
 * 口数 TỪ số tiền, nên suy ngược lại là dựng đầu vào từ đầu ra — mất mát.
 */
export interface NewFundTrade {
  account_id: string
  /** 協会コード, vd '9I31223A' */
  assoc_fund_cd: string
  kind: FundTradeKind
  /** 約定日 (ISO date) — KHÔNG phải 受渡日 */
  traded_on: string
  /** 口数; âm chỉ hợp lệ với kind='adjust' */
  units: number
  /** ¥/10.000口 lúc khớp; 0 với 'adjust' */
  nav: number
  /** yên thật đã trừ/nhận; 0 với 'adjust' */
  amount: number
  /** 口座区分 nguyên văn; chuỗi rỗng nếu không biết */
  bucket: string
  note: string
}

/** Không cho đổi account_id: chuyển lệnh sang tài khoản khác thì xoá rồi ghi lại. */
export type FundTradePatch = Partial<Omit<NewFundTrade, 'account_id'>>

/** Mục tiêu tiết kiệm (mục AD). */
export interface NewSavingsGoal {
  name: string
  account_id: string
  /** minor units theo currency của tài khoản; > 0 */
  target_amount: number
  target_date: string | null
  note: string
}

export type SavingsGoalPatch = Partial<NewSavingsGoal>

export interface NewRelative {
  name: string
  birth_year: number
  relationship: Relationship
  /** Bỏ trống = 'VN'. */
  country?: string
}
export type RelativePatch = Partial<NewRelative & { is_archived: boolean; sort_order: number }>

/** Chuyến đi (migration 0058). */
export interface NewTrip {
  start_on: string
  end_on: string
  /** Bỏ trống = ''. */
  label?: string
  /** Bỏ trống = 'VN'. */
  country?: string
  /** true = "đã hỏi, không phải chuyến đi". Bỏ trống = false. */
  dismissed?: boolean
}

/**
 * Bộ lọc của `listBenefitTransactions`: giao dịch mà màn Quyền lợi cần — lần gửi tiền,
 * khoản thuộc vài danh mục (thuế trên phiếu lương, ふるさと納税), và chuyển khoản VÀO tài
 * khoản NISA/iDeCo. Một truy vấn OR thay cho ba, vì hook thông báo chạy ở mọi màn và
 * mỗi truy vấn thêm là thêm cho cả app.
 */
export interface BenefitTxFilter {
  categoryIds: string[]
  toAccountIds: string[]
}

/** Lifetime (mục Lifetime): một kịch bản đời. */
export interface NewLifeScenario {
  name: string
  display_currency: string
  end_age: number
  real_return_bps: number
  band_spread_bps: number
  starting_assets_minor: number
  nominal_terms: boolean
  is_primary: boolean
}

export type LifeScenarioPatch = Partial<NewLifeScenario>

/** Lifetime: chặng đời (thu chi nền của một kịch bản). */
export interface NewLifePhase {
  scenario_id: string
  start_year: number
  label: string
  country: string | null
  currency: string
  annual_income_minor: number
  annual_expense_minor: number
  fx_to_display: number
}

export type LifePhasePatch = Partial<Omit<NewLifePhase, 'scenario_id'>>

/** Lifetime: sự kiện (khoản có năm bắt đầu và tùy chọn năm kết thúc). */
export interface NewLifeEvent {
  scenario_id: string
  start_year: number
  end_year: number | null
  kind: 'income' | 'expense'
  amount_minor: number
  currency: string
  label: string
  note: string
  /** 1 đơn vị `currency` của sự kiện = bao nhiêu đơn vị display, theo MAJOR units. */
  fx_to_display: number
  inflate: boolean
}

export type LifeEventPatch = Partial<Omit<NewLifeEvent, 'scenario_id'>>

/** Nhãn cắt ngang danh mục (vd "Về VN 2026"). */
/** Khoản sắp chi (migration 0038). */
export interface NewPlannedExpense {
  title: string
  /** ước tính (minor units theo `currency`); 0 = chưa biết */
  amount: number
  currency: CurrencyCode
  due_on: string
  /** Bỏ trống = 'day'. 'month' đòi `due_on` là ngày 1 của tháng. */
  due_precision?: DuePrecision
  /** null / bỏ trống = không nhắc; 0 = nhắc đúng ngày. */
  remind_days_before?: number | null
  category_id?: string | null
  account_id?: string | null
  note?: string
  /**
   * Nhãn của lời nhắc (migration 0044) — lúc ghi thành giao dịch thật thì form Nhập
   * lấy sẵn. Bỏ trống khi patch = KHÔNG đổi nhãn; mảng rỗng = bỏ hết nhãn.
   */
  tag_ids?: string[]
}

export type PlannedExpensePatch = Partial<
  NewPlannedExpense & { status: PlannedStatus; transaction_id: string | null }
>

export interface NewTag {
  name: string
  /** Khóa màu trong bảng màu của app. */
  color: string
  /** Trần chi (minor units theo base currency); null = không đặt. */
  budget_amount?: number | null
  /** Kỳ của trần; chỉ có nghĩa khi `budget_amount` khác null. */
  budget_period?: TagBudgetPeriod
  /** Nhóm của nhãn (xem migration 0039); bỏ trống = ngoài nhóm (mục "Khác"). */
  group_id?: string | null
}

export type TagPatch = Partial<NewTag & { sort_order: number; is_archived: boolean }>

export interface NewTagGroup {
  name: string
}

export type TagGroupPatch = Partial<NewTagGroup & { sort_order: number }>

// Toàn bộ đọc/ghi dữ liệu đi qua interface này.
// 2 implementation: demoRepo (localStorage) và supabaseRepo (Postgres + RLS).
export interface Repo {
  getProfile(): Promise<ProfileRow>
  updateProfile(patch: ProfilePatch): Promise<ProfileRow>
  getAccounts(): Promise<AccountRow[]>
  getAccountBalances(): Promise<AccountBalanceRow[]>
  getCategories(): Promise<CategoryRow[]>
  listTransactions(range: DateRange): Promise<TransactionRow[]>
  searchTransactions(filter: TxFilter): Promise<TransactionRow[]>
  /** Lấy 1 giao dịch theo id; null nếu không tìm thấy (đã bị xóa). */
  getTransaction(id: string): Promise<TransactionRow | null>
  createTransaction(input: NewTransaction): Promise<TransactionRow>
  updateTransaction(id: string, patch: TransactionPatch): Promise<TransactionRow>
  deleteTransaction(id: string): Promise<void>
  /** Xóa nhiều giao dịch cùng lúc (chọn nhiều rồi xóa). Rỗng → không làm gì. */
  deleteTransactions(ids: string[]): Promise<void>
  /**
   * Đổi danh mục cho nhiều giao dịch cùng lúc (sửa hàng loạt ở Sổ — §4.2 mục 4).
   * Rỗng → không làm gì. `categoryId` null = gỡ danh mục.
   */
  setTransactionsCategory(ids: string[], categoryId: string | null): Promise<void>
  /**
   * GẮN THÊM một nhãn cho nhiều giao dịch. Khác `setTransactionTags` (thay toàn bộ
   * nhãn của MỘT giao dịch): sửa hàng loạt là thêm một nhãn chung, không được xoá
   * những nhãn riêng mà từng khoản đang mang. Đã gắn rồi thì bỏ qua, không nhân đôi.
   */
  addTagToTransactions(ids: string[], tagId: string): Promise<void>

  createAccount(input: NewAccount): Promise<AccountRow>
  updateAccount(id: string, patch: AccountPatch): Promise<AccountRow>
  /** Gán lại sort_order theo thứ tự id truyền vào. */
  reorderAccounts(orderedIds: string[]): Promise<void>
  /** Xóa tài khoản. Chỉ xóa khi không còn giao dịch / định kỳ / mục tiêu /
   *  giá trị đầu tư nào dùng nó, và nó không phải nguồn trả của thẻ nào.
   *  Còn tham chiếu → throw Error với thông điệp tiếng Việt. */
  deleteAccount(id: string): Promise<void>

  // --- Đầu tư: giá trị thị trường (mục AE) ---
  /** Toàn bộ snapshot của user (mọi tài khoản); UI tự lọc theo account_id. */
  getAccountValuations(): Promise<AccountValuationRow[]>
  /** Tạo mới hoặc đè snapshot theo (account_id, valued_on). */
  upsertValuation(input: NewValuation): Promise<AccountValuationRow>
  deleteValuation(id: string): Promise<void>

  // --- Cổ phiếu Việt Nam: bảng giá + sổ lệnh (migration 0035) ---
  /** Bảng giá công khai (mọi mã, mọi sàn). Chỉ đọc — edge function stock-refresh ghi. */
  getStockPrices(): Promise<StockPriceRow[]>
  /** Toàn bộ sổ lệnh của user (mọi tài khoản); UI tự lọc theo account_id. */
  getStockTrades(): Promise<StockTradeRow[]>
  createStockTrade(input: NewStockTrade): Promise<StockTradeRow>
  updateStockTrade(id: string, patch: StockTradePatch): Promise<StockTradeRow>
  deleteStockTrade(id: string): Promise<void>
  /**
   * Bao nhiêu lệnh cổ phiếu đáng có dòng tiền mà chưa có (migration 0054).
   *
   * Phạm vi là MỌI tài khoản đã khai ví, không nhận `accountId`: tab Đầu tư gộp nhiều
   * tài khoản, bắt nơi gọi tự lặp là để lại một lỗ hổng không ai thấy.
   */
  countStockTradesWithoutTransfer(): Promise<number>
  /** Ghi bù những dòng tiền đó, mỗi lệnh một dòng đúng ngày `traded_on`. Trả số dòng đã ghi. */
  backfillStockTradeTransfers(): Promise<number>

  // --- Quỹ đầu tư Nhật: danh bạ + bảng giá + sổ lệnh (migration 0045) ---
  /** Danh bạ quỹ công khai. Chỉ đọc — chỉ service role ghi (seed + edge function). */
  getFunds(): Promise<FundRow[]>
  /** Khai/đổi 信託報酬 của một quỹ (ppm, xem FundRow); null = xoá về "chưa khai". */
  updateFundExpenseRatio(assocFundCd: string, ppm: number | null): Promise<void>
  /** Bảng 基準価額 công khai. Chỉ đọc — edge function fund-refresh ghi. */
  getFundPrices(): Promise<FundPriceRow[]>
  /** Toàn bộ sổ lệnh quỹ của user (mọi tài khoản); UI tự lọc theo account_id. */
  getFundTrades(): Promise<FundTradeRow[]>
  createFundTrade(input: NewFundTrade): Promise<FundTradeRow>
  updateFundTrade(id: string, patch: FundTradePatch): Promise<FundTradeRow>
  deleteFundTrade(id: string): Promise<void>

  // --- Mục tiêu tiết kiệm (mục AD) ---
  getSavingsGoals(): Promise<SavingsGoalRow[]>
  createSavingsGoal(input: NewSavingsGoal): Promise<SavingsGoalRow>
  updateSavingsGoal(id: string, patch: SavingsGoalPatch): Promise<SavingsGoalRow>
  deleteSavingsGoal(id: string): Promise<void>

  // --- Chuyến đi (migration 0058) ---
  listTrips(): Promise<TripRow[]>
  createTrip(input: NewTrip): Promise<TripRow>
  deleteTrip(id: string): Promise<void>

  // --- Người thân nhận tiền (migration 0056) ---
  getRelatives(): Promise<RelativeRow[]>
  createRelative(input: NewRelative): Promise<RelativeRow>
  updateRelative(id: string, patch: RelativePatch): Promise<RelativeRow>
  /** Giao dịch cho màn Quyền lợi: is_remittance OR category_id in OR to_account_id in, trong [start, end). */
  listBenefitTransactions(range: DateRange, filter: BenefitTxFilter): Promise<TransactionRow[]>

  // --- Lifetime: chiếu tài sản ròng cả đời ---
  getLifeScenarios(): Promise<LifeScenarioRow[]>
  createLifeScenario(input: NewLifeScenario): Promise<LifeScenarioRow>
  updateLifeScenario(id: string, patch: LifeScenarioPatch): Promise<LifeScenarioRow>
  /** Xóa kịch bản + mọi chặng/sự kiện của nó (cascade). */
  deleteLifeScenario(id: string): Promise<void>
  /** Toàn bộ chặng của mọi kịch bản; UI tự lọc theo scenario_id. */
  getLifePhases(): Promise<LifePhaseRow[]>
  createLifePhase(input: NewLifePhase): Promise<LifePhaseRow>
  updateLifePhase(id: string, patch: LifePhasePatch): Promise<LifePhaseRow>
  deleteLifePhase(id: string): Promise<void>
  /** Toàn bộ sự kiện của mọi kịch bản; UI tự lọc theo scenario_id. */
  getLifeEvents(): Promise<LifeEventRow[]>
  createLifeEvent(input: NewLifeEvent): Promise<LifeEventRow>
  updateLifeEvent(id: string, patch: LifeEventPatch): Promise<LifeEventRow>
  deleteLifeEvent(id: string): Promise<void>

  /**
   * Gửi một câu hỏi tra số cho nhà cung cấp AI, trả về JSON THÔ.
   *
   * Trả `unknown` là cố ý: việc kiểm nằm ở `traSoKetQua.docKetQua`, nơi có unit test.
   * Repo không được kiểm hộ — hai chỗ kiểm là hai chỗ trôi lệch.
   *
   * `tien` là đồng tiền của CHẶNG đang hỏi (không phải đồng edge function trả về — đó là
   * việc của `docKetQua` kiểm sau). Nó KHÔNG đi ra ngoài: edge function không đọc trường
   * này, và bản thân câu hỏi (`van`) đã nói rõ đồng tiền rồi. Lý do duy nhất nó có mặt
   * trong chữ ký là bản DEMO: demo không gọi mạng nên không có cách nào khác để biết trả
   * mẫu bằng đồng gì — đoán từ nội dung `van` là đoán chữ, mà cả `traSoKetQua.ts` được
   * viết quanh đúng luật KHÔNG ĐOÁN.
   */
  traSo(van: string, tien: CurrencyCode): Promise<unknown>

  // --- Lịch sử tài sản ròng (mục AF) ---
  getNetWorthSnapshots(): Promise<NetWorthSnapshotRow[]>
  /** Ghi/đè snapshot net worth (base) theo ngày (unique user_id+snapshot_on). */
  upsertNetWorthSnapshot(snapshotOn: string, netWorth: number): Promise<NetWorthSnapshotRow>

  /** Điểm sức khỏe đã chấm, cũ → mới. Một dòng một tháng. */
  getHealthSnapshots(): Promise<HealthSnapshotRow[]>
  /**
   * Ghi điểm của MỘT tháng. `monthOn` là ngày đầu tháng tài chính; mở tab nhiều lần trong
   * cùng tháng thì ghi đè, không sinh nhiều dòng.
   */
  upsertHealthSnapshot(
    monthOn: string,
    score: number,
    coverageBps: number,
  ): Promise<HealthSnapshotRow>

  /** Lịch sử kết luận của MỘT kịch bản, cũ → mới. Một dòng một tháng. */
  getLifetimeVerdictSnapshots(scenarioId: string): Promise<LifetimeVerdictSnapshotRow[]>
  /**
   * Ghi kết luận của tháng đang chạy cho một kịch bản. Mở tab nhiều lần trong tháng thì
   * ghi đè (unique user_id + scenario_id + month_on), không sinh nhiều dòng.
   */
  upsertLifetimeVerdictSnapshot(
    input: NewLifetimeVerdictSnapshot,
  ): Promise<LifetimeVerdictSnapshotRow>

  createCategory(input: NewCategory): Promise<CategoryRow>
  updateCategory(id: string, patch: CategoryPatch): Promise<CategoryRow>
  reorderCategories(orderedIds: string[]): Promise<void>
  /** Xóa danh mục. Chỉ xóa khi không còn giao dịch / định kỳ / ngân sách nào
   *  dùng nó. Danh mục cha có con: xóa cả cha lẫn con khi TẤT CẢ đều trống;
   *  còn tham chiếu (ở cha hoặc bất kỳ con nào) → throw, không xóa gì. */
  deleteCategory(id: string): Promise<void>

  // --- Nhóm tài sản (thành viên = accounts.asset_group; đây là cài đặt riêng) ---
  getAssetGroupSettings(): Promise<AssetGroupSettingRow[]>
  /** Tạo mới hoặc cập nhật cài đặt của nhóm theo tên (unique user_id+name). */
  upsertAssetGroupSetting(
    name: string,
    patch: AssetGroupSettingPatch,
  ): Promise<AssetGroupSettingRow>
  /** Đổi tên nhóm: cập nhật mọi tài khoản thuộc nhóm + di chuyển cài đặt.
   *  newName đã tồn tại → gộp (giữ cài đặt của newName, bỏ cài đặt oldName). */
  renameAssetGroup(oldName: string, newName: string): Promise<void>
  /** Xóa nhóm: chuyển các tài khoản về reassignTo (null = chưa phân nhóm) rồi bỏ cài đặt. */
  deleteAssetGroup(name: string, reassignTo: string | null): Promise<void>
  /** Gán sort_order cho nhóm theo thứ tự tên truyền vào (upsert từng nhóm). */
  reorderAssetGroups(orderedNames: string[]): Promise<void>
  /** Gán nhiều tài khoản vào một nhóm (null = bỏ nhóm). */
  assignAccountsToGroup(accountIds: string[], group: string | null): Promise<void>

  listBudgets(monthKey: string): Promise<BudgetRow[]>
  /** Tạo mới hoặc cập nhật hạn mức (unique user_id+category_id+month_key). */
  upsertBudget(
    categoryId: string,
    monthKey: string,
    amount: number,
    rollover?: boolean,
  ): Promise<BudgetRow>
  deleteBudget(id: string): Promise<void>
  /** Chép hạn mức từ tháng liền trước vào monthKey; bỏ qua danh mục đã có hạn mức
   *  ở tháng đích. Trả về số hạn mức đã chép. */
  copyBudgetsFromPreviousMonth(monthKey: string): Promise<number>

  /** Thu dự kiến người dùng khai cho `monthKey`; null = chưa khai (dùng số trung bình). */
  getMonthPlan(monthKey: string): Promise<MonthPlanRow | null>
  /** Khai/sửa thu dự kiến (unique user_id+month_key). */
  upsertMonthPlan(monthKey: string, expectedIncome: number): Promise<MonthPlanRow>
  /** Bỏ số khai tay, quay về trung bình 3 tháng. Không có dòng thì im lặng bỏ qua. */
  deleteMonthPlan(monthKey: string): Promise<void>

  // --- Nợ / cho vay (mục F) ---
  getDebts(): Promise<DebtRow[]>
  /** Toàn bộ lịch sử trả của user (mọi khoản nợ); UI tự lọc theo debt_id. */
  getDebtPayments(): Promise<DebtPaymentRow[]>
  createDebt(input: NewDebt): Promise<DebtRow>
  updateDebt(id: string, patch: DebtPatch): Promise<DebtRow>
  /** Xóa khoản nợ + payments (cascade) + mọi giao dịch liên kết của payments. */
  deleteDebt(id: string): Promise<void>
  /** Ghi nhận trả: nếu input.transaction != null thì tạo giao dịch thật trước rồi
   *  payment trỏ tới nó; ngược lại payment.transaction_id = null. */
  createDebtPayment(input: NewDebtPayment): Promise<DebtPaymentRow>
  /** Xóa 1 lần trả + giao dịch liên kết (nếu có) để hoàn số dư. */
  deleteDebtPayment(id: string): Promise<void>

  // --- Giao dịch định kỳ (mục C+D) ---
  listRecurringRules(): Promise<RecurringRuleRow[]>
  createRecurringRule(input: NewRecurringRule): Promise<RecurringRuleRow>
  updateRecurringRule(id: string, patch: RecurringRulePatch): Promise<RecurringRuleRow>
  /** Xóa rule: giao dịch đã sinh giữ nguyên (recurring_rule_id set null). */
  deleteRecurringRule(id: string): Promise<void>
  /** Sinh 1 kỳ cho engine catch-up: true = đã tạo, false = trùng (rule + ngày) bỏ qua. */
  insertRecurringOccurrence(input: NewRecurringOccurrence): Promise<boolean>

  // --- Tự động trả thẻ (mục 0010) ---
  /** Sinh 1 lần tự trả thẻ: true = đã tạo, false = trùng (thẻ + ngày đến hạn) bỏ qua. */
  insertCardAutopay(input: NewTransaction): Promise<boolean>

  // --- Nhãn cắt ngang danh mục ---
  /** Nhóm nhãn, đã sắp theo sort_order tăng dần. */
  getTagGroups(): Promise<TagGroupRow[]>
  createTagGroup(input: NewTagGroup): Promise<TagGroupRow>
  updateTagGroup(id: string, patch: TagGroupPatch): Promise<TagGroupRow>
  /** Xóa nhóm; nhãn trong nhóm rơi về `group_id: null` (KHÔNG bị xóa theo). */
  deleteTagGroup(id: string): Promise<void>
  getTags(): Promise<TagRow[]>
  /** Toàn bộ liên kết giao dịch ↔ nhãn của user; UI tự lọc. */
  getTransactionTags(): Promise<TransactionTagRow[]>
  // --- Khoản sắp chi (migration 0038) ---
  getPlannedExpenses(): Promise<PlannedExpenseRow[]>
  createPlannedExpense(input: NewPlannedExpense): Promise<PlannedExpenseRow>
  updatePlannedExpense(id: string, patch: PlannedExpensePatch): Promise<PlannedExpenseRow>
  deletePlannedExpense(id: string): Promise<void>

  createTag(input: NewTag): Promise<TagRow>
  updateTag(id: string, patch: TagPatch): Promise<TagRow>
  /**
   * Mọi lần "khoản chi X mang nhãn Y", cả đời sổ. Dành cho trần nhãn kiểu 'total':
   * nó cần tổng từ lúc tạo nhãn tới nay, trong khi mọi màn khác chỉ tải theo tháng.
   *
   * Trả dòng gầy (không phải TransactionRow) và chỉ gồm giao dịch CÓ nhãn — tập này
   * nhỏ hơn hẳn sổ giao dịch, nên không cần kéo cả bảng về máy.
   */
  getTagSpend(): Promise<TagSpendRow[]>
  /** Xóa nhãn + mọi liên kết tới nó (giao dịch giữ nguyên). */
  deleteTag(id: string): Promise<void>
  /** Đặt lại TOÀN BỘ nhãn của một giao dịch (danh sách rỗng = gỡ hết). */
  setTransactionTags(transactionId: string, tagIds: string[]): Promise<void>
  /** Mọi liên kết quy tắc định kỳ ↔ nhãn của người dùng (migration 0042). */
  listRecurringRuleTags(): Promise<RecurringRuleTagRow[]>
  /** Ghi đè toàn bộ nhãn của một quy tắc định kỳ. */
  setRecurringRuleTags(ruleId: string, tagIds: string[]): Promise<void>
  /** Mọi liên kết khoản sắp chi ↔ nhãn của người dùng (migration 0044). */
  listPlannedExpenseTags(): Promise<PlannedExpenseTagRow[]>
  /** Ghi đè toàn bộ nhãn của một khoản sắp chi. */
  setPlannedExpenseTags(plannedId: string, tagIds: string[]): Promise<void>

  // --- Thông báo (mục AO) ---
  /** Toàn bộ trạng thái thông báo của user (mã + mốc đã đọc/đã tắt). */
  getNotificationState(): Promise<NotificationStateRow[]>
  /** Đánh dấu đã đọc nhiều mã cùng lúc. Mã đã có thì giữ read_at cũ. */
  markNotificationsRead(keys: string[]): Promise<void>
  /** Tắt hẳn một tin-để-biết. Bấm tắt tức là vừa nhìn thấy, nên đặt luôn
   *  read_at = bây giờ (cả hai bản lưu đều vậy, kể cả khi đã có read_at cũ). */
  dismissNotification(key: string): Promise<void>
  /** Xóa trạng thái của các mã truyền vào — vòng đời việc-cần-làm (mục E của spec). */
  deleteNotificationStates(keys: string[]): Promise<void>
  /** Dọn rác: xóa dòng có created_at < beforeISO **và chưa bị tắt**.
   *  Dòng đã tắt (dismissed_at khác null) thì giữ mãi — mục C.2/E của spec hứa
   *  "tắt là mất hẳn", dọn nó đi là 13 tháng sau gợi ý đã tắt sống lại. */
  pruneNotificationState(beforeISO: string): Promise<void>

  // --- Đẩy thông báo ra ngoài app (migration 0034) ---
  /** Mọi thiết bị của user này đã đồng ý nhận thông báo. */
  getPushSubscriptions(): Promise<PushSubscriptionRow[]>
  /**
   * Ghi/đè đăng ký của MỘT thiết bị (khoá theo endpoint).
   * Đăng ký lại cùng endpoint thì cập nhật khoá, không tạo dòng thứ hai.
   */
  savePushSubscription(input: NewPushSubscription): Promise<void>
  /** Bỏ đăng ký một thiết bị. Endpoint không có trong bảng → không làm gì. */
  deletePushSubscription(endpoint: string): Promise<void>

  // --- Lịch sử tỷ giá ---
  /** Ghi/đè tỷ giá của một ngày (unique user_id + on_date + base). */
  recordFxRates(onDate: string, base: CurrencyCode, rates: Rates): Promise<void>
  /**
   * Đọc lịch sử tỷ giá trong [from, to] (ISO, tính cả hai đầu), cũ → mới. Bảng chỉ tích
   * từ cuối 07/2026 và chỉ có dòng ở ngày người dùng mở app — khoảng trống là bình
   * thường, chỗ đọc phải tự chọn dòng gần nhất thay vì đòi đủ từng ngày.
   */
  listFxHistory(from: string, to: string): Promise<FxHistoryRow[]>

  // --- Sao lưu / khôi phục (mục Z) ---
  /** Gom toàn bộ dữ liệu người dùng thành một ảnh chụp để tải xuống. */
  exportAll(): Promise<BackupData>
  /** Ghi đè TOÀN BỘ dữ liệu bằng bản sao lưu (xóa hết rồi nhập lại). */
  importAll(data: BackupData): Promise<void>

  // --- Nhập phiếu lương 給与明細 (Task 7) ---
  /** Khoản thu trên Yucho, để neo phiếu lương. */
  listYuchoIncome(accountId: string): Promise<
    { id: string; occurred_on: string; amount: number; account_id: string; category_id: string | null }[]
  >
  /** Các dấu ghi chú `給与 …` đã có, để chống nhập trùng. */
  listDauPhieuLuong(): Promise<string[]>
  /**
   * Xoá TOÀN BỘ dòng nhập từ phiếu lương — mọi dòng mang tiền tố `給与 ` trong
   * `note`, không phân biệt lô/dấu nào. Không có cột `import_batch` nên tiền tố
   * này là tay cầm duy nhất; gỡ theo TỪNG dấu riêng rẽ không có ở đây vì `dau`
   * chứa dấu cách và `·` — ghép chúng vào cú pháp `.or()` của PostgREST (vốn
   * tách theo dấu phẩy) là kiểu lỗi không báo lỗi, chỉ âm thầm xoá thiếu.
   *
   * Trả `{ dong, neo }`: `dong` = số dòng đã xoá, `neo` = số dòng neo được TRẢ LẠI vào
   * thống kê (phiếu có 通勤手当 đặt `exclude_from_stats` lên dòng neo — dòng đó là dòng
   * sao kê, không mang tiền tố `給与 ` nên phép xoá không chạm tới). Hai số tách riêng
   * vì chúng là hai việc khác nhau, và người dùng cần thấy việc thứ hai đã xảy ra.
   *
   * `traNo` = số lần trả nợ đã xoá khỏi `debt_payments`. Phải xoá riêng: FK
   * `transaction_id` là `on delete set null`, nên xoá mỗi giao dịch sẽ để hàng
   * debt_payments còn nguyên — nợ vẫn bị trừ trong khi tiền đã mất khỏi sổ.
   */
  xoaPhieuLuong(): Promise<{ dong: number; neo: number; traNo: number }>
}
