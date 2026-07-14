// Types viết tay khớp với supabase/migrations/0001_init.sql.
// Khi schema đổi: cập nhật file này cùng lúc với migration
// (hoặc thay bằng `supabase gen types typescript` nếu cài CLI).

export type AccountType = 'cash' | 'bank'
export type CategoryType = 'expense' | 'income'
export type TransactionType = 'expense' | 'income' | 'transfer'

export interface ProfileRow {
  user_id: string
  display_name: string | null
  month_start_day: number
  created_at: string
}

export interface AccountRow {
  id: string
  user_id: string
  name: string
  type: AccountType
  initial_balance: number
  sort_order: number
  is_archived: boolean
  created_at: string
}

export interface CategoryRow {
  id: string
  user_id: string
  name: string
  type: CategoryType
  icon: string
  sort_order: number
  is_archived: boolean
  created_at: string
}

export interface TransactionRow {
  id: string
  user_id: string
  type: TransactionType
  amount: number
  category_id: string | null
  account_id: string
  to_account_id: string | null
  occurred_on: string
  note: string
  created_at: string
  updated_at: string
}

export interface AccountBalanceRow {
  id: string
  user_id: string
  name: string
  type: AccountType
  is_archived: boolean
  sort_order: number
  balance: number
}

type InsertOf<Row, Required extends keyof Row, Optional extends keyof Row> =
  Pick<Row, Required> & Partial<Pick<Row, Optional>>

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow
        Insert: InsertOf<ProfileRow, 'user_id', 'display_name' | 'month_start_day'>
        Update: Partial<Pick<ProfileRow, 'display_name' | 'month_start_day'>>
        Relationships: []
      }
      accounts: {
        Row: AccountRow
        Insert: InsertOf<
          AccountRow,
          'user_id' | 'name' | 'type',
          'id' | 'initial_balance' | 'sort_order' | 'is_archived'
        >
        Update: Partial<
          Pick<AccountRow, 'name' | 'type' | 'initial_balance' | 'sort_order' | 'is_archived'>
        >
        Relationships: []
      }
      categories: {
        Row: CategoryRow
        Insert: InsertOf<
          CategoryRow,
          'user_id' | 'name' | 'type',
          'id' | 'icon' | 'sort_order' | 'is_archived'
        >
        Update: Partial<
          Pick<CategoryRow, 'name' | 'type' | 'icon' | 'sort_order' | 'is_archived'>
        >
        Relationships: []
      }
      transactions: {
        Row: TransactionRow
        Insert: InsertOf<
          TransactionRow,
          'user_id' | 'type' | 'amount' | 'account_id',
          'id' | 'category_id' | 'to_account_id' | 'occurred_on' | 'note'
        >
        Update: Partial<
          Pick<
            TransactionRow,
            'type' | 'amount' | 'category_id' | 'account_id' | 'to_account_id' | 'occurred_on' | 'note'
          >
        >
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
