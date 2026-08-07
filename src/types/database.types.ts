// Types viết tay khớp với supabase/migrations/0001_init.sql.
// Khi schema đổi: cập nhật file này cùng lúc với migration
// (hoặc thay bằng `supabase gen types typescript` nếu cài CLI).
// Lưu ý: dùng `type` chứ không dùng `interface` — supabase-js yêu cầu
// index signature ngầm (Record<string, unknown>) mà interface không có.

import type { CurrencyCode } from '../lib/money'
import type { RecurringFrequency } from '../lib/recurring'

export type AccountType = 'cash' | 'bank' | 'card' | 'ic' | 'ewallet' | 'investment' | 'fixed'
/** Tài khoản ưu đãi thuế Nhật có hạn mức nạp theo năm (mục khối 7). */
export type TaxShelter = 'nisa_tsumitate' | 'nisa_growth' | 'ideco'
export type CategoryType = 'expense' | 'income'
export type NeedLevel = 'essential' | 'flexible'
export type CostType = 'fixed' | 'variable'
export type TransactionType = 'expense' | 'income' | 'transfer'
/** i_owe = mình nợ người ta · owed_to_me = người ta nợ mình */
export type DebtDirection = 'i_owe' | 'owed_to_me'
export type DebtStatus = 'open' | 'settled'

export type ProfileRow = {
  user_id: string
  display_name: string | null
  base_currency: CurrencyCode
  month_start_day: number
  /** Thu nhập mỗi giờ làm (minor units base) để quy đổi "món này = mấy giờ làm"; null = chưa khai. */
  hourly_wage: number | null
  /** Lạm phát năm (basis points, 250 = 2.50%) để tính lợi nhuận thực; null = chưa đặt. */
  annual_inflation_bps: number | null
  /** Thuế lãi vốn áp lên phần lời (basis points); mặc định 2032 = 20.32% (Nhật). */
  capital_gains_tax_bps: number
  /** Trần chi thiết yếu trên thu nhập tháng (basis points); mặc định 5000 = 50%. */
  target_essential_bps: number
  /** Trần chi linh hoạt trên thu nhập tháng (basis points); mặc định 3000 = 30%. */
  target_flexible_bps: number
  /** Sàn tiết kiệm trên thu nhập tháng (basis points); mặc định 2000 = 20%. Cần VƯỢT. */
  target_savings_bps: number
  /** Loại thông báo đã tắt (mục AO); mảng rỗng = bật hết. */
  notif_off: string[]
  /** Năm sinh — cần cho Lifetime. null = chưa khai. */
  birth_year: number | null
  /** Giờ gửi push mỗi ngày (0..23), tính theo `push_tz` chứ không phải UTC. */
  push_hour: number
  /**
   * Múi giờ IANA để hiểu `push_hour` ('Asia/Tokyo', 'America/Los_Angeles').
   * Lưu tên múi giờ chứ không lưu offset số: offset không biết DST.
   */
  push_tz: string
  /** Lần gần nhất đã gửi push; null = chưa gửi lần nào. Chặn gửi hai lần một ngày. */
  push_last_sent_at: string | null
  created_at: string
}

/**
 * Một trình duyệt trên một thiết bị đã đồng ý nhận thông báo (migration 0034).
 * Một người nhiều dòng (điện thoại + laptop) và đều phải nhận được.
 */
export type PushSubscriptionRow = {
  user_id: string
  /** URL do dịch vụ đẩy của trình duyệt cấp — chính nó là danh tính thiết bị. */
  endpoint: string
  /** Khoá công khai của thiết bị (base64url) để mã hoá nội dung aes128gcm. */
  p256dh: string
  /** Khoá xác thực của thiết bị (base64url). */
  auth: string
  /** Để người dùng nhận ra "máy nào" khi muốn tắt một thiết bị; null = không rõ. */
  user_agent: string | null
  created_at: string
  /** Lần gửi thành công gần nhất; null = chưa gửi lần nào. */
  last_ok_at: string | null
}

