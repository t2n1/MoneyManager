import { normalizeText } from '../features/transactions/filter'
import { addMonths, monthKeyString, parseMonthKey } from '../lib/dates'
import type { CurrencyCode } from '../lib/money'
import type { Rates } from '../lib/rates'
import { parseDensity } from '../lib/density'
import { getSupabase } from '../lib/supabase'
import { IMPORT_CHUNK_SIZE, chunk, validateBackupPayload } from './backupImport'
import { pageOrderFor, type DataTable } from './exportTables'
import { fetchAllPages, type Page } from './paging'
import type {
  AccountRow,
  AccountValuationRow,
  AssetGroupSettingRow,
  BudgetRow,
  CategoryRow,
  CategoryType,
  DebtPaymentRow,
  DebtRow,
  LifeEventRow,
  LifePhaseRow,
  LifeScenarioRow,
  MonthPlanRow,
  NetWorthSnapshotRow,
  NotificationStateRow,
  RecurringRuleRow,
  RecurringRuleTagRow,
  PlannedExpenseTagRow,
  PlannedExpenseRow,
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
  type NewPlannedExpense,
  type NewTag,
  type NewTagGroup,
  type PlannedExpensePatch,
  type NewTransaction,
  type NewValuation,
  type ProfilePatch,
  type RecurringRulePatch,
  type Repo,
  type SavingsGoalPatch,
  type StockTradePatch,
  type TagGroupPatch,
  type TagPatch,
  type TransactionPatch,
  type TxFilter,
} from './repo'

// Repo thật: mọi bảo mật nằm ở RLS phía Postgres.

/** Bỏ `tag_ids` (bảng liên kết riêng) để payload chỉ còn cột thật của transactions. */
function txColumns<T extends { tag_ids?: string[] }>(input: T): Omit<T, 'tag_ids'> {
  const { tag_ids: _drop, ...rest } = input
  return rest
}

async function currentUserId(): Promise<string> {
  const {
    data: { user },
  } = await getSupabase().auth.getUser()
  if (!user) throw new Error('Chưa đăng nhập')
  return user.id
}

/** sort_order kế tiếp = max hiện có + 1 (RLS đã giới hạn theo user). */
async function nextSortOrder(
  table: 'accounts' | 'categories',
  type?: CategoryType,
): Promise<number> {
  const base = getSupabase()
    .from(table)
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
  const { data } = await (type ? base.eq('type', type) : base)
  return (data?.[0]?.sort_order ?? -1) + 1
}

/** Thứ tự kế tiếp cho nhãn (bảng tags không có cột `type` nên tách khỏi nextSortOrder). */
async function nextTagSortOrder(): Promise<number> {
  const { data } = await getSupabase()
    .from('tags')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
  return (data?.[0]?.sort_order ?? -1) + 1
}

