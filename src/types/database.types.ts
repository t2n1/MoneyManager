// Types viết tay khớp với supabase/migrations/0001_init.sql.
// Khi schema đổi: cập nhật file này cùng lúc với migration
// (hoặc thay bằng `supabase gen types typescript` nếu cài CLI).
// Lưu ý: dùng `type` chứ không dùng `interface` — supabase-js yêu cầu
// index signature ngầm (Record<string, unknown>) mà interface không có.

import type { CurrencyCode } from '../lib/money'

export type AccountType = 'cash' | 'bank'
export type CategoryType = 'expense' | 'income'
export type TransactionType = 'expense' | 'income' | 'transfer'

export type ProfileRow = {
  user_id: string
  display_name: string | null
  base_currency: CurrencyCode
  month_start_day: number
  created_at: string
}

export type AccountRow = {
  id: string
  user_id: string
  name: string
  type: AccountType
  currency: CurrencyCode
  initial_balance: number
  sort_order: number
  is_archived: boolean
  created_at: string
}

export type CategoryRow = {
  id: string
  user_id: string
  name: string
  type: CategoryType
  icon: string
  sort_order: number
  is_archived: boolean
  created_at: string
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
  occurred_on: string
  note: string
  created_at: string
  updated_at: string
}

export type AccountBalanceRow = {
  id: string
  user_id: string
  name: string
  type: AccountType
  currency: CurrencyCode
  is_archived: boolean
  sort_order: number
  balance: number
}

export type BudgetRow = {
  id: string
  user_id: string
  category_id: string
  month_key: string // "YYYY-MM"
  amount: number // minor units theo base_currency
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
        Insert: InsertOf<ProfileRow, 'user_id', 'display_name' | 'base_currency' | 'month_start_day'>
        Update: Partial<Pick<ProfileRow, 'display_name' | 'base_currency' | 'month_start_day'>>
        Relationships: []
      }
      accounts: {
        Row: AccountRow
        Insert: InsertOf<
          AccountRow,
          'user_id' | 'name' | 'type',
          'id' | 'currency' | 'initial_balance' | 'sort_order' | 'is_archived'
        >
        Update: Partial<
          Pick<
            AccountRow,
            'name' | 'type' | 'currency' | 'initial_balance' | 'sort_order' | 'is_archived'
          >
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
          'id' | 'to_amount' | 'category_id' | 'to_account_id' | 'occurred_on' | 'note'
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
          >
        >
        Relationships: []
      }
      budgets: {
        Row: BudgetRow
        Insert: InsertOf<
          BudgetRow,
          'user_id' | 'category_id' | 'month_key' | 'amount',
          'id'
        >
        Update: Partial<Pick<BudgetRow, 'amount'>>
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
