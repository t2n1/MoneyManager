import { addMonths, monthKeyForDate, monthKeyString, parseMonthKey, toISODate } from '../lib/dates'
import { filterTransactions } from '../features/transactions/filter'
import { brokerCash, holdingsFromTrades, portfolioValue, sessionPrices, type Trade } from '../features/assets/holdings'
import { validateBackupPayload } from './backupImport'
import type { CurrencyCode } from '../lib/money'
import type { Rates } from '../lib/rates'
import type {
  AccountBalanceRow,
  AccountRow,
  AccountValuationRow,
  AssetGroupSettingRow,
  BudgetRow,
  CategoryRow,
  CategoryType,
  CostType,
  DebtPaymentRow,
  DebtRow,
  FxHistoryRow,
  LifeEventRow,
  LifePhaseRow,
  LifeScenarioRow,
  NeedLevel,
  NetWorthSnapshotRow,
  NotificationStateRow,
  ProfileRow,
  PushSubscriptionRow,
  RecurringRuleRow,
  SavingsGoalRow,
  StockPriceRow,
  StockTradeRow,
  TagRow,
  TagSpendRow,
  TransactionRow,
  TransactionTagRow,
} from '../types/database.types'
import {
  BACKUP_VERSION,
  type AccountPatch,
  type AssetGroupSettingPatch,
  type BackupData,
  type CategoryPatch,
  type DebtPatch,
  type LifeEventPatch,
  type LifePhasePatch,
  type LifeScenarioPatch,
  type NewAccount,
  type NewCategory,
  type NewDebt,
  type NewDebtPayment,
  type NewLifeEvent,
  type NewLifePhase,
  type NewLifeScenario,
  type NewPushSubscription,
  type NewRecurringOccurrence,
  type NewRecurringRule,
  type NewSavingsGoal,
  type NewStockTrade,
  type NewTag,
  type NewTransaction,
  type NewValuation,
  type ProfilePatch,
  type RecurringRulePatch,
  type Repo,
  type SavingsGoalPatch,
  type StockTradePatch,
  type TagPatch,
  type TransactionPatch,
  type TxFilter,
} from './repo'

// Repo demo: dữ liệu lưu localStorage, seed giống hệt trigger handle_new_user
// trong migration + một ít giao dịch mẫu để sổ/tổng quan có số liệu.
// Tiền lưu ở minor units: JPY = yên, VND = đồng, USD = cent.

export const STORAGE_KEY = 'sct-demo-db-v16' // v16: thêm bảng giá + sổ lệnh cổ phiếu demo (stockPrices, stockTrades)
const DEMO_USER = 'demo-user'

/**
 * Soi hình dạng giao dịch y như CHECK của bảng transactions (migration 0001):
 *   transfer      → có to_account_id (khác account_id), KHÔNG có danh mục
 *   expense/income → có danh mục, KHÔNG có to_account_id/to_amount
 * Không có chốt này, demo nhận cả những dòng Postgres từ chối → bug chỉ nổ ở
 * bản thật, còn test và kiểm tra tay trên demo thì xanh.
 */
function assertTxShape(input: Pick<NewTransaction, 'type' | 'category_id' | 'account_id' | 'to_account_id' | 'to_amount'>) {
  if (input.type === 'transfer') {
    if (!input.to_account_id) throw new Error('Chuyển khoản phải có tài khoản đích')
    if (input.to_account_id === input.account_id)
      throw new Error('Không chuyển khoản về chính nó')
    if (input.category_id) throw new Error('Chuyển khoản không mang danh mục')
    return
  }
  if (!input.category_id) throw new Error('Giao dịch thu/chi phải có danh mục')
  if (input.to_account_id || input.to_amount)
    throw new Error('Giao dịch thu/chi không có tài khoản đích')
}

/**
 * Soi hình dạng lệnh y như CHECK `stock_trades_shape` của Postgres (migration 0035):
 *   kind='adjust' → quantity khác 0, price = 0 (cổ phiếu thưởng/gộp không có giá)
 *   kind='buy'/'sell' → quantity > 0, price > 0
 * Không có chốt này, demo nhận cả những dòng Postgres từ chối → bug chỉ nổ ở bản thật
 * (tiền lệ: assertTxShape ở trên, commit a321239).
 */
function assertStockTradeShape(input: Pick<NewStockTrade, 'kind' | 'quantity' | 'price'>) {
  if (input.kind === 'adjust') {
    if (input.quantity === 0) throw new Error('Điều chỉnh phải khác 0 cổ')
    if (input.price !== 0) throw new Error('Điều chỉnh không được có giá')
    return
  }
  if (!(input.quantity > 0)) throw new Error('Số cổ phải là số dương')
  if (!(input.price > 0)) throw new Error('Giá phải là số dương')
}

interface DemoDB {
  profile: ProfileRow
  accounts: AccountRow[]
  categories: CategoryRow[]
  transactions: TransactionRow[]
  budgets: BudgetRow[]
  assetGroupSettings: AssetGroupSettingRow[]
  debts: DebtRow[]
  debtPayments: DebtPaymentRow[]
  recurringRules: RecurringRuleRow[]
  accountValuations: AccountValuationRow[]
  stockTrades: StockTradeRow[]
  stockPrices: StockPriceRow[]
  savingsGoals: SavingsGoalRow[]
  networthSnapshots: NetWorthSnapshotRow[]
  tags: TagRow[]
  transactionTags: TransactionTagRow[]
  /** Trạng thái thông báo (mục AO); vắng mặt ở dữ liệu demo cũ. */
  notificationState?: NotificationStateRow[]
  /** Lịch sử tỷ giá; vắng mặt ở dữ liệu demo cũ. */
  fxHistory?: FxHistoryRow[]
  /** Thiết bị đã đăng ký nhận push (migration 0034); vắng mặt ở dữ liệu demo cũ. */
  pushSubscriptions?: PushSubscriptionRow[]
  lifeScenarios: LifeScenarioRow[]
  lifePhases: LifePhaseRow[]
  lifeEvents: LifeEventRow[]
}