export type AccountRow = {
  id: string
  user_id: string
  name: string
  type: AccountType
  currency: CurrencyCode
  initial_balance: number
  /** Nhóm tài sản do người dùng tự đặt (Tiêu dùng, Tiết kiệm, Đầu tư…); null = chưa phân nhóm */
  asset_group: string | null
  /** true = ẩn khỏi trang Tài sản (vẫn dùng bình thường khi nhập giao dịch) */
  is_hidden: boolean
  /** false = không cộng số dư vào Tổng tài sản (vẫn hiển thị riêng) */
  include_in_totals: boolean
  /** Thẻ tín dụng: hạn mức (minor units theo currency thẻ); null = không đặt / không phải thẻ */
  credit_limit: number | null
  /** Thẻ tín dụng: ngày chốt sao kê hằng tháng (1..31); null = chưa đặt */
  statement_day: number | null
  /** Thẻ tín dụng: ngày đến hạn thanh toán hằng tháng (1..31); null = chưa đặt */
  payment_due_day: number | null
  /** Thẻ tín dụng: tài khoản nguồn tự trả thẻ (cùng currency, không phải thẻ); null = không tự trả */
  payment_account_id: string | null
  /** Thẻ tín dụng: ngày đến hạn cuối đã tự sinh giao dịch trả; null = chưa sinh kỳ nào */
  card_autopay_through: string | null
  /** Tài sản cố định: số tháng khấu hao tuyến tính; null = không khấu hao tự động */
  depreciation_months: number | null
  /** Tài sản cố định: ngày mua (mốc bắt đầu khấu hao); null = chưa đặt */
  depreciation_from: string | null
  /** Tài sản cố định: giá trị còn lại khi hết vòng đời (minor units) */
  salvage_value: number
  /** Ưu đãi thuế Nhật (NISA/iDeCo) để theo dõi hạn mức năm; null = tài khoản thường */
  tax_shelter: TaxShelter | null
  /** Hạn mức nạp mỗi năm (minor units theo currency tài khoản); null = chưa đặt */
  shelter_annual_limit: number | null
  sort_order: number
  is_archived: boolean
  created_at: string
}

/** Nhãn cắt ngang danh mục (vd "Về VN 2026", "Đám cưới"). */
export type TagRow = {
  id: string
  user_id: string
  name: string
  /** Khóa màu trong bảng màu của app (xem features/tags/colors). */
  color: string
  sort_order: number
  /**
   * Đã lưu trữ = ẩn khỏi ô chọn nhãn khi nhập giao dịch, nhưng GIỮ NGUYÊN liên
   * kết và số liệu lịch sử (khác hẳn xóa nhãn — xóa thì cascade mất hết). Dành
   * cho nhãn hết việc như "Về VN 2026" sau khi đã về.
   */
  is_archived: boolean
  /**
   * Trần chi cho nhãn (minor units theo BASE currency, như budgets.amount);
   * null = không đặt trần. Xem migration 0036.
   */
  budget_amount: number | null
  /** Kỳ của trần. Chỉ có nghĩa khi `budget_amount` khác null. */
  budget_period: TagBudgetPeriod
  created_at: string
}

/**
 * 'total' = trần cho cả đời nhãn, không reset (nhãn theo dịp: "Về VN 2026").
 * 'monthly' = trần mỗi tháng, hết tháng reset (nhãn lặp đều: "Cà phê").
 */
export type TagBudgetPeriod = 'total' | 'monthly'

/** Liên kết nhiều–nhiều giữa giao dịch và nhãn. */
export type TransactionTagRow = {
  transaction_id: string
  tag_id: string
  user_id: string
}

/**
 * Một lần "giao dịch chi X mang nhãn Y" — đủ để cộng tổng chi cả đời của nhãn mà
 * không phải kéo nguyên bảng transactions về máy.
 *
 * Có `transaction_id` vì một giao dịch mang hai nhãn sẽ ra HAI dòng: nơi tính phải
 * biết chúng là cùng một khoản tiền, kẻo tổng "đã tiêu có gắn nhãn" đếm đúp.
 */
export type TagSpendRow = {
  tag_id: string
  transaction_id: string
  /** minor units theo currency của tài khoản nguồn — nơi tính tự quy đổi về base. */
  amount: number
  account_id: string
  occurred_on: string
  is_refund: boolean
}

