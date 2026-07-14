import type { CurrencyCode } from '../lib/money'
import type {
  AccountBalanceRow,
  AccountRow,
  AccountType,
  CategoryRow,
  CategoryType,
  ProfileRow,
  TransactionRow,
  TransactionType,
} from '../types/database.types'

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
}

export type AccountPatch = Partial<NewAccount & { is_archived: boolean }>

export interface NewCategory {
  name: string
  type: CategoryType
  icon: string
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
}

// Toàn bộ đọc/ghi dữ liệu đi qua interface này.
// 2 implementation: demoRepo (localStorage) và supabaseRepo (Postgres + RLS).
export interface Repo {
  getProfile(): Promise<ProfileRow>
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
}
