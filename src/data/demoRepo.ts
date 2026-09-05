import { addMonths, monthKeyForDate, monthKeyString, parseMonthKey, toISODate } from '../lib/dates'
import { filterTransactions } from '../features/transactions/filter'
import { asTrade, brokerCash, holdingsFromTrades, portfolioValue, sessionPrices } from '../features/assets/holdings'
import {
  asFundTrade,
  fundHoldingsFromTrades,
  fundValue,
  sessionNavs,
} from '../features/assets/fundHoldings'
import { validateBackupPayload } from './backupImport'
import { DEFAULT_DENSITY, parseDensity } from '../lib/density'
import { debtPaymentPosting } from '../features/debts/debtPaymentPosting'
import { missingTradeTransfers, stockTradeCashFlow } from '../features/assets/stockTradePosting'
import type { CurrencyCode } from '../lib/money'
import type { Rates } from '../lib/rates'
import type {
  AccountBalanceRow,
  AccountRow,
  AccountValuationRow,
  AssetGroupSettingRow,
  BudgetRow,
  CategoryRow,
  CategoryKind,
  CategoryType,
  CostType,
  DebtPaymentRow,
  DebtRow,
  FundPriceRow,
  FundRow,
  FundTradeRow,
  FxHistoryRow,
  LifeEventRow,
  LifePhaseRow,
  LifeScenarioRow,
  NeedLevel,
  MonthPlanRow,
  HealthSnapshotRow,
  LifetimeVerdictSnapshotRow,
  NetWorthSnapshotRow,
  PlannedExpenseRow,
  NotificationStateRow,
  ProfileRow,
  PushSubscriptionRow,
  RecurringRuleRow,
  RecurringRuleTagRow,
  PlannedExpenseTagRow,
  RelativeRow,
  TripRow,
  SavingsGoalRow,
  StockPriceRow,
  StockTradeRow,
  TagGroupRow,
  TagRow,
  TagSpendRow,
  TransactionRow,
  TransactionTagRow,
} from '../types/database.types'
import {
  type NewLifetimeVerdictSnapshot,
  BACKUP_VERSION,
  type AccountPatch,
  type AssetGroupSettingPatch,
  type BackupData,
  type BenefitTxFilter,
  type CategoryPatch,
  type DateRange,
  type DebtPatch,
  type FundTradePatch,
  type LifeEventPatch,
  type LifePhasePatch,
  type LifeScenarioPatch,
  type NewAccount,
  type NewCategory,
  type NewDebt,
  type NewDebtPayment,
  type NewFundTrade,
  type NewLifeEvent,
  type NewLifePhase,
  type NewLifeScenario,
  type NewPushSubscription,
  type NewRecurringOccurrence,
  type NewRecurringRule,
  type NewRelative,
  type NewTrip,
  type NewSavingsGoal,
  type NewStockTrade,
  type NewPlannedExpense,
  type NewTag,
  type NewTagGroup,
  type PlannedExpensePatch,
  type NewTransaction,
  type NewValuation,
  type ProfilePatch,
  type RecurringRulePatch,
  type RelativePatch,
  type Repo,
  type SavingsGoalPatch,
  type StockTradePatch,
  type TagGroupPatch,
  type TagPatch,
  type TransactionPatch,
  type TxFilter,
} from './repo'

// Repo demo: dữ liệu lưu localStorage, seed giống hệt trigger handle_new_user
// trong migration + một ít giao dịch mẫu để sổ/tổng quan có số liệu.
// Tiền lưu ở minor units: JPY = yên, VND = đồng, USD = cent.

export const STORAGE_KEY = 'sct-demo-db-v18' // v18: 24 tháng lịch sử + cú đổi nếp + gửi về VN + nợ có lãi + mục tiêu
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

/**
 * Ghi/sửa/xoá dòng tiền của một lệnh cho khớp với chính lệnh đó — gọi SAU khi
 * `db.stockTrades` đã ở trạng thái mới. Sửa `db` tại chỗ; nơi gọi tự `save(db)`.
 *
 * Khớp hành vi bản thật: unique index `transactions_stock_trade_id_key` (migration 0054)
 * cho phép tối đa một dòng mỗi lệnh, nên ở đây cũng đúng một dòng.
 */
function dongBoDongTienLenh(db: DemoDB, trade: StockTradeRow) {
  const viId = db.accounts.find((a) => a.id === trade.account_id)?.cash_account_id ?? null
  const flow = stockTradeCashFlow(trade, trade.account_id, viId)
  const idx = db.transactions.findIndex((t) => t.stock_trade_id === trade.id)

  if (!flow) {
    if (idx >= 0) db.transactions.splice(idx, 1)
    return
  }
  if (idx >= 0) {
    db.transactions[idx] = { ...db.transactions[idx], ...flow, updated_at: nowISO() }
    return
  }
  db.transactions.push({
    ...flow,
    id: uuid(),
    user_id: DEMO_USER,
    recurring_rule_id: null,
    stock_trade_id: trade.id,
    created_at: nowISO(),
    updated_at: nowISO(),
  })
}

/** Lệnh còn thiếu dòng tiền, tính trên trạng thái hiện tại của db. */
function thieuDongTien(db: DemoDB) {
  return missingTradeTransfers(
    db.accounts.filter((a) => a.cash_account_id),
    db.stockTrades ?? [],
    new Set(db.transactions.map((t) => t.stock_trade_id).filter((id): id is string => !!id)),
  )
}

/**
 * Soi hình dạng lệnh quỹ y như CHECK `fund_trades_shape` của Postgres (migration 0045):
 *   adjust → units <> 0 và nav = 0 và amount = 0
 *   khác   → units > 0 và amount > 0
 *
 * Bản demo là chỗ DUY NHẤT bắt được lỗi này trước khi nó thành một câu INSERT bị 23514 ở
 * production — nơi lỗi chỉ hiện ra dưới dạng một mã lỗi Postgres không ai đọc được.
 */