export const supabaseRepo: Repo = {
  async getProfile() {
    const { data, error } = await getSupabase().from('profiles').select('*').single()
    if (error) throw error
    return data
  },

  async updateProfile(patch: ProfilePatch) {
    const uid = await currentUserId()
    const { data, error } = await getSupabase()
      .from('profiles')
      .update(patch)
      .eq('user_id', uid)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getAccounts() {
    const { data, error } = await getSupabase()
      .from('accounts')
      .select('*')
      .order('sort_order')
    if (error) throw error
    return data
  },

  async getAccountBalances() {
    const { data, error } = await getSupabase()
      .from('account_balances')
      .select('*')
      .order('sort_order')
    if (error) throw error
    return data
  },

  async getCategories() {
    const { data, error } = await getSupabase()
      .from('categories')
      .select('*')
      .order('sort_order')
    if (error) throw error
    return data
  },

  async listTransactions({ start, end }) {
    // Phân trang: khoảng thời gian rộng (báo cáo năm/nhiều năm) vượt 1.000 dòng là
    // Supabase cắt im lặng. `id` làm chốt sắp xếp cuối để trang không lặp/sót.
    return await fetchAllPages<TransactionRow>(async (from, to) =>
      getSupabase()
        .from('transactions')
        .select('*')
        .gte('occurred_on', start)
        .lt('occurred_on', end)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
    )
  },

  async searchTransactions(filter: TxFilter) {
    // Dựng lại truy vấn cho TỪNG trang: builder của supabase-js là đối tượng có trạng thái,
    // gọi `.range()` nhiều lần trên cùng một cái là dựa vào chi tiết nội bộ của thư viện.
    const buildQuery = (from: number, to: number) => {
      let q = getSupabase()
        .from('transactions')
        .select('*')
        .gte('occurred_on', filter.start)
        .lt('occurred_on', filter.end)
      if (filter.types && filter.types.length > 0) q = q.in('type', filter.types)
      if (filter.categoryIds && filter.categoryIds.length > 0)
        q = q.in('category_id', filter.categoryIds)
      // `.is` chứ không `.in`: SQL không so NULL bằng IN được. Loại chuyển khoản để
      // khớp với `matchesFilter` phía demo và với bảng đếm ở reports/uncategorized.ts.
      if (filter.uncategorized === true) q = q.is('category_id', null).neq('type', 'transfer')
      if (filter.accountIds && filter.accountIds.length > 0) {
        const ids = filter.accountIds.map((id) => `"${id}"`).join(',')
        q = q.or(`account_id.in.(${ids}),to_account_id.in.(${ids})`)
      }
      if (filter.amountMin != null) q = q.gte('amount', filter.amountMin)
      if (filter.amountMax != null) q = q.lte('amount', filter.amountMax)
      return q
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to)
    }
    // Phân trang: tìm kiếm trên khoảng rộng (sau khi nạp 9 năm lịch sử) dễ vượt 1.000 dòng.
    const data = await fetchAllPages<TransactionRow>(async (from, to) => buildQuery(from, to))
    // Khớp text ở client bằng normalizeText: ilike của Postgres phân biệt dấu
    // tiếng Việt nên sẽ lệch kết quả so với demoRepo ("com trua" ≠ "Cơm trưa").
    const text = filter.text?.trim()
    if (!text) return data
    const needle = normalizeText(text)
    return data.filter((t) => normalizeText(t.note).includes(needle))
  },

  async getTransaction(id: string) {
    const { data, error } = await getSupabase()
      .from('transactions')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async createTransaction(input: NewTransaction) {
    const user_id = await currentUserId()
    // tag_ids là bảng liên kết riêng, không phải cột của transactions
    const { tag_ids, ...fields } = input
    const { data, error } = await getSupabase()
      .from('transactions')
      .insert({ ...fields, user_id })
      .select()
      .single()
    if (error) throw error
    if (tag_ids?.length) await this.setTransactionTags(data.id, tag_ids)
    return data
  },

  async updateTransaction(id: string, patch: TransactionPatch) {
    const { tag_ids, ...fields } = patch
    const { data, error } = await getSupabase()
      .from('transactions')
      .update(fields)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    if (tag_ids) await this.setTransactionTags(id, tag_ids)
    return data
  },

  async deleteTransaction(id: string) {
    const { error } = await getSupabase().from('transactions').delete().eq('id', id)
    if (error) throw error
  },

  async deleteTransactions(ids: string[]) {
    if (ids.length === 0) return
    // Chia lô: `id=in.(...)` nằm trên query string nên danh sách quá dài (hàng nghìn
    // sau import) có thể vượt giới hạn độ dài URL. FK on delete của DB tự dọn nhãn liên
    // kết và set null debt_payments, y như xóa lẻ.
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100)
      const { error } = await getSupabase().from('transactions').delete().in('id', batch)
      if (error) throw error
    }
  },

  async createAccount(input: NewAccount) {
    const user_id = await currentUserId()
    const sort_order = await nextSortOrder('accounts')
    const { data, error } = await getSupabase()
      .from('accounts')
      .insert({ ...input, user_id, sort_order })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateAccount(id: string, patch: AccountPatch) {
    const { data, error } = await getSupabase()
      .from('accounts')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async reorderAccounts(orderedIds: string[]) {
    const results = await Promise.all(
      orderedIds.map((id, i) =>
        getSupabase().from('accounts').update({ sort_order: i }).eq('id', id),
      ),
    )
    for (const { error } of results) if (error) throw error
  },

  async deleteAccount(id: string) {
    const sb = getSupabase()
    const tx = await sb
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .or(`account_id.eq.${id},to_account_id.eq.${id}`)
    if (tx.error) throw tx.error
    if ((tx.count ?? 0) > 0)
      throw new Error('Không xóa được: còn giao dịch dùng tài khoản này. Hãy Lưu trữ thay vì Xóa.')

    const rr = await sb
      .from('recurring_rules')
      .select('id', { count: 'exact', head: true })
      .or(`account_id.eq.${id},to_account_id.eq.${id}`)
    if (rr.error) throw rr.error
    if ((rr.count ?? 0) > 0)
      throw new Error('Không xóa được: còn giao dịch định kỳ dùng tài khoản này. Hãy Lưu trữ thay vì Xóa.')

    const sg = await sb
      .from('savings_goals')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', id)
    if (sg.error) throw sg.error
    if ((sg.count ?? 0) > 0)
      throw new Error('Không xóa được: còn mục tiêu tiết kiệm gắn với tài khoản này.')

    const card = await sb
      .from('accounts')
      .select('id', { count: 'exact', head: true })
      .eq('payment_account_id', id)
    if (card.error) throw card.error
    if ((card.count ?? 0) > 0)
      throw new Error('Không xóa được: tài khoản này đang là nguồn trả cho một thẻ tín dụng.')

    const val = await sb
      .from('account_valuations')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', id)
    if (val.error) throw val.error
    if ((val.count ?? 0) > 0)
      throw new Error('Không xóa được: còn dữ liệu giá trị đầu tư của tài khoản này.')

    // stock_trades có `on delete cascade` ở DB (migration 0035) — không chặn ở đây thì
    // xoá tài khoản là XOÁ LUÔN sổ lệnh mà không ai hỏi, ngược hẳn với mọi bảng khác
    // ở trên (transactions, recurring_rules, …) đều báo lỗi thay vì âm thầm cascade.
    const st = await sb
      .from('stock_trades')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', id)
    if (st.error) throw st.error
    if ((st.count ?? 0) > 0)
      throw new Error('Không xóa được: còn sổ lệnh cổ phiếu của tài khoản này.')

    const { error } = await sb.from('accounts').delete().eq('id', id)
    if (error) throw error
  },

  async getAccountValuations() {
    // Phân trang: mỗi (tài khoản × ngày định giá) một dòng — cập nhật đều tay vài
    // tài khoản là vài năm vượt 1.000. Bị cắt là XIRR tính trên chuỗi thiếu điểm cũ.
    // `id` làm chốt sắp xếp cuối để trang không lặp/sót (valued_on không đơn trị).
    return await fetchAllPages<AccountValuationRow>(async (from, to) =>
      getSupabase()
        .from('account_valuations')
        .select('*')
        .order('valued_on', { ascending: false })
        .order('id')
        .range(from, to),
    )
  },

  async upsertValuation(input: NewValuation) {
    const user_id = await currentUserId()
    const { data, error } = await getSupabase()
      .from('account_valuations')
      .upsert(
        {
          user_id,
          account_id: input.account_id,
          valued_on: input.valued_on,
          market_value: input.market_value,
          note: input.note,
          // Người gõ tay luôn thắng (quyết định 4). Bắt buộc phải ghi rõ 'manual' ở ĐÂY
          // dù cột có default cùng giá trị: default chỉ áp dụng cho hàng MỚI — hàng đã
          // có sẵn (ví dụ cron vừa ghi 'auto' cho đúng ngày này) thì upsert là UPDATE,
          // default không chạy, và thiếu dòng này sẽ để nguyên 'auto' cũ. Lần cron chạy
          // kế tiếp sẽ thấy 'auto' và đè mất số người dùng vừa sửa.
          source: 'manual',
        },
        { onConflict: 'account_id,valued_on' },
      )
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteValuation(id: string) {
    const { error } = await getSupabase().from('account_valuations').delete().eq('id', id)
    if (error) throw error
  },

  async getStockPrices() {
    // Cả sàn HOSE đã 400+ mã, ba sàn thì vượt trần 1.000 của PostgREST → phải phân
    // trang, không thì bảng giá bị cắt và mã ở cuối bảng chữ cái mất giá im lặng.
    return await fetchAllPages<StockPriceRow>(async (from, to) =>
      getSupabase().from('stock_prices').select('*').order('symbol').range(from, to),
    )
  },

  async getStockTrades() {
    // `id` làm chốt sắp xếp cuối để hai trang liền nhau không lặp/sót (traded_on
    // không đơn trị — xem src/data/paging.ts).
    return await fetchAllPages<StockTradeRow>(async (from, to) =>
      getSupabase()
        .from('stock_trades')
        .select('*')
        .order('traded_on', { ascending: false })
        .order('id')
        .range(from, to),
    )
  },

  async createStockTrade(input: NewStockTrade) {
    const user_id = await currentUserId()
    const { data, error } = await getSupabase()
      .from('stock_trades')
      .insert({
        user_id,
        account_id: input.account_id,
        symbol: input.symbol.trim().toUpperCase(),
        kind: input.kind,
        traded_on: input.traded_on,
        quantity: input.quantity,
        price: input.price,
        fee: input.fee,
        tax: input.tax,
        note: input.note,
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateStockTrade(id: string, patch: StockTradePatch) {
    const { data, error } = await getSupabase()
      .from('stock_trades')
      .update({
        ...patch,
        ...(patch.symbol === undefined ? {} : { symbol: patch.symbol.trim().toUpperCase() }),
      })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteStockTrade(id: string) {
    const { error } = await getSupabase().from('stock_trades').delete().eq('id', id)
    if (error) throw error
  },

  async getSavingsGoals() {
    const { data, error } = await getSupabase()
      .from('savings_goals')
      .select('*')
      .order('sort_order')
    if (error) throw error
    return data
  },

  async createSavingsGoal(input: NewSavingsGoal) {
    const user_id = await currentUserId()
    const { data: existing } = await getSupabase()
      .from('savings_goals')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
    const sort_order = (existing?.[0]?.sort_order ?? -1) + 1
    const { data, error } = await getSupabase()
      .from('savings_goals')
      .insert({ ...input, user_id, sort_order })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateSavingsGoal(id: string, patch: SavingsGoalPatch) {
    const { data, error } = await getSupabase()
      .from('savings_goals')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteSavingsGoal(id: string) {
    const { error } = await getSupabase().from('savings_goals').delete().eq('id', id)
    if (error) throw error
  },

  async getLifeScenarios() {
    const { data, error } = await getSupabase()
      .from('life_scenarios')
      .select('*')
      .order('sort_order')
    if (error) throw error
    return data
  },

  async createLifeScenario(input: NewLifeScenario) {
    const user_id = await currentUserId()
    const { data: existing } = await getSupabase()
      .from('life_scenarios')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
    const sort_order = (existing?.[0]?.sort_order ?? -1) + 1
    const { data, error } = await getSupabase()
      .from('life_scenarios')
      .insert({ ...input, user_id, sort_order })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateLifeScenario(id: string, patch: LifeScenarioPatch) {
    const { data, error } = await getSupabase()
      .from('life_scenarios')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteLifeScenario(id: string) {
    const { error } = await getSupabase().from('life_scenarios').delete().eq('id', id)
    if (error) throw error
  },

  async getLifePhases() {
    const { data, error } = await getSupabase()
      .from('life_phases')
      .select('*')
      .order('start_year')
    if (error) throw error
    return data
  },

  async createLifePhase(input: NewLifePhase) {
    const user_id = await currentUserId()
    const { data, error } = await getSupabase()
      .from('life_phases')
      .insert({ ...input, user_id })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateLifePhase(id: string, patch: LifePhasePatch) {
    const { data, error } = await getSupabase()
      .from('life_phases')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteLifePhase(id: string) {
    const { error } = await getSupabase().from('life_phases').delete().eq('id', id)
    if (error) throw error
  },

  async getLifeEvents() {
    const { data, error } = await getSupabase()
      .from('life_events')
      .select('*')
      .order('start_year')
    if (error) throw error
    return data
  },

  async createLifeEvent(input: NewLifeEvent) {
    const user_id = await currentUserId()
    const { data, error } = await getSupabase()
      .from('life_events')
      .insert({ ...input, user_id })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateLifeEvent(id: string, patch: LifeEventPatch) {
    const { data, error } = await getSupabase()
      .from('life_events')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteLifeEvent(id: string) {
    const { error } = await getSupabase().from('life_events').delete().eq('id', id)
    if (error) throw error
  },

  async getNetWorthSnapshots() {
    // Phân trang: mỗi ngày mở app là một dòng snapshot (NetWorthHistorySection upsert
    // theo ngày) → ~2,7 năm dùng là vượt 1.000 và biểu đồ tài sản lặng lẽ mất điểm CŨ
    // nhất. snapshot_on unique theo user (UNIQUE user_id+snapshot_on) nên tự nó đã là
    // khoá sắp xếp ổn định.
    return await fetchAllPages<NetWorthSnapshotRow>(async (from, to) =>
      getSupabase()
        .from('networth_snapshots')
        .select('*')
        .order('snapshot_on')
        .range(from, to),
    )
  },

  async upsertNetWorthSnapshot(snapshotOn: string, netWorth: number) {
    const user_id = await currentUserId()
    const { data, error } = await getSupabase()
      .from('networth_snapshots')
      .upsert(
        { user_id, snapshot_on: snapshotOn, net_worth: netWorth },
        { onConflict: 'user_id,snapshot_on' },
      )
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getNotificationState() {
    // Phân trang + .order bắt buộc: dòng ĐÃ TẮT không bao giờ bị dọn (pruneNotificationState
    // cố ý chừa ra) nên bảng này chỉ phình. Không .order thì quá 1.000 dòng PostgREST trả
    // 1.000 dòng TÙY Ý — thông báo đã tắt sẽ thỉnh thoảng "sống lại". `key` unique theo
    // user (PK user_id+key) nên là khoá sắp xếp ổn định.
    return await fetchAllPages<NotificationStateRow>(async (from, to) =>
      getSupabase().from('notification_state').select('*').order('key').range(from, to),
    )
  },

  async markNotificationsRead(keys: string[]) {
    if (keys.length === 0) return
    const user_id = await currentUserId()
    const now = new Date().toISOString()
    // ignoreDuplicates: mã đã đọc từ trước thì giữ nguyên read_at cũ.
    const { error } = await getSupabase()
      .from('notification_state')
      .upsert(
        keys.map((key) => ({ user_id, key, read_at: now })),
        { onConflict: 'user_id,key', ignoreDuplicates: true },
      )
    if (error) throw error
  },

  async dismissNotification(key: string) {
    const user_id = await currentUserId()
    const now = new Date().toISOString()
    const { error } = await getSupabase()
      .from('notification_state')
      .upsert({ user_id, key, read_at: now, dismissed_at: now }, { onConflict: 'user_id,key' })
    if (error) throw error
  },

  async deleteNotificationStates(keys: string[]) {
    if (keys.length === 0) return
    const user_id = await currentUserId()
    // RLS đã chặn theo user rồi, nhưng key không unique toàn cục (PK là user_id+key)
    // nên thêm .eq cho chắc — phòng khi RLS bị tắt nhầm thì vẫn không đụng dữ liệu người khác.
    const { error } = await getSupabase()
      .from('notification_state')
      .delete()
      .eq('user_id', user_id)
      .in('key', keys)
    if (error) throw error
  },

  async pruneNotificationState(beforeISO: string) {
    // `is('dismissed_at', null)`: dòng ĐÃ TẮT không bao giờ bị dọn — "tắt là mất hẳn"
    // (mục C.2/E của spec). Giữ y hệt demoRepo.
    // .eq('user_id', ...): phòng thủ thêm, không chỉ dựa vào RLS (xem deleteNotificationStates).
    const user_id = await currentUserId()
    const { error } = await getSupabase()
      .from('notification_state')
      .delete()
      .eq('user_id', user_id)
      .lt('created_at', beforeISO)
      .is('dismissed_at', null)
    if (error) throw error
  },

  async getPushSubscriptions() {
    const { data, error } = await getSupabase().from('push_subscriptions').select('*')
    if (error) throw error
    return data
  },

  async savePushSubscription(input: NewPushSubscription) {
    const user_id = await currentUserId()
    // onConflict theo CẢ khoá chính: endpoint một mình không unique trong bảng, và
    // cùng một endpoint về lý thuyết có thể đổi chủ nếu người dùng đăng xuất rồi
    // đăng nhập tài khoản khác trên chính máy đó.
    const { error } = await getSupabase().from('push_subscriptions').upsert(
      {
        user_id,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        user_agent: input.userAgent,
      },
      { onConflict: 'user_id,endpoint' },
    )
    if (error) throw error
  },

  async deletePushSubscription(endpoint: string) {
    const user_id = await currentUserId()
    // .eq('user_id'): phòng thủ thêm ngoài RLS, giống deleteNotificationStates.
    const { error } = await getSupabase()
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user_id)
      .eq('endpoint', endpoint)
    if (error) throw error
  },

  async recordFxRates(onDate: string, base: CurrencyCode, rates: Rates) {
    const user_id = await currentUserId()
    const { error } = await getSupabase()
      .from('fx_history')
      .upsert({ user_id, on_date: onDate, base, rates }, { onConflict: 'user_id,on_date,base' })
    if (error) throw error
  },

  async createCategory(input: NewCategory) {
    const user_id = await currentUserId()
    const sort_order = await nextSortOrder('categories', input.type)
    const { data, error } = await getSupabase()
      .from('categories')
      .insert({ ...input, parent_id: input.parent_id ?? null, user_id, sort_order })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateCategory(id: string, patch: CategoryPatch) {
    const { data, error } = await getSupabase()
      .from('categories')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async reorderCategories(orderedIds: string[]) {
    const results = await Promise.all(
      orderedIds.map((id, i) =>
        getSupabase().from('categories').update({ sort_order: i }).eq('id', id),
      ),
    )
    for (const { error } of results) if (error) throw error
  },

  async deleteCategory(id: string) {
    const sb = getSupabase()
    // Cha có con → gom id cha + con để kiểm tra & xóa cả nhóm (con cascade khi xóa cha).
    const { data: children, error: eCh } = await sb
      .from('categories')
      .select('id')
      .eq('parent_id', id)
    if (eCh) throw eCh
    const ids = [id, ...(children ?? []).map((c) => c.id)]

    const tx = await sb
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .in('category_id', ids)
    if (tx.error) throw tx.error
    if ((tx.count ?? 0) > 0)
      throw new Error('Không xóa được: còn giao dịch dùng danh mục này. Hãy Lưu trữ thay vì Xóa.')

    const rr = await sb
      .from('recurring_rules')
      .select('id', { count: 'exact', head: true })
      .in('category_id', ids)
    if (rr.error) throw rr.error
    if ((rr.count ?? 0) > 0)
      throw new Error('Không xóa được: còn giao dịch định kỳ dùng danh mục này. Hãy Lưu trữ thay vì Xóa.')

    const bg = await sb
      .from('budgets')
      .select('id', { count: 'exact', head: true })
      .in('category_id', ids)
    if (bg.error) throw bg.error
    if ((bg.count ?? 0) > 0)
      throw new Error('Không xóa được: còn ngân sách đặt cho danh mục này. Hãy Lưu trữ thay vì Xóa.')

    // Xóa cha → FK on delete cascade tự xóa con (đã kiểm tra con trống ở trên).
    const { error } = await sb.from('categories').delete().eq('id', id)
    if (error) throw error
  },

  async getAssetGroupSettings() {
    const { data, error } = await getSupabase()
      .from('asset_group_settings')
      .select('*')
      .order('sort_order')
    if (error) throw error
    return data
  },

  async upsertAssetGroupSetting(name: string, patch: AssetGroupSettingPatch) {
    const user_id = await currentUserId()
    const { data, error } = await getSupabase()
      .from('asset_group_settings')
      .upsert({ user_id, name, ...patch }, { onConflict: 'user_id,name' })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async renameAssetGroup(oldName: string, newName: string) {
    const uid = await currentUserId()
    const sb = getSupabase()
    // Chuyển thành viên trước
    const { error: e1 } = await sb
      .from('accounts')
      .update({ asset_group: newName })
      .eq('user_id', uid)
      .eq('asset_group', oldName)
    if (e1) throw e1
    // Gộp nếu newName đã có cài đặt; ngược lại đổi tên bản ghi cũ
    const { data: target } = await sb
      .from('asset_group_settings')
      .select('id')
      .eq('name', newName)
      .maybeSingle()
    if (target) {
      const { error } = await sb.from('asset_group_settings').delete().eq('name', oldName)
      if (error) throw error
    } else {
      const { error } = await sb
        .from('asset_group_settings')
        .update({ name: newName })
        .eq('name', oldName)
      if (error) throw error
    }
  },

  async deleteAssetGroup(name: string, reassignTo: string | null) {
    const uid = await currentUserId()
    const sb = getSupabase()
    const { error: e1 } = await sb
      .from('accounts')
      .update({ asset_group: reassignTo })
      .eq('user_id', uid)
      .eq('asset_group', name)
    if (e1) throw e1
    const { error: e2 } = await sb.from('asset_group_settings').delete().eq('name', name)
    if (e2) throw e2
  },

  async reorderAssetGroups(orderedNames: string[]) {
    const user_id = await currentUserId()
    const { error } = await getSupabase()
      .from('asset_group_settings')
      .upsert(
        orderedNames.map((name, i) => ({ user_id, name, sort_order: i })),
        { onConflict: 'user_id,name' },
      )
    if (error) throw error
  },

  async assignAccountsToGroup(accountIds: string[], group: string | null) {
    if (accountIds.length === 0) return
    const { error } = await getSupabase()
      .from('accounts')
      .update({ asset_group: group })
      .in('id', accountIds)
    if (error) throw error
  },

  async listBudgets(monthKey: string) {
    const { data, error } = await getSupabase()
      .from('budgets')
      .select('*')
      .eq('month_key', monthKey)
    if (error) throw error
    return data
  },

  async upsertBudget(categoryId: string, monthKey: string, amount: number, rollover = false) {
    const user_id = await currentUserId()
    const { data, error } = await getSupabase()
      .from('budgets')
      .upsert(
        { user_id, category_id: categoryId, month_key: monthKey, amount, rollover },
        { onConflict: 'user_id,category_id,month_key' },
      )
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteBudget(id: string) {
    const { error } = await getSupabase().from('budgets').delete().eq('id', id)
    if (error) throw error
  },

  async copyBudgetsFromPreviousMonth(monthKey: string) {
    const user_id = await currentUserId()
    const prev = monthKeyString(addMonths(parseMonthKey(monthKey), -1))
    const sb = getSupabase()
    const { data: prevRows, error: e1 } = await sb
      .from('budgets')
      .select('category_id, amount, rollover')
      .eq('month_key', prev)
    if (e1) throw e1
    const { data: curRows, error: e2 } = await sb
      .from('budgets')
      .select('category_id')
      .eq('month_key', monthKey)
    if (e2) throw e2
    const existing = new Set((curRows ?? []).map((r) => r.category_id))
    const toInsert = (prevRows ?? [])
      .filter((r) => !existing.has(r.category_id))
      .map((r) => ({
        user_id,
        category_id: r.category_id,
        month_key: monthKey,
        amount: r.amount,
        rollover: r.rollover,
      }))
    if (toInsert.length === 0) return 0
    const { error: e3 } = await sb.from('budgets').insert(toInsert)
    if (e3) throw e3
    return toInsert.length
  },

  async getMonthPlan(monthKey: string) {
    // maybeSingle: chưa khai thu dự kiến là chuyện BÌNH THƯỜNG của gần hết các tháng,
    // không phải lỗi. `single()` sẽ ném PGRST116 và mặt lập kế hoạch chết cứng.
    const { data, error } = await getSupabase()
      .from('month_plans')
      .select('*')
      .eq('month_key', monthKey)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async upsertMonthPlan(monthKey: string, expectedIncome: number) {
    const user_id = await currentUserId()
    const { data, error } = await getSupabase()
      .from('month_plans')
      .upsert(
        { user_id, month_key: monthKey, expected_income: expectedIncome },
        { onConflict: 'user_id,month_key' },
      )
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteMonthPlan(monthKey: string) {
    const { error } = await getSupabase()
      .from('month_plans')
      .delete()
      .eq('month_key', monthKey)
    if (error) throw error
  },

  async getDebts() {
    const { data, error } = await getSupabase()
      .from('debts')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async getDebtPayments() {
    // Phân trang: gom MỌI lần trả của MỌI khoản nợ — vay trả góp dài hạn + trả hộ
    // tích lại nhiều năm là vượt 1.000. `id` chốt cuối vì paid_on không đơn trị.
    return await fetchAllPages<DebtPaymentRow>(async (from, to) =>
      getSupabase()
        .from('debt_payments')
        .select('*')
        .order('paid_on', { ascending: false })
        .order('id')
        .range(from, to),
    )
  },

  async createDebt(input: NewDebt) {
    const user_id = await currentUserId()
    const sb = getSupabase()
    const { transaction, ...debtFields } = input
    let disbursement_transaction_id: string | null = null
    if (transaction) {
      // Giải ngân là dòng tiền cho vay → đánh dấu để báo cáo Chi/Thu bỏ qua.
      const { data: tx, error: eTx } = await sb
        .from('transactions')
        .insert({ ...txColumns(transaction), user_id, is_debt_flow: true })
        .select()
        .single()
      if (eTx) throw eTx
      disbursement_transaction_id = tx.id
    }
    const { data, error } = await sb
      .from('debts')
      .insert({ ...debtFields, user_id, disbursement_transaction_id })
      .select()
      .single()
    if (error) {
      // Bồi hoàn: tạo nợ thất bại thì xóa giao dịch giải ngân, tránh lệch số dư
      if (disbursement_transaction_id)
        await sb.from('transactions').delete().eq('id', disbursement_transaction_id)
      throw error
    }
    return data
  },

  async updateDebt(id: string, patch: DebtPatch) {
    // `transaction` chỉ dùng lúc tạo (giải ngân), không phải cột của debts.
    const { transaction: _ignore, ...debtPatch } = patch
    const { data, error } = await getSupabase()
      .from('debts')
      .update(debtPatch)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteDebt(id: string) {
    const sb = getSupabase()
    // Xóa giao dịch liên kết trước (payments tự cascade khi xóa debt)
    const { data: payments, error: e1 } = await sb
      .from('debt_payments')
      .select('transaction_id')
      .eq('debt_id', id)
    if (e1) throw e1
    // Kèm giao dịch giải ngân của chính khoản nợ (nếu có)
    const { data: debt, error: eDebt } = await sb
      .from('debts')
      .select('disbursement_transaction_id')
      .eq('id', id)
      .single()
    if (eDebt) throw eDebt
    const txIds = [
      ...(payments ?? []).map((p) => p.transaction_id),
      debt?.disbursement_transaction_id ?? null,
    ].filter((t): t is string => !!t)
    if (txIds.length > 0) {
      const { error: e2 } = await sb.from('transactions').delete().in('id', txIds)
      if (e2) throw e2
    }
    const { error: e3 } = await sb.from('debts').delete().eq('id', id)
    if (e3) throw e3
  },

  async createDebtPayment(input: NewDebtPayment) {
    const user_id = await currentUserId()
    const sb = getSupabase()
    let transaction_id: string | null = null
    if (input.transaction) {
      // Trả nợ là dòng tiền nợ/cho vay → đánh dấu để báo cáo Chi/Thu bỏ qua.
      const { data: tx, error: eTx } = await sb
        .from('transactions')
        .insert({ ...txColumns(input.transaction), user_id, is_debt_flow: true })
        .select()
        .single()
      if (eTx) throw eTx
      transaction_id = tx.id
    }
    const { data, error } = await sb
      .from('debt_payments')
      .insert({
        user_id,
        debt_id: input.debt_id,
        amount: input.amount,
        paid_on: input.paid_on,
        transaction_id,
        note: input.note,
      })
      .select()
      .single()
    if (error) {
      // Bồi hoàn: payment thất bại thì xóa giao dịch vừa tạo, tránh lệch số dư
      if (transaction_id) await sb.from('transactions').delete().eq('id', transaction_id)
      throw error
    }
    return data
  },

  async deleteDebtPayment(id: string) {
    const sb = getSupabase()
    const { data: payment, error: e1 } = await sb
      .from('debt_payments')
      .select('transaction_id')
      .eq('id', id)
      .single()
    if (e1) throw e1
    const { error: e2 } = await sb.from('debt_payments').delete().eq('id', id)
    if (e2) throw e2
    if (payment?.transaction_id) {
      const { error: e3 } = await sb
        .from('transactions')
        .delete()
        .eq('id', payment.transaction_id)
      if (e3) throw e3
    }
  },

  async listRecurringRules() {
    const { data, error } = await getSupabase()
      .from('recurring_rules')
      .select('*')
      .order('created_at')
    if (error) throw error
    return data
  },

  async createRecurringRule(input: NewRecurringRule) {
    const user_id = await currentUserId()
    // tag_ids là bảng nối riêng (migration 0042), không phải cột của recurring_rules
    const { tag_ids, ...fields } = input
    const { data, error } = await getSupabase()
      .from('recurring_rules')
      .insert({ ...fields, user_id })
      .select()
      .single()
    if (error) throw error
    if (tag_ids?.length) await this.setRecurringRuleTags(data.id, tag_ids)
    return data
  },

  /** Ghi đè toàn bộ nhãn của một quy tắc định kỳ. */
  async setRecurringRuleTags(ruleId: string, tagIds: string[]) {
    const user_id = await currentUserId()
    const sb = getSupabase()
    const del = await sb.from('recurring_rule_tags').delete().eq('rule_id', ruleId)
    if (del.error) throw del.error
    if (tagIds.length === 0) return
    const { error } = await sb
      .from('recurring_rule_tags')
      .insert(tagIds.map((tag_id) => ({ rule_id: ruleId, tag_id, user_id })))
    if (error) throw error
  },

  async listRecurringRuleTags() {
    const { data, error } = await getSupabase().from('recurring_rule_tags').select('*')
    if (error) throw error
    return data ?? []
  },

  async updateRecurringRule(id: string, patch: RecurringRulePatch) {
    // Bỏ trống tag_ids = KHÔNG đụng tới nhãn; mảng rỗng = bỏ hết nhãn.
    const { tag_ids, ...fields } = patch
    if (tag_ids) await this.setRecurringRuleTags(id, tag_ids)
    const { data, error } = await getSupabase()
      .from('recurring_rules')
      .update(fields)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteRecurringRule(id: string) {
    // transactions.recurring_rule_id tự set null (FK on delete set null)
    const { error } = await getSupabase().from('recurring_rules').delete().eq('id', id)
    if (error) throw error
  },

  async insertRecurringOccurrence(input: NewRecurringOccurrence) {
    const user_id = await currentUserId()
    const sb = getSupabase()
    // `.select('id')`: cần id để chép nhãn của quy tắc xuống giao dịch vừa sinh.
    const { data, error } = await sb
      .from('transactions')
      .insert({ ...txColumns(input), user_id })
      .select('id')
      .single()
    if (error) {
      // 23505 = unique_violation: thiết bị khác đã sinh kỳ này → bỏ qua im lặng
      if (error.code === '23505') return false
      throw error
    }
    // Nhãn của quy tắc (migration 0042) đi theo từng kỳ nó sinh ra. Lỗi ở bước này
    // KHÔNG được làm cả lượt catch-up chết: giao dịch đã ghi xong và đúng số tiền,
    // thiếu nhãn thì gắn lại được, còn ném ra đây là các kỳ sau không sinh nữa.
    try {
      const links = await sb
        .from('recurring_rule_tags')
        .select('tag_id')
        .eq('rule_id', input.recurring_rule_id)
      if (links.data?.length) {
        await sb.from('transaction_tags').insert(
          links.data.map((l) => ({ transaction_id: data.id, tag_id: l.tag_id, user_id })),
        )
      }
    } catch {
      // bỏ qua có ý định — xem chú thích trên
    }
    return true
  },

  async insertCardAutopay(input: NewTransaction) {
    const user_id = await currentUserId()
    const { error } = await getSupabase()
      .from('transactions')
      .insert({ ...txColumns(input), user_id })
    if (error) {
      // 23505 = unique_violation: thiết bị khác đã sinh kỳ này → bỏ qua im lặng
      if (error.code === '23505') return false
      throw error
    }
    return true
  },

  // --- Nhãn ---

  async getTags() {
    const { data, error } = await getSupabase()
      .from('tags')
      .select('*')
      .order('sort_order', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async getTransactionTags() {
    // Phân trang: `.select('*')` trần bị Supabase cắt im lặng ở 1.000 dòng. Bảng này
    // lớn theo số giao dịch được gắn nhãn, nên sổ đã nạp lịch sử Zaim sẽ thiếu liên
    // kết — chip nhãn biến mất khỏi vài dòng và "Chi theo nhãn" cộng thiếu, không báo
    // lỗi gì. Bảng nối khoá kép, không có cột `id` để làm chốt sắp xếp.
    return await fetchAllPages<TransactionTagRow>(async (from, to) =>
      getSupabase()
        .from('transaction_tags')
        .select('*')
        .order('transaction_id')
        .order('tag_id')
        .range(from, to),
    )
  },

  async getTagSpend() {
    // Đi TỪ bảng nối: tập giao dịch có nhãn nhỏ hơn hẳn sổ, nên đây là cách kéo đủ
    // dữ liệu cho trần "cả đời nhãn" mà không tải nguyên bảng transactions.
    // `!inner` để giao dịch đã xoá (liên kết mồ côi) không thành dòng rỗng.
    type Joined = {
      tag_id: string
      transactions: {
        id: string
        amount: number
        account_id: string
        occurred_on: string
        is_refund: boolean | null
      } | null
    }
    const rows = await fetchAllPages<Joined>(async (from, to) =>
      getSupabase()
        .from('transaction_tags')
        .select(
          'tag_id, transactions!inner(id, amount, account_id, occurred_on, is_refund)',
        )
        // Cùng bộ lọc với tagBreakdown ở client: chỉ khoản CHI còn tính thống kê.
        .eq('transactions.type', 'expense')
        .not('transactions.is_debt_flow', 'is', true)
        .not('transactions.exclude_from_stats', 'is', true)
        .order('transaction_id')
        .order('tag_id')
        .range(from, to),
    )
    return rows.flatMap<TagSpendRow>((r) =>
      r.transactions
        ? [
            {
              tag_id: r.tag_id,
              transaction_id: r.transactions.id,
              amount: r.transactions.amount,
              account_id: r.transactions.account_id,
              occurred_on: r.transactions.occurred_on,
              is_refund: r.transactions.is_refund ?? false,
            },
          ]
        : [],
    )
  },

  async getPlannedExpenses() {
    const { data, error } = await getSupabase()
      .from('planned_expenses')
      .select('*')
      .order('due_on', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async createPlannedExpense(input: NewPlannedExpense) {
    const user_id = await currentUserId()
    // tag_ids là bảng nối riêng (migration 0044), không phải cột của planned_expenses
    const { tag_ids, ...fields } = input
    const { data, error } = await getSupabase()
      .from('planned_expenses')
      .insert({ ...fields, title: input.title.trim(), user_id })
      .select()
      .single()
    if (error) throw error
    if (tag_ids?.length) await this.setPlannedExpenseTags(data.id, tag_ids)
    return data
  },

  /** Ghi đè toàn bộ nhãn của một khoản sắp chi. */
  async setPlannedExpenseTags(plannedId: string, tagIds: string[]) {
    const user_id = await currentUserId()
    const sb = getSupabase()
    const del = await sb.from('planned_expense_tags').delete().eq('planned_id', plannedId)
    if (del.error) throw del.error
    if (tagIds.length === 0) return
    const { error } = await sb
      .from('planned_expense_tags')
      .insert(tagIds.map((tag_id) => ({ planned_id: plannedId, tag_id, user_id })))
    if (error) throw error
  },

  async listPlannedExpenseTags() {
    const { data, error } = await getSupabase().from('planned_expense_tags').select('*')
    if (error) throw error
    return data ?? []
  },

  async updatePlannedExpense(id: string, patch: PlannedExpensePatch) {
    // Bỏ trống tag_ids = KHÔNG đụng tới nhãn; mảng rỗng = bỏ hết nhãn.
    const { tag_ids, ...rest } = patch
    if (tag_ids) await this.setPlannedExpenseTags(id, tag_ids)
    const { data, error } = await getSupabase()
      .from('planned_expenses')
      .update(rest.title ? { ...rest, title: rest.title.trim() } : rest)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deletePlannedExpense(id: string) {
    const { error } = await getSupabase().from('planned_expenses').delete().eq('id', id)
    if (error) throw error
  },

  async getTagGroups() {
    const { data, error } = await getSupabase()
      .from('tag_groups')
      .select('*')
      .order('sort_order', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async createTagGroup(input: NewTagGroup) {
    const user_id = await currentUserId()
    const name = input.name.trim()
    const { data: rows, error: readErr } = await getSupabase()
      .from('tag_groups')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
    if (readErr) throw readErr
    const sort_order = (rows?.[0]?.sort_order ?? -1) + 1
    const { data, error } = await getSupabase()
      .from('tag_groups')
      .insert({ name, user_id, sort_order })
      .select()
      .single()
    // 23505 = trùng unique(user_id, name)
    if (error) throw error?.code === '23505' ? new Error(`Nhóm "${name}" đã tồn tại`) : error
    return data
  },

  async updateTagGroup(id: string, patch: TagGroupPatch) {
    const { data, error } = await getSupabase()
      .from('tag_groups')
      .update(patch.name ? { ...patch, name: patch.name.trim() } : patch)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error?.code === '23505' ? new Error('Tên nhóm đã tồn tại') : error
    return data
  },

  async deleteTagGroup(id: string) {
    // tags.group_id có `on delete set null` (0039) → nhãn ở lại, chỉ rơi khỏi nhóm.
    const { error } = await getSupabase().from('tag_groups').delete().eq('id', id)
    if (error) throw error
  },

  async createTag(input: NewTag) {
    const user_id = await currentUserId()
    const sort_order = await nextTagSortOrder()
    const { data, error } = await getSupabase()
      .from('tags')
      .insert({ ...input, name: input.name.trim(), user_id, sort_order })
      .select()
      .single()
    // 23505 = trùng unique(user_id, name)
    if (error) throw error?.code === '23505' ? new Error(`Nhãn "${input.name.trim()}" đã tồn tại`) : error
    return data
  },

  async updateTag(id: string, patch: TagPatch) {
    const { data, error } = await getSupabase()
      .from('tags')
      .update(patch.name ? { ...patch, name: patch.name.trim() } : patch)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error?.code === '23505' ? new Error('Tên nhãn đã tồn tại') : error
    return data
  },

  async deleteTag(id: string) {
    // transaction_tags cascade theo FK → chỉ cần xóa nhãn
    const { error } = await getSupabase().from('tags').delete().eq('id', id)
    if (error) throw error
  },

  async setTransactionTags(transactionId: string, tagIds: string[]) {
    const user_id = await currentUserId()
    const sb = getSupabase()
    const del = await sb.from('transaction_tags').delete().eq('transaction_id', transactionId)
    if (del.error) throw del.error
    if (tagIds.length === 0) return
    const { error } = await sb
      .from('transaction_tags')
      .insert(tagIds.map((tag_id) => ({ transaction_id: transactionId, tag_id, user_id })))
    if (error) throw error
  },

  async exportAll(): Promise<BackupData> {
    const sb = getSupabase()
    const selectAll = async <T>(table: DataTable): Promise<T[]> => {
      // Phân trang: `.select('*')` trần bị Supabase cắt ở 1.000 dòng mà không báo lỗi, nên
      // backup của sổ đã nạp lịch sử Zaim (~14.000 giao dịch) sẽ thiếu dòng — và Khôi phục
      // thì GHI ĐÈ, tức khôi phục từ file thiếu là xoá thật phần còn lại.
      // Khoá sắp xếp: phân trang không có thứ tự ổn định thì trang sau có thể trả lại
      // dòng của trang trước và bỏ sót dòng khác. Thường là `id`, nhưng bảng nối khoá
      // kép không có cột đó — xem exportTables.ts.
      const [first, ...rest] = pageOrderFor(table)
      return await fetchAllPages<T>(async (from, to) => {
        let q = sb.from(table).select('*').order(first)
        for (const col of rest) q = q.order(col)
        return (await q.range(from, to)) as Page<T>
      })
    }
    const [
      profile,
      accounts,
      categories,
      transactions,
      budgets,
      assetGroupSettings,
      debts,
      debtPayments,
      recurringRules,
      accountValuations,
      savingsGoals,
      networthSnapshots,
      tagGroups,
      tags,
      transactionTags,
      lifeScenarios,
      lifePhases,
      lifeEvents,
      stockTrades,
      monthPlans,
      recurringRuleTags,
      plannedExpenses,
      plannedExpenseTags,
    ] = await Promise.all([
      this.getProfile(),
      selectAll<AccountRow>('accounts'),
      selectAll<CategoryRow>('categories'),
      selectAll<TransactionRow>('transactions'),
      selectAll<BudgetRow>('budgets'),
      selectAll<AssetGroupSettingRow>('asset_group_settings'),
      selectAll<DebtRow>('debts'),
      selectAll<DebtPaymentRow>('debt_payments'),
      selectAll<RecurringRuleRow>('recurring_rules'),
      selectAll<AccountValuationRow>('account_valuations'),
      selectAll<SavingsGoalRow>('savings_goals'),
      selectAll<NetWorthSnapshotRow>('networth_snapshots'),
      selectAll<TagGroupRow>('tag_groups'),
      selectAll<TagRow>('tags'),
      selectAll<TransactionTagRow>('transaction_tags'),
      selectAll<LifeScenarioRow>('life_scenarios'),
      selectAll<LifePhaseRow>('life_phases'),
      selectAll<LifeEventRow>('life_events'),
      selectAll<StockTradeRow>('stock_trades'),
      selectAll<MonthPlanRow>('month_plans'),
      selectAll<RecurringRuleTagRow>('recurring_rule_tags'),
      selectAll<PlannedExpenseRow>('planned_expenses'),
      selectAll<PlannedExpenseTagRow>('planned_expense_tags'),
    ])
    return {
      version: BACKUP_VERSION,
      exported_at: new Date().toISOString(),
      profile,
      accounts,
      categories,
      transactions,
      budgets,
      assetGroupSettings,
      debts,
      debtPayments,
      recurringRules,
      accountValuations,
      savingsGoals,
      networthSnapshots,
      tagGroups,
      tags,
      transactionTags,
      lifeScenarios,
      lifePhases,
      lifeEvents,
      stockTrades,
      monthPlans,
      recurringRuleTags,
      plannedExpenses,
      plannedExpenseTags,
    }
  },

  async importAll(data: BackupData) {
    const uid = await currentUserId()
    const sb = getSupabase()
    const ok = (error: { message: string } | null) => {
      if (error) throw error
    }

    // 0) Soát file TRƯỚC khi xoá. Bước 1 dưới đây xoá sạch dữ liệu hiện có, và mỗi bảng
    // là một request riêng (không có transaction bao ngoài) — file hỏng ở giữa nghĩa là
    // mất dữ liệu cũ rồi mới biết không chèn được.
    const problems = validateBackupPayload(data)
    if (problems.length)
      throw new Error(
        `File sao lưu có ${problems.length} vấn đề, chưa xoá gì cả:\n· ${problems.join('\n· ')}`,
      )

    // Chèn theo lô: 16.000 giao dịch trong MỘT request dễ vượt giới hạn kích thước body
    // và statement timeout của Postgres, mà đứt thì đứt cả cục.
    // Nhận thẳng hàm chèn (thay vì tên bảng) để TypeScript vẫn soi payload theo đúng cột
    // của từng bảng — đổi sang `object[]` là mất luôn lớp bảo vệ đó.
    const insertChunked = async <T>(
      rows: T[],
      insert: (part: T[]) => PromiseLike<{ error: { message: string } | null }>,
    ) => {
      for (const part of chunk(rows, IMPORT_CHUNK_SIZE)) ok((await insert(part)).error)
    }

    // 1) Xóa dữ liệu hiện có theo thứ tự con → cha (tránh vướng FK)
    const deleteOrder: DataTable[] = [
      'account_valuations',
      'savings_goals',
      'networth_snapshots',
      // recurring_rule_tags trước tags VÀ trước recurring_rules (composite FK cả hai).
      // Cascade cũng lo được, nhưng khai rõ như transaction_tags để thứ tự đọc ra được ý.
      'recurring_rule_tags',
      'planned_expense_tags',
      'planned_expenses',
      'transaction_tags',
      'tags',
      'tag_groups',
      'life_phases',
      'life_events',
      'life_scenarios',
      'debt_payments',
      'debts',
      'budgets',
      'transactions',
      'recurring_rules',
      'asset_group_settings',
      'categories',
      // stock_trades: composite FK tới accounts → xoá trước accounts.
      'stock_trades',
      'accounts',
    ]
    for (const table of deleteOrder) {
      ok((await sb.from(table).delete().eq('user_id', uid)).error)
    }

    // 2) Nhập lại theo thứ tự cha → con, giữ nguyên id, đóng dấu user_id hiện tại.
    // accounts: payment_account_id là self-FK → chèn null trước, cập nhật sau.
    if (data.accounts?.length) {
      await insertChunked(
            data.accounts.map((a) => ({
              id: a.id,
              user_id: uid,
              name: a.name,
              type: a.type,
              currency: a.currency,
              initial_balance: a.initial_balance,
              asset_group: a.asset_group,
              is_hidden: a.is_hidden,
              include_in_totals: a.include_in_totals,
              credit_limit: a.credit_limit,
              statement_day: a.statement_day,
              payment_due_day: a.payment_due_day,
              payment_account_id: null,
              card_autopay_through: a.card_autopay_through,
              depreciation_months: a.depreciation_months,
              depreciation_from: a.depreciation_from,
              salvage_value: a.salvage_value,
              tax_shelter: a.tax_shelter,
              shelter_annual_limit: a.shelter_annual_limit,
              sort_order: a.sort_order,
              is_archived: a.is_archived,
            })),
        (part) => sb.from('accounts').insert(part),
      )
    }

    // categories: parent_id là self-FK → chèn danh mục cha trước, con sau.
    const cats = data.categories ?? []
    const catPayload = (c: CategoryRow) => ({
      id: c.id,
      user_id: uid,
      name: c.name,
      type: c.type,
      icon: c.icon,
      parent_id: c.parent_id,
      sort_order: c.sort_order,
      is_archived: c.is_archived,
      need_level: c.need_level,
      cost_type: c.cost_type,
    })
    const parents = cats.filter((c) => !c.parent_id)
    const children = cats.filter((c) => c.parent_id)
    if (parents.length) await insertChunked(parents.map(catPayload), (part) => sb.from('categories').insert(part))
    if (children.length) await insertChunked(children.map(catPayload), (part) => sb.from('categories').insert(part))

    if (data.recurringRules?.length) {
      await insertChunked(
            data.recurringRules.map((r) => ({
              id: r.id,
              user_id: uid,
              type: r.type,
              amount: r.amount,
              to_amount: r.to_amount,
              category_id: r.category_id,
              account_id: r.account_id,
              to_account_id: r.to_account_id,
              note: r.note,
              frequency: r.frequency,
              start_on: r.start_on,
              end_on: r.end_on,
              is_paused: r.is_paused,
              last_generated_on: r.last_generated_on,
            })),
        (part) => sb.from('recurring_rules').insert(part),
      )
    }

    if (data.transactions?.length) {
      await insertChunked(
            data.transactions.map((t) => ({
              id: t.id,
              user_id: uid,
              type: t.type,
              amount: t.amount,
              to_amount: t.to_amount,
              category_id: t.category_id,
              account_id: t.account_id,
              to_account_id: t.to_account_id,
              recurring_rule_id: t.recurring_rule_id,
              occurred_on: t.occurred_on,
              note: t.note,
              is_remittance: t.is_remittance,
              remit_service: t.remit_service,
              remit_fee_jpy: t.remit_fee_jpy,
              remit_received_vnd: t.remit_received_vnd,
              is_debt_flow: t.is_debt_flow,
              exclude_from_stats: t.exclude_from_stats,
              is_refund: t.is_refund,
            })),
        (part) => sb.from('transactions').insert(part),
      )
    }

    if (data.budgets?.length) {
      await insertChunked(
            data.budgets.map((b) => ({
              id: b.id,
              user_id: uid,
              category_id: b.category_id,
              month_key: b.month_key,
              amount: b.amount,
              rollover: b.rollover,
            })),
        (part) => sb.from('budgets').insert(part),
      )
    }

    if (data.assetGroupSettings?.length) {
      await insertChunked(
            data.assetGroupSettings.map((s) => ({
              id: s.id,
              user_id: uid,
              name: s.name,
              sort_order: s.sort_order,
              include_in_totals: s.include_in_totals,
              is_hidden: s.is_hidden,
            })),
        (part) => sb.from('asset_group_settings').insert(part),
      )
    }

    if (data.debts?.length) {
      await insertChunked(
            data.debts.map((d) => ({
              id: d.id,
              user_id: uid,
              counterparty: d.counterparty,
              direction: d.direction,
              currency: d.currency,
              principal: d.principal,
              due_on: d.due_on,
              status: d.status,
              note: d.note,
              // `?? null`: backup xuất trước migration 0021 chưa có hai trường này.
              // Thiếu chúng là khoản trả góp mất lãi suất + số kỳ, biến thành "nợ thường".
              interest_bps: d.interest_bps ?? null,
              term_months: d.term_months ?? null,
              disbursement_transaction_id: d.disbursement_transaction_id,
            })),
        (part) => sb.from('debts').insert(part),
      )
    }

    if (data.debtPayments?.length) {
      await insertChunked(
            data.debtPayments.map((p) => ({
              id: p.id,
              user_id: uid,
              debt_id: p.debt_id,
              amount: p.amount,
              paid_on: p.paid_on,
              transaction_id: p.transaction_id,
              note: p.note,
            })),
        (part) => sb.from('debt_payments').insert(part),
      )
    }

    // account_valuations: composite FK tới accounts → chèn sau accounts.
    if (data.accountValuations?.length) {
      await insertChunked(
            data.accountValuations.map((v) => ({
              id: v.id,
              user_id: uid,
              account_id: v.account_id,
              valued_on: v.valued_on,
              market_value: v.market_value,
              note: v.note,
              // Phải gửi rõ `source` — thiếu dòng này thì mọi hàng khôi phục rơi về
              // default 'manual' của cột, kể cả hàng exportAll xuất ra là 'auto' (do
              // cron ghi). Từ đó cron thấy 'manual' và không bao giờ tính lại nữa
              // (quyết định 4 đọc ngược: khôi phục không phải là gõ tay).
              source: v.source,
            })),
        (part) => sb.from('account_valuations').insert(part),
      )
    }

    // stock_trades: composite FK tới accounts → chèn sau accounts.
    if (data.stockTrades?.length) {
      await insertChunked(
            data.stockTrades.map((t) => ({
              id: t.id,
              user_id: uid,
              account_id: t.account_id,
              symbol: t.symbol,
              kind: t.kind,
              traded_on: t.traded_on,
              quantity: t.quantity,
              price: t.price,
              fee: t.fee,
              tax: t.tax,
              note: t.note,
            })),
        (part) => sb.from('stock_trades').insert(part),
      )
    }

    // savings_goals: FK tới accounts → chèn sau accounts.
    if (data.savingsGoals?.length) {
      await insertChunked(
            data.savingsGoals.map((g) => ({
              id: g.id,
              user_id: uid,
              name: g.name,
              account_id: g.account_id,
              target_amount: g.target_amount,
              target_date: g.target_date,
              note: g.note,
              sort_order: g.sort_order,
            })),
        (part) => sb.from('savings_goals').insert(part),
      )
    }

    // life_scenarios (cha) trước, rồi life_phases/life_events (composite FK
    // (scenario_id, user_id) → life_scenarios) — chèn con trước cha sẽ bị chặn.
    if (data.lifeScenarios?.length) {
      await insertChunked(
            data.lifeScenarios.map((s) => ({
              id: s.id,
              user_id: uid,
              name: s.name,
              display_currency: s.display_currency,
              end_age: s.end_age,
              real_return_bps: s.real_return_bps,
              band_spread_bps: s.band_spread_bps,
              starting_assets_minor: s.starting_assets_minor,
              nominal_terms: s.nominal_terms,
              is_primary: s.is_primary,
              sort_order: s.sort_order,
            })),
        (part) => sb.from('life_scenarios').insert(part),
      )
    }

    if (data.lifePhases?.length) {
      await insertChunked(
            data.lifePhases.map((p) => ({
              id: p.id,
              user_id: uid,
              scenario_id: p.scenario_id,
              start_year: p.start_year,
              label: p.label,
              country: p.country,
              currency: p.currency,
              annual_income_minor: p.annual_income_minor,
              annual_expense_minor: p.annual_expense_minor,
              fx_to_display: p.fx_to_display,
            })),
        (part) => sb.from('life_phases').insert(part),
      )
    }

    if (data.lifeEvents?.length) {
      await insertChunked(
            data.lifeEvents.map((e) => ({
              id: e.id,
              user_id: uid,
              scenario_id: e.scenario_id,
              start_year: e.start_year,
              end_year: e.end_year,
              kind: e.kind,
              amount_minor: e.amount_minor,
              currency: e.currency,
              label: e.label,
              note: e.note,
              // Bản sao lưu tạo trước migration 0032 chưa có trường này → 1.
              // ĐỪNG XOÁ `?? 1` vì thấy TypeScript bảo là dư: theo KIỂU thì nhánh này
              // chết (`LifeEventRow.fx_to_display` không nullable), nhưng theo RUNTIME
              // thì nó sống — file .json người dùng nạp vào là dữ liệu ngoài, xuất từ
              // bản cũ thì thiếu hẳn trường này.
              fx_to_display: e.fx_to_display ?? 1,
              inflate: e.inflate,
            })),
        (part) => sb.from('life_events').insert(part),
      )
    }

    // networth_snapshots: chỉ phụ thuộc user → chèn độc lập.
    if (data.networthSnapshots?.length) {
      await insertChunked(
            data.networthSnapshots.map((s) => ({
              id: s.id,
              user_id: uid,
              snapshot_on: s.snapshot_on,
              net_worth: s.net_worth,
            })),
        (part) => sb.from('networth_snapshots').insert(part),
      )
    }

    // month_plans: chỉ phụ thuộc user (không FK sang danh mục) → chèn độc lập.
    if (data.monthPlans?.length) {
      await insertChunked(
        data.monthPlans.map((p) => ({
          id: p.id,
          user_id: uid,
          month_key: p.month_key,
          expected_income: p.expected_income,
        })),
        (part) => sb.from('month_plans').insert(part),
      )
    }

    // nhóm trước, rồi nhãn (FK group_id), rồi liên kết (composite FK tới cả
    // transactions lẫn tags).
    if (data.tagGroups?.length) {
      await insertChunked(
        data.tagGroups.map((g) => ({
          id: g.id,
          user_id: uid,
          name: g.name,
          sort_order: g.sort_order,
        })),
        (part) => sb.from('tag_groups').insert(part),
      )
    }

    if (data.tags?.length) {
      await insertChunked(
        data.tags.map((t) => ({
          id: t.id,
          user_id: uid,
          name: t.name,
          color: t.color,
          sort_order: t.sort_order,
          // `?? false`: backup trước migration 0033. Thiếu trường này là mọi nhãn
          // đã lưu trữ tràn lại vào ô chọn nhãn sau khi khôi phục.
          is_archived: t.is_archived ?? false,
          // `?? null` / `?? 'total'`: backup trước 0036. Trước đây hai cột này bị bỏ
          // quên hẳn ở đây — khôi phục xong là mất sạch trần chi theo nhãn.
          budget_amount: t.budget_amount ?? null,
          budget_period: t.budget_period ?? 'total',
          // `?? null`: backup trước 0039.
          group_id: t.group_id ?? null,
        })),
        (part) => sb.from('tags').insert(part),
      )
    }

    // Nhãn của quy tắc định kỳ (migration 0042): chèn SAU tags và SAU recurring_rules
    // — composite FK trỏ vào cả hai bảng đó.
    if (data.recurringRuleTags?.length) {
      await insertChunked(
        data.recurringRuleTags.map((l) => ({
          rule_id: l.rule_id,
          tag_id: l.tag_id,
          user_id: uid,
        })),
        (part) => sb.from('recurring_rule_tags').insert(part),
      )
    }

    // planned_expenses: FK sang categories, accounts và transactions → chèn sau cả ba.
    if (data.plannedExpenses?.length) {
      await insertChunked(
        data.plannedExpenses.map((pe) => ({
          id: pe.id,
          user_id: uid,
          title: pe.title,
          amount: pe.amount,
          currency: pe.currency,
          due_on: pe.due_on,
          due_precision: pe.due_precision,
          remind_days_before: pe.remind_days_before,
          category_id: pe.category_id,
          account_id: pe.account_id,
          status: pe.status,
          transaction_id: pe.transaction_id,
          note: pe.note,
        })),
        (part) => sb.from('planned_expenses').insert(part),
      )
    }

    // Nhãn của khoản sắp chi (0044): sau tags và sau planned_expenses.
    if (data.plannedExpenseTags?.length) {
      await insertChunked(
        data.plannedExpenseTags.map((l) => ({
          planned_id: l.planned_id,
          tag_id: l.tag_id,
          user_id: uid,
        })),
        (part) => sb.from('planned_expense_tags').insert(part),
      )
    }

    if (data.transactionTags?.length) {
      await insertChunked(
            data.transactionTags.map((l) => ({
              transaction_id: l.transaction_id,
              tag_id: l.tag_id,
              user_id: uid,
            })),
        (part) => sb.from('transaction_tags').insert(part),
      )
    }

    // 3) Pass 2: khôi phục self-FK payment_account_id của thẻ tín dụng.
    for (const a of data.accounts ?? []) {
      if (a.payment_account_id) {
        ok(
          (
            await sb
              .from('accounts')
              .update({ payment_account_id: a.payment_account_id })
              .eq('id', a.id)
          ).error,
        )
      }
    }

    // 4) Hồ sơ: khôi phục TOÀN BỘ cột người dùng tự đặt. Liệt kê tay từng cột
    // (không spread `data.profile`) vì file backup là dữ liệu ngoài — spread sẽ
    // đẩy cả khoá lạ/`user_id`/`created_at` vào update. Mỗi lần thêm cột profile
    // ở migration mới thì PHẢI thêm vào đây, nếu không Khôi phục sẽ lặng lẽ reset
    // nó về giá trị hiện tại (bug đã xảy ra với birth_year/notif_off/axis targets).
    // Các `??`: backup xuất trước migration tương ứng thì thiếu hẳn trường —
    // rơi về default của migration.
    // KHÔNG khôi phục `push_last_sent_at` (cột riêng của service role, xem ProfilePatch).
    ok(
      (
        await sb
          .from('profiles')
          .update({
            display_name: data.profile.display_name,
            month_start_day: data.profile.month_start_day,
            base_currency: data.profile.base_currency,
            hourly_wage: data.profile.hourly_wage ?? null,
            annual_inflation_bps: data.profile.annual_inflation_bps ?? null,
            capital_gains_tax_bps: data.profile.capital_gains_tax_bps ?? 2032,
            target_essential_bps: data.profile.target_essential_bps ?? 5000, // 0027
            target_flexible_bps: data.profile.target_flexible_bps ?? 3000, // 0027
            target_savings_bps: data.profile.target_savings_bps ?? 2000, // 0027
            notif_off: data.profile.notif_off ?? [], // 0029
            birth_year: data.profile.birth_year ?? null, // 0031 — thiếu là Lifetime ngừng chạy
            push_hour: data.profile.push_hour ?? 8, // 0034
            push_tz: data.profile.push_tz ?? 'Asia/Tokyo', // 0034
            // 0040. Đi qua parseDensity chứ không lấy trực tiếp: cột là text nên bản lưu
            // có thể mang giá trị lạ, mà DB có check in ('visual','full') — gửi thẳng lên
            // là cả lượt khôi phục nổ vì một cột trình bày.
            density_pref: parseDensity(data.profile.density_pref), // 0040
          })
          .eq('user_id', uid)
      ).error,
    )
  },
}