export type CategoryRow = {
  id: string
  user_id: string
  name: string
  type: CategoryType
  icon: string
  /** null = danh mục chính (cha); có giá trị = danh mục con của cha đó (1 cấp) */
  parent_id: string | null
  sort_order: number
  is_archived: boolean
  created_at: string
  /** Chỉ danh mục Chi lá: nhu cầu bắt buộc vs sở thích. null = chưa phân loại */
  need_level: NeedLevel | null
  /** Chỉ danh mục Chi lá: chi cố định vs biến đổi. null = chưa phân loại */
  cost_type: CostType | null
}

export type TransactionRow = {
  id: string
  user_id: string
  type: TransactionType
  /** minor units theo currency của tài khoản nguồn */
  amount: number
  /** CK xuyên tệ: minor units theo currency tài khoản đích; null = cùng loại tiền */
  to_amount: number | null
  category_id: string | null
  account_id: string
  to_account_id: string | null
  /** Rule định kỳ đã sinh giao dịch này; null = giao dịch nhập tay */
  recurring_rule_id: string | null
  occurred_on: string
  note: string
  /** Gửi tiền về VN: true = giao dịch này là một lần gửi tiền (mặc định false). */
  is_remittance?: boolean
  /** Gửi tiền về VN: dịch vụ chuyển (Wise/SBI Remit/Brastel/DCOM/Khác); null = không rõ. */
  remit_service?: string | null
  /** Gửi tiền về VN: phí dịch vụ (minor units JPY). */
  remit_fee_jpy?: number | null
  /** Gửi tiền về VN: số VND người nhận nhận được (minor units VND = đồng). */
  remit_received_vnd?: number | null
  /** Dòng tiền nợ/cho vay/trả hộ: true = báo cáo Chi/Thu bỏ qua (số dư vẫn tính). */
  is_debt_flow?: boolean
  /** true = loại khỏi mọi thống kê (báo cáo/ngân sách/insight); số dư vẫn tính. Mục AM/X. */
  exclude_from_stats?: boolean
  /** Hoàn tiền: giao dịch CHI mang dấu âm (tiền về ví, KHÔNG phải thu nhập). */
  is_refund?: boolean
  created_at: string
  updated_at: string
}

export type AccountBalanceRow = {
  id: string
  user_id: string
  name: string
  type: AccountType
  currency: CurrencyCode
  asset_group: string | null
  is_hidden: boolean
  include_in_totals: boolean
  /** Thẻ tín dụng: hạn mức (minor units); null = không đặt / không phải thẻ */
  credit_limit: number | null
  /** Thẻ tín dụng: ngày chốt sao kê hằng tháng (1..31); null = chưa đặt */
  statement_day: number | null
  /** Thẻ tín dụng: ngày đến hạn trả hằng tháng (1..31); null = chưa đặt */
  payment_due_day: number | null
  /** Thẻ tín dụng: tài khoản nguồn tự trả thẻ; null = không tự trả / không phải thẻ */
  payment_account_id: string | null
  is_archived: boolean
  sort_order: number
  /** Giá gốc nhập tay (accounts.initial_balance) — tài sản cố định dùng làm giá mua */
  cost_basis: number
  /** Tài sản cố định: số tháng khấu hao tuyến tính; null = không khấu hao */
  depreciation_months: number | null
  /** Tài sản cố định: ngày mua; null = chưa đặt */
  depreciation_from: string | null
  /** Tài sản cố định: giá trị còn lại cuối vòng đời (minor units) */
  salvage_value: number
  /** Ưu đãi thuế Nhật; null = tài khoản thường */
  tax_shelter: TaxShelter | null
  /** Hạn mức nạp mỗi năm (minor units); null = chưa đặt */
  shelter_annual_limit: number | null
  /** Đầu tư: giá trị thị trường (snapshot mới nhất, minor units theo currency); null = chưa cập nhật / không phải đầu tư */
  market_value: number | null
  balance: number
}

