import { addMonths, monthKeyForDate, monthKeyString, parseMonthKey, toISODate } from '../lib/dates'
import { filterTransactions } from '../features/transactions/filter'
import type {
  AccountBalanceRow,
  AccountRow,
  AssetGroupSettingRow,
  BudgetRow,
  CategoryRow,
  CategoryType,
  DebtPaymentRow,
  DebtRow,
  ProfileRow,
  TransactionRow,
} from '../types/database.types'
import type {
  AccountPatch,
  AssetGroupSettingPatch,
  CategoryPatch,
  DebtPatch,
  NewAccount,
  NewCategory,
  NewDebt,
  NewDebtPayment,
  NewTransaction,
  ProfilePatch,
  Repo,
  TransactionPatch,
  TxFilter,
} from './repo'

// Repo demo: dữ liệu lưu localStorage, seed giống hệt trigger handle_new_user
// trong migration + một ít giao dịch mẫu để sổ/tổng quan có số liệu.
// Tiền lưu ở minor units: JPY = yên, VND = đồng, USD = cent.

const STORAGE_KEY = 'sct-demo-db-v9' // v9: thêm nợ / cho vay (debts + debt_payments)
const DEMO_USER = 'demo-user'

interface DemoDB {
  profile: ProfileRow
  accounts: AccountRow[]
  categories: CategoryRow[]
  transactions: TransactionRow[]
  budgets: BudgetRow[]
  assetGroupSettings: AssetGroupSettingRow[]
  debts: DebtRow[]
  debtPayments: DebtPaymentRow[]
}

const uuid = () => crypto.randomUUID()
const nowISO = () => new Date().toISOString()

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toISODate(d)
}