function assertFundTradeShape(
  input: Pick<NewFundTrade, 'kind' | 'units' | 'nav' | 'amount'>,
) {
  if (input.kind === 'adjust') {
    if (input.units === 0) throw new Error('Lệnh điều chỉnh phải có số 口数 khác 0.')
    if (input.nav !== 0) throw new Error('Lệnh điều chỉnh không được có 基準価額.')
    if (input.amount !== 0) throw new Error('Lệnh điều chỉnh không được có số tiền.')
    return
  }
  if (!Number.isFinite(input.units) || input.units <= 0)
    throw new Error('Lệnh mua/bán phải có số 口数 dương.')
  if (!Number.isFinite(input.amount) || input.amount <= 0)
    throw new Error('Lệnh mua/bán phải có số tiền dương.')
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
  /**
   * Quỹ đầu tư Nhật (migration 0045). Optional (khác `stockTrades`/`stockPrices` ở trên):
   * `importAll` chưa mang lại ba bảng này khi khôi phục từ file sao lưu (đó là việc của
   * Task 7) — khai bắt buộc sẽ đỏ kiểu ngay tại object trả về của `importAll`.
   */
  funds?: FundRow[]
  fundPrices?: FundPriceRow[]
  fundTrades?: FundTradeRow[]
  savingsGoals: SavingsGoalRow[]
  networthSnapshots: NetWorthSnapshotRow[]
  healthSnapshots: HealthSnapshotRow[]
  /** Lịch sử kết luận tab Tương lai (migration 0055); vắng mặt ở dữ liệu demo cũ. */
  lifetimeVerdictSnapshots?: LifetimeVerdictSnapshotRow[]
  tags: TagRow[]
  transactionTags: TransactionTagRow[]
  /** Nhãn của quy tắc định kỳ (migration 0042); vắng mặt ở dữ liệu demo cũ. */
  recurringRuleTags?: RecurringRuleTagRow[]
  /** Nhãn của khoản sắp chi (migration 0044); vắng mặt ở dữ liệu demo cũ. */
  plannedExpenseTags?: PlannedExpenseTagRow[]
  tagGroups?: TagGroupRow[]
  /** Trạng thái thông báo (mục AO); vắng mặt ở dữ liệu demo cũ. */
  notificationState?: NotificationStateRow[]
  /** Lịch sử tỷ giá; vắng mặt ở dữ liệu demo cũ. */
  fxHistory?: FxHistoryRow[]
  /** Thiết bị đã đăng ký nhận push (migration 0034); vắng mặt ở dữ liệu demo cũ. */
  pushSubscriptions?: PushSubscriptionRow[]
  lifeScenarios: LifeScenarioRow[]
  lifePhases: LifePhaseRow[]
  lifeEvents: LifeEventRow[]
  /** Khoản sắp chi (migration 0038); vắng mặt ở dữ liệu demo cũ. */
  plannedExpenses?: PlannedExpenseRow[]
  /** Thu dự kiến từng tháng (migration 0041); vắng mặt ở dữ liệu demo cũ. */
  monthPlans?: MonthPlanRow[]
  /** Người thân nhận tiền (migration 0056); vắng mặt ở dữ liệu demo cũ (localStorage). */
  relatives?: RelativeRow[]
  /** Chuyến đi (migration 0058); vắng mặt ở dữ liệu demo cũ. Seed KHÔNG có chuyến nào. */
  trips?: TripRow[]
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

/**
 * Ngày `day` của tháng cách đây `monthsBack` tháng.
 *
 * Đặt ngày 1 TRƯỚC khi lùi tháng: `setMonth` trên ngày 31 sẽ nhảy sang tháng sau ở những
 * tháng 30 ngày (31/03 lùi 1 tháng ra 03/03), và một giao dịch nhảy tháng làm cả chuỗi 24
 * tháng lệch đúng ở chỗ khó thấy nhất. `day` bị kẹp về 28 để mọi tháng đều nhận được.
 */
function monthsAgoISO(monthsBack: number, day: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - monthsBack)
  d.setDate(Math.min(day, 28))
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
    // null = để app suy từ `type` (liquidity.ts), đúng hành vi của người chưa đặt cờ.
    is_liquid: null,
    cash_account_id: null,
    // Chưa lần nào đối chiếu qua sheet → app suy từ giao dịch bù, giống người dùng cũ.
    last_reconciled_at: null,
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
    kind: CategoryKind = 'expense',
  ): CategoryRow => ({
    kind,
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
    // Tài khoản NISA quỹ đầu tư Nhật (migration 0045) — vốn gốc đến từ fund_trades, không
    // từ initial_balance: Rakuten quét sạch tiền dư (自動出金) nên không có "tiền chưa
    // đầu tư" để gán ở đây.
    account('NISA Rakuten', 'investment', 'JPY', 0, 6, 'Tài sản Nhật'),
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
  // ふるさと納税 (mục Quyền lợi, migration 0056): khoản quyên góp trừ vào thuế cư trú năm
  // sau — không phải "cho không", nên cần lộ diện trong danh mục demo để màn Quyền lợi có
  // gì mà đếm.
  const furusato = category('ふるさと納税 (寄附)', 'expense', '🎁', null, 'flexible', 'variable')
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
    // `kind: 'transfer'` — cùng quy ước với backfill của migration 0046. Có nó thì demo
    // mới chạy qua đúng nhánh "tầng chuyển tài sản" của khối 01, và mới thấy được chi tiêu
    // KHÔNG gồm ¥30.000 gửi về nhà.
    category('Gửi tiền về VN', 'expense', '🧧', taiChinh.id, null, null, 'transfer'),
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
    furusato,
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
  // Tài khoản NISA nằm cuối mảng accounts (thêm sau, không đổi thứ tự 4 tài khoản đầu ở
  // trên) — lấy bằng tên cho khỏi phụ thuộc chỉ số mảng.
  const nisaAcc = accounts.find((a) => a.name === 'NISA Rakuten')!
  // spec F: tài khoản NISA mẫu phải có tax_shelter để khối ④ hiện
  nisaAcc.tax_shelter = 'nisa_tsumitate'
  nisaAcc.shelter_annual_limit = 1_200_000

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

  /** Quy tắc lương — nguồn của cờ "thu định kỳ" (khối 01 tab Tháng này). */
  const luongRule: RecurringRuleRow = {
    id: uuid(),
    user_id: DEMO_USER,
    type: 'income',
    amount: 280_000,
    to_amount: null,
    category_id: cat('Lương', 'income').id,
    account_id: bank.id,
    to_account_id: null,
    note: 'Lương tháng',
    frequency: 'monthly',
    start_on: monthsAgoISO(24, 25),
    end_on: null,
    is_paused: false,
    last_generated_on: null,
    mode: 'auto',
    remind_days_before: 0,
    is_refund: false,
    created_at: nowISO(),
    updated_at: nowISO(),
  }

  // Người thân nhận tiền gửi về VN (migration 0056) — mẹ (70+, đã quá tuổi ngưỡng 30–69)
  // và em Hùng (30–69, đúng khoảng tuổi luật 国外居住親族 áp dụng).
  const me = { id: uuid(), user_id: DEMO_USER, name: 'Mẹ', birth_year: 1955, relationship: 'parent' as const, country: 'VN', is_archived: false, sort_order: 0, created_at: nowISO() }
  const em = { id: uuid(), user_id: DEMO_USER, name: 'Em Hùng', birth_year: 1995, relationship: 'sibling' as const, country: 'VN', is_archived: false, sort_order: 1, created_at: nowISO() }
  const relatives: RelativeRow[] = [me, em]

  const transactions = [
    // Chi tiêu hàng ngày bằng JPY
    tx({ type: 'expense', amount: 850, occurred_on: daysAgo(0), note: 'Cơm trưa', category_id: cat('Bữa trưa', 'expense').id }),
    tx({ type: 'expense', amount: 210, occurred_on: daysAgo(0), note: 'Tàu điện', category_id: cat('Tàu điện', 'expense').id }),
    tx({ type: 'expense', amount: 3_280, occurred_on: daysAgo(1), note: 'Ăn tối cùng bạn', category_id: cat('Ăn ngoài', 'expense').id }),
    tx({ type: 'expense', amount: 4_990, occurred_on: daysAgo(1), note: 'Áo khoác Uniqlo', category_id: cat('Quần áo', 'expense').id, account_id: bank.id }),
    tx({ type: 'expense', amount: 12_400, occurred_on: daysAgo(3), note: 'Tiền điện + gas', category_id: cat('Điện', 'expense').id, account_id: bank.id }),
    tx({ type: 'expense', amount: 1_200, occurred_on: daysAgo(5), note: 'Thuốc cảm', category_id: cat('Thuốc', 'expense').id }),
    tx({ type: 'expense', amount: 68_000, occurred_on: daysAgo(0), note: 'Tiền thuê nhà tháng này', category_id: cat('Tiền nhà', 'expense').id, account_id: bank.id }),
    // GẮN quy tắc lương: không gắn thì khối "thu định kỳ vs một lần" của tháng đang chạy
    // không có tín hiệu nào và tự ẩn — tức khối mới dựng không bao giờ thấy được trong demo.
    {
      ...tx({ type: 'income', amount: 280_000, occurred_on: daysAgo(0), note: 'Lương tháng', category_id: cat('Lương', 'income').id, account_id: bank.id }),
      recurring_rule_id: luongRule.id,
    },
    // Thưởng nhỏ KHÔNG gắn quy tắc → cột "một lần", để hai cột đều có số.
    tx({ type: 'income', amount: 9_181, occurred_on: daysAgo(2), note: 'Thưởng nhỏ', category_id: cat('Lương', 'income').id, account_id: bank.id }),
    // Gửi về VN của tháng đang chạy — để tầng "chuyển tài sản" của khối 01 khác 0.
    {
      ...tx({ type: 'expense', amount: 30_000, occurred_on: daysAgo(6), note: 'Gửi tiền về nhà', category_id: cat('Gửi tiền về VN', 'expense').id, account_id: bank.id }),
      is_remittance: true,
      remit_service: 'Wise',
      remit_fee_jpy: 500,
      remit_received_vnd: 29_500 * 166,
      remit_recipient_id: me.id,
    },
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
    tx({ type: 'expense', amount: 30_000, occurred_on: daysAgo(40), note: 'ふるさと納税', category_id: cat('ふるさと納税 (寄附)', 'expense').id, account_id: bank.id }),
    // ---------------------------------------------------------------- 24 THÁNG LỊCH SỬ
    //
    // VÌ SAO CẦN. Dữ liệu demo trước đây chỉ có ~2 tháng, nên SÁU khối của bản redesign
    // không bao giờ render với dữ liệu có nghĩa: điểm đổi nếp + mức nền (cần ≥8 tháng và
    // một cú đổi), công tắc "Từ khi đổi nếp", rổ quen thuộc (cần 24 tháng), bảng 12 dòng +
    // cột "So mức nền", panel mùa vụ, và dải Gửi về VN. Chúng chỉ có unit test — mở app ra
    // thì toàn trạng thái rỗng, tức không kiểm được bố cục với số dài thật.
    //
    // Bốn nếp cố ý dựng vào dữ liệu, mỗi cái để một khối có gì mà nói:
    //   · CÚ ĐỔI NẾP ở tháng thứ 10 tính từ đầu chuỗi: chi nền tụt từ ~¥380k xuống ~¥210k.
    //   · MÙA VỤ tháng 10 nặng hơn hẳn (thêm ~¥90k), để panel 12 cột có một cột nổi lên.
    //   · GỬI VỀ VN đều ¥30.000, BỎ một tháng và một tháng gửi ¥40.000 — đúng ba trạng
    //     thái mà `remitStrip` phân biệt (đều / bỏ / khác mức thường lệ).
    //   · THU tách định kỳ vs một lần: lương gắn `recurring_rule_id`, thưởng thì không.
    ...lichSu24Thang(),
  ]

  /**
   * 24 tháng giao dịch, tháng −24 → tháng −1. Tháng đang chạy đã có ở khối trên.
   *
   * Số dựng cố ý "tròn nhưng không đều": mỗi tháng lệch một chút theo `i` để trung vị và
   * trung bình khác nhau — nếu mọi tháng bằng nhau thì `baselineLevel` (trung vị) và trung
   * bình trùng nhau và cả lời giải thích "vì sao dùng trung vị" mất chỗ để thấy.
   */
  function lichSu24Thang(): TransactionRow[] {
    const out: TransactionRow[] = []
    const DOI_NEP = 10 // tháng thứ 10 của chuỗi: nếp cũ → nếp mới

    for (let i = 24; i >= 1; i--) {
      const idx = 24 - i // 0 = tháng cũ nhất
      const cuNep = idx < DOI_NEP
      const wobble = ((idx * 7) % 5) - 2 // −2…+2, đủ để trung vị ≠ trung bình

      // Lương: GẮN quy tắc → khối "thu định kỳ vs một lần" có tín hiệu.
      out.push({
        ...tx({
          type: 'income',
          amount: 280_000 + wobble * 1_000,
          occurred_on: monthsAgoISO(i, 25),
          note: 'Lương tháng',
          category_id: cat('Lương', 'income').id,
          account_id: bank.id,
        }),
        recurring_rule_id: luongRule.id,
      })

      // Thưởng hè: KHÔNG gắn quy tắc → cột "một lần".
      if (idx === 22 || idx === 10) {
        out.push(
          tx({
            type: 'income',
            amount: 80_000,
            occurred_on: monthsAgoISO(i, 15),
            note: 'Thưởng hè',
            category_id: cat('Lương', 'income').id,
            account_id: bank.id,
          }),
        )
      }

      // Tiền nhà — khoản cố định lớn nhất, và nó tụt khi đổi nếp (chuyển chỗ ở rẻ hơn).
      out.push(
        tx({
          type: 'expense',
          amount: cuNep ? 112_000 : 68_000,
          occurred_on: monthsAgoISO(i, 1),
          note: 'Tiền thuê nhà',
          category_id: cat('Tiền nhà', 'expense').id,
          account_id: bank.id,
        }),
      )

      // Ăn uống + đi chợ + đi lại: phần biến đổi, cũng tụt sau cú đổi nếp.
      const bienDoi = (cuNep ? 210_000 : 120_000) + wobble * 4_000
      out.push(
        tx({
          type: 'expense',
          amount: Math.round(bienDoi * 0.45),
          occurred_on: monthsAgoISO(i, 6),
          note: 'Đi chợ',
          category_id: cat('Đi chợ', 'expense').id,
          account_id: bank.id,
        }),
        tx({
          type: 'expense',
          amount: Math.round(bienDoi * 0.4),
          occurred_on: monthsAgoISO(i, 12),
          note: 'Ăn ngoài',
          category_id: cat('Ăn ngoài', 'expense').id,
        }),
        tx({
          type: 'expense',
          amount: Math.round(bienDoi * 0.15),
          occurred_on: monthsAgoISO(i, 18),
          note: 'Tàu điện',
          category_id: cat('Tàu điện', 'expense').id,
        }),
      )

      // MÙA VỤ: tháng 10 dương lịch nặng hơn hẳn.
      const thang = new Date(monthsAgoISO(i, 1)).getMonth() + 1
      if (thang === 10) {
        out.push(
          tx({
            type: 'expense',
            amount: 90_000,
            occurred_on: monthsAgoISO(i, 20),
            note: 'Vé máy bay về nhà',
            category_id: cat('Vé máy bay', 'expense').id,
            account_id: bank.id,
          }),
        )
      }

      // GỬI VỀ VN: đều ¥30.000; bỏ tháng thứ 4, gửi ¥40.000 ở tháng thứ 15.
      if (idx !== 4) {
        out.push({
          ...tx({
            type: 'expense',
            amount: idx === 15 ? 40_000 : 30_000,
            occurred_on: monthsAgoISO(i, 26),
            note: 'Gửi tiền về nhà',
            category_id: cat('Gửi tiền về VN', 'expense').id,
            account_id: bank.id,
          }),
          is_remittance: true,
          remit_service: 'Wise',
          remit_fee_jpy: 500,
          // Tỷ giá THẬT của từng lần, lệch nhau theo `idx` — khối "được giá nhất / thiệt
          // nhất" so số VND người nhận THỰC NHẬN, nên không có hai đầu số thì nó tự ẩn.
          remit_received_vnd: Math.round((idx === 15 ? 39_500 : 29_500) * (160 + (idx % 7))),
          // Người nhận (migration 0056): mẹ/em xen kẽ, một lần bỏ trống để màn Quyền lợi
          // có "chưa gán" thật trong dữ liệu demo.
          remit_recipient_id: idx === 2 ? null : idx % 2 === 0 ? me.id : em.id,
        })
      }

      // Nạp NISA đều mỗi tháng — cho khối "phần giữ lại đi đâu" có tầng đầu tư.
      if (!cuNep) {
        out.push(
          tx({
            type: 'transfer',
            amount: 45_000,
            occurred_on: monthsAgoISO(i, 27),
            note: 'Nạp NISA',
            account_id: bank.id,
            to_account_id: nisaAcc.id,
          }),
        )
      }
    }
    return out
  }

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
    // Dữ liệu mẫu có từ trước 0049 → 'chưa ai nói', đúng như mọi khoản nợ cũ thật.
    origin: null,
    income_category_id: null,
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
    // Dữ liệu mẫu có từ trước 0049 → 'chưa ai nói', đúng như mọi khoản nợ cũ thật.
    origin: null,
    income_category_id: null,
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

  // Hai quỹ Rakuten thật + 基準価額 phiên 2026-08-10 (đo thật từ nguồn 投信協会). Dùng số
  // thật để bản demo phản ánh đúng thứ người dùng sẽ thấy, và để ai đọc dữ liệu demo cũng
  // thấy ngay đơn vị là ¥/10.000口 chứ không phải ¥/口.
  const funds: FundRow[] = [
    {
      assoc_fund_cd: '9I31223A',
      isin_cd: 'JP90C000Q2U6',
      name: '楽天・プラス・S&P500インデックス・ファンド',
      last_status: 'ok',
      last_checked_at: '2026-08-12T13:00:00.000Z',
      created_at: '2026-08-12T13:00:00.000Z',
      // 信託報酬 công bố 0,077%/năm — số thật của quỹ này.
      expense_ratio_ppm: 770,
    },
    {
      assoc_fund_cd: '9I314241',
      isin_cd: 'JP90C000QF22',
      name: '楽天・プラス・NASDAQ-100インデックス・ファンド',
      last_status: 'ok',
      last_checked_at: '2026-08-12T13:00:00.000Z',
      created_at: '2026-08-12T13:00:00.000Z',
      // 信託報酬 công bố 0,198%/năm — số thật của quỹ này.
      expense_ratio_ppm: 1980,
    },
  ]
  const fundPrices: FundPriceRow[] = [
    {
      assoc_fund_cd: '9I31223A',
      nav: 20_053,
      prior_nav: 20_012,
      net_assets_m: 1_175_583,
      nav_date: '2026-08-10',
      updated_at: '2026-08-12T13:00:00.000Z',
    },
    {
      assoc_fund_cd: '9I314241',
      nav: 18_855,
      prior_nav: 18_712,
      net_assets_m: 306_851,
      nav_date: '2026-08-10',
      updated_at: '2026-08-12T13:00:00.000Z',
    },
  ]
  // Đúng hai lệnh mua ngày 約定 2026-04-09 — tái tạo vị thế thật: 70.000 ¥ vốn,
  // 80.757 ¥ giá trị theo phiên 2026-08-10. Tài khoản NISA (investment/JPY) đã seed ở trên.
  const idNisaJPY = nisaAcc.id
  const fundTrades: FundTradeRow[] = [
    {
      id: uuid(),
      user_id: DEMO_USER,
      account_id: idNisaJPY,
      assoc_fund_cd: '9I31223A',
      kind: 'buy',
      traded_on: '2026-04-09',
      units: 28_429,
      nav: 17_588,
      amount: 50_000,
      bucket: 'NISAつみたて投資枠',
      note: '',
      created_at: '2026-04-14T00:00:00.000Z',
      updated_at: '2026-04-14T00:00:00.000Z',
    },
    {
      id: uuid(),
      user_id: DEMO_USER,
      account_id: idNisaJPY,
      assoc_fund_cd: '9I314241',
      kind: 'buy',
      traded_on: '2026-04-09',
      units: 12_595,
      nav: 15_879,
      amount: 20_000,
      bucket: 'NISA成長投資枠',
      note: '',
      created_at: '2026-04-14T00:00:00.000Z',
      updated_at: '2026-04-14T00:00:00.000Z',
    },
  ]

  /**
   * Hai khoản nợ nữa, cố ý dựng để khối 03 tab Quyết định nói được điều nó tồn tại để nói:
   * xếp theo TIỀN LÃI khác hẳn xếp theo DƯ NỢ.
   *
   *   · thẻ trả góp: dư nợ NHỎ hơn nhưng lãi 15%/năm → tiền lãi LỚN nhất
   *   · thuế cư trú: dư nợ LỚN hơn nhưng lãi 0% → trả trước không tiết kiệm đồng nào
   */
  const debtCard: DebtRow = {
    id: uuid(),
    user_id: DEMO_USER,
    counterparty: 'Thẻ tín dụng trả góp',
    direction: 'i_owe',
    currency: 'JPY',
    principal: 318_400,
    due_on: daysAgo(-12),
    status: 'open',
    note: 'Mua máy giặt + tủ lạnh',
    interest_bps: 1_500,
    term_months: 11,
    // Dữ liệu mẫu có từ trước 0049 → 'chưa ai nói', đúng như mọi khoản nợ cũ thật.
    origin: null,
    income_category_id: null,
    disbursement_transaction_id: null,
    created_at: nowISO(),
    updated_at: nowISO(),
  }
  const debtTax: DebtRow = {
    id: uuid(),
    user_id: DEMO_USER,
    counterparty: 'Thuế cư trú trả sau',
    direction: 'i_owe',
    currency: 'JPY',
    principal: 91_498,
    due_on: daysAgo(-40),
    status: 'open',
    note: '',
    interest_bps: 0,
    term_months: 4,
    // Dữ liệu mẫu có từ trước 0049 → 'chưa ai nói', đúng như mọi khoản nợ cũ thật.
    origin: null,
    income_category_id: null,
    disbursement_transaction_id: null,
    created_at: nowISO(),
    updated_at: nowISO(),
  }

  const debts = [debtLent, debtOwed, debtCard, debtTax]

  /** Một mục tiêu THẬT — để khối 04 tab Quyết định hiện tiến độ thay vì lời mời đặt. */
  const savingsGoals: SavingsGoalRow[] = [
    {
      id: uuid(),
      user_id: DEMO_USER,
      name: 'Đủ 1× trả nợ ngắn hạn',
      account_id: bank.id,
      target_amount: 650_000,
      target_date: null,
      note: 'Tiền mặt phủ hết phần nợ tới hạn 12 tháng',
      sort_order: 0,
      created_at: nowISO(),
    },
  ]
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
      budget_method: '50-30-20',
      budget_targets: {},
      notif_off: [],
      birth_year: null,
      push_hour: 8,
      push_tz: 'Asia/Tokyo',
      push_last_sent_at: null,
      density_pref: DEFAULT_DENSITY,
      // null = chưa khai (migration 0051) → màn 退職金 dùng hằng số dựng sẵn trong code
      // và nói rõ đang dùng số của 事業年度 nào. KHÔNG bump khoá localStorage vì hai cột
      // này nullable: bản demo cũ trong máy người dùng đọc lên là `undefined`, và mọi
      // nơi dùng đều có `?? mặc_định`.
      kikin_give_rate_bps: null,
      kikin_sheet: null,
      fuyo_claimed_years: [],
      created_at: nowISO(),
    },
    accounts,
    categories,
    transactions,
    budgets,
    assetGroupSettings,
    debts,
    debtPayments,
    recurringRules: [luongRule],
    accountValuations,
    stockTrades,
    stockPrices,
    funds,
    fundPrices,
    fundTrades,
    relatives,
    savingsGoals,
    networthSnapshots: [],
    healthSnapshots: [],
    lifetimeVerdictSnapshots: [],
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
      const trades = stockTrades.filter((t) => t.account_id === a.id).map(asTrade)
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

    /**
     * Snapshot 'auto' mà cron fund-refresh sẽ ghi cho tài khoản quỹ này NẾU nó chạy ngay
     * bây giờ. Cùng lý do và cùng cách làm như `tuTinhAutoValuation` ở trên (gọi ĐÚNG các
     * hàm thuần của fundHoldings.ts, không chép lại phép tính), nhưng theo từng bước của
     * supabase/functions/fund-refresh/index.ts — bản quỹ có SÁU chốt bỏ qua, một chốt
     * không có ở bản cổ phiếu.
     */
    function tuTinhAutoValuationQuy(
      a: AccountRow,
    ): { valued_on: string; market_value: number; source: 'auto' } | null {
      if (a.type !== 'investment' || a.currency !== 'JPY' || a.is_archived) return null

      const trades = (db.fundTrades ?? []).filter((t) => t.account_id === a.id).map(asFundTrade)
      if (trades.length === 0) return null

      // ① Trộn hai hệ đơn vị (口数 của quỹ và số cổ của cổ phiếu) là cộng sai; im lặng
      //    cộng sai còn tệ hơn bỏ qua.
      if (stockTrades.some((t) => t.account_id === a.id)) return null

      const { holdings, oversold } = fundHoldingsFromTrades(trades)
      // ② Sổ lệnh có lỗ hổng: giữ số cũ, không ghi số biết là sai.
      if (oversold.length > 0) return null

      // Ngày phiên tính TRÊN QUỸ ĐANG GIỮ, không trên cả bảng giá — xem sessionNavs().
      const {
        session: phien,
        navByFund,
        staleFunds,
      } = sessionNavs(
        db.fundPrices ?? [],
        holdings.map((h) => h.assocFundCd),
      )
      // ③ Bảng giá rỗng.
      if (!phien) return null
      // ④ Quỹ đang giữ mà giá còn ở phiên cũ hơn: giá vẫn > 0 nên fundValue không tự phát
      //    hiện được, phải chặn ở đây kẻo ghi số dùng giá hôm kia mà đóng dấu "hôm nay".
      if (holdings.some((h) => staleFunds.has(h.assocFundCd))) return null

      const { marketValue, missingNavs } = fundValue(holdings, navByFund)
      // ⑤ Thiếu giá MỘT PHẦN cũng phải bỏ, không chỉ khi thiếu giá MỌI quỹ — chốt này
      //    KHÔNG có ở bản cổ phiếu. Giữ hai quỹ mà mất giá một quỹ là lệch cỡ 40%, lại
      //    đóng dấu 'auto' trông như đúng. Xem fund-refresh/index.ts.
      if (missingNavs.length > 0 || marketValue === null) return null

      // ⑥ Cron cũng bỏ qua nếu `manual` row đã tồn tại cùng ngày (`nguoi-dung-da-go-tay`),
      //    nhưng chốt này không kiểm tra ở đây. latestValuation dưới đảm bảo `manual`
      //    luôn thắng `auto` cùng ngày, nên kiểm tra lại ở đây là trùng lặp quy tắc.

      return { valued_on: phien, market_value: marketValue, source: 'auto' }
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
        // Hai loại tài khoản đầu tư, hai cron thật, hai hàm mô phỏng. Chọn theo loại tiền
        // giống cách AccountDetailPage và trang Đầu tư chọn engine.
        const synthetic =
          a.currency === 'JPY'
            ? tuTinhAutoValuationQuy(a)
            : tuTinhAutoValuation(a, balance)
        return {
          id: a.id,
          user_id: a.user_id,
          name: a.name,
          type: a.type,
          currency: a.currency,
          asset_group: a.asset_group ?? null,
          is_hidden: a.is_hidden ?? false,
          include_in_totals: a.include_in_totals ?? true,
          is_liquid: a.is_liquid ?? null,
          credit_limit: a.credit_limit ?? null,
          statement_day: a.statement_day ?? null,
          payment_due_day: a.payment_due_day ?? null,
          payment_account_id: a.payment_account_id ?? null,
          cash_account_id: a.cash_account_id ?? null,
          is_archived: a.is_archived,
          sort_order: a.sort_order,
          cost_basis: a.initial_balance,
          depreciation_months: a.depreciation_months ?? null,
          depreciation_from: a.depreciation_from ?? null,
          salvage_value: a.salvage_value ?? 0,
          tax_shelter: a.tax_shelter ?? null,
          shelter_annual_limit: a.shelter_annual_limit ?? null,
          last_reconciled_at: a.last_reconciled_at ?? null,
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
      recurring_rule_id: input.recurring_rule_id ?? null,
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

  async setTransactionsCategory(ids: string[], categoryId: string | null) {
    if (ids.length === 0) return
    const db = load()
    const hit = new Set(ids)
    db.transactions = db.transactions.map((t) =>
      hit.has(t.id) ? { ...t, category_id: categoryId } : t,
    )
    save(db)
  },

  async addTagToTransactions(ids: string[], tagId: string) {
    if (ids.length === 0) return
    const db = load()
    const links = db.transactionTags ?? []
    // Bỏ qua khoản đã mang nhãn này — GẮN THÊM, không nhân đôi liên kết.
    const daCo = new Set(links.filter((l) => l.tag_id === tagId).map((l) => l.transaction_id))
    const them = ids
      .filter((id) => !daCo.has(id))
      .map((transaction_id) => ({ transaction_id, tag_id: tagId }))
    db.transactionTags = [...links, ...them] as typeof links
    save(db)
  },

  async createAccount(input: NewAccount) {
    const db = load()
    const sort_order = db.accounts.reduce((m, a) => Math.max(m, a.sort_order + 1), 0)
    const row: AccountRow = {
      ...input,
      is_liquid: input.is_liquid ?? null,
      last_reconciled_at: null,
      credit_limit: input.credit_limit ?? null,
      statement_day: input.statement_day ?? null,
      payment_due_day: input.payment_due_day ?? null,
      payment_account_id: input.payment_account_id ?? null,
      cash_account_id: input.cash_account_id ?? null,
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
    if ((db.fundTrades ?? []).some((t) => t.account_id === id))
      throw new Error('Không xóa được: còn sổ lệnh quỹ của tài khoản này.')
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
    dongBoDongTienLenh(db, row)
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
    dongBoDongTienLenh(db, next)
    save(db)
    return next
  },

  async deleteStockTrade(id: string) {
    const db = load()
    db.stockTrades = (db.stockTrades ?? []).filter((t) => t.id !== id)
    // Khớp FK `on delete cascade` của migration 0054 — bản thật không cần ai nhớ dọn.
    db.transactions = db.transactions.filter((t) => t.stock_trade_id !== id)
    save(db)
  },

  async countStockTradesWithoutTransfer() {
    return thieuDongTien(load()).length
  },

  async backfillStockTradeTransfers() {
    const db = load()
    const thieu = thieuDongTien(db)
    for (const { tradeId, tx } of thieu) {
      db.transactions.push({
        ...tx,
        id: uuid(),
        user_id: DEMO_USER,
        recurring_rule_id: null,
        stock_trade_id: tradeId,
        created_at: nowISO(),
        updated_at: nowISO(),
      })
    }
    if (thieu.length > 0) save(db)
    return thieu.length
  },

  async getFunds() {
    return (load().funds ?? [])
      .slice()
      .sort((a, b) => a.assoc_fund_cd.localeCompare(b.assoc_fund_cd))
  },

  async updateFundExpenseRatio(assocFundCd: string, ppm: number | null) {
    const db = load()
    const f = (db.funds ?? []).find((x) => x.assoc_fund_cd === assocFundCd)
    if (f) {
      f.expense_ratio_ppm = ppm
      save(db)
    }
  },

  async getFundPrices() {
    return (load().fundPrices ?? [])
      .slice()
      .sort((a, b) => a.assoc_fund_cd.localeCompare(b.assoc_fund_cd))
  },

  async getFundTrades() {
    return (load().fundTrades ?? [])
      .slice()
      .sort(
        (a, b) =>
          b.traded_on.localeCompare(a.traded_on) || b.created_at.localeCompare(a.created_at),
      )
  },

  async createFundTrade(input: NewFundTrade) {
    assertFundTradeShape(input)
    const db = load()
    db.fundTrades ??= []
    const row: FundTradeRow = {
      id: uuid(),
      user_id: DEMO_USER,
      account_id: input.account_id,
      assoc_fund_cd: input.assoc_fund_cd.trim(),
      kind: input.kind,
      traded_on: input.traded_on,
      units: input.units,
      nav: input.nav,
      amount: input.amount,
      bucket: input.bucket,
      note: input.note,
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    db.fundTrades.push(row)
    save(db)
    return row
  },

  async updateFundTrade(id: string, patch: FundTradePatch) {
    const db = load()
    db.fundTrades ??= []
    const idx = db.fundTrades.findIndex((t) => t.id === id)
    if (idx < 0) throw new Error('Không tìm thấy lệnh quỹ này.')
    const current = db.fundTrades[idx]
    const next: FundTradeRow = {
      ...current,
      assoc_fund_cd:
        patch.assoc_fund_cd !== undefined ? patch.assoc_fund_cd.trim() : current.assoc_fund_cd,
      kind: patch.kind ?? current.kind,
      traded_on: patch.traded_on ?? current.traded_on,
      units: patch.units ?? current.units,
      nav: patch.nav ?? current.nav,
      amount: patch.amount ?? current.amount,
      bucket: patch.bucket ?? current.bucket,
      note: patch.note ?? current.note,
      updated_at: nowISO(),
    }
    // Soi hình dạng SAU khi trộn patch, y như CHECK của Postgres soi dòng kết quả — sửa
    // lệnh có thể đổi cả kind lẫn nav/amount, chỉ soi lúc tạo là không đủ.
    assertFundTradeShape(next)
    db.fundTrades[idx] = next
    save(db)
    return next
  },

  async deleteFundTrade(id: string) {
    const db = load()
    db.fundTrades = (db.fundTrades ?? []).filter((t) => t.id !== id)
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

  async listTrips() {
    return (load().trips ?? []).slice().sort((a, b) => a.start_on.localeCompare(b.start_on))
  },

  async createTrip(input: NewTrip) {
    const db = load()
    db.trips ??= []
    const row: TripRow = {
      id: uuid(),
      user_id: DEMO_USER,
      start_on: input.start_on,
      end_on: input.end_on,
      label: input.label ?? '',
      country: input.country ?? 'VN',
      dismissed: input.dismissed ?? false,
      created_at: nowISO(),
    }
    db.trips.push(row)
    save(db)
    return row
  },

  async deleteTrip(id: string) {
    const db = load()
    db.trips = (db.trips ?? []).filter((t) => t.id !== id)
    save(db)
  },

  async getRelatives() {
    return (load().relatives ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)
  },

  async createRelative(input: NewRelative) {
    const db = load()
    db.relatives ??= []
    const sort_order = db.relatives.reduce((m, r) => Math.max(m, r.sort_order + 1), 0)
    const row: RelativeRow = {
      id: uuid(),
      user_id: DEMO_USER,
      name: input.name,
      birth_year: input.birth_year,
      relationship: input.relationship,
      country: input.country ?? 'VN',
      is_archived: false,
      sort_order,
      created_at: nowISO(),
    }
    db.relatives.push(row)
    save(db)
    return row
  },

  async updateRelative(id: string, patch: RelativePatch) {
    const db = load()
    db.relatives ??= []
    const idx = db.relatives.findIndex((r) => r.id === id)
    if (idx < 0) throw new Error('Không tìm thấy người thân')
    db.relatives[idx] = { ...db.relatives[idx], ...patch }
    save(db)
    return db.relatives[idx]
  },

  async listBenefitTransactions({ start, end }: DateRange, filter: BenefitTxFilter) {
    const cats = new Set(filter.categoryIds)
    const accs = new Set(filter.toAccountIds)
    return load()
      .transactions.filter(
        (t) =>
          t.occurred_on >= start &&
          t.occurred_on < end &&
          (t.is_remittance === true ||
            (t.category_id != null && cats.has(t.category_id)) ||
            (t.to_account_id != null && accs.has(t.to_account_id))),
      )
      .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.id.localeCompare(b.id))
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

  async traSo(_van: string, tien: CurrencyCode) {
    // Bản demo không gọi mạng và không có khoá. Trả một kết quả mẫu để người xem thấy
    // ĐÚNG luồng. Số gốc (¥1.100.000 / 1.700.000 / 3.400.000) là số thật đã tra cho JPY
    // (ゼクシィ 2024) — nhưng `docKetQua` (traSoKetQua.ts) từ chối nếu `tien` trả về khác
    // đồng của chặng đang hỏi, nên phải trả ĐÚNG `tien` nhận vào, không được ghim cứng
    // 'JPY'. Không tra số thật cho VND/USD ở đây (bản demo không gọi mạng để tra); khi
    // `tien` khác JPY thì độ lớn dưới đây KHÔNG có nghĩa — `dien_giai` nói rõ điều đó
    // thay vì giả vờ đây là một con số đã tra cho đồng đó.
    return {
      khong_biet: false,
      tien,
      thap: 1_100_000,
      giua: 1_700_000,
      cao: 3_400_000,
      dien_giai:
        tien === 'JPY'
          ? 'Tổng chi phí trung bình ¥3.439.000 cho 52 khách, đã trừ ご祝儀 ước tính để ra ' +
            'số thực móc ra. (Bản demo: kết quả mẫu, không gọi mạng.)'
          : `(Bản demo: kết quả mẫu cố định theo JPY, không gọi mạng — số hiển thị KHÔNG ` +
            `phải số đã tra cho ${tien}, chỉ để xem đúng luồng.)`,
      canh_bao: [
        'Khảo sát 2025 đổi cách đo — số mới ¥2.986.000 không so trực tiếp được với 2024.',
        'Khoảng phổ biến nhất chỉ chiếm 18,6%, nên đây là dải rộng.',
      ],
      nguon: { ten: 'ゼクシィ結婚トレンド調査', url: 'https://souken.zexy.net/', nam: 2024 },
    }
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

  async getHealthSnapshots() {
    return (load().healthSnapshots ?? [])
      .slice()
      .sort((a, b) => a.month_on.localeCompare(b.month_on))
  },

  async upsertHealthSnapshot(monthOn: string, score: number, coverageBps: number) {
    const db = load()
    db.healthSnapshots ??= []
    const existing = db.healthSnapshots.find((x) => x.month_on === monthOn)
    if (existing) {
      existing.score = score
      existing.coverage_bps = coverageBps
      existing.updated_at = nowISO()
      save(db)
      return existing
    }
    const row: HealthSnapshotRow = {
      id: uuid(),
      user_id: DEMO_USER,
      month_on: monthOn,
      score,
      coverage_bps: coverageBps,
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    db.healthSnapshots.push(row)
    save(db)
    return row
  },

  async getLifetimeVerdictSnapshots(scenarioId: string) {
    return (load().lifetimeVerdictSnapshots ?? [])
      .filter((v) => v.scenario_id === scenarioId)
      .sort((a, b) => a.month_on.localeCompare(b.month_on))
  },

  async upsertLifetimeVerdictSnapshot(input: NewLifetimeVerdictSnapshot) {
    const db = load()
    db.lifetimeVerdictSnapshots ??= []
    const existing = db.lifetimeVerdictSnapshots.find(
      (v) => v.scenario_id === input.scenario_id && v.month_on === input.month_on,
    )
    if (existing) {
      Object.assign(existing, input, { updated_at: nowISO() })
      save(db)
      return existing
    }
    const row: LifetimeVerdictSnapshotRow = {
      id: uuid(),
      user_id: DEMO_USER,
      ...input,
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    db.lifetimeVerdictSnapshots.push(row)
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

  async listFxHistory(from: string, to: string) {
    // Bản demo tự sinh tỷ giá từng ngày (xấp xỉ mức các dòng gửi tiền demo dùng:
    // 160 + dao động nhỏ) để các thẻ đọc lịch sử tỷ giá có gì mà hiện; dòng đã ghi
    // bằng recordFxRates thì thắng dòng tự sinh cùng ngày.
    const db = load()
    const stored = new Map((db.fxHistory ?? []).map((r) => [r.on_date, r]))
    const out: FxHistoryRow[] = []
    const start = new Date(`${from}T00:00:00Z`)
    const end = new Date(`${to}T00:00:00Z`)
    for (let d = start; d <= end; d = new Date(d.getTime() + 86_400_000)) {
      const iso = d.toISOString().slice(0, 10)
      const hit = stored.get(iso)
      if (hit) {
        out.push(hit)
        continue
      }
      const wobble = d.getUTCDate() % 7
      out.push({
        user_id: DEMO_USER,
        on_date: iso,
        base: 'JPY',
        rates: { VND: 160 + wobble, USD: 0.0063 },
      })
    }
    return out
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
      // Cùng quy ước với trigger `mark_transfer_categories` của migration 0046: hai danh
      // mục bút toán này là chuyển tài sản, không phải chi tiêu.
      kind:
        input.kind ??
        (input.name === 'Gửi tiền về VN' || input.name === 'Điều chỉnh số dư'
          ? 'transfer'
          : 'expense'),
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

  async getMonthPlan(monthKey: string) {
    return (load().monthPlans ?? []).find((p) => p.month_key === monthKey) ?? null
  },

  async upsertMonthPlan(monthKey: string, expectedIncome: number) {
    // Chặn số âm ở đây vì demoRepo KHÔNG có CHECK của Postgres — bản demo là chỗ
    // người ta thử app lần đầu, để nó nhận -5.000 rồi vẽ ra kế hoạch vô nghĩa thì
    // lỗi hiện ra ở tận chỗ khác. Xem ghi chú "demo mode không kiểm ràng buộc".
    if (!Number.isFinite(expectedIncome) || expectedIncome < 0) {
      throw new Error('Thu dự kiến không được là số âm')
    }
    const db = load()
    db.monthPlans ??= []
    const existing = db.monthPlans.find((p) => p.month_key === monthKey)
    if (existing) {
      existing.expected_income = expectedIncome
      existing.updated_at = nowISO()
      save(db)
      return existing
    }
    const row: MonthPlanRow = {
      id: uuid(),
      user_id: DEMO_USER,
      month_key: monthKey,
      expected_income: expectedIncome,
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    db.monthPlans.push(row)
    save(db)
    return row
  },

  async deleteMonthPlan(monthKey: string) {
    const db = load()
    db.monthPlans = (db.monthPlans ?? []).filter((p) => p.month_key !== monthKey)
    save(db)
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
      // Đọc THẲNG như interest_bps, không dựa vào `...debtFields`: NewDebt khai hai cột
      // này là tuỳ chọn, nên vắng mặt thì bản ghi thiếu hẳn khóa — localStorage giữ
      // nguyên `undefined`, và mọi chỗ đọc `origin` sau này so với undefined thay vì
      // null. Bản thật (Postgres) mặc định null, nên để vậy là demo lệch bản thật.
      origin: input.origin ?? null,
      income_category_id: input.income_category_id ?? null,
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
      // Cách ghi đọc từ KHOẢN NỢ, không từ người gọi: khoản `origin = 'earned'` (tiền
      // công) thì lần trả là THU thật, còn lại là dòng tiền nợ như cũ. Xem
      // debtPaymentPosting — một chỗ cho cả hai cửa ghi và cả hai repo.
      const debt = (db.debts ?? []).find((d) => d.id === input.debt_id)
      const post = debtPaymentPosting(debt, input.transaction.category_id)
      const tx: TransactionRow = {
        ...input.transaction,
        category_id: post.categoryId,
        is_debt_flow: post.isDebtFlow,
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
    return (load().recurringRules ?? [])
      // mode/remind_days_before thêm ở 0037 → db demo cũ chưa có cột. Mặc định phải
      // là hành vi CŨ ('auto'), không phải im lặng ngừng sinh giao dịch.
      .map((r) => ({
        ...r,
        mode: r.mode ?? ('auto' as const),
        remind_days_before: r.remind_days_before ?? 0,
      }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
  },

  async createRecurringRule(input: NewRecurringRule) {
    const db = load()
    db.recurringRules ??= []
    // tag_ids là bảng nối riêng (migration 0042), không phải cột của quy tắc
    const { tag_ids, ...fields } = input
    const row: RecurringRuleRow = {
      ...fields,
      id: uuid(),
      user_id: DEMO_USER,
      is_paused: false,
      last_generated_on: null,
      // Ràng buộc DB (0043): cờ hoàn tiền chỉ có nghĩa với CHI.
      is_refund: fields.type === 'expense' && fields.is_refund === true,
      mode: input.mode ?? 'auto',
      remind_days_before: input.remind_days_before ?? 0,
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    db.recurringRules.push(row)
    db.recurringRuleTags ??= []
    for (const tagId of tag_ids ?? []) {
      db.recurringRuleTags.push({ rule_id: row.id, tag_id: tagId, user_id: DEMO_USER })
    }
    save(db)
    return row
  },

  async updateRecurringRule(id: string, patch: RecurringRulePatch) {
    const db = load()
    db.recurringRules ??= []
    const idx = db.recurringRules.findIndex((r) => r.id === id)
    if (idx < 0) throw new Error('Không tìm thấy quy tắc định kỳ')
    // Bỏ trống tag_ids = KHÔNG đụng tới nhãn; mảng rỗng = bỏ hết nhãn.
    const { tag_ids, ...fields } = patch
    if (tag_ids) {
      db.recurringRuleTags = (db.recurringRuleTags ?? []).filter((l) => l.rule_id !== id)
      for (const tagId of tag_ids) {
        db.recurringRuleTags.push({ rule_id: id, tag_id: tagId, user_id: DEMO_USER })
      }
    }
    db.recurringRules[idx] = { ...db.recurringRules[idx], ...fields, updated_at: nowISO() }
    save(db)
    return db.recurringRules[idx]
  },

  async deleteRecurringRule(id: string) {
    const db = load()
    db.recurringRules = (db.recurringRules ?? []).filter((r) => r.id !== id)
    // Postgres có `on delete cascade`; bản demo phải tự dọn liên kết.
    db.recurringRuleTags = (db.recurringRuleTags ?? []).filter((l) => l.rule_id !== id)
    // Khớp FK on delete set null: giao dịch đã sinh giữ nguyên, chỉ mất liên kết
    db.transactions = db.transactions.map((t) =>
      t.recurring_rule_id === id ? { ...t, recurring_rule_id: null } : t,
    )
    save(db)
  },

  async listRecurringRuleTags() {
    return load().recurringRuleTags ?? []
  },

  async setRecurringRuleTags(ruleId: string, tagIds: string[]) {
    const db = load()
    db.recurringRuleTags = (db.recurringRuleTags ?? []).filter((l) => l.rule_id !== ruleId)
    for (const tagId of tagIds) {
      db.recurringRuleTags.push({ rule_id: ruleId, tag_id: tagId, user_id: DEMO_USER })
    }
    save(db)
  },

  async insertRecurringOccurrence(input: NewRecurringOccurrence) {
    const db = load()
    // Tự kiểm tra trùng (thay cho partial unique index phía Postgres)
    const dup = db.transactions.some(
      (t) => t.recurring_rule_id === input.recurring_rule_id && t.occurred_on === input.occurred_on,
    )
    if (dup) return false
    const id = uuid()
    db.transactions.push({
      ...input,
      id,
      user_id: DEMO_USER,
      created_at: nowISO(),
      updated_at: nowISO(),
    })
    // Nhãn của quy tắc đi theo từng kỳ nó sinh ra (migration 0042)
    db.transactionTags ??= []
    for (const l of db.recurringRuleTags ?? []) {
      if (l.rule_id === input.recurring_rule_id) {
        db.transactionTags.push({ transaction_id: id, tag_id: l.tag_id, user_id: DEMO_USER })
      }
    }
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
      // is_archived thêm sau (migration 0033), budget_* thêm sau nữa (0036),
      // group_id sau nữa (0039) → db demo cũ chưa có cột, ép về mặc định thay vì
      // để undefined lọt lên tầng trên
      .map((t) => ({
        ...t,
        is_archived: t.is_archived ?? false,
        budget_amount: t.budget_amount ?? null,
        budget_period: t.budget_period ?? 'total',
        group_id: t.group_id ?? null,
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
        category_id: t.category_id ?? null,
      })
    }
    return out
  },

  async getPlannedExpenses() {
    return (load().plannedExpenses ?? [])
      .slice()
      .sort(
        (a: PlannedExpenseRow, b: PlannedExpenseRow) =>
          a.due_on.localeCompare(b.due_on) || a.created_at.localeCompare(b.created_at),
      )
  },

  async listPlannedExpenseTags() {
    return load().plannedExpenseTags ?? []
  },

  async setPlannedExpenseTags(plannedId: string, tagIds: string[]) {
    const db = load()
    db.plannedExpenseTags = (db.plannedExpenseTags ?? []).filter((l) => l.planned_id !== plannedId)
    for (const tagId of tagIds) {
      db.plannedExpenseTags.push({ planned_id: plannedId, tag_id: tagId, user_id: DEMO_USER })
    }
    save(db)
  },

  async createPlannedExpense(input: NewPlannedExpense) {
    const db = load()
    db.plannedExpenses ??= []
    const row: PlannedExpenseRow = {
      id: uuid(),
      user_id: DEMO_USER,
      title: input.title,
      amount: input.amount,
      currency: input.currency,
      due_on: input.due_on,
      due_precision: input.due_precision ?? 'day',
      remind_days_before: input.remind_days_before ?? null,
      category_id: input.category_id ?? null,
      account_id: input.account_id ?? null,
      status: 'planned',
      transaction_id: null,
      note: input.note ?? '',
      created_at: nowISO(),
      updated_at: nowISO(),
    }
    db.plannedExpenses.push(row)
    db.plannedExpenseTags ??= []
    for (const tagId of input.tag_ids ?? []) {
      db.plannedExpenseTags.push({ planned_id: row.id, tag_id: tagId, user_id: DEMO_USER })
    }
    save(db)
    return row
  },

  async updatePlannedExpense(id: string, patch: PlannedExpensePatch) {
    const db = load()
    db.plannedExpenses ??= []
    const idx = db.plannedExpenses.findIndex((p) => p.id === id)
    if (idx < 0) throw new Error('Không tìm thấy khoản sắp chi')
    // Bỏ trống tag_ids = KHÔNG đụng tới nhãn; mảng rỗng = bỏ hết nhãn.
    const { tag_ids, ...fields } = patch
    if (tag_ids) {
      db.plannedExpenseTags = (db.plannedExpenseTags ?? []).filter((l) => l.planned_id !== id)
      for (const tagId of tag_ids) {
        db.plannedExpenseTags.push({ planned_id: id, tag_id: tagId, user_id: DEMO_USER })
      }
    }
    db.plannedExpenses[idx] = { ...db.plannedExpenses[idx], ...fields, updated_at: nowISO() }
    save(db)
    return db.plannedExpenses[idx]
  },

  async deletePlannedExpense(id: string) {
    const db = load()
    db.plannedExpenses = (db.plannedExpenses ?? []).filter((p) => p.id !== id)
    // Postgres có `on delete cascade`; bản demo phải tự dọn liên kết.
    db.plannedExpenseTags = (db.plannedExpenseTags ?? []).filter((l) => l.planned_id !== id)
    save(db)
  },

  async getTagGroups() {
    return [...(load().tagGroups ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  },

  async createTagGroup(input: NewTagGroup) {
    const db = load()
    db.tagGroups ??= []
    const name = input.name.trim()
    // Postgres có unique(user_id, name); demoRepo không thực thi ràng buộc nào nên
    // phải tự chặn, không thì "thử ở demo thấy chạy" không nói gì về bản thật.
    if (db.tagGroups.some((g) => g.name === name)) throw new Error(`Nhóm "${name}" đã tồn tại`)
    const row: TagGroupRow = {
      id: uuid(),
      user_id: DEMO_USER,
      name,
      sort_order: db.tagGroups.reduce((m, g) => Math.max(m, g.sort_order + 1), 0),
      created_at: nowISO(),
    }
    db.tagGroups.push(row)
    save(db)
    return row
  },

  async updateTagGroup(id: string, patch: TagGroupPatch) {
    const db = load()
    db.tagGroups ??= []
    const idx = db.tagGroups.findIndex((g) => g.id === id)
    if (idx < 0) throw new Error('Không tìm thấy nhóm nhãn')
    const name = patch.name?.trim()
    if (name && db.tagGroups.some((g) => g.id !== id && g.name === name))
      throw new Error(`Nhóm "${name}" đã tồn tại`)
    db.tagGroups[idx] = { ...db.tagGroups[idx], ...patch, ...(name ? { name } : {}) }
    save(db)
    return db.tagGroups[idx]
  },

  async deleteTagGroup(id: string) {
    const db = load()
    db.tagGroups = (db.tagGroups ?? []).filter((g) => g.id !== id)
    // Bắt chước `on delete set null` của FK: nhãn ở lại, chỉ rơi ra khỏi nhóm.
    db.tags = (db.tags ?? []).map((t) => (t.group_id === id ? { ...t, group_id: null } : t))
    save(db)
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
      group_id: input.group_id ?? null,
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
      fundTrades: db.fundTrades ?? [],
      savingsGoals: db.savingsGoals ?? [],
      relatives: db.relatives ?? [],
      trips: db.trips ?? [],
      networthSnapshots: db.networthSnapshots ?? [],
      healthSnapshots: db.healthSnapshots ?? [],
      lifetimeVerdictSnapshots: db.lifetimeVerdictSnapshots ?? [],
      tagGroups: db.tagGroups ?? [],
      tags: db.tags ?? [],
      transactionTags: db.transactionTags ?? [],
      lifeScenarios: db.lifeScenarios ?? [],
      lifePhases: db.lifePhases ?? [],
      lifeEvents: db.lifeEvents ?? [],
      monthPlans: db.monthPlans ?? [],
      recurringRuleTags: db.recurringRuleTags ?? [],
      plannedExpenses: db.plannedExpenses ?? [],
      plannedExpenseTags: db.plannedExpenseTags ?? [],
    }
  },

  // --- Nhập phiếu lương 給与明細 (Task 7) ---
  // Rỗng là đủ cho chế độ demo: bản demo không có tài khoản Yucho Bank thật, nên trang
  // nhập tự hiện "Không tìm thấy tài khoản Yucho Bank" trước khi hai hàm này được gọi.
  async listYuchoIncome() {
    return []
  },
  async listDauPhieuLuong() {
    return []
  },
  async xoaPhieuLuong() {
    return { dong: 0, neo: 0, traNo: 0 }
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
        // Cột của migration 0040 — bản lưu xuất trước đó không có nó.
        density_pref: parseDensity(data.profile.density_pref),
        // Cột của migration 0056 — bản lưu xuất trước đó không có nó.
        fuyo_claimed_years: data.profile.fuyo_claimed_years ?? [],
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
      fundTrades: stamp(data.fundTrades ?? []),
      stockPrices,
      savingsGoals: stamp(data.savingsGoals ?? []),
      relatives: stamp(data.relatives ?? []),
      trips: stamp(data.trips ?? []),
      networthSnapshots: stamp(data.networthSnapshots ?? []),
      healthSnapshots: stamp(data.healthSnapshots ?? []),
      lifetimeVerdictSnapshots: stamp(data.lifetimeVerdictSnapshots ?? []),
      tagGroups: stamp(data.tagGroups ?? []),
      tags: stamp(data.tags ?? []),
      transactionTags: stamp(data.transactionTags ?? []),
      lifeScenarios: stamp(data.lifeScenarios ?? []),
      lifePhases: stamp(data.lifePhases ?? []),
      lifeEvents: stamp(data.lifeEvents ?? []),
      monthPlans: stamp(data.monthPlans ?? []),
      recurringRuleTags: data.recurringRuleTags ?? [],
      plannedExpenses: stamp(data.plannedExpenses ?? []),
      plannedExpenseTags: data.plannedExpenseTags ?? [],
    }
    save(db)
  },
}