/** Đầu tư (mục AE): ảnh chụp giá trị thị trường của một tài khoản tại một ngày. */
export type AccountValuationRow = {
  id: string
  user_id: string
  account_id: string
  valued_on: string
  /** minor units theo currency của tài khoản; luôn ≥ 0 */
  market_value: number
  note: string
  /** 'auto' = do edge function stock-refresh ghi; 'manual' = người dùng gõ tay (không bị cron đè) */
  source: 'manual' | 'auto'
  created_at: string
}

/** Bảng giá cổ phiếu Việt Nam (công khai, không thuộc user nào) — migration 0035. */
export type StockPriceRow = {
  symbol: string
  exchange: 'hose' | 'hnx' | 'upcom'
  name: string
  /** đồng/cổ; luôn > 0 */
  price: number
  /** giá tham chiếu phiên trước; null = không có */
  prior_close: number | null
  /** ngày PHIÊN của giá này (không phải ngày hút) */
  trading_date: string
  updated_at: string
}

export type StockTradeKind = 'buy' | 'sell' | 'adjust'

/** Một lệnh mua/bán/điều chỉnh cổ phiếu — migration 0035. */
export type StockTradeRow = {
  id: string
  user_id: string
  account_id: string
  symbol: string
  kind: StockTradeKind
  traded_on: string
  /** số cổ; âm chỉ với kind='adjust' (gộp cổ phiếu) */
  quantity: number
  /** đồng/cổ; 0 với kind='adjust' */
  price: number
  fee: number
  /** thuế bán 0,1%; 0 với mua và điều chỉnh */
  tax: number
  note: string
  created_at: string
  updated_at: string
}

/** Lịch sử tài sản ròng (mục AF): ảnh chụp net worth base theo ngày. */
export type NetWorthSnapshotRow = {
  id: string
  user_id: string
  snapshot_on: string
  /** tài sản ròng quy đổi base (minor units); có thể âm */
  net_worth: number
  created_at: string
}

/** Trạng thái thông báo (mục AO): chỉ nhớ đã đọc / đã tắt, không lưu nội dung. */
export type NotificationStateRow = {
  user_id: string
  key: string
  read_at: string | null
  dismissed_at: string | null
  /**
   * Mốc đã đẩy push cho mã này; null = chưa từng đẩy. Chỉ edge function ghi cột này.
   * Đây là thứ thực thi nguyên tắc "một việc báo một lần": mã việc-cần-làm không kèm
   * kỳ, nên còn dòng này thì còn im, tới khi tình huống hết và mã bị dọn (mục E).
   */
  pushed_at: string | null
  created_at: string
}

/** Lịch sử tỷ giá theo ngày — đợt này chỉ ghi, chưa có luật nào đọc. */
export type FxHistoryRow = {
  user_id: string
  on_date: string
  base: CurrencyCode
  /** major units: 1 đơn vị base đổi được rates[X] đơn vị X. */
  rates: Record<string, number>
}

/** Mục tiêu tiết kiệm (mục AD): đích cần đạt trên số dư một tài khoản. */
export type SavingsGoalRow = {
  id: string
  user_id: string
  name: string
  account_id: string
  /** minor units theo currency của tài khoản; > 0 */
  target_amount: number
  /** hạn hoàn thành; null = không đặt */
  target_date: string | null
  note: string
  sort_order: number
  created_at: string
}

/** Lifetime (mục Lifetime): một kịch bản đời. */
export type LifeScenarioRow = {
  id: string
  user_id: string
  name: string
  display_currency: string
  end_age: number
  /** Lợi suất THỰC (đã trừ lạm phát), basis points. Âm được. */
  real_return_bps: number
  /** Nửa độ rộng dải dao động, basis points. */
  band_spread_bps: number
  starting_assets_minor: number
  /** false = giá hôm nay (mặc định) */
  nominal_terms: boolean
  is_primary: boolean
  sort_order: number
  created_at: string
}

/** Chặng đời: thu chi NỀN. Không buộc theo quốc gia — xem migration 0031. */
export type LifePhaseRow = {
  id: string
  user_id: string
  scenario_id: string
  start_year: number
  label: string
  /** 'JP' | 'US' | 'VN' | ... | null */
  country: string | null
  currency: string
  annual_income_minor: number
  annual_expense_minor: number
  /** 1 đơn vị currency = bao nhiêu đơn vị display_currency, theo MAJOR units */
  fx_to_display: number
  created_at: string
}