// crypto.randomUUID() chỉ chạy trong secure context (HTTPS / localhost).
// Khi mở qua IP + HTTP trên điện thoại thì nó undefined, nên cần fallback.
const uuid = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const b = crypto.getRandomValues(new Uint8Array(16))
    b[6] = (b[6] & 0x0f) | 0x40
    b[8] = (b[8] & 0x3f) | 0x80
    const h = [...b].map((x) => x.toString(16).padStart(2, '0'))
    return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}
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
    credit_limit: null,
    statement_day: null,
    payment_due_day: null,
    payment_account_id: null,
    card_autopay_through: null,
    depreciation_months: null,
    depreciation_from: null,
    salvage_value: 0,
    tax_shelter: null,
    shelter_annual_limit: null,
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
    need_level: NeedLevel | null = null,
    cost_type: CostType | null = null,
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
    need_level,
    cost_type,
  })

  const accounts = [
    account('Tiền mặt', 'cash', 'JPY', 30_000, 0, 'Tiêu dùng'), // ¥30.000
    account('Ngân hàng', 'bank', 'JPY', 800_000, 1, 'Tiêu dùng'), // ¥800.000
    // Tài khoản riêng cho sổ lệnh cổ phiếu Việt Nam (migration 0035) — tách khỏi
    // 'Đầu tư VN' bên dưới vì tài khoản đó đã có giao dịch/định giá gắn sẵn; nếu dùng
    // chung, test "xoá tài khoản còn sổ lệnh" sẽ luôn báo lỗi vì giao dịch trước.
    account('Chứng khoán VN', 'investment', 'VND', 100_000_000, 2, 'Tài sản Việt Nam'), // 100.000.000 ₫ (vốn gốc)
    account('Đầu tư VN', 'investment', 'VND', 50_000_000, 3, 'Đầu tư'), // 50.000.000 ₫ (vốn gốc)
    account('Dự trữ USD', 'bank', 'USD', 200_000, 4, 'Dự phòng'), // $2.000,00
    // Thẻ tín dụng: số dư ban đầu âm = đang nợ ¥45.000. Không thuộc nhóm tài sản.
    {
      ...account('Thẻ Rakuten', 'card', 'JPY', -45_000, 5, null),
      credit_limit: 500_000,
      statement_day: 31, // chốt cuối tháng (kẹp về ngày cuối)
      payment_due_day: 27, // trả ngày 27 (dời T7/CN sang T2 khi hiển thị)
    },
  ]
  // Thẻ Rakuten (JPY) tự trả từ tài khoản Ngân hàng (JPY, cùng loại tiền)
  accounts[5].payment_account_id = accounts[1].id

  // Danh mục cha + con — bộ chuẩn hoá kiểu "Money Manager" (dịch tiếng Việt).
  const nhaO = category('Nhà ở', 'expense', '🏠')
  const anUong = category('Ăn uống', 'expense', '🍜')
  const giaoTe = category('Giao tế', 'expense', '👫')
  const diLai = category('Đi lại', 'expense', '🚆')
  const thoiTrang = category('Thời trang', 'expense', '🧥')
  const soThich = category('Sở thích', 'expense', '🌱')
  const sucKhoe = category('Sức khỏe', 'expense', '🧘')
  // "Tài chính" không có con -> tự nó là danh mục lá, nên có nhãn 2 trục. Chỉ chứa
  // PHÍ tài chính; mua đầu tư là chuyển khoản sang tài khoản đầu tư, không phải chi.
  const taiChinh = category('Tài chính', 'expense', '🏦', null, 'essential', 'variable')
  const giaoDuc = category('Giáo dục', 'expense', '📔')
  const duLich = category('Du lịch', 'expense', '🧳')
  const giayTo = category('Giấy tờ & Pháp lý', 'expense', '📄')
  const quaTang = category('Quà tặng', 'expense', '🎁')
  const khacChi = category('Khác', 'expense', '📦')
  const categories = [
    nhaO,
    category('Tiền nhà', 'expense', '🔑', nhaO.id, 'essential', 'fixed'),
    category('Nội thất', 'expense', '🛋️', nhaO.id),
    category('Đồ bếp', 'expense', '🍳', nhaO.id),
    category('Đồ vệ sinh cá nhân', 'expense', '🧴', nhaO.id),
    category('Điện', 'expense', '💡', nhaO.id, 'essential', 'variable'),
    category('Nước', 'expense', '🚰', nhaO.id),
    category('Gas', 'expense', '🔥', nhaO.id),
    category('Điện thoại', 'expense', '📱', nhaO.id, 'essential', 'fixed'),
    anUong,
    category('Bữa sáng', 'expense', '🥐', anUong.id),
    category('Bữa trưa', 'expense', '🍱', anUong.id, 'essential', 'variable'),
    category('Bữa tối', 'expense', '🍚', anUong.id),
    category('Ăn ngoài', 'expense', '🍽️', anUong.id, 'flexible', 'variable'),
    category('Đồ uống', 'expense', '🥤', anUong.id),
    category('Đi chợ', 'expense', '🛒', anUong.id, 'essential', 'variable'),
    giaoTe,
    category('Bạn bè', 'expense', '🧑‍🤝‍🧑', giaoTe.id),
    category('Tình cảm', 'expense', '💑', giaoTe.id),
    diLai,
    category('Xe buýt', 'expense', '🚌', diLai.id),
    category('Tàu điện', 'expense', '🚉', diLai.id, 'essential', 'variable'),
    category('Taxi', 'expense', '🚕', diLai.id),
    category('Ô tô', 'expense', '🚗', diLai.id),
    category('Bãi đỗ xe', 'expense', '🅿️', diLai.id, 'essential', 'fixed'),
    category('Luup', 'expense', '🛴', diLai.id),
    thoiTrang,
    category('Quần áo', 'expense', '👕', thoiTrang.id, 'flexible', 'variable'),
    category('Giày dép', 'expense', '👟', thoiTrang.id),
    category('Phụ kiện', 'expense', '👜', thoiTrang.id),
    category('Mỹ phẩm', 'expense', '💄', thoiTrang.id),
    category('Giặt là', 'expense', '🧺', thoiTrang.id),
    soThich,
    category('Cây cối', 'expense', '🪴', soThich.id),
    category('Nhiếp ảnh', 'expense', '📷', soThich.id),
    category('Đăng ký', 'expense', '📺', soThich.id, 'flexible', 'fixed'),
    category('Thể thao', 'expense', '⚽', soThich.id),
    sucKhoe,
    category('Gym', 'expense', '🏋️', sucKhoe.id),
    category('Bệnh viện', 'expense', '🏥', sucKhoe.id),
    category('Thuốc', 'expense', '💊', sucKhoe.id, 'essential', 'variable'),
    category('Thuốc lá', 'expense', '🚬', sucKhoe.id),
    taiChinh,
    giaoDuc,
    category('Thi cử', 'expense', '📝', giaoDuc.id),
    category('Học phí', 'expense', '🏫', giaoDuc.id),
    category('Sách vở', 'expense', '📚', giaoDuc.id),
    duLich,
    category('Vé máy bay', 'expense', '✈️', duLich.id, 'flexible', 'variable'),
    category('Khách sạn', 'expense', '🏨', duLich.id),
    category('Tham quan & ăn chơi', 'expense', '🎡', duLich.id),
    category('Quà mang về', 'expense', '🍡', duLich.id),
    giayTo,
    category('Visa & lưu trú', 'expense', '🛂', giayTo.id, 'essential', 'variable'),
    category('Hộ chiếu & lãnh sự', 'expense', '🛃', giayTo.id),
    category('Dịch thuật & công chứng', 'expense', '✍️', giayTo.id),
    quaTang,
    category('Quà', 'expense', '🎀', quaTang.id),
    category('Hỗ trợ gia đình', 'expense', '👪', quaTang.id),
    khacChi,
    // Thu
    category('Lương', 'income', '💰'),
    category('Thưởng', 'income', '🎉'),
    category('Được tặng', 'income', '🧧'),
    category('Đầu tư', 'income', '📈'),
    category('Bán đồ cũ', 'income', '♻️'),
    category('Khác', 'income', '💵'),
  ]

  const cat = (name: string, type: CategoryType) =>
    categories.find((c) => c.name === name && c.type === type)!
  const [cash, bank, stockAcc, invest] = accounts

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
    recurring_rule_id: null,
    created_at: nowISO(),
    updated_at: nowISO(),
    ...partial,
  })

  const transactions = [
    // Chi tiêu hàng ngày bằng JPY
    tx({ type: 'expense', amount: 850, occurred_on: daysAgo(0), note: 'Cơm trưa', category_id: cat('Bữa trưa', 'expense').id }),
    tx({ type: 'expense', amount: 210, occurred_on: daysAgo(0), note: 'Tàu điện', category_id: cat('Tàu điện', 'expense').id }),
    tx({ type: 'expense', amount: 3_280, occurred_on: daysAgo(1), note: 'Ăn tối cùng bạn', category_id: cat('Ăn ngoài', 'expense').id }),
    tx({ type: 'expense', amount: 4_990, occurred_on: daysAgo(1), note: 'Áo khoác Uniqlo', category_id: cat('Quần áo', 'expense').id, account_id: bank.id }),
    tx({ type: 'expense', amount: 12_400, occurred_on: daysAgo(3), note: 'Tiền điện + gas', category_id: cat('Điện', 'expense').id, account_id: bank.id }),
    tx({ type: 'expense', amount: 1_200, occurred_on: daysAgo(5), note: 'Thuốc cảm', category_id: cat('Thuốc', 'expense').id }),
    tx({ type: 'expense', amount: 68_000, occurred_on: daysAgo(0), note: 'Tiền thuê nhà tháng này', category_id: cat('Tiền nhà', 'expense').id, account_id: bank.id }),
    tx({ type: 'income', amount: 280_000, occurred_on: daysAgo(0), note: 'Lương tháng', category_id: cat('Lương', 'income').id, account_id: bank.id }),
    // Rút tiền mặt JPY (cùng loại tiền → to_amount null)
    tx({ type: 'transfer', amount: 30_000, occurred_on: daysAgo(4), note: 'Rút tiền mặt', account_id: bank.id, to_account_id: cash.id }),
    // Chuyển khoản XUYÊN TỆ: ¥50.000 → Đầu tư VN nhận 8.250.000 ₫
    tx({ type: 'transfer', amount: 50_000, to_amount: 8_250_000, occurred_on: daysAgo(7), note: 'Nạp tài khoản đầu tư', account_id: bank.id, to_account_id: invest.id }),
    // Thu nhập đầu tư bằng VND
    tx({ type: 'income', amount: 1_500_000, occurred_on: daysAgo(6), note: 'Cổ tức', category_id: cat('Đầu tư', 'income').id, account_id: invest.id }),
    // Tháng trước
    tx({ type: 'expense', amount: 1_800, occurred_on: daysAgo(32), note: 'Xem phim', category_id: cat('Đăng ký', 'expense').id }),
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
    budget('Ăn uống', 40_000), // trần nhóm ở cha — gộp chi của mọi con
    budget('Bữa trưa', 15_000), // mốc theo dõi ở con (không cộng vào tổng)
    budget('Đi lại', 8_000), // trần nhóm ở cha
    budget('Quần áo', 20_000), // con của nhóm chưa có trần → tính độc lập (tương thích)
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
    groupSetting('Tài sản Việt Nam', 1),
    groupSetting('Đầu tư', 2),
    groupSetting('Dự phòng', 3),
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
    interest_bps: null,
    term_months: null,
    disbursement_transaction_id: null,
    created_at: nowISO(),
    updated_at: nowISO(),
  }
  const debtOwed: DebtRow = {
    id: uuid(),
    user_id: DEMO_USER,
    counterparty: 'Trả góp máy tính',
    direction: 'i_owe',
    currency: 'USD',
    principal: 50_000, // $500,00
    due_on: daysAgo(-20), // hạn 20 ngày tới
    status: 'open',
    note: '',
    interest_bps: 1200, // 12%/năm — ví dụ trả góp có lãi (mục AG)
    term_months: 6,
    disbursement_transaction_id: null,
    created_at: nowISO(),
    updated_at: nowISO(),
  }
  // Snapshot giá trị thị trường cho TK đầu tư (vốn gốc ròng ~59.750.000 ₫ → giá thị
  // trường 65.000.000 ₫, lãi chưa thực hiện ~5.250.000 ₫).
  const accountValuations: AccountValuationRow[] = [
    {
      id: uuid(),
      user_id: DEMO_USER,
      account_id: invest.id,
      valued_on: daysAgo(1),
      market_value: 65_000_000,
      note: 'Cập nhật cuối tháng',
      source: 'manual',
      created_at: nowISO(),
    },
  ]

  // Bảng giá cứng cho chế độ demo — xem thử khu Danh mục không cần mạng.
  const stockPrices: StockPriceRow[] = [
    { symbol: 'FPT', exchange: 'hose', name: 'Công ty Cổ phần FPT', price: 70_300, prior_close: 71_500, trading_date: '2026-08-05', updated_at: nowISO() },
    { symbol: 'VNM', exchange: 'hose', name: 'Công ty Cổ phần Sữa Việt Nam', price: 58_600, prior_close: 59_500, trading_date: '2026-08-05', updated_at: nowISO() },
    { symbol: 'HPG', exchange: 'hose', name: 'Công ty Cổ phần Tập đoàn Hòa Phát', price: 22_000, prior_close: 22_150, trading_date: '2026-08-05', updated_at: nowISO() },
  ]

  // Sổ lệnh mẫu — tài khoản 'Chứng khoán VN' riêng (investment/VND) đã seed ở trên.
  const idChungKhoanVN = stockAcc.id
  const stockTrades: StockTradeRow[] = [
    { id: uuid(), user_id: DEMO_USER, account_id: idChungKhoanVN, symbol: 'FPT', kind: 'buy', traded_on: '2026-03-10', quantity: 500, price: 62_000, fee: 46_500, tax: 0, note: '', created_at: nowISO(), updated_at: nowISO() },
    { id: uuid(), user_id: DEMO_USER, account_id: idChungKhoanVN, symbol: 'HPG', kind: 'buy', traded_on: '2026-04-02', quantity: 1_000, price: 21_000, fee: 31_500, tax: 0, note: '', created_at: nowISO(), updated_at: nowISO() },
    { id: uuid(), user_id: DEMO_USER, account_id: idChungKhoanVN, symbol: 'FPT', kind: 'adjust', traded_on: '2026-06-20', quantity: 50, price: 0, fee: 0, tax: 0, note: 'Cổ phiếu thưởng 10%', created_at: nowISO(), updated_at: nowISO() },
  ]

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
      hourly_wage: null,
      annual_inflation_bps: null,
      capital_gains_tax_bps: 2032,
      target_essential_bps: 5000,
      target_flexible_bps: 3000,
      target_savings_bps: 2000,
      notif_off: [],
      birth_year: null,
      push_hour: 8,
      push_tz: 'Asia/Tokyo',
      push_last_sent_at: null,
      created_at: nowISO(),
    },
    accounts,
    categories,
    transactions,
    budgets,
    assetGroupSettings,
    debts,
    debtPayments,
    recurringRules: [],
    accountValuations,
    stockTrades,
    stockPrices,
    savingsGoals: [],
    networthSnapshots: [],
    tags: [],
    transactionTags: [],
    lifeScenarios: [],
    lifePhases: [],
    lifeEvents: [],
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
    const valuations = db.accountValuations ?? []
    const stockTrades = db.stockTrades ?? []

    // Bảng giá gom về một phiên chung, cùng cách stock-refresh làm — dùng chung cho
    // mọi tài khoản vì cùng một lượt "hút giá" chỉ có một phiên.
    const { session, priceBySymbol, staleSymbols } = sessionPrices(db.stockPrices ?? [])

    /**
     * Snapshot 'auto' mà cron stock-refresh sẽ ghi cho tài khoản này NẾU nó chạy ngay
     * bây giờ — chế độ demo không có cron nên phải tự dựng, bằng ĐÚNG các hàm thuần
     * của holdings.ts (không chép lại phép tính), theo từng bước của
     * supabase/functions/stock-refresh/index.ts. `null` ở bất cứ bước nào nghĩa là
     * cron thật cũng sẽ bỏ qua tài khoản này — demo phải im lặng giống vậy, không bịa
     * số. Điều kiện đủ chạy khớp loadInput.ts: investment, VND, chưa lưu trữ, có sổ lệnh.
     */
    function tuTinhAutoValuation(
      a: AccountRow,
      balance: number,
    ): { valued_on: string; market_value: number; source: 'auto' } | null {
      if (a.type !== 'investment' || a.currency !== 'VND' || a.is_archived) return null
      const trades: Trade[] = stockTrades
        .filter((t) => t.account_id === a.id)
        .map((t) => ({
          symbol: t.symbol,
          kind: t.kind,
          tradedOn: t.traded_on,
          quantity: t.quantity,
          price: t.price,
          fee: t.fee,
          tax: t.tax,
        }))
      if (trades.length === 0) return null
      if (session === null) return null

      const { holdings, oversold } = holdingsFromTrades(trades)
      // Sổ lệnh có lỗ hổng: không ghi số biết là sai (giống cron bỏ qua).
      if (oversold.length > 0) return null
      // Mã đang giữ mà giá còn ở phiên cũ hơn: giá vẫn > 0 nên portfolioValue không tự
      // phát hiện được, phải chặn ở đây (giống cron).
      if (holdings.some((h) => staleSymbols.has(h.symbol))) return null

      const cash = brokerCash(balance, trades)
      const { marketValue } = portfolioValue(holdings, priceBySymbol, cash)
      if (marketValue === null) return null

      return { valued_on: session, market_value: marketValue, source: 'auto' }
    }

    // Snapshot mới nhất mỗi tài khoản: gộp hàng thật (accountValuations) với snapshot
    // 'auto' vừa tự tính, rồi áp đúng luật của view account_balances — valued_on mới
    // nhất thắng, và ở CÙNG NGÀY thì 'manual' luôn thắng 'auto' (quyết định 4: cron
    // không bao giờ đè hàng người dùng gõ tay). Không có synthetic thì y hệt trước đây.
    const latestValuation = (
      accountId: string,
      synthetic: { valued_on: string; market_value: number; source: 'auto' } | null,
    ): number | null => {
      const rows: { valued_on: string; market_value: number; source: string; created_at: string }[] =
        valuations
          .filter((v) => v.account_id === accountId)
          .map((v) => ({ valued_on: v.valued_on, market_value: v.market_value, source: v.source, created_at: v.created_at }))
      if (synthetic) rows.push({ ...synthetic, created_at: '' })
      if (rows.length === 0) return null
      rows.sort((x, y) => {
        const byDate = y.valued_on.localeCompare(x.valued_on)
        if (byDate !== 0) return byDate
        if (x.source !== y.source) return x.source === 'manual' ? -1 : 1
        return y.created_at.localeCompare(x.created_at)
      })
      return rows[0].market_value
    }

    return db.accounts
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((a) => {
        // Cùng logic với view account_balances trong migration
        const delta = db.transactions.reduce((sum, t) => {
          if (t.type === 'income' && t.account_id === a.id) return sum + t.amount
          // Hoàn tiền: tiền quay lại ví → cộng (khớp view account_balances)
          if (t.type === 'expense' && t.account_id === a.id && t.is_refund) return sum + t.amount
          if (t.type === 'expense' && t.account_id === a.id) return sum - t.amount
          if (t.type === 'transfer' && t.account_id === a.id) return sum - t.amount
          if (t.type === 'transfer' && t.to_account_id === a.id)
            return sum + (t.to_amount ?? t.amount)
          return sum
        }, 0)
        const balance = a.initial_balance + delta
        const synthetic = tuTinhAutoValuation(a, balance)
        return {
          id: a.id,
          user_id: a.user_id,
          name: a.name,
          type: a.type,
          currency: a.currency,
          asset_group: a.asset_group ?? null,
          is_hidden: a.is_hidden ?? false,
          include_in_totals: a.include_in_totals ?? true,
          credit_limit: a.credit_limit ?? null,
          statement_day: a.statement_day ?? null,
          payment_due_day: a.payment_due_day ?? null,
          payment_account_id: a.payment_account_id ?? null,
          is_archived: a.is_archived,
          sort_order: a.sort_order,
          cost_basis: a.initial_balance,
          depreciation_months: a.depreciation_months ?? null,
          depreciation_from: a.depreciation_from ?? null,
          salvage_value: a.salvage_value ?? 0,
          tax_shelter: a.tax_shelter ?? null,
          shelter_annual_limit: a.shelter_annual_limit ?? null,
          market_value: latestValuation(a.id, synthetic),
          balance,
        }
      })
  },

  async getCategories() {
    return load().categories.sort((a, b) => a.sort_order - b.sort_order)
  },

  async listTransactions({ start, end }) {
    // `id` làm chốt cuối để khớp thứ tự với supabaseRepo (order occurred_on, created_at, id):
    // dữ liệu nhập theo lô (Zaim) có created_at trùng nhau, thiếu chốt là hai chế độ
    // hiển thị khác thứ tự.
    return load()
      .transactions.filter((t) => t.occurred_on >= start && t.occurred_on < end)
      .sort(
        (a, b) =>
          b.occurred_on.localeCompare(a.occurred_on) ||
          b.created_at.localeCompare(a.created_at) ||
          a.id.localeCompare(b.id),
      )
  },

  async searchTransactions(filter: TxFilter) {
    return filterTransactions(load().transactions, filter)
  },

  async getTransaction(id: string) {
    return load().transactions.find((t) => t.id === id) ?? null
  },

  async createTransaction(input: NewTransaction) {
    assertTxShape(input)
    // CHECK amount > 0 của 0001: demo không chặn là bug chỉ nổ ở bản thật.
    if (!(typeof input.amount === 'number' && Number.isFinite(input.amount) && input.amount > 0))
      throw new Error('Số tiền phải là số dương')
    const db = load()
    // tag_ids không phải cột của transactions — tách ra thành liên kết riêng
    const { tag_ids, ...fields } = input
    const row: TransactionRow = {
      ...fields,
      id: uuid(),
      user_id: DEMO_USER,
      recurring_rule_id: null,
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    db.transactions.push(row)
    db.transactionTags ??= []
    for (const tagId of tag_ids ?? []) {
      db.transactionTags.push({ transaction_id: row.id, tag_id: tagId, user_id: DEMO_USER })
    }
    save(db)
    return row
  },

  async updateTransaction(id: string, patch: TransactionPatch) {
    const db = load()
    const idx = db.transactions.findIndex((t) => t.id === id)
    if (idx < 0) throw new Error('Không tìm thấy giao dịch')
    const { tag_ids, ...fields } = patch
    const next = { ...db.transactions[idx], ...fields, updated_at: nowISO() }
    // Soi hình dạng SAU khi trộn patch, y như CHECK của Postgres soi dòng kết quả.
    // Đường sửa giao dịch có thể đổi cả type lẫn vai trò (roleSave/EditTransactionSheet)
    // — chỉ soi lúc tạo là demo nhận những patch mà bản thật từ chối bằng 23514.
    assertTxShape(next)
    if (!(typeof next.amount === 'number' && Number.isFinite(next.amount) && next.amount > 0))
      throw new Error('Số tiền phải là số dương')
    db.transactions[idx] = next
    if (tag_ids) {
      db.transactionTags = (db.transactionTags ?? []).filter((l) => l.transaction_id !== id)
      for (const tagId of tag_ids) {
        db.transactionTags.push({ transaction_id: id, tag_id: tagId, user_id: DEMO_USER })
      }
    }
    save(db)
    return db.transactions[idx]
  },

  async deleteTransaction(id: string) {
    const db = load()
    db.transactions = db.transactions.filter((t) => t.id !== id)
    db.transactionTags = (db.transactionTags ?? []).filter((l) => l.transaction_id !== id)
    // Khớp FK on delete set null của Supabase: lần trả nợ liên kết trở thành "ghi nhận suông"
    db.debtPayments = (db.debtPayments ?? []).map((p) =>
      p.transaction_id === id ? { ...p, transaction_id: null } : p,
    )
    save(db)
  },

  async deleteTransactions(ids: string[]) {
    if (ids.length === 0) return
    const db = load()
    const drop = new Set(ids)
    db.transactions = db.transactions.filter((t) => !drop.has(t.id))
    db.transactionTags = (db.transactionTags ?? []).filter((l) => !drop.has(l.transaction_id))
    db.debtPayments = (db.debtPayments ?? []).map((p) =>
      p.transaction_id && drop.has(p.transaction_id) ? { ...p, transaction_id: null } : p,
    )
    save(db)
  },

  async createAccount(input: NewAccount) {
    const db = load()
    const sort_order = db.accounts.reduce((m, a) => Math.max(m, a.sort_order + 1), 0)
    const row: AccountRow = {
      ...input,
      credit_limit: input.credit_limit ?? null,
      statement_day: input.statement_day ?? null,
      payment_due_day: input.payment_due_day ?? null,
      payment_account_id: input.payment_account_id ?? null,
      card_autopay_through: input.card_autopay_through ?? null,
      depreciation_months: input.depreciation_months ?? null,
      depreciation_from: input.depreciation_from ?? null,
      salvage_value: input.salvage_value ?? 0,
      tax_shelter: input.tax_shelter ?? null,
      shelter_annual_limit: input.shelter_annual_limit ?? null,
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

  async deleteAccount(id: string) {
    const db = load()
    if (db.transactions.some((t) => t.account_id === id || t.to_account_id === id))
      throw new Error('Không xóa được: còn giao dịch dùng tài khoản này. Hãy Lưu trữ thay vì Xóa.')
    if ((db.recurringRules ?? []).some((r) => r.account_id === id || r.to_account_id === id))
      throw new Error('Không xóa được: còn giao dịch định kỳ dùng tài khoản này. Hãy Lưu trữ thay vì Xóa.')
    if ((db.savingsGoals ?? []).some((g) => g.account_id === id))
      throw new Error('Không xóa được: còn mục tiêu tiết kiệm gắn với tài khoản này.')
    if (db.accounts.some((a) => a.payment_account_id === id))
      throw new Error('Không xóa được: tài khoản này đang là nguồn trả cho một thẻ tín dụng.')
    if ((db.accountValuations ?? []).some((v) => v.account_id === id))
      throw new Error('Không xóa được: còn dữ liệu giá trị đầu tư của tài khoản này.')
    if ((db.stockTrades ?? []).some((t) => t.account_id === id))
      throw new Error('Không xóa được: còn sổ lệnh cổ phiếu của tài khoản này.')
    db.accounts = db.accounts.filter((a) => a.id !== id)
    save(db)
  },

  async getAccountValuations() {
    return (load().accountValuations ?? [])
      .slice()
      .sort((a, b) => b.valued_on.localeCompare(a.valued_on))
  },

  async upsertValuation(input: NewValuation) {
    const db = load()
    db.accountValuations ??= []
    // Đè theo (account_id, valued_on) — khớp unique của Postgres
    const existing = db.accountValuations.find(
      (v) => v.account_id === input.account_id && v.valued_on === input.valued_on,
    )
    if (existing) {
      existing.market_value = input.market_value
      existing.note = input.note
      // Người gõ tay luôn thắng (quyết định 4): dù hàng này đang là 'auto' do cron ghi,
      // một lần sửa tay phải claim lại nó — không thì lần cron chạy kế tiếp vẫn thấy
      // 'auto' và đè mất số vừa sửa.
      existing.source = 'manual'
      save(db)
      return existing
    }
    const row: AccountValuationRow = {
      id: uuid(),
      user_id: DEMO_USER,
      account_id: input.account_id,
      valued_on: input.valued_on,
      market_value: input.market_value,
      note: input.note,
      source: 'manual',
      created_at: nowISO(),
    }
    db.accountValuations.push(row)
    save(db)
    return row
  },

  async deleteValuation(id: string) {
    const db = load()
    db.accountValuations = (db.accountValuations ?? []).filter((v) => v.id !== id)
    save(db)
  },

  async getStockPrices() {
    return (load().stockPrices ?? []).slice().sort((a, b) => a.symbol.localeCompare(b.symbol))
  },

  async getStockTrades() {
    return (load().stockTrades ?? [])
      .slice()
      .sort((a, b) => b.traded_on.localeCompare(a.traded_on) || b.created_at.localeCompare(a.created_at))
  },

  async createStockTrade(input: NewStockTrade) {
    assertStockTradeShape(input)
    const db = load()
    db.stockTrades ??= []
    const row: StockTradeRow = {
      id: uuid(),
      user_id: DEMO_USER,
      account_id: input.account_id,
      symbol: input.symbol.trim().toUpperCase(),
      kind: input.kind,
      traded_on: input.traded_on,
      quantity: input.quantity,
      price: input.price,
      fee: input.fee,
      tax: input.tax,
      note: input.note,
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    db.stockTrades.push(row)
    save(db)
    return row
  },

  async updateStockTrade(id: string, patch: StockTradePatch) {
    const db = load()
    db.stockTrades ??= []
    const idx = db.stockTrades.findIndex((t) => t.id === id)
    if (idx < 0) throw new Error('Không tìm thấy lệnh này.')
    const current = db.stockTrades[idx]
    const next: StockTradeRow = {
      ...current,
      symbol: patch.symbol !== undefined ? patch.symbol.trim().toUpperCase() : current.symbol,
      kind: patch.kind ?? current.kind,
      traded_on: patch.traded_on ?? current.traded_on,
      quantity: patch.quantity ?? current.quantity,
      price: patch.price ?? current.price,
      fee: patch.fee ?? current.fee,
      tax: patch.tax ?? current.tax,
      note: patch.note ?? current.note,
      updated_at: nowISO(),
    }
    // Soi hình dạng SAU khi trộn patch, y như CHECK của Postgres soi dòng kết quả —
    // sửa lệnh có thể đổi cả kind lẫn quantity/price, chỉ soi lúc tạo là không đủ.
    assertStockTradeShape(next)
    db.stockTrades[idx] = next
    save(db)
    return next
  },

  async deleteStockTrade(id: string) {
    const db = load()
    db.stockTrades = (db.stockTrades ?? []).filter((t) => t.id !== id)
    save(db)
  },

  async getSavingsGoals() {
    return (load().savingsGoals ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)
  },

  async createSavingsGoal(input: NewSavingsGoal) {
    const db = load()
    db.savingsGoals ??= []
    const sort_order = db.savingsGoals.reduce((m, g) => Math.max(m, g.sort_order + 1), 0)
    const row: SavingsGoalRow = {
      id: uuid(),
      user_id: DEMO_USER,
      name: input.name,
      account_id: input.account_id,
      target_amount: input.target_amount,
      target_date: input.target_date,
      note: input.note,
      sort_order,
      created_at: nowISO(),
    }
    db.savingsGoals.push(row)
    save(db)
    return row
  },

  async updateSavingsGoal(id: string, patch: SavingsGoalPatch) {
    const db = load()
    db.savingsGoals ??= []
    const idx = db.savingsGoals.findIndex((g) => g.id === id)
    if (idx < 0) throw new Error('Không tìm thấy mục tiêu')
    db.savingsGoals[idx] = { ...db.savingsGoals[idx], ...patch }
    save(db)
    return db.savingsGoals[idx]
  },

  async deleteSavingsGoal(id: string) {
    const db = load()
    db.savingsGoals = (db.savingsGoals ?? []).filter((g) => g.id !== id)
    save(db)
  },

  async getLifeScenarios() {
    return (load().lifeScenarios ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)
  },

  async createLifeScenario(input: NewLifeScenario) {
    const db = load()
    db.lifeScenarios ??= []
    const sort_order = db.lifeScenarios.reduce((m, s) => Math.max(m, s.sort_order + 1), 0)
    const row: LifeScenarioRow = {
      id: uuid(),
      user_id: DEMO_USER,
      name: input.name,
      display_currency: input.display_currency,
      end_age: input.end_age,
      real_return_bps: input.real_return_bps,
      band_spread_bps: input.band_spread_bps,
      starting_assets_minor: input.starting_assets_minor,
      nominal_terms: input.nominal_terms,
      is_primary: input.is_primary,
      sort_order,
      created_at: nowISO(),
    }
    db.lifeScenarios.push(row)
    save(db)
    return row
  },

  async updateLifeScenario(id: string, patch: LifeScenarioPatch) {
    const db = load()
    db.lifeScenarios ??= []
    const idx = db.lifeScenarios.findIndex((s) => s.id === id)
    if (idx < 0) throw new Error('Không tìm thấy kịch bản')
    db.lifeScenarios[idx] = { ...db.lifeScenarios[idx], ...patch }
    save(db)
    return db.lifeScenarios[idx]
  },

  // Demo không có `on delete cascade` của Postgres nên phải tự xóa
  // chặng + sự kiện thuộc kịch bản, tránh để lại dữ liệu mồ côi.
  async deleteLifeScenario(id: string) {
    const db = load()
    db.lifeScenarios = (db.lifeScenarios ?? []).filter((s) => s.id !== id)
    db.lifePhases = (db.lifePhases ?? []).filter((p) => p.scenario_id !== id)
    db.lifeEvents = (db.lifeEvents ?? []).filter((e) => e.scenario_id !== id)
    save(db)
  },

  async getLifePhases() {
    return (load().lifePhases ?? []).slice().sort((a, b) => a.start_year - b.start_year)
  },

  async createLifePhase(input: NewLifePhase) {
    const db = load()
    db.lifePhases ??= []
    // UNIQUE (scenario_id, start_year) của 0031: hai chặng cùng năm bắt đầu trong một
    // kịch bản thì Postgres nổ 23505 — demo phải chặn y hệt, không thì bug chỉ nổ bản thật.
    if (db.lifePhases.some((p) => p.scenario_id === input.scenario_id && p.start_year === input.start_year))
      throw new Error(`Kịch bản đã có chặng bắt đầu năm ${input.start_year}`)
    const row: LifePhaseRow = {
      id: uuid(),
      user_id: DEMO_USER,
      scenario_id: input.scenario_id,
      start_year: input.start_year,
      label: input.label,
      country: input.country,
      currency: input.currency,
      annual_income_minor: input.annual_income_minor,
      annual_expense_minor: input.annual_expense_minor,
      fx_to_display: input.fx_to_display,
      created_at: nowISO(),
    }
    db.lifePhases.push(row)
    save(db)
    return row
  },

  async updateLifePhase(id: string, patch: LifePhasePatch) {
    const db = load()
    db.lifePhases ??= []
    const idx = db.lifePhases.findIndex((p) => p.id === id)
    if (idx < 0) throw new Error('Không tìm thấy chặng')
    const next = { ...db.lifePhases[idx], ...patch }
    // Soi UNIQUE sau khi trộn patch, giống createLifePhase (dời chặng đè lên năm của chặng khác).
    if (db.lifePhases.some((p) => p.id !== id && p.scenario_id === next.scenario_id && p.start_year === next.start_year))
      throw new Error(`Kịch bản đã có chặng bắt đầu năm ${next.start_year}`)
    db.lifePhases[idx] = next
    save(db)
    return db.lifePhases[idx]
  },

  async deleteLifePhase(id: string) {
    const db = load()
    db.lifePhases = (db.lifePhases ?? []).filter((p) => p.id !== id)
    save(db)
  },

  async getLifeEvents() {
    return (load().lifeEvents ?? [])
      // Bản ghi ghi trước migration 0032 chưa có fx_to_display. Mặc định 1 — sự kiện
      // cùng tiền với đơn vị hiển thị thì tỷ giá không được dùng tới.
      //
      // ĐỪNG XOÁ `?? 1` vì thấy TypeScript bảo là dư: theo KIỂU thì nhánh này chết
      // (`LifeEventRow.fx_to_display` không nullable), nhưng theo RUNTIME thì nó sống —
      // localStorage giữ JSON ghi từ bản cũ, và ở đó trường này thiếu hẳn. Bỏ đi là
      // `undefined` chảy thẳng vào engine rồi thành NaN.
      .map((e) => ({ ...e, fx_to_display: e.fx_to_display ?? 1 }))
      .sort((a, b) => a.start_year - b.start_year)
  },

  async createLifeEvent(input: NewLifeEvent) {
    const db = load()
    db.lifeEvents ??= []
    const row: LifeEventRow = {
      id: uuid(),
      user_id: DEMO_USER,
      scenario_id: input.scenario_id,
      start_year: input.start_year,
      end_year: input.end_year,
      kind: input.kind,
      amount_minor: input.amount_minor,
      currency: input.currency,
      label: input.label,
      note: input.note,
      fx_to_display: input.fx_to_display,
      inflate: input.inflate,
      created_at: nowISO(),
    }
    db.lifeEvents.push(row)
    save(db)
    return row
  },

  async updateLifeEvent(id: string, patch: LifeEventPatch) {
    const db = load()
    db.lifeEvents ??= []
    const idx = db.lifeEvents.findIndex((e) => e.id === id)
    if (idx < 0) throw new Error('Không tìm thấy sự kiện')
    db.lifeEvents[idx] = { ...db.lifeEvents[idx], ...patch }
    save(db)
    return db.lifeEvents[idx]
  },

  async deleteLifeEvent(id: string) {
    const db = load()
    db.lifeEvents = (db.lifeEvents ?? []).filter((e) => e.id !== id)
    save(db)
  },

  async getNetWorthSnapshots() {
    return (load().networthSnapshots ?? []).slice().sort((a, b) => a.snapshot_on.localeCompare(b.snapshot_on))
  },

  async upsertNetWorthSnapshot(snapshotOn: string, netWorth: number) {
    const db = load()
    db.networthSnapshots ??= []
    const existing = db.networthSnapshots.find((s) => s.snapshot_on === snapshotOn)
    if (existing) {
      existing.net_worth = netWorth
      save(db)
      return existing
    }
    const row: NetWorthSnapshotRow = {
      id: uuid(),
      user_id: DEMO_USER,
      snapshot_on: snapshotOn,
      net_worth: netWorth,
      created_at: nowISO(),
    }
    db.networthSnapshots.push(row)
    save(db)
    return row
  },

  async getNotificationState() {
    return (load().notificationState ?? []).slice()
  },

  async markNotificationsRead(keys: string[]) {
    if (keys.length === 0) return
    const db = load()
    db.notificationState ??= []
    const now = nowISO()
    for (const key of keys) {
      if (db.notificationState.some((r) => r.key === key)) continue
      db.notificationState.push({
        user_id: DEMO_USER,
        key,
        read_at: now,
        dismissed_at: null,
        pushed_at: null,
        created_at: now,
      })
    }
    save(db)
  },

  async dismissNotification(key: string) {
    const db = load()
    db.notificationState ??= []
    const now = nowISO()
    const existing = db.notificationState.find((r) => r.key === key)
    if (existing) {
      // Bấm tắt tức là vừa nhìn thấy → luôn đặt lại read_at = bây giờ (khớp supabaseRepo).
      existing.read_at = now
      existing.dismissed_at = now
    } else {
      db.notificationState.push({
        user_id: DEMO_USER,
        key,
        read_at: now,
        dismissed_at: now,
        pushed_at: null,
        created_at: now,
      })
    }
    save(db)
  },

  async deleteNotificationStates(keys: string[]) {
    if (keys.length === 0) return
    const db = load()
    db.notificationState = (db.notificationState ?? []).filter((r) => !keys.includes(r.key))
    save(db)
  },

  async pruneNotificationState(beforeISO: string) {
    const db = load()
    // Dòng ĐÃ TẮT thì không dọn dù cũ tới đâu: mục C.2 hứa "tắt là mất hẳn" và mục E
    // nói rõ "đã tắt gợi ý tạo quy tắc Netflix thì phải tắt vĩnh viễn". Dọn cả dòng đã
    // tắt là 13 tháng sau gợi ý đó sống lại. Dọn rác chỉ nhằm vào dòng đã-đọc-chưa-tắt.
    db.notificationState = (db.notificationState ?? []).filter(
      (r) => r.created_at >= beforeISO || r.dismissed_at != null,
    )
    save(db)
  },

  async getPushSubscriptions() {
    return (load().pushSubscriptions ?? []).slice()
  },

  async savePushSubscription(input: NewPushSubscription) {
    const db = load()
    db.pushSubscriptions ??= []
    const existing = db.pushSubscriptions.find((r) => r.endpoint === input.endpoint)
    if (existing) {
      // Đăng ký lại cùng endpoint = cập nhật khoá, KHÔNG thêm dòng thứ hai. Bản
      // Supabase làm việc này bằng upsert onConflict; ở đây phải tự làm vì demoRepo
      // không thực thi khoá chính.
      existing.p256dh = input.p256dh
      existing.auth = input.auth
      existing.user_agent = input.userAgent
    } else {
      db.pushSubscriptions.push({
        user_id: DEMO_USER,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        user_agent: input.userAgent,
        created_at: new Date().toISOString(),
        last_ok_at: null,
      })
    }
    save(db)
  },

  async deletePushSubscription(endpoint: string) {
    const db = load()
    db.pushSubscriptions = (db.pushSubscriptions ?? []).filter((r) => r.endpoint !== endpoint)
    save(db)
  },

  async recordFxRates(onDate: string, base: CurrencyCode, rates: Rates) {
    const db = load()
    db.fxHistory ??= []
    const existing = db.fxHistory.find((r) => r.on_date === onDate && r.base === base)
    if (existing) existing.rates = { ...rates } as Record<string, number>
    else
      db.fxHistory.push({
        user_id: DEMO_USER,
        on_date: onDate,
        base,
        rates: { ...rates } as Record<string, number>,
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
      need_level: input.need_level ?? null,
      cost_type: input.cost_type ?? null,
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

  async deleteCategory(id: string) {
    const db = load()
    const target = db.categories.find((c) => c.id === id)
    if (!target) throw new Error('Không tìm thấy danh mục')
    // Cha (parent_id null) có con → gom cha + tất cả con để xóa cả nhóm.
    const childIds = target.parent_id
      ? []
      : db.categories.filter((c) => c.parent_id === id).map((c) => c.id)
    const ids = new Set<string>([id, ...childIds])
    if (db.transactions.some((t) => t.category_id != null && ids.has(t.category_id)))
      throw new Error('Không xóa được: còn giao dịch dùng danh mục này. Hãy Lưu trữ thay vì Xóa.')
    if ((db.recurringRules ?? []).some((r) => r.category_id != null && ids.has(r.category_id)))
      throw new Error('Không xóa được: còn giao dịch định kỳ dùng danh mục này. Hãy Lưu trữ thay vì Xóa.')
    if ((db.budgets ?? []).some((b) => ids.has(b.category_id)))
      throw new Error('Không xóa được: còn ngân sách đặt cho danh mục này. Hãy Lưu trữ thay vì Xóa.')
    db.categories = db.categories.filter((c) => !ids.has(c.id))
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

  async upsertBudget(categoryId: string, monthKey: string, amount: number, rollover = false) {
    const db = load()
    const existing = db.budgets.find(
      (b) => b.category_id === categoryId && b.month_key === monthKey,
    )
    if (existing) {
      existing.amount = amount
      existing.rollover = rollover
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
      rollover,
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
        rollover: b.rollover,
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
    const { transaction, ...debtFields } = input
    let disbursement_transaction_id: string | null = null
    if (transaction) {
      // Giải ngân là dòng tiền cho vay → đánh dấu để báo cáo Chi/Thu bỏ qua.
      const tx: TransactionRow = {
        ...transaction,
        is_debt_flow: true,
        id: uuid(),
        user_id: DEMO_USER,
        recurring_rule_id: null,
        created_at: nowISO(),
        updated_at: nowISO(),
      }
      db.transactions.push(tx)
      disbursement_transaction_id = tx.id
    }
    const row: DebtRow = {
      ...debtFields,
      id: uuid(),
      user_id: DEMO_USER,
      status: 'open',
      interest_bps: input.interest_bps ?? null,
      term_months: input.term_months ?? null,
      disbursement_transaction_id,
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
    // `transaction` chỉ dùng lúc tạo (giải ngân), không phải cột của debts.
    const { transaction: _ignore, ...debtPatch } = patch
    db.debts[idx] = { ...db.debts[idx], ...debtPatch, updated_at: nowISO() }
    save(db)
    return db.debts[idx]
  },

  async deleteDebt(id: string) {
    const db = load()
    db.debts ??= []
    db.debtPayments ??= []
    // Xóa giao dịch liên kết của các payment thuộc khoản nợ này + giao dịch giải ngân
    const txIds = new Set(
      db.debtPayments
        .filter((p) => p.debt_id === id && p.transaction_id)
        .map((p) => p.transaction_id as string),
    )
    const disbursementTxId = db.debts.find((d) => d.id === id)?.disbursement_transaction_id
    if (disbursementTxId) txIds.add(disbursementTxId)
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
      // Trả nợ là dòng tiền nợ/cho vay → đánh dấu để báo cáo Chi/Thu bỏ qua.
      const tx: TransactionRow = {
        ...input.transaction,
        is_debt_flow: true,
        id: uuid(),
        user_id: DEMO_USER,
        recurring_rule_id: null,
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

  async listRecurringRules() {
    return (load().recurringRules ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at))
  },

  async createRecurringRule(input: NewRecurringRule) {
    const db = load()
    db.recurringRules ??= []
    const row: RecurringRuleRow = {
      ...input,
      id: uuid(),
      user_id: DEMO_USER,
      is_paused: false,
      last_generated_on: null,
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    db.recurringRules.push(row)
    save(db)
    return row
  },

  async updateRecurringRule(id: string, patch: RecurringRulePatch) {
    const db = load()
    db.recurringRules ??= []
    const idx = db.recurringRules.findIndex((r) => r.id === id)
    if (idx < 0) throw new Error('Không tìm thấy quy tắc định kỳ')
    db.recurringRules[idx] = { ...db.recurringRules[idx], ...patch, updated_at: nowISO() }
    save(db)
    return db.recurringRules[idx]
  },

  async deleteRecurringRule(id: string) {
    const db = load()
    db.recurringRules = (db.recurringRules ?? []).filter((r) => r.id !== id)
    // Khớp FK on delete set null: giao dịch đã sinh giữ nguyên, chỉ mất liên kết
    db.transactions = db.transactions.map((t) =>
      t.recurring_rule_id === id ? { ...t, recurring_rule_id: null } : t,
    )
    save(db)
  },

  async insertRecurringOccurrence(input: NewRecurringOccurrence) {
    const db = load()
    // Tự kiểm tra trùng (thay cho partial unique index phía Postgres)
    const dup = db.transactions.some(
      (t) => t.recurring_rule_id === input.recurring_rule_id && t.occurred_on === input.occurred_on,
    )
    if (dup) return false
    db.transactions.push({
      ...input,
      id: uuid(),
      user_id: DEMO_USER,
      created_at: nowISO(),
      updated_at: nowISO(),
    })
    save(db)
    return true
  },

  async insertCardAutopay(input: NewTransaction) {
    const db = load()
    // Tự kiểm tra trùng (thay cho partial unique index phía Postgres): mỗi thẻ
    // mỗi ngày đến hạn chỉ 1 lần tự trả
    const dup = db.transactions.some(
      (t) =>
        t.note === input.note &&
        t.to_account_id === input.to_account_id &&
        t.occurred_on === input.occurred_on,
    )
    if (dup) return false
    const { tag_ids: _drop, ...fields } = input
    db.transactions.push({
      ...fields,
      id: uuid(),
      user_id: DEMO_USER,
      recurring_rule_id: null,
      created_at: nowISO(),
      updated_at: nowISO(),
    })
    save(db)
    return true
  },

  // --- Nhãn ---

  async getTags() {
    return (load().tags ?? [])
      // is_archived thêm sau (migration 0033), budget_* thêm sau nữa (0036) → db demo
      // cũ chưa có cột, ép về mặc định thay vì để undefined lọt lên tầng trên
      .map((t) => ({
        ...t,
        is_archived: t.is_archived ?? false,
        budget_amount: t.budget_amount ?? null,
        budget_period: t.budget_period ?? 'total',
      }))
      .sort((a, b) => a.sort_order - b.sort_order)
  },

  async getTransactionTags() {
    return (load().transactionTags ?? []).slice()
  },

  async getTagSpend() {
    const db = load()
    const txById = new Map(db.transactions.map((t) => [t.id, t]))
    const out: TagSpendRow[] = []
    for (const l of db.transactionTags ?? []) {
      const t = txById.get(l.transaction_id)
      // Chỉ khoản CHI còn tính vào thống kê — cùng bộ lọc với tagBreakdown, để tổng
      // cả đời và tổng một tháng không bao giờ đếm theo hai luật khác nhau.
      if (!t || t.type !== 'expense' || t.is_debt_flow || t.exclude_from_stats) continue
      out.push({
        tag_id: l.tag_id,
        transaction_id: t.id,
        amount: t.amount,
        account_id: t.account_id,
        occurred_on: t.occurred_on,
        is_refund: t.is_refund ?? false,
      })
    }
    return out
  },

  async createTag(input: NewTag) {
    const db = load()
    db.tags ??= []
    const name = input.name.trim()
    if (db.tags.some((t) => t.name === name)) throw new Error(`Nhãn "${name}" đã tồn tại`)
    const row: TagRow = {
      id: uuid(),
      user_id: DEMO_USER,
      name,
      color: input.color,
      sort_order: db.tags.reduce((m, t) => Math.max(m, t.sort_order + 1), 0),
      is_archived: false,
      budget_amount: input.budget_amount ?? null,
      budget_period: input.budget_period ?? 'total',
      created_at: nowISO(),
    }
    db.tags.push(row)
    save(db)
    return row
  },

  async updateTag(id: string, patch: TagPatch) {
    const db = load()
    db.tags ??= []
    const idx = db.tags.findIndex((t) => t.id === id)
    if (idx < 0) throw new Error('Không tìm thấy nhãn')
    const name = patch.name?.trim()
    if (name && db.tags.some((t) => t.id !== id && t.name === name))
      throw new Error(`Nhãn "${name}" đã tồn tại`)
    db.tags[idx] = { ...db.tags[idx], ...patch, ...(name ? { name } : {}) }
    save(db)
    return db.tags[idx]
  },

  async deleteTag(id: string) {
    const db = load()
    db.tags = (db.tags ?? []).filter((t) => t.id !== id)
    db.transactionTags = (db.transactionTags ?? []).filter((l) => l.tag_id !== id)
    save(db)
  },

  async setTransactionTags(transactionId: string, tagIds: string[]) {
    const db = load()
    db.transactionTags = (db.transactionTags ?? []).filter(
      (l) => l.transaction_id !== transactionId,
    )
    for (const tagId of tagIds) {
      db.transactionTags.push({ transaction_id: transactionId, tag_id: tagId, user_id: DEMO_USER })
    }
    save(db)
  },

  async exportAll(): Promise<BackupData> {
    const db = load()
    return {
      version: BACKUP_VERSION,
      exported_at: nowISO(),
      profile: db.profile,
      accounts: db.accounts,
      categories: db.categories,
      transactions: db.transactions,
      budgets: db.budgets,
      assetGroupSettings: db.assetGroupSettings ?? [],
      debts: db.debts ?? [],
      debtPayments: db.debtPayments ?? [],
      recurringRules: db.recurringRules ?? [],
      accountValuations: db.accountValuations ?? [],
      stockTrades: db.stockTrades ?? [],
      savingsGoals: db.savingsGoals ?? [],
      networthSnapshots: db.networthSnapshots ?? [],
      tags: db.tags ?? [],
      transactionTags: db.transactionTags ?? [],
      lifeScenarios: db.lifeScenarios ?? [],
      lifePhases: db.lifePhases ?? [],
      lifeEvents: db.lifeEvents ?? [],
    }
  },

  async importAll(data: BackupData) {
    // Soát y như bản thật: demoRepo không có FK/CHECK của Postgres, nên nếu bỏ bước này
    // thì "đã thử ở demo thấy chạy" không chứng minh được gì về bản Supabase.
    const problems = validateBackupPayload(data)
    if (problems.length)
      throw new Error(
        `File sao lưu có ${problems.length} vấn đề, chưa xoá gì cả:\n· ${problems.join('\n· ')}`,
      )
    // Giữ nguyên user_id demo để dữ liệu nhất quán với seed/reset.
    const stamp = <T extends { user_id: string }>(rows: T[]): T[] =>
      rows.map((r) => ({ ...r, user_id: DEMO_USER }))
    // stock_prices là dữ liệu công khai (server hút lại được) — KHÔNG có trong file sao
    // lưu, nên giữ nguyên bảng giá hiện có thay vì xoá theo import.
    const stockPrices = load().stockPrices ?? []
    const db: DemoDB = {
      profile: {
        ...data.profile,
        user_id: DEMO_USER,
        // File sao lưu cũ hơn migration 0034 không có ba cột giờ gửi push. Bản Supabase
        // không đụng profiles khi khôi phục nên default của Postgres lo hộ, còn ở đây
        // thiếu là `undefined` chảy thẳng vào ô chọn giờ trong Cài đặt.
        //
        // `??` trông như dư vì ProfileRow khai ba cột này là bắt buộc — nhưng kiểu đó
        // nói về dữ liệu TRONG app, còn `data` là file người dùng chọn từ đĩa và có
        // thể được xuất trước khi ba cột tồn tại. Đặt default TRƯỚC spread thì
        // TypeScript đúng khi bảo là code chết (TS2783), nên phải viết từng cột.
        push_hour: data.profile.push_hour ?? 8,
        push_tz: data.profile.push_tz ?? 'Asia/Tokyo',
        push_last_sent_at: data.profile.push_last_sent_at ?? null,
      },
      accounts: stamp(data.accounts ?? []),
      categories: stamp(data.categories ?? []),
      transactions: stamp(data.transactions ?? []),
      budgets: stamp(data.budgets ?? []),
      assetGroupSettings: stamp(data.assetGroupSettings ?? []),
      debts: stamp(data.debts ?? []),
      debtPayments: stamp(data.debtPayments ?? []),
      recurringRules: stamp(data.recurringRules ?? []),
      accountValuations: stamp(data.accountValuations ?? []),
      stockTrades: stamp(data.stockTrades ?? []),
      stockPrices,
      savingsGoals: stamp(data.savingsGoals ?? []),
      networthSnapshots: stamp(data.networthSnapshots ?? []),
      tags: stamp(data.tags ?? []),
      transactionTags: stamp(data.transactionTags ?? []),
      lifeScenarios: stamp(data.lifeScenarios ?? []),
      lifePhases: stamp(data.lifePhases ?? []),
      lifeEvents: stamp(data.lifeEvents ?? []),
    }
    save(db)
  },
}
