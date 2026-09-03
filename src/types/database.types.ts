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
/** Quan hệ với người thân nhận tiền (migration 0056). */
export type Relationship = 'parent' | 'spouse' | 'child' | 'sibling' | 'grandparent' | 'other'
export type CategoryType = 'expense' | 'income'
/**
 * Danh mục là tiêu thật hay chỉ chuyển tài sản.
 *
 * `transfer` = tiền vẫn của mình, chỉ đứng ở chỗ khác (Gửi tiền về VN, Điều chỉnh số dư).
 * Danh mục transfer KHÔNG vào tổng chi, KHÔNG vào tỷ lệ giữ lại, KHÔNG đặt được hạn mức.
 * Xem migration 0046 và `features/categories/kind.ts`.
 */
export type CategoryKind = 'expense' | 'transfer'
export type NeedLevel = 'essential' | 'flexible' | 'education' | 'giving' | 'buffer'
export type CostType = 'fixed' | 'variable'
export type TransactionType = 'expense' | 'income' | 'transfer'
/** i_owe = mình nợ người ta · owed_to_me = người ta nợ mình */
export type DebtDirection = 'i_owe' | 'owed_to_me'
export type DebtStatus = 'open' | 'settled'
/**
 * Khoản nợ này từ đâu ra (migration 0049). KHÔNG phải nhãn trang trí: nhánh 'earned'
 * làm lần trả được ghi thành THU thật thay vì dòng tiền nợ (xem debtPaymentPosting).
 * null = chưa ai nói → xử như 'lent', tức hành vi trước 0049.
 */
export type DebtOrigin = 'lent' | 'earned'

/**
 * Sheet mô phỏng cá nhân của 企業年金, người dùng gõ lại vào app (migration 0051).
 * `dated` là ngày IN TRÊN SHEET ('YYYY-MM'), không phải ngày gõ — màn hình hiện nó cạnh
 * con số để "tiết kiệm được bao nhiêu" không âm thầm cũ đi khi lương đã đổi.
 */
export type KikinSheet = {
  dated: string
  /** m = 掛金/tháng, si = 社会保険料/năm, tax = 所得税+住民税/năm. */
  points: { m: number; si: number; tax: number }[]
}

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
  /**
   * 給付利率 của 企業年金 (basis points, 30 = 0,30%/năm) — 基金 đặt lại theo từng 事業年度.
   * null = chưa khai → app dùng `KIKIN_GIVE_RATE_BPS_2025`. Migration 0051.
   */
  kikin_give_rate_bps: number | null
  /**
   * Ba điểm hiệu chuẩn từ sheet của 企業年金; null = chưa khai → app dùng `SHEET_2025_08`.
   * Migration 0051.
   */
  kikin_sheet: KikinSheet | null
  /** Năm thuế đã khai khấu trừ người phụ thuộc ở nước ngoài (migration 0056). Rỗng = chưa năm nào. */
  fuyo_claimed_years: number[]
  /** Giờ gửi push mỗi ngày (0..23), tính theo `push_tz` chứ không phải UTC. */
  push_hour: number
  /**
   * Múi giờ IANA để hiểu `push_hour` ('Asia/Tokyo', 'America/Los_Angeles').
   * Lưu tên múi giờ chứ không lưu offset số: offset không biết DST.
   */
  push_tz: string
  /** Lần gần nhất đã gửi push; null = chưa gửi lần nào. Chặn gửi hai lần một ngày. */
  push_last_sent_at: string | null
  /**
   * Cách trình bày (migration 0040): 'visual' = Gọn, 'full' = Đầy đủ.
   *
   * Kiểu ở đây rộng hơn ràng buộc thật (DB có check in ('visual','full')) vì cột là
   * `text`; app luôn đi qua `parseDensity()` ở src/lib/density.ts để về một trong hai
   * giá trị, nên giá trị lạ từ DB cũ không làm app trắng màn.
   */
  density_pref: string
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
  /**
   * Tiền ở đây rút ra tiêu được NGAY hay không (migration 0047).
   *
   * null = chưa đặt → app suy từ `type`, và phải NÓI RA là đang suy. Xem
   * `features/assets/liquidity.ts`: phép suy cũ đếm tiền gửi có kỳ hạn (定期預金, `type`
   * là 'bank') là tiền tiêu ngay được, và con số sai đó nuôi quỹ dự phòng, khả năng trả
   * nợ ngắn hạn, và khối "phần giữ lại đi đâu".
   */
  is_liquid: boolean | null
  /** Thẻ tín dụng: hạn mức (minor units theo currency thẻ); null = không đặt / không phải thẻ */
  credit_limit: number | null
  /** Thẻ tín dụng: ngày chốt sao kê hằng tháng (1..31); null = chưa đặt */
  statement_day: number | null
  /** Thẻ tín dụng: ngày đến hạn thanh toán hằng tháng (1..31); null = chưa đặt */
  payment_due_day: number | null
  /** Thẻ tín dụng: tài khoản nguồn tự trả thẻ (cùng currency, không phải thẻ); null = không tự trả */
  payment_account_id: string | null
  /**
   * Tài khoản đang giữ tiền mặt của tài khoản đầu tư này (migration 0054).
   *
   * Người dùng mua cổ phiếu VN bằng tiền ở ngân hàng nhưng chỉ ghi sổ lệnh, nên số dư
   * ngân hàng cao hơn tiền thật còn `brokerCash` ra âm. Khai cột này thì mỗi lệnh tự kéo
   * theo một chuyển khoản thật giữa hai tài khoản — xem `features/assets/stockTradePosting.ts`.
   *
   * null = không khai → không ghi gì, hành vi cũ giữ nguyên y hệt.
   */
  cash_account_id: string | null
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
  /**
   * Lần cuối người dùng so số dư sổ với thực tế qua sheet Đối chiếu (migration 0050).
   *
   * Ghi CẢ KHI đã khớp — đó là lý do cột này tồn tại. Trước 0050 app suy "lần đối chiếu
   * gần nhất" từ giao dịch bù, nên đối chiếu thấy khớp (không sinh giao dịch nào) không
   * để lại dấu vết và tài khoản vẫn bị đếm là chưa đối chiếu.
   *
   * null = chưa lần nào qua cột này → rơi về phép suy cũ. Xem `notifications/reconciledAt.ts`.
   */
  last_reconciled_at: string | null
  sort_order: number
  is_archived: boolean
  created_at: string
}