/** Sự kiện: khoản có năm bắt đầu và (tùy chọn) năm kết thúc. Lương hưu cũng ở đây. */
export type LifeEventRow = {
  id: string
  user_id: string
  scenario_id: string
  start_year: number
  /** null = đến hết đời */
  end_year: number | null
  kind: 'income' | 'expense'
  /** Số MỖI NĂM trong khoảng */
  amount_minor: number
  currency: string
  label: string
  note: string
  /**
   * 1 đơn vị currency của SỰ KIỆN = bao nhiêu đơn vị display_currency, theo MAJOR
   * units. Riêng của sự kiện, không mượn của chặng — xem migration 0032.
   */
  fx_to_display: number
  inflate: boolean
  created_at: string
}

export type BudgetRow = {
  id: string
  user_id: string
  category_id: string
  month_key: string // "YYYY-MM"
  amount: number // minor units theo base_currency
  /** true = dồn phần hạn mức chưa tiêu tháng trước sang tháng này (mục AH). */
  rollover?: boolean
  created_at: string
  updated_at: string
}

/**
 * Cài đặt cho một nhóm tài sản. Thành viên nhóm vẫn là chuỗi accounts.asset_group;
 * bảng này chỉ lưu thuộc tính riêng của nhóm (thứ tự, có tính vào tổng, ẩn/hiện).
 * `name` khớp với accounts.asset_group. Nhóm không có bản ghi → dùng mặc định.
 */
export type AssetGroupSettingRow = {
  id: string
  user_id: string
  name: string
  sort_order: number
  /** false = không cộng vào Tổng tài sản (vẫn hiển thị riêng) */
  include_in_totals: boolean
  /** true = ẩn hẳn khỏi trang Tài sản (chỉ thấy trong trang quản lý) */
  is_hidden: boolean
  created_at: string
}

export type DebtRow = {
  id: string
  user_id: string
  counterparty: string
  direction: DebtDirection
  currency: CurrencyCode
  /** minor units theo currency của khoản nợ */
  principal: number
  due_on: string | null
  status: DebtStatus
  note: string
  /** lãi suất năm theo basis points (550 = 5.50%/năm); null = nợ thường không tính lịch trả */
  interest_bps: number | null
  /** số kỳ trả góp (tháng); null = không trả góp */
  term_months: number | null
  /** giao dịch giải ngân lúc tạo (cho vay = chi, mình nợ = thu); null = không chuyển tiền thật */
  disbursement_transaction_id: string | null
  created_at: string
  updated_at: string
}

export type DebtPaymentRow = {
  id: string
  user_id: string
  debt_id: string
  /** minor units theo currency của khoản nợ */
  amount: number
  paid_on: string
  /** giao dịch thật nếu có chuyển tiền; null = ghi nhận suông */
  transaction_id: string | null
  note: string
  created_at: string
}

export type RecurringRuleRow = {
  id: string
  user_id: string
  type: TransactionType
  /** minor units theo currency của tài khoản nguồn */
  amount: number
  /** CK xuyên tệ: minor units theo currency tài khoản đích; null = cùng loại tiền */
  to_amount: number | null
  category_id: string | null
  account_id: string
  to_account_id: string | null
  note: string
  frequency: RecurringFrequency
  /** kỳ đến hạn đầu tiên; anchor cho ngày-trong-tháng / thứ-trong-tuần */
  start_on: string
  /** null = vô hạn */
  end_on: string | null
  is_paused: boolean
  /** kỳ đến hạn cuối đã sinh; null = chưa sinh kỳ nào */
  last_generated_on: string | null
  created_at: string
  updated_at: string
}

