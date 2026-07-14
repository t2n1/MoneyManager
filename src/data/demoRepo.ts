import { toISODate } from '../lib/dates'
import type {
  AccountBalanceRow,
  AccountRow,
  CategoryRow,
  CategoryType,
  ProfileRow,
  TransactionRow,
} from '../types/database.types'
import type { NewTransaction, Repo, TransactionPatch } from './repo'

// Repo demo: dữ liệu lưu localStorage, seed giống hệt trigger handle_new_user
// trong migration + một ít giao dịch mẫu để sổ/tổng quan có số liệu.

const STORAGE_KEY = 'sct-demo-db-v1'
const DEMO_USER = 'demo-user'

interface DemoDB {
  profile: ProfileRow
  accounts: AccountRow[]
  categories: CategoryRow[]
  transactions: TransactionRow[]
}

const uuid = () => crypto.randomUUID()
const nowISO = () => new Date().toISOString()

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toISODate(d)
}

function seed(): DemoDB {
  const account = (name: string, type: AccountRow['type'], sort_order: number): AccountRow => ({
    id: uuid(),
    user_id: DEMO_USER,
    name,
    type,
    initial_balance: type === 'cash' ? 500_000 : 8_000_000,
    sort_order,
    is_archived: false,
    created_at: nowISO(),
  })

  const category = (
    name: string,
    type: CategoryType,
    icon: string,
    sort_order: number,
  ): CategoryRow => ({
    id: uuid(),
    user_id: DEMO_USER,
    name,
    type,
    icon,
    sort_order,
    is_archived: false,
    created_at: nowISO(),
  })

  const accounts = [account('Tiền mặt', 'cash', 0), account('Ngân hàng', 'bank', 1)]

  const categories = [
    category('Ăn uống', 'expense', '🍜', 0),
    category('Đi lại', 'expense', '🚌', 1),
    category('Mua sắm', 'expense', '🛍️', 2),
    category('Hóa đơn & tiện ích', 'expense', '🧾', 3),
    category('Nhà cửa', 'expense', '🏠', 4),
    category('Sức khỏe', 'expense', '💊', 5),
    category('Giải trí', 'expense', '🎮', 6),
    category('Giáo dục', 'expense', '📚', 7),
    category('Quà tặng & từ thiện', 'expense', '🎁', 8),
    category('Khác', 'expense', '📦', 9),
    category('Lương', 'income', '💰', 0),
    category('Thưởng', 'income', '🎉', 1),
    category('Được tặng', 'income', '🧧', 2),
    category('Đầu tư', 'income', '📈', 3),
    category('Khác', 'income', '💵', 4),
  ]

  const cat = (name: string, type: CategoryType) =>
    categories.find((c) => c.name === name && c.type === type)!
  const [cash, bank] = accounts

  const tx = (
    partial: Pick<TransactionRow, 'type' | 'amount' | 'occurred_on' | 'note'> &
      Partial<Pick<TransactionRow, 'category_id' | 'account_id' | 'to_account_id'>>,
  ): TransactionRow => ({
    id: uuid(),
    user_id: DEMO_USER,
    category_id: null,
    account_id: cash.id,
    to_account_id: null,
    created_at: nowISO(),
    updated_at: nowISO(),
    ...partial,
  })

  const transactions = [
    tx({ type: 'expense', amount: 45_000, occurred_on: daysAgo(0), note: 'Bún bò', category_id: cat('Ăn uống', 'expense').id }),
    tx({ type: 'expense', amount: 12_000, occurred_on: daysAgo(0), note: 'Gửi xe', category_id: cat('Đi lại', 'expense').id }),
    tx({ type: 'expense', amount: 128_000, occurred_on: daysAgo(1), note: 'Ăn tối cùng bạn', category_id: cat('Ăn uống', 'expense').id }),
    tx({ type: 'expense', amount: 259_000, occurred_on: daysAgo(1), note: 'Áo thun', category_id: cat('Mua sắm', 'expense').id, account_id: bank.id }),
    tx({ type: 'expense', amount: 520_000, occurred_on: daysAgo(3), note: 'Tiền điện tháng này', category_id: cat('Hóa đơn & tiện ích', 'expense').id, account_id: bank.id }),
    tx({ type: 'transfer', amount: 2_000_000, occurred_on: daysAgo(4), note: 'Rút tiền mặt', account_id: bank.id, to_account_id: cash.id }),
    tx({ type: 'expense', amount: 89_000, occurred_on: daysAgo(5), note: 'Thuốc cảm', category_id: cat('Sức khỏe', 'expense').id }),
    tx({ type: 'income', amount: 15_000_000, occurred_on: daysAgo(9), note: 'Lương tháng', category_id: cat('Lương', 'income').id, account_id: bank.id }),
    tx({ type: 'expense', amount: 65_000, occurred_on: daysAgo(32), note: 'Xem phim', category_id: cat('Giải trí', 'expense').id }),
    tx({ type: 'expense', amount: 210_000, occurred_on: daysAgo(35), note: 'Siêu thị', category_id: cat('Mua sắm', 'expense').id, account_id: bank.id }),
    tx({ type: 'income', amount: 15_000_000, occurred_on: daysAgo(39), note: 'Lương tháng', category_id: cat('Lương', 'income').id, account_id: bank.id }),
  ]

  return {
    profile: {
      user_id: DEMO_USER,
      display_name: 'Người dùng demo',
      month_start_day: 1,
      created_at: nowISO(),
    },
    accounts,
    categories,
    transactions,
  }
}