/**
 * Nhóm nhãn — một CÂU HỎI mà nhãn là câu trả lời ("Với ai?" → "Người yêu").
 * Người dùng tự tạo; migration 0039 seed sẵn "Với ai?" và "Ở đâu?".
 */
export type TagGroupRow = {
  id: string
  user_id: string
  name: string
  sort_order: number
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
   * Nhóm của nhãn; null = ngoài nhóm. Nhãn ngoài nhóm vẫn dùng bình thường, chỉ
   * nằm ở mục "Khác" cuối ô chọn nhãn. Xem migration 0039.
   */
  group_id: string | null
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
 * Liên kết nhiều–nhiều giữa QUY TẮC ĐỊNH KỲ và nhãn (migration 0042).
 *
 * Engine catch-up chép các nhãn này xuống từng giao dịch nó sinh ra, nên nhãn của
 * một khoản định kỳ chỉ phải khai một lần ở quy tắc.
 */
export type RecurringRuleTagRow = {
  rule_id: string
  tag_id: string
  user_id: string
}

/**
 * Liên kết nhiều–nhiều giữa KHOẢN SẮP CHI (lời nhắc) và nhãn (migration 0044).
 *
 * Lúc ghi khoản đó thành giao dịch thật, form Nhập lấy sẵn những nhãn này.
 */
export type PlannedExpenseTagRow = {
  planned_id: string
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
  /** Danh mục của giao dịch; null = chưa gắn. Dùng để đếm nhãn này đang phủ mấy hạn mức. */
  category_id: string | null
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
  /** Tiêu thật ('expense') hay chuyển tài sản ('transfer'). Mặc định 'expense'. */
  kind: CategoryKind
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
  /** Gửi tiền về VN: người thân nhận (relatives.id, migration 0056). null/thiếu = chưa gán. */
  remit_recipient_id?: string | null
  /** Dòng tiền nợ/cho vay/trả hộ: true = báo cáo Chi/Thu bỏ qua (số dư vẫn tính). */
  is_debt_flow?: boolean
  /** true = loại khỏi mọi thống kê (báo cáo/ngân sách/insight); số dư vẫn tính. Mục AM/X. */
  exclude_from_stats?: boolean
  /** Hoàn tiền: giao dịch CHI mang dấu âm (tiền về ví, KHÔNG phải thu nhập). */
  is_refund?: boolean
  /**
   * Lệnh cổ phiếu đã sinh ra dòng tiền này (migration 0054); null/vắng = giao dịch thường.
   *
   * FK `on delete cascade`: xoá lệnh thì dòng tiền tự đi theo, không phải nhớ dọn ở tầng
   * ứng dụng. Unique index chặn một lệnh có hai dòng.
   */
  stock_trade_id?: string | null
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
  /**
   * Rút ra tiêu được ngay? null = chưa đặt → suy từ `type`. Xem `features/assets/liquidity.ts`.
   *
   * PHẢI có ở đây: `buildHealthSnapshot`, `earmarked.ts` và bộ đếm "N tài khoản chưa khai"
   * chỉ đọc view này. Migration 0047 thêm cột mà quên dựng lại view, nên trong 6 migration
   * cột này là `undefined` ở mọi nơi đọc view — tiền gửi có kỳ hạn vẫn bị đếm là tiền tiêu
   * ngay, và lời nhắc "chưa khai" không bao giờ tắt được. Sửa ở 0053.
   */
  is_liquid: boolean | null
  /** Thẻ tín dụng: hạn mức (minor units); null = không đặt / không phải thẻ */
  credit_limit: number | null
  /** Thẻ tín dụng: ngày chốt sao kê hằng tháng (1..31); null = chưa đặt */
  statement_day: number | null
  /** Thẻ tín dụng: ngày đến hạn trả hằng tháng (1..31); null = chưa đặt */
  payment_due_day: number | null
  /** Thẻ tín dụng: tài khoản nguồn tự trả thẻ; null = không tự trả / không phải thẻ */
  payment_account_id: string | null
  /** Ví tiền của tài khoản đầu tư (migration 0054); null = không khai. Xem `AccountRow`. */
  cash_account_id: string | null
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
  /** Lần cuối đối chiếu (migration 0050); null = chưa lần nào → suy từ giao dịch bù */
  last_reconciled_at: string | null
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

/** Danh bạ quỹ đầu tư Nhật (công khai, không thuộc user nào) — migration 0045. */
export type FundRow = {
  /** 協会コード, vd '9I31223A' */
  assoc_fund_cd: string
  /** cần CẢ hai mã mới gọi được CSV giá; thiếu một cái server trả 200 kèm JSON rỗng */
  isin_cd: string
  name: string
  /** kết quả lần hút gần nhất — chỗ duy nhất lộ ra việc mã quỹ bị sai */
  last_status: 'chua-kiem' | 'ok' | 'ma-sai' | 'loi-mang'
  last_checked_at: string | null
  created_at: string
}

/**
 * Tên quỹ trong sao kê Rakuten → quỹ nào. NHIỀU tên trỏ về MỘT quỹ vì quỹ đổi tên
 * (Rakuten đổi loạt 「楽天・プラス」 ngày 2024-10-17) — migration 0045.
 */
export type FundAliasRow = {
  /** đúng chuỗi trong cột 対象証券名, kể cả '/再投資型' và ký tự full-width */
  statement_name: string
  assoc_fund_cd: string
}

/** 基準価額 mới nhất của từng quỹ (công khai) — migration 0045. */
export type FundPriceRow = {
  assoc_fund_cd: string
  /** ¥ trên 10.000 口 (đơn vị nguồn công bố); luôn > 0 */
  nav: number
  /** phiên trước; null = không có */
  prior_nav: number | null
  /** 純資産総額, TRIỆU yên. KHÔNG dùng để tính tiền. */
  net_assets_m: number | null
  /** ngày PHIÊN của giá (không phải ngày hút) */
  nav_date: string
  updated_at: string
}

export type FundTradeKind = 'buy' | 'sell' | 'adjust'

/** Một lệnh mua/bán/điều chỉnh quỹ — migration 0045. */
export type FundTradeRow = {
  id: string
  user_id: string
  account_id: string
  assoc_fund_cd: string
  kind: FundTradeKind
  /** 約定日 — KHÔNG phải 受渡日; hai ngày này lệch tới 5 ngày trên sao kê thật */
  traded_on: string
  /** 口数; âm chỉ với kind='adjust' */
  units: number
  /** ¥/10.000口 lúc khớp; 0 với 'adjust'. KHÔNG dùng để tính giá vốn. */
  nav: number
  /** yên THẬT đã trừ/nhận — nguồn sự thật cho giá vốn; 0 với 'adjust' */
  amount: number
  /** 口座区分 nguyên văn ('NISA成長投資枠', '特定', …); không tham gia phép tính */
  bucket: string
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

/**
 * Điểm sức khỏe ĐÃ TÍNH của một tháng (migration 0048).
 *
 * Snapshot chứ không tính lại: tỷ giá quá khứ không dựng lại được, số dư quá khứ neo vào
 * số dư hôm nay (nên giao dịch nhập muộn làm nó lệch), và ngưỡng/trọng số có thể đã đổi.
 * Xem đầu file migration.
 */
export type HealthSnapshotRow = {
  id: string
  user_id: string
  /** Ngày đầu của THÁNG TÀI CHÍNH được chấm. Một tháng một dòng. */
  month_on: string
  /** 0..100 */
  score: number
  /** Phần trọng số đã chấm được, bps (10000 = đủ sáu chỉ số). */
  coverage_bps: number
  created_at: string
  updated_at: string
}

/**
 * Lịch sử KẾT LUẬN của tab Tương lai (migration 0055): mỗi tháng một dòng cho mỗi kịch
 * bản, ghi từ bản ĐÃ LƯU khi mở tab. Xem verdictHistory.ts cho phần so.
 */
export type LifetimeVerdictSnapshotRow = {
  id: string
  user_id: string
  scenario_id: string
  /** Ngày đầu của THÁNG TÀI CHÍNH. Một tháng một dòng mỗi kịch bản. */
  month_on: string
  /** Năm đạt tự do tài chính (quy tắc 4%). null = không đạt trong bản chiếu. */
  fire_year: number | null
  /** Năm đầu tiên nhánh bi quan âm. null = không năm nào. */
  negative_year: number | null
  end_age: number
  /** Tài sản nhánh trung tâm lúc `end_age`, minor units của `display_currency`. */
  assets_end_minor: number
  display_currency: string
  created_at: string
  updated_at: string
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

/** Người thân nhận tiền gửi về VN (migration 0056). */
export type RelativeRow = {
  id: string
  user_id: string
  name: string
  /** Bắt buộc: tuổi tại 31/12 quyết định ngưỡng 38万 và mức khấu trừ. */
  birth_year: number
  relationship: Relationship
  /** ISO-2; 'JP' = đã cư trú ở Nhật → ngoài phạm vi luật 国外居住親族. */
  country: string
  is_archived: boolean
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
 * Thu dự kiến của một tháng, do người dùng khai tay (migration 0041).
 *
 * Vắng dòng KHÔNG phải "thu bằng 0" — nó nghĩa là "chưa khai", và mặt lập kế hoạch
 * rơi về trung bình 3 tháng đã hoàn tất. Còn `expected_income = 0` là con số thật:
 * tháng nghỉ không lương.
 */
export type MonthPlanRow = {
  id: string
  user_id: string
  month_key: string // "YYYY-MM"
  expected_income: number // minor units theo base_currency
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
  /** 'earned' = nợ tiền công → lần trả vào Thu thật; null = chưa ai nói (xem 0049) */
  origin: DebtOrigin | null
  /** Danh mục THU cho mọi lần trả khi origin = 'earned'; ràng buộc DB đòi phải có */
  income_category_id: string | null
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
  /** Hoàn tiền lặp lại (migration 0043). Chỉ được true khi type = 'expense'. */
  is_refund: boolean
  /**
   * Kỳ đến hạn cuối ĐÃ XONG; null = chưa kỳ nào.
   *
   * Với `mode = 'auto'` nghĩa là "đã sinh giao dịch tới kỳ này"; với `'remind'`
   * nghĩa là "người dùng đã xác nhận trả tới kỳ này". Một cột cho hai nghĩa vì cả
   * hai đều là con trỏ "xong tới đâu" và mọi phép toán ngày dùng nó y hệt nhau.
   */
  last_generated_on: string | null
  /** Xem migration 0037. */
  mode: RecurringMode
  /** Chỉ dùng với `mode = 'remind'`: nhắc trước ngày đến hạn bấy nhiêu ngày. */
  remind_days_before: number
  created_at: string
  updated_at: string
}

/**
 * 'auto' = tới hạn TỰ SINH giao dịch (khoản tự động rời tài khoản).
 * 'remind' = chỉ nhắc, người dùng tự ghi rồi xác nhận (khoản phải tự tay làm, số
 * tiền có thể khác nhau mỗi lần — vd gửi tiền về nhà).
 */
export type RecurringMode = 'auto' | 'remind'

/** 'day' = đúng ngày này · 'month' = chỉ biết tháng (due_on neo vào ngày 1). */
export type DuePrecision = 'day' | 'month'
/** 'planned' = còn phải chi · 'done' = đã chi (có transaction_id) · 'dropped' = bỏ. */
export type PlannedStatus = 'planned' | 'done' | 'dropped'

/** Một khoản CHƯA tiêu mà sẽ phải tiêu — xem migration 0038. */
export type PlannedExpenseRow = {
  id: string
  user_id: string
  title: string
  /** ước tính, minor units theo `currency`; 0 = chưa biết bao nhiêu */
  amount: number
  currency: CurrencyCode
  due_on: string
  due_precision: DuePrecision
  /** null = không nhắc; 0 = nhắc đúng ngày đến hạn */
  remind_days_before: number | null
  category_id: string | null
  account_id: string | null
  status: PlannedStatus
  /** giao dịch đã ghi khi chi thật; null = chưa chi */
  transaction_id: string | null
  note: string
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
          | 'density_pref'
          | 'kikin_give_rate_bps'
          | 'kikin_sheet'
          | 'fuyo_claimed_years'
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
          | 'density_pref'
          | 'kikin_give_rate_bps'
          | 'kikin_sheet'
          | 'fuyo_claimed_years'
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
          | 'cash_account_id'
          | 'card_autopay_through'
          | 'depreciation_months'
          | 'depreciation_from'
          | 'salvage_value'
          | 'tax_shelter'
          | 'shelter_annual_limit'
          | 'sort_order'
          | 'is_archived'
          | 'is_liquid'
          | 'last_reconciled_at'
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
            | 'cash_account_id'
            | 'card_autopay_through'
            | 'depreciation_months'
            | 'depreciation_from'
            | 'salvage_value'
            | 'tax_shelter'
            | 'shelter_annual_limit'
            | 'sort_order'
            | 'is_archived'
            | 'is_liquid'
            | 'last_reconciled_at'
          >
        >
        Relationships: []
      }
      categories: {
        Row: CategoryRow
        Insert: InsertOf<
          CategoryRow,
          'user_id' | 'name' | 'type',
          | 'id'
          | 'icon'
          | 'parent_id'
          | 'sort_order'
          | 'is_archived'
          | 'need_level'
          | 'cost_type'
          | 'kind'
        >
        Update: Partial<
          Pick<
            CategoryRow,
            | 'name'
            | 'type'
            | 'icon'
            | 'parent_id'
            | 'sort_order'
            | 'is_archived'
            | 'need_level'
            | 'cost_type'
            | 'kind'
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
          | 'remit_recipient_id'
          | 'is_debt_flow'
          | 'exclude_from_stats'
          | 'is_refund'
          | 'stock_trade_id'
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
            | 'remit_recipient_id'
            | 'is_debt_flow'
            | 'exclude_from_stats'
            | 'is_refund'
            | 'stock_trade_id'
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
      month_plans: {
        Row: MonthPlanRow
        Insert: InsertOf<MonthPlanRow, 'user_id' | 'month_key' | 'expected_income', 'id'>
        Update: Partial<Pick<MonthPlanRow, 'expected_income'>>
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
          | 'origin'
          | 'income_category_id'
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
          | 'mode'
          | 'remind_days_before'
          | 'is_refund'
        >
        Update: Partial<
          Pick<
            RecurringRuleRow,
            | 'is_refund'
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
            | 'mode'
            | 'remind_days_before'
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
      funds: {
        Row: FundRow
        Insert: InsertOf<FundRow, 'assoc_fund_cd' | 'isin_cd', 'name' | 'last_status' | 'last_checked_at'>
        Update: Partial<Pick<FundRow, 'isin_cd' | 'name' | 'last_status' | 'last_checked_at'>>
        Relationships: []
      }
      fund_aliases: {
        Row: FundAliasRow
        Insert: InsertOf<FundAliasRow, 'statement_name' | 'assoc_fund_cd', never>
        Update: Partial<Pick<FundAliasRow, 'assoc_fund_cd'>>
        Relationships: []
      }
      fund_prices: {
        Row: FundPriceRow
        Insert: InsertOf<
          FundPriceRow,
          'assoc_fund_cd' | 'nav' | 'nav_date',
          'prior_nav' | 'net_assets_m' | 'updated_at'
        >
        Update: Partial<
          Pick<FundPriceRow, 'nav' | 'prior_nav' | 'net_assets_m' | 'nav_date' | 'updated_at'>
        >
        Relationships: []
      }
      fund_trades: {
        Row: FundTradeRow
        Insert: InsertOf<
          FundTradeRow,
          'user_id' | 'account_id' | 'assoc_fund_cd' | 'kind' | 'units',
          'id' | 'traded_on' | 'nav' | 'amount' | 'bucket' | 'note'
        >
        Update: Partial<
          Pick<
            FundTradeRow,
            'assoc_fund_cd' | 'kind' | 'traded_on' | 'units' | 'nav' | 'amount' | 'bucket' | 'note'
          >
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
      relatives: {
        Row: RelativeRow
        Insert: InsertOf<
          RelativeRow,
          'user_id' | 'name' | 'birth_year' | 'relationship',
          'id' | 'country' | 'is_archived' | 'sort_order' | 'created_at'
        >
        Update: Partial<
          Pick<RelativeRow, 'name' | 'birth_year' | 'relationship' | 'country' | 'is_archived' | 'sort_order'>
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
      tag_groups: {
        Row: TagGroupRow
        Insert: InsertOf<TagGroupRow, 'user_id' | 'name', 'id' | 'sort_order'>
        Update: Partial<Pick<TagGroupRow, 'name' | 'sort_order'>>
        Relationships: []
      }
      tags: {
        Row: TagRow
        Insert: InsertOf<
          TagRow,
          'user_id' | 'name',
          'id' | 'color' | 'sort_order' | 'is_archived' | 'budget_amount' | 'budget_period' | 'group_id'
        >
        Update: Partial<
          Pick<
            TagRow,
            'name' | 'color' | 'sort_order' | 'is_archived' | 'budget_amount' | 'budget_period' | 'group_id'
          >
        >
        Relationships: []
      }
      planned_expenses: {
        Row: PlannedExpenseRow
        Insert: InsertOf<
          PlannedExpenseRow,
          'user_id' | 'title' | 'due_on',
          | 'id'
          | 'amount'
          | 'currency'
          | 'due_precision'
          | 'remind_days_before'
          | 'category_id'
          | 'account_id'
          | 'status'
          | 'transaction_id'
          | 'note'
        >
        Update: Partial<
          Pick<
            PlannedExpenseRow,
            | 'title'
            | 'amount'
            | 'currency'
            | 'due_on'
            | 'due_precision'
            | 'remind_days_before'
            | 'category_id'
            | 'account_id'
            | 'status'
            | 'transaction_id'
            | 'note'
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
      recurring_rule_tags: {
        Row: RecurringRuleTagRow
        Insert: RecurringRuleTagRow
        Update: Partial<RecurringRuleTagRow>
        Relationships: []
      }
      planned_expense_tags: {
        Row: PlannedExpenseTagRow
        Insert: PlannedExpenseTagRow
        Update: Partial<PlannedExpenseTagRow>
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
      health_snapshots: {
        Row: HealthSnapshotRow
        Insert: InsertOf<
          HealthSnapshotRow,
          'user_id' | 'month_on' | 'score',
          'id' | 'coverage_bps'
        >
        Update: Partial<Pick<HealthSnapshotRow, 'score' | 'coverage_bps'>>
        Relationships: []
      }
      lifetime_verdict_snapshots: {
        Row: LifetimeVerdictSnapshotRow
        Insert: InsertOf<
          LifetimeVerdictSnapshotRow,
          | 'user_id'
          | 'scenario_id'
          | 'month_on'
          | 'end_age'
          | 'assets_end_minor'
          | 'display_currency',
          'id' | 'fire_year' | 'negative_year'
        >
        Update: Partial<
          Pick<
            LifetimeVerdictSnapshotRow,
            'fire_year' | 'negative_year' | 'end_age' | 'assets_end_minor' | 'display_currency'
          >
        >
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