type InsertOf<Row, Required extends keyof Row, Optional extends keyof Row> =
  Pick<Row, Required> & Partial<Pick<Row, Optional>>

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow
        Insert: InsertOf<
          ProfileRow,
          'user_id',
          | 'display_name'
          | 'base_currency'
          | 'month_start_day'
          | 'hourly_wage'
          | 'annual_inflation_bps'
          | 'capital_gains_tax_bps'
          | 'target_essential_bps'
          | 'target_flexible_bps'
          | 'target_savings_bps'
          | 'notif_off'
          | 'birth_year'
          | 'push_hour'
          | 'push_tz'
          | 'push_last_sent_at'
        >
        Update: Partial<
          Pick<
            ProfileRow,
            | 'display_name'
            | 'base_currency'
            | 'month_start_day'
            | 'hourly_wage'
            | 'annual_inflation_bps'
            | 'capital_gains_tax_bps'
            | 'target_essential_bps'
            | 'target_flexible_bps'
            | 'target_savings_bps'
            | 'notif_off'
            | 'birth_year'
            | 'push_hour'
            | 'push_tz'
            | 'push_last_sent_at'
          >
        >
        Relationships: []
      }
      accounts: {
        Row: AccountRow
        Insert: InsertOf<
          AccountRow,
          'user_id' | 'name' | 'type',
          | 'id'
          | 'currency'
          | 'initial_balance'
          | 'asset_group'
          | 'is_hidden'
          | 'include_in_totals'
          | 'credit_limit'
          | 'statement_day'
          | 'payment_due_day'
          | 'payment_account_id'
          | 'card_autopay_through'
          | 'depreciation_months'
          | 'depreciation_from'
          | 'salvage_value'
          | 'tax_shelter'
          | 'shelter_annual_limit'
          | 'sort_order'
          | 'is_archived'
        >
        Update: Partial<
          Pick<
            AccountRow,
            | 'name'
            | 'type'
            | 'currency'
            | 'initial_balance'
            | 'asset_group'
            | 'is_hidden'
            | 'include_in_totals'
            | 'credit_limit'
            | 'statement_day'
            | 'payment_due_day'
            | 'payment_account_id'
            | 'card_autopay_through'
            | 'depreciation_months'
            | 'depreciation_from'
            | 'salvage_value'
            | 'tax_shelter'
            | 'shelter_annual_limit'
            | 'sort_order'
            | 'is_archived'
          >
        >
        Relationships: []
      }
      categories: {
        Row: CategoryRow
        Insert: InsertOf<
          CategoryRow,
          'user_id' | 'name' | 'type',
          'id' | 'icon' | 'parent_id' | 'sort_order' | 'is_archived' | 'need_level' | 'cost_type'
        >
        Update: Partial<
          Pick<
            CategoryRow,
            'name' | 'type' | 'icon' | 'parent_id' | 'sort_order' | 'is_archived' | 'need_level' | 'cost_type'
          >
        >
        Relationships: []
      }
      transactions: {
        Row: TransactionRow
        Insert: InsertOf<
          TransactionRow,
          'user_id' | 'type' | 'amount' | 'account_id',
          | 'id'
          | 'to_amount'
          | 'category_id'
          | 'to_account_id'
          | 'occurred_on'
          | 'note'
          | 'recurring_rule_id'
          | 'is_remittance'
          | 'remit_service'
          | 'remit_fee_jpy'
          | 'remit_received_vnd'
          | 'is_debt_flow'
          | 'exclude_from_stats'
          | 'is_refund'
        >
        Update: Partial<
          Pick<
            TransactionRow,
            | 'type'
            | 'amount'
            | 'to_amount'
            | 'category_id'
            | 'account_id'
            | 'to_account_id'
            | 'occurred_on'
            | 'note'
            | 'is_remittance'
            | 'remit_service'
            | 'remit_fee_jpy'
            | 'remit_received_vnd'
            | 'is_debt_flow'
            | 'exclude_from_stats'
            | 'is_refund'
          >
        >
        Relationships: []
      }
      budgets: {
        Row: BudgetRow
        Insert: InsertOf<
          BudgetRow,
          'user_id' | 'category_id' | 'month_key' | 'amount',
          'id' | 'rollover'
        >
        Update: Partial<Pick<BudgetRow, 'amount' | 'rollover'>>
        Relationships: []
      }
      asset_group_settings: {
        Row: AssetGroupSettingRow
        Insert: InsertOf<
          AssetGroupSettingRow,
          'user_id' | 'name',
          'id' | 'sort_order' | 'include_in_totals' | 'is_hidden'
        >
        Update: Partial<
          Pick<AssetGroupSettingRow, 'name' | 'sort_order' | 'include_in_totals' | 'is_hidden'>
        >
        Relationships: []
      }
      debts: {
        Row: DebtRow
        Insert: InsertOf<
          DebtRow,
          'user_id' | 'counterparty' | 'direction' | 'principal',
          | 'id'
          | 'currency'
          | 'due_on'
          | 'status'
          | 'note'
          | 'interest_bps'
          | 'term_months'
          | 'disbursement_transaction_id'
        >
        Update: Partial<
          Pick<
            DebtRow,
            | 'counterparty'
            | 'direction'
            | 'currency'
            | 'principal'
            | 'due_on'
            | 'status'
            | 'note'
            | 'interest_bps'
            | 'term_months'
          >
        >
        Relationships: []
      }
      debt_payments: {
        Row: DebtPaymentRow
        Insert: InsertOf<
          DebtPaymentRow,
          'user_id' | 'debt_id' | 'amount',
          'id' | 'paid_on' | 'transaction_id' | 'note'
        >
        Update: Partial<Pick<DebtPaymentRow, 'amount' | 'paid_on' | 'transaction_id' | 'note'>>
        Relationships: []
      }
      recurring_rules: {
        Row: RecurringRuleRow
        Insert: InsertOf<
          RecurringRuleRow,
          'user_id' | 'type' | 'amount' | 'account_id' | 'frequency' | 'start_on',
          | 'id'
          | 'to_amount'
          | 'category_id'
          | 'to_account_id'
          | 'note'
          | 'end_on'
          | 'is_paused'
          | 'last_generated_on'
        >
        Update: Partial<
          Pick<
            RecurringRuleRow,
            | 'type'
            | 'amount'
            | 'to_amount'
            | 'category_id'
            | 'account_id'
            | 'to_account_id'
            | 'note'
            | 'frequency'
            | 'start_on'
            | 'end_on'
            | 'is_paused'
            | 'last_generated_on'
          >
        >
        Relationships: []
      }
      account_valuations: {
        Row: AccountValuationRow
        Insert: InsertOf<
          AccountValuationRow,
          'user_id' | 'account_id' | 'market_value',
          'id' | 'valued_on' | 'note' | 'source'
        >
        Update: Partial<Pick<AccountValuationRow, 'valued_on' | 'market_value' | 'note' | 'source'>>
        Relationships: []
      }
      stock_prices: {
        Row: StockPriceRow
        Insert: InsertOf<
          StockPriceRow,
          'symbol' | 'exchange' | 'price' | 'trading_date',
          'name' | 'prior_close' | 'updated_at'
        >
        Update: Partial<
          Pick<StockPriceRow, 'exchange' | 'name' | 'price' | 'prior_close' | 'trading_date' | 'updated_at'>
        >
        Relationships: []
      }
      stock_trades: {
        Row: StockTradeRow
        Insert: InsertOf<
          StockTradeRow,
          'user_id' | 'account_id' | 'symbol' | 'kind' | 'quantity',
          'id' | 'traded_on' | 'price' | 'fee' | 'tax' | 'note'
        >
        Update: Partial<
          Pick<StockTradeRow, 'symbol' | 'kind' | 'traded_on' | 'quantity' | 'price' | 'fee' | 'tax' | 'note'>
        >
        Relationships: []
      }
      savings_goals: {
        Row: SavingsGoalRow
        Insert: InsertOf<
          SavingsGoalRow,
          'user_id' | 'name' | 'account_id' | 'target_amount',
          'id' | 'target_date' | 'note' | 'sort_order'
        >
        Update: Partial<
          Pick<SavingsGoalRow, 'name' | 'account_id' | 'target_amount' | 'target_date' | 'note' | 'sort_order'>
        >
        Relationships: []
      }
      life_scenarios: {
        Row: LifeScenarioRow
        Insert: InsertOf<
          LifeScenarioRow,
          'user_id' | 'name',
          | 'id'
          | 'display_currency'
          | 'end_age'
          | 'real_return_bps'
          | 'band_spread_bps'
          | 'starting_assets_minor'
          | 'nominal_terms'
          | 'is_primary'
          | 'sort_order'
        >
        Update: Partial<
          Pick<
            LifeScenarioRow,
            | 'name'
            | 'display_currency'
            | 'end_age'
            | 'real_return_bps'
            | 'band_spread_bps'
            | 'starting_assets_minor'
            | 'nominal_terms'
            | 'is_primary'
            | 'sort_order'
          >
        >
        Relationships: []
      }
      life_phases: {
        Row: LifePhaseRow
        Insert: InsertOf<
          LifePhaseRow,
          'user_id' | 'scenario_id' | 'start_year' | 'currency',
          | 'id'
          | 'label'
          | 'country'
          | 'annual_income_minor'
          | 'annual_expense_minor'
          | 'fx_to_display'
        >
        Update: Partial<
          Pick<
            LifePhaseRow,
            | 'start_year'
            | 'label'
            | 'country'
            | 'currency'
            | 'annual_income_minor'
            | 'annual_expense_minor'
            | 'fx_to_display'
          >
        >
        Relationships: []
      }
      life_events: {
        Row: LifeEventRow
        Insert: InsertOf<
          LifeEventRow,
          'user_id' | 'scenario_id' | 'start_year' | 'kind' | 'amount_minor' | 'currency' | 'label',
          'id' | 'end_year' | 'note' | 'fx_to_display' | 'inflate'
        >
        Update: Partial<
          Pick<
            LifeEventRow,
            | 'start_year'
            | 'end_year'
            | 'kind'
            | 'amount_minor'
            | 'currency'
            | 'label'
            | 'note'
            | 'fx_to_display'
            | 'inflate'
          >
        >
        Relationships: []
      }
      tags: {
        Row: TagRow
        Insert: InsertOf<
          TagRow,
          'user_id' | 'name',
          'id' | 'color' | 'sort_order' | 'is_archived' | 'budget_amount' | 'budget_period'
        >
        Update: Partial<
          Pick<
            TagRow,
            'name' | 'color' | 'sort_order' | 'is_archived' | 'budget_amount' | 'budget_period'
          >
        >
        Relationships: []
      }
      transaction_tags: {
        Row: TransactionTagRow
        Insert: TransactionTagRow
        Update: Partial<TransactionTagRow>
        Relationships: []
      }
      networth_snapshots: {
        Row: NetWorthSnapshotRow
        Insert: InsertOf<
          NetWorthSnapshotRow,
          'user_id' | 'net_worth',
          'id' | 'snapshot_on'
        >
        Update: Partial<Pick<NetWorthSnapshotRow, 'net_worth' | 'snapshot_on'>>
        Relationships: []
      }
      notification_state: {
        Row: NotificationStateRow
        Insert: InsertOf<
          NotificationStateRow,
          'user_id' | 'key',
          'read_at' | 'dismissed_at' | 'pushed_at' | 'created_at'
        >
        Update: Partial<Pick<NotificationStateRow, 'read_at' | 'dismissed_at' | 'pushed_at'>>
        Relationships: []
      }
      fx_history: {
        Row: FxHistoryRow
        Insert: InsertOf<FxHistoryRow, 'user_id' | 'on_date' | 'base' | 'rates', never>
        Update: Partial<Pick<FxHistoryRow, 'rates'>>
        Relationships: []
      }
      push_subscriptions: {
        Row: PushSubscriptionRow
        Insert: InsertOf<
          PushSubscriptionRow,
          'user_id' | 'endpoint' | 'p256dh' | 'auth',
          'user_agent' | 'created_at' | 'last_ok_at'
        >
        Update: Partial<Pick<PushSubscriptionRow, 'p256dh' | 'auth' | 'user_agent' | 'last_ok_at'>>
        Relationships: []
      }
    }
    Views: {
      account_balances: {
        Row: AccountBalanceRow
        Relationships: []
      }
    }
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