function seed(): DemoDB {
  const account = (
    name: string,
    type: AccountRow['type'],
    currency: AccountRow['currency'],
    initial_balance: number,
    sort_order: number,
    asset_group: string | null,
  ): AccountRow => ({
    id: uuid(),
    user_id: DEMO_USER,
    name,
    type,
    currency,
    initial_balance,
    asset_group,
    is_hidden: false,
    include_in_totals: true,
    sort_order,
    is_archived: false,
    created_at: nowISO(),
  })

  let catOrder = 0
  const category = (
    name: string,
    type: CategoryType,
    icon: string,
    parent_id: string | null = null,
  ): CategoryRow => ({
    id: uuid(),
    user_id: DEMO_USER,
    name,
    type,
    icon,
    parent_id,
    sort_order: catOrder++,
    is_archived: false,
    created_at: nowISO(),
  })

  const accounts = [
    account('Tiền mặt', 'cash', 'JPY', 30_000, 0, 'Tiêu dùng'), // ¥30.000
    account('Ngân hàng', 'bank', 'JPY', 800_000, 1, 'Tiêu dùng'), // ¥800.000
    account('Đầu tư VN', 'bank', 'VND', 50_000_000, 2, 'Đầu tư'), // 50.000.000 ₫
    account('Dự trữ USD', 'bank', 'USD', 200_000, 3, 'Dự phòng'), // $2.000,00
  ]

  // Danh mục cha (một số có danh mục con để minh họa)
  const anUong = category('Ăn uống', 'expense', '🍜')
  const diLai = category('Đi lại', 'expense', '🚌')
  const muaSam = category('Mua sắm', 'expense', '🛍️')
  const hoaDon = category('Hóa đơn & tiện ích', 'expense', '🧾')
  const categories = [
    anUong,
    category('Đi chợ', 'expense', '🛒', anUong.id),
    category('Nhà hàng', 'expense', '🍽️', anUong.id),
    category('Cà phê', 'expense', '☕', anUong.id),
    diLai,
    category('Xăng xe', 'expense', '⛽', diLai.id),
    category('Tàu / Xe buýt', 'expense', '🚆', diLai.id),
    category('Taxi', 'expense', '🚕', diLai.id),
    muaSam,
    category('Quần áo', 'expense', '👕', muaSam.id),
    category('Đồ điện tử', 'expense', '📱', muaSam.id),
    hoaDon,
    category('Điện', 'expense', '💡', hoaDon.id),
    category('Nước', 'expense', '🚰', hoaDon.id),
    category('Internet / Điện thoại', 'expense', '🌐', hoaDon.id),
    category('Nhà cửa', 'expense', '🏠'),
    category('Sức khỏe', 'expense', '💊'),
    category('Giải trí', 'expense', '🎮'),
    category('Giáo dục', 'expense', '📚'),
    category('Quà tặng & từ thiện', 'expense', '🎁'),
    category('Khác', 'expense', '📦'),
    category('Lương', 'income', '💰'),
    category('Thưởng', 'income', '🎉'),
    category('Được tặng', 'income', '🧧'),
    category('Đầu tư', 'income', '📈'),
    category('Khác', 'income', '💵'),
  ]

  const cat = (name: string, type: CategoryType) =>
    categories.find((c) => c.name === name && c.type === type)!
  const [cash, bank, invest] = accounts

  const tx = (
    partial: Pick<TransactionRow, 'type' | 'amount' | 'occurred_on' | 'note'> &
      Partial<Pick<TransactionRow, 'category_id' | 'account_id' | 'to_account_id' | 'to_amount'>>,
  ): TransactionRow => ({
    id: uuid(),
    user_id: DEMO_USER,
    category_id: null,
    account_id: cash.id,
    to_account_id: null,
    to_amount: null,
    created_at: nowISO(),
    updated_at: nowISO(),
    ...partial,
  })

  const transactions = [
    // Chi tiêu hàng ngày bằng JPY
    tx({ type: 'expense', amount: 850, occurred_on: daysAgo(0), note: 'Cơm trưa', category_id: cat('Nhà hàng', 'expense').id }),
    tx({ type: 'expense', amount: 210, occurred_on: daysAgo(0), note: 'Tàu điện', category_id: cat('Tàu / Xe buýt', 'expense').id }),
    tx({ type: 'expense', amount: 3_280, occurred_on: daysAgo(1), note: 'Ăn tối cùng bạn', category_id: cat('Nhà hàng', 'expense').id }),
    tx({ type: 'expense', amount: 4_990, occurred_on: daysAgo(1), note: 'Áo khoác Uniqlo', category_id: cat('Quần áo', 'expense').id, account_id: bank.id }),
    tx({ type: 'expense', amount: 12_400, occurred_on: daysAgo(3), note: 'Tiền điện + gas', category_id: cat('Điện', 'expense').id, account_id: bank.id }),
    tx({ type: 'expense', amount: 1_200, occurred_on: daysAgo(5), note: 'Thuốc cảm', category_id: cat('Sức khỏe', 'expense').id }),
    tx({ type: 'income', amount: 280_000, occurred_on: daysAgo(9), note: 'Lương tháng', category_id: cat('Lương', 'income').id, account_id: bank.id }),
    // Rút tiền mặt JPY (cùng loại tiền → to_amount null)
    tx({ type: 'transfer', amount: 30_000, occurred_on: daysAgo(4), note: 'Rút tiền mặt', account_id: bank.id, to_account_id: cash.id }),
    // Chuyển khoản XUYÊN TỆ: ¥50.000 → Đầu tư VN nhận 8.250.000 ₫
    tx({ type: 'transfer', amount: 50_000, to_amount: 8_250_000, occurred_on: daysAgo(7), note: 'Nạp tài khoản đầu tư', account_id: bank.id, to_account_id: invest.id }),
    // Thu nhập đầu tư bằng VND
    tx({ type: 'income', amount: 1_500_000, occurred_on: daysAgo(6), note: 'Cổ tức', category_id: cat('Đầu tư', 'income').id, account_id: invest.id }),
    // Tháng trước
    tx({ type: 'expense', amount: 1_800, occurred_on: daysAgo(32), note: 'Xem phim', category_id: cat('Giải trí', 'expense').id }),
    tx({ type: 'expense', amount: 6_700, occurred_on: daysAgo(35), note: 'Siêu thị', category_id: cat('Đi chợ', 'expense').id, account_id: bank.id }),
    tx({ type: 'income', amount: 280_000, occurred_on: daysAgo(39), note: 'Lương tháng', category_id: cat('Lương', 'income').id, account_id: bank.id }),
  ]

  const thisMonth = monthKeyString(monthKeyForDate(toISODate(new Date()), 1))
  const budget = (categoryName: string, amount: number): BudgetRow => ({
    id: uuid(),
    user_id: DEMO_USER,
    category_id: cat(categoryName, 'expense').id,
    month_key: thisMonth,
    amount,
    created_at: nowISO(),
    updated_at: nowISO(),
  })
  const budgets = [
    budget('Ăn uống', 40_000), // ¥40.000 — hạn mức ở cha, gộp chi của các con
    budget('Đi lại', 8_000), // ¥8.000 — hạn mức ở cha
    budget('Quần áo', 20_000), // ¥20.000 — hạn mức ở một danh mục con
  ]

  // Cài đặt nhóm mặc định: giữ đúng thứ tự đã seed cho 3 nhóm.
  const groupSetting = (name: string, sort_order: number): AssetGroupSettingRow => ({
    id: uuid(),
    user_id: DEMO_USER,
    name,
    sort_order,
    include_in_totals: true,
    is_hidden: false,
    created_at: nowISO(),
  })
  const assetGroupSettings = [
    groupSetting('Tiêu dùng', 0),
    groupSetting('Đầu tư', 1),
    groupSetting('Dự phòng', 2),
  ]

  // Khoản nợ mẫu: mình cho bạn vay ¥50.000 (đã nhận lại ¥20.000) và mình nợ công ty $500.
  const debtLent: DebtRow = {
    id: uuid(),
    user_id: DEMO_USER,
    counterparty: 'Bạn Minh',
    direction: 'owed_to_me',
    currency: 'JPY',
    principal: 50_000,
    due_on: null,
    status: 'open',
    note: 'Cho mượn lúc chuyển nhà',
    created_at: nowISO(),
    updated_at: nowISO(),
  }
  const debtOwed: DebtRow = {
    id: uuid(),
    user_id: DEMO_USER,
    counterparty: 'Tạm ứng công ty',
    direction: 'i_owe',
    currency: 'USD',
    principal: 50_000, // $500,00
    due_on: daysAgo(-20), // hạn 20 ngày tới
    status: 'open',
    note: '',
    created_at: nowISO(),
    updated_at: nowISO(),
  }
  const debts = [debtLent, debtOwed]
  const debtPayments: DebtPaymentRow[] = [
    {
      id: uuid(),
      user_id: DEMO_USER,
      debt_id: debtLent.id,
      amount: 20_000,
      paid_on: daysAgo(2),
      transaction_id: null, // ghi nhận suông (demo)
      note: 'Trả trước một phần',
      created_at: nowISO(),
    },
  ]

  return {
    profile: {
      user_id: DEMO_USER,
      display_name: 'Người dùng demo',
      base_currency: 'JPY',
      month_start_day: 1,
      created_at: nowISO(),
    },
    accounts,
    categories,
    transactions,
    budgets,
    assetGroupSettings,
    debts,
    debtPayments,
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

  async updateProfile(patch: ProfilePatch) {
    const db = load()
    db.profile = { ...db.profile, ...patch }
    save(db)
    return db.profile
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
          if (t.type === 'transfer' && t.to_account_id === a.id)
            return sum + (t.to_amount ?? t.amount)
          return sum
        }, 0)
        return {
          id: a.id,
          user_id: a.user_id,
          name: a.name,
          type: a.type,
          currency: a.currency,
          asset_group: a.asset_group ?? null,
          is_hidden: a.is_hidden ?? false,
          include_in_totals: a.include_in_totals ?? true,
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

  async searchTransactions(filter: TxFilter) {
    return filterTransactions(load().transactions, filter)
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

  async createAccount(input: NewAccount) {
    const db = load()
    const sort_order = db.accounts.reduce((m, a) => Math.max(m, a.sort_order + 1), 0)
    const row: AccountRow = {
      ...input,
      id: uuid(),
      user_id: DEMO_USER,
      sort_order,
      is_archived: false,
      created_at: nowISO(),
    }
    db.accounts.push(row)
    save(db)
    return row
  },

  async updateAccount(id: string, patch: AccountPatch) {
    const db = load()
    const idx = db.accounts.findIndex((a) => a.id === id)
    if (idx < 0) throw new Error('Không tìm thấy tài khoản')
    db.accounts[idx] = { ...db.accounts[idx], ...patch }
    save(db)
    return db.accounts[idx]
  },

  async reorderAccounts(orderedIds: string[]) {
    const db = load()
    orderedIds.forEach((id, i) => {
      const acc = db.accounts.find((a) => a.id === id)
      if (acc) acc.sort_order = i
    })
    save(db)
  },

  async createCategory(input: NewCategory) {
    const db = load()
    const sort_order = db.categories
      .filter((c) => c.type === input.type)
      .reduce((m, c) => Math.max(m, c.sort_order + 1), 0)
    const row: CategoryRow = {
      ...input,
      parent_id: input.parent_id ?? null,
      id: uuid(),
      user_id: DEMO_USER,
      sort_order,
      is_archived: false,
      created_at: nowISO(),
    }
    db.categories.push(row)
    save(db)
    return row
  },

  async updateCategory(id: string, patch: CategoryPatch) {
    const db = load()
    const idx = db.categories.findIndex((c) => c.id === id)
    if (idx < 0) throw new Error('Không tìm thấy danh mục')
    db.categories[idx] = { ...db.categories[idx], ...patch }
    save(db)
    return db.categories[idx]
  },

  async reorderCategories(orderedIds: string[]) {
    const db = load()
    orderedIds.forEach((id, i) => {
      const cat = db.categories.find((c) => c.id === id)
      if (cat) cat.sort_order = i
    })
    save(db)
  },

  async getAssetGroupSettings() {
    return (load().assetGroupSettings ?? []).sort((a, b) => a.sort_order - b.sort_order)
  },

  async upsertAssetGroupSetting(name: string, patch: AssetGroupSettingPatch) {
    const db = load()
    db.assetGroupSettings ??= []
    const existing = db.assetGroupSettings.find((s) => s.name === name)
    if (existing) {
      Object.assign(existing, patch)
      save(db)
      return existing
    }
    const nextSort = db.assetGroupSettings.reduce((m, s) => Math.max(m, s.sort_order + 1), 0)
    const row: AssetGroupSettingRow = {
      id: uuid(),
      user_id: DEMO_USER,
      name,
      sort_order: nextSort,
      include_in_totals: true,
      is_hidden: false,
      created_at: nowISO(),
      ...patch,
    }
    db.assetGroupSettings.push(row)
    save(db)
    return row
  },

  async renameAssetGroup(oldName: string, newName: string) {
    const db = load()
    db.assetGroupSettings ??= []
    for (const a of db.accounts) {
      if (a.asset_group === oldName) a.asset_group = newName
    }
    const oldIdx = db.assetGroupSettings.findIndex((s) => s.name === oldName)
    const targetExists = db.assetGroupSettings.some((s) => s.name === newName)
    if (oldIdx >= 0) {
      // Gộp vào nhóm đã có → bỏ cài đặt cũ; ngược lại → đổi tên cài đặt cũ
      if (targetExists) db.assetGroupSettings.splice(oldIdx, 1)
      else db.assetGroupSettings[oldIdx].name = newName
    }
    save(db)
  },

  async deleteAssetGroup(name: string, reassignTo: string | null) {
    const db = load()
    db.assetGroupSettings ??= []
    for (const a of db.accounts) {
      if (a.asset_group === name) a.asset_group = reassignTo
    }
    db.assetGroupSettings = db.assetGroupSettings.filter((s) => s.name !== name)
    save(db)
  },

  async reorderAssetGroups(orderedNames: string[]) {
    const db = load()
    db.assetGroupSettings ??= []
    orderedNames.forEach((name, i) => {
      const existing = db.assetGroupSettings.find((s) => s.name === name)
      if (existing) existing.sort_order = i
      else
        db.assetGroupSettings.push({
          id: uuid(),
          user_id: DEMO_USER,
          name,
          sort_order: i,
          include_in_totals: true,
          is_hidden: false,
          created_at: nowISO(),
        })
    })
    save(db)
  },

  async assignAccountsToGroup(accountIds: string[], group: string | null) {
    const db = load()
    const ids = new Set(accountIds)
    for (const a of db.accounts) {
      if (ids.has(a.id)) a.asset_group = group
    }
    save(db)
  },

  async listBudgets(monthKey: string) {
    return load().budgets.filter((b) => b.month_key === monthKey)
  },

  async upsertBudget(categoryId: string, monthKey: string, amount: number) {
    const db = load()
    const existing = db.budgets.find(
      (b) => b.category_id === categoryId && b.month_key === monthKey,
    )
    if (existing) {
      existing.amount = amount
      existing.updated_at = nowISO()
      save(db)
      return existing
    }
    const row: BudgetRow = {
      id: uuid(),
      user_id: DEMO_USER,
      category_id: categoryId,
      month_key: monthKey,
      amount,
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    db.budgets.push(row)
    save(db)
    return row
  },

  async deleteBudget(id: string) {
    const db = load()
    db.budgets = db.budgets.filter((b) => b.id !== id)
    save(db)
  },

  async copyBudgetsFromPreviousMonth(monthKey: string) {
    const db = load()
    const prev = monthKeyString(addMonths(parseMonthKey(monthKey), -1))
    const existingCats = new Set(
      db.budgets.filter((b) => b.month_key === monthKey).map((b) => b.category_id),
    )
    const toCopy = db.budgets.filter(
      (b) => b.month_key === prev && !existingCats.has(b.category_id),
    )
    for (const b of toCopy) {
      db.budgets.push({
        id: uuid(),
        user_id: DEMO_USER,
        category_id: b.category_id,
        month_key: monthKey,
        amount: b.amount,
        created_at: nowISO(),
        updated_at: nowISO(),
      })
    }
    save(db)
    return toCopy.length
  },

  async getDebts() {
    return (load().debts ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at))
  },

  async getDebtPayments() {
    return (load().debtPayments ?? []).sort((a, b) => b.paid_on.localeCompare(a.paid_on))
  },

  async createDebt(input: NewDebt) {
    const db = load()
    db.debts ??= []
    const row: DebtRow = {
      ...input,
      id: uuid(),
      user_id: DEMO_USER,
      status: 'open',
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    db.debts.push(row)
    save(db)
    return row
  },

  async updateDebt(id: string, patch: DebtPatch) {
    const db = load()
    const idx = (db.debts ?? []).findIndex((d) => d.id === id)
    if (idx < 0) throw new Error('Không tìm thấy khoản nợ')
    db.debts[idx] = { ...db.debts[idx], ...patch, updated_at: nowISO() }
    save(db)
    return db.debts[idx]
  },

  async deleteDebt(id: string) {
    const db = load()
    db.debts ??= []
    db.debtPayments ??= []
    // Xóa giao dịch liên kết của các payment thuộc khoản nợ này
    const txIds = new Set(
      db.debtPayments
        .filter((p) => p.debt_id === id && p.transaction_id)
        .map((p) => p.transaction_id as string),
    )
    if (txIds.size > 0) db.transactions = db.transactions.filter((t) => !txIds.has(t.id))
    db.debtPayments = db.debtPayments.filter((p) => p.debt_id !== id)
    db.debts = db.debts.filter((d) => d.id !== id)
    save(db)
  },

  async createDebtPayment(input: NewDebtPayment) {
    const db = load()
    db.debtPayments ??= []
    let transaction_id: string | null = null
    if (input.transaction) {
      const tx: TransactionRow = {
        ...input.transaction,
        id: uuid(),
        user_id: DEMO_USER,
        created_at: nowISO(),
        updated_at: nowISO(),
      }
      db.transactions.push(tx)
      transaction_id = tx.id
    }
    const row: DebtPaymentRow = {
      id: uuid(),
      user_id: DEMO_USER,
      debt_id: input.debt_id,
      amount: input.amount,
      paid_on: input.paid_on,
      transaction_id,
      note: input.note,
      created_at: nowISO(),
    }
    db.debtPayments.push(row)
    save(db)
    return row
  },

  async deleteDebtPayment(id: string) {
    const db = load()
    db.debtPayments ??= []
    const payment = db.debtPayments.find((p) => p.id === id)
    if (payment?.transaction_id) {
      db.transactions = db.transactions.filter((t) => t.id !== payment.transaction_id)
    }
    db.debtPayments = db.debtPayments.filter((p) => p.id !== id)
    save(db)
  },
}
