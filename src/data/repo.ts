import type {
  AccountBalanceRow,
  AccountRow,
  CategoryRow,
  ProfileRow,
  TransactionRow,
  TransactionType,
} from '../types/database.types'

export interface NewTransaction {
  type: TransactionType
  amount: number
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

// Toàn bộ đọc/ghi dữ liệu đi qua interface này.
// 2 implementation: demoRepo (localStorage) và supabaseRepo (Postgres + RLS).
export interface Repo {
  getProfile(): Promise<ProfileRow>
  getAccounts(): Promise<AccountRow[]>
  getAccountBalances(): Promise<AccountBalanceRow[]>
  getCategories(): Promise<CategoryRow[]>
  listTransactions(range: DateRange): Promise<TransactionRow[]>
  createTransaction(input: NewTransaction): Promise<TransactionRow>
  updateTransaction(id: string, patch: TransactionPatch): Promise<TransactionRow>
  deleteTransaction(id: string): Promise<void>
}