function load(): DemoDB {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      return JSON.parse(raw) as DemoDB
    } catch {
      // dữ liệu hỏng → seed lại
    }
  }
  const db = seed()
  save(db)
  return db
}

function save(db: DemoDB) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

export function resetDemoData() {
  localStorage.removeItem(STORAGE_KEY)
}

export const demoRepo: Repo = {
  async getProfile() {
    return load().profile
  },

  async getAccounts() {
    return load().accounts.sort((a, b) => a.sort_order - b.sort_order)
  },

  async getAccountBalances(): Promise<AccountBalanceRow[]> {
    const db = load()
    return db.accounts
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((a) => {
        // Cùng logic với view account_balances trong migration
        const delta = db.transactions.reduce((sum, t) => {
          if (t.type === 'income' && t.account_id === a.id) return sum + t.amount
          if (t.type === 'expense' && t.account_id === a.id) return sum - t.amount
          if (t.type === 'transfer' && t.account_id === a.id) return sum - t.amount
          if (t.type === 'transfer' && t.to_account_id === a.id) return sum + t.amount
          return sum
        }, 0)
        return {
          id: a.id,
          user_id: a.user_id,
          name: a.name,
          type: a.type,
          is_archived: a.is_archived,
          sort_order: a.sort_order,
          balance: a.initial_balance + delta,
        }
      })
  },

  async getCategories() {
    return load().categories.sort((a, b) => a.sort_order - b.sort_order)
  },

  async listTransactions({ start, end }) {
    return load()
      .transactions.filter((t) => t.occurred_on >= start && t.occurred_on < end)
      .sort(
        (a, b) =>
          b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at),
      )
  },

  async createTransaction(input: NewTransaction) {
    const db = load()
    const row: TransactionRow = {
      ...input,
      id: uuid(),
      user_id: DEMO_USER,
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    db.transactions.push(row)
    save(db)
    return row
  },

  async updateTransaction(id: string, patch: TransactionPatch) {
    const db = load()
    const idx = db.transactions.findIndex((t) => t.id === id)
    if (idx < 0) throw new Error('Không tìm thấy giao dịch')
    db.transactions[idx] = { ...db.transactions[idx], ...patch, updated_at: nowISO() }
    save(db)
    return db.transactions[idx]
  },

  async deleteTransaction(id: string) {
    const db = load()
    db.transactions = db.transactions.filter((t) => t.id !== id)
    save(db)
  },
}
