import type { RecurringFrequency } from '../lib/recurring'
import type { CurrencyCode } from '../lib/money'
import type {
  AccountBalanceRow,
  AccountRow,
  AccountType,
  AssetGroupSettingRow,
  BudgetRow,
  CategoryRow,
  CategoryType,
  DebtDirection,
  DebtPaymentRow,
  DebtRow,
  ProfileRow,
  RecurringRuleRow,
  TransactionRow,
  TransactionType,
} from '../types/database.types'

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
}

/** Phiên bản định dạng backup hiện hành. */
export const BACKUP_VERSION = 1

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
  /** Dòng tiền nợ/cho vay/trả hộ: true = báo cáo Chi/Thu bỏ qua (số dư vẫn tính). */
  is_debt_flow?: boolean
}

export type TransactionPatch = Partial<NewTransaction>

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
  /** Thẻ tín dụng: con trỏ kỳ đã tự trả; null = chưa sinh kỳ nào */
  card_autopay_through?: string | null
}

export type AccountPatch = Partial<NewAccount & { is_archived: boolean }>

export interface NewCategory {
  name: string
  type: CategoryType
  icon: string
  /** null/bỏ trống = danh mục chính; id cha = danh mục con của cha đó */
  parent_id?: string | null
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
}

/** Chỉ sửa được tên hiển thị + ngày bắt đầu tháng. Cố ý KHÔNG có base_currency. */
export type ProfilePatch = Partial<Pick<ProfileRow, 'display_name' | 'month_start_day'>>

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
}

export type RecurringRulePatch = Partial<
  NewRecurringRule & { is_paused: boolean; last_generated_on: string | null }
>

/** Giao dịch do engine catch-up sinh — luôn mang recurring_rule_id. */
export type NewRecurringOccurrence = NewTransaction & { recurring_rule_id: string }

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
  createTransaction(input: NewTransaction): Promise<TransactionRow>
  updateTransaction(id: string, patch: TransactionPatch): Promise<TransactionRow>
  deleteTransaction(id: string): Promise<void>

  createAccount(input: NewAccount): Promise<AccountRow>
  updateAccount(id: string, patch: AccountPatch): Promise<AccountRow>
  /** Gán lại sort_order theo thứ tự id truyền vào. */
  reorderAccounts(orderedIds: string[]): Promise<void>

  createCategory(input: NewCategory): Promise<CategoryRow>
  updateCategory(id: string, patch: CategoryPatch): Promise<CategoryRow>
  reorderCategories(orderedIds: string[]): Promise<void>
  /** Bổ sung bộ danh mục kiểu Nhật: chỉ tạo mục còn thiếu (khớp tên+loại). Trả số đã thêm. */
  addJapanCategoryPreset(): Promise<number>

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
  upsertBudget(categoryId: string, monthKey: string, amount: number): Promise<BudgetRow>
  deleteBudget(id: string): Promise<void>
  /** Chép hạn mức từ tháng liền trước vào monthKey; bỏ qua danh mục đã có hạn mức
   *  ở tháng đích. Trả về số hạn mức đã chép. */
  copyBudgetsFromPreviousMonth(monthKey: string): Promise<number>

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

  // --- Sao lưu / khôi phục (mục Z) ---
  /** Gom toàn bộ dữ liệu người dùng thành một ảnh chụp để tải xuống. */
  exportAll(): Promise<BackupData>
  /** Ghi đè TOÀN BỘ dữ liệu bằng bản sao lưu (xóa hết rồi nhập lại). */
  importAll(data: BackupData): Promise<void>
}
