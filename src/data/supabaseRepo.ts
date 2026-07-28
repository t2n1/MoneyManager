import { normalizeText } from '../features/transactions/filter'
import { addMonths, monthKeyString, parseMonthKey } from '../lib/dates'
import type { CurrencyCode } from '../lib/money'
import type { Rates } from '../lib/rates'
import { getSupabase } from '../lib/supabase'
import type {
  AccountRow,
  AccountValuationRow,
  AssetGroupSettingRow,
  BudgetRow,
  CategoryRow,
  CategoryType,
  DebtPaymentRow,
  DebtRow,
  NetWorthSnapshotRow,
  RecurringRuleRow,
  SavingsGoalRow,
  TagRow,
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
  type NewAccount,
  type NewCategory,
  type NewDebt,
  type NewDebtPayment,
  type NewRecurringOccurrence,
  type NewRecurringRule,
  type NewSavingsGoal,
  type NewTag,
  type NewTransaction,
  type NewValuation,
  type ProfilePatch,
  type RecurringRulePatch,
  type Repo,
  type SavingsGoalPatch,
  type TagPatch,
  type TransactionPatch,
  type TxFilter,
} from './repo'

// Repo thật: mọi bảo mật nằm ở RLS phía Postgres.

/** Các bảng dữ liệu người dùng (không gồm view account_balances). */
type DataTable =
  | 'accounts'
  | 'categories'
  | 'transactions'
  | 'budgets'
  | 'asset_group_settings'
  | 'debts'
  | 'debt_payments'
  | 'recurring_rules'
  | 'account_valuations'
  | 'savings_goals'
  | 'networth_snapshots'
  | 'tags'
  | 'transaction_tags'

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
    const { data, error } = await getSupabase()
      .from('transactions')
      .select('*')
      .gte('occurred_on', start)
      .lt('occurred_on', end)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async searchTransactions(filter: TxFilter) {
    let q = getSupabase()
      .from('transactions')
      .select('*')
      .gte('occurred_on', filter.start)
      .lt('occurred_on', filter.end)
    if (filter.types && filter.types.length > 0) q = q.in('type', filter.types)
    if (filter.categoryIds && filter.categoryIds.length > 0)
      q = q.in('category_id', filter.categoryIds)
    if (filter.accountIds && filter.accountIds.length > 0) {
      const ids = filter.accountIds.map((id) => `"${id}"`).join(',')
      q = q.or(`account_id.in.(${ids}),to_account_id.in.(${ids})`)
    }
    if (filter.amountMin != null) q = q.gte('amount', filter.amountMin)
    if (filter.amountMax != null) q = q.lte('amount', filter.amountMax)
    const { data, error } = await q
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error
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

    const { error } = await sb.from('accounts').delete().eq('id', id)
    if (error) throw error
  },

  async getAccountValuations() {
    const { data, error } = await getSupabase()
      .from('account_valuations')
      .select('*')
      .order('valued_on', { ascending: false })
    if (error) throw error
    return data
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

  async getNetWorthSnapshots() {
    const { data, error } = await getSupabase()
      .from('networth_snapshots')
      .select('*')
      .order('snapshot_on')
    if (error) throw error
    return data
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
    const { data, error } = await getSupabase().from('notification_state').select('*')
    if (error) throw error
    return data
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
    const { error } = await getSupabase().from('notification_state').delete().in('key', keys)
    if (error) throw error
  },

  async pruneNotificationState(beforeISO: string) {
    // `is('dismissed_at', null)`: dòng ĐÃ TẮT không bao giờ bị dọn — "tắt là mất hẳn"
    // (mục C.2/E của spec). Giữ y hệt demoRepo.
    const { error } = await getSupabase()
      .from('notification_state')
      .delete()
      .lt('created_at', beforeISO)
      .is('dismissed_at', null)
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
    await getSupabase()
      .from('asset_group_settings')
      .upsert(
        orderedNames.map((name, i) => ({ user_id, name, sort_order: i })),
        { onConflict: 'user_id,name' },
      )
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

  async getDebts() {
    const { data, error } = await getSupabase()
      .from('debts')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async getDebtPayments() {
    const { data, error } = await getSupabase()
      .from('debt_payments')
      .select('*')
      .order('paid_on', { ascending: false })
    if (error) throw error
    return data
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
    const { data, error } = await getSupabase()
      .from('recurring_rules')
      .insert({ ...input, user_id })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateRecurringRule(id: string, patch: RecurringRulePatch) {
    const { data, error } = await getSupabase()
      .from('recurring_rules')
      .update(patch)
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
    const { data, error } = await getSupabase().from('transaction_tags').select('*')
    if (error) throw error
    return data ?? []
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
      const { data, error } = await sb.from(table).select('*')
      if (error) throw error
      return (data ?? []) as T[]
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
      tags,
      transactionTags,
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
      selectAll<TagRow>('tags'),
      selectAll<TransactionTagRow>('transaction_tags'),
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
      tags,
      transactionTags,
    }
  },

  async importAll(data: BackupData) {
    const uid = await currentUserId()
    const sb = getSupabase()
    const ok = (error: { message: string } | null) => {
      if (error) throw error
    }

    // 1) Xóa dữ liệu hiện có theo thứ tự con → cha (tránh vướng FK)
    const deleteOrder: DataTable[] = [
      'account_valuations',
      'savings_goals',
      'networth_snapshots',
      'transaction_tags',
      'tags',
      'debt_payments',
      'debts',
      'budgets',
      'transactions',
      'recurring_rules',
      'asset_group_settings',
      'categories',
      'accounts',
    ]
    for (const table of deleteOrder) {
      ok((await sb.from(table).delete().eq('user_id', uid)).error)
    }

    // 2) Nhập lại theo thứ tự cha → con, giữ nguyên id, đóng dấu user_id hiện tại.
    // accounts: payment_account_id là self-FK → chèn null trước, cập nhật sau.
    if (data.accounts?.length) {
      ok(
        (
          await sb.from('accounts').insert(
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
          )
        ).error,
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
    if (parents.length) ok((await sb.from('categories').insert(parents.map(catPayload))).error)
    if (children.length) ok((await sb.from('categories').insert(children.map(catPayload))).error)

    if (data.recurringRules?.length) {
      ok(
        (
          await sb.from('recurring_rules').insert(
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
          )
        ).error,
      )
    }

    if (data.transactions?.length) {
      ok(
        (
          await sb.from('transactions').insert(
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
          )
        ).error,
      )
    }

    if (data.budgets?.length) {
      ok(
        (
          await sb.from('budgets').insert(
            data.budgets.map((b) => ({
              id: b.id,
              user_id: uid,
              category_id: b.category_id,
              month_key: b.month_key,
              amount: b.amount,
              rollover: b.rollover,
            })),
          )
        ).error,
      )
    }

    if (data.assetGroupSettings?.length) {
      ok(
        (
          await sb.from('asset_group_settings').insert(
            data.assetGroupSettings.map((s) => ({
              id: s.id,
              user_id: uid,
              name: s.name,
              sort_order: s.sort_order,
              include_in_totals: s.include_in_totals,
              is_hidden: s.is_hidden,
            })),
          )
        ).error,
      )
    }

    if (data.debts?.length) {
      ok(
        (
          await sb.from('debts').insert(
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
              disbursement_transaction_id: d.disbursement_transaction_id,
            })),
          )
        ).error,
      )
    }

    if (data.debtPayments?.length) {
      ok(
        (
          await sb.from('debt_payments').insert(
            data.debtPayments.map((p) => ({
              id: p.id,
              user_id: uid,
              debt_id: p.debt_id,
              amount: p.amount,
              paid_on: p.paid_on,
              transaction_id: p.transaction_id,
              note: p.note,
            })),
          )
        ).error,
      )
    }

    // account_valuations: composite FK tới accounts → chèn sau accounts.
    if (data.accountValuations?.length) {
      ok(
        (
          await sb.from('account_valuations').insert(
            data.accountValuations.map((v) => ({
              id: v.id,
              user_id: uid,
              account_id: v.account_id,
              valued_on: v.valued_on,
              market_value: v.market_value,
              note: v.note,
            })),
          )
        ).error,
      )
    }

    // savings_goals: FK tới accounts → chèn sau accounts.
    if (data.savingsGoals?.length) {
      ok(
        (
          await sb.from('savings_goals').insert(
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
          )
        ).error,
      )
    }

    // networth_snapshots: chỉ phụ thuộc user → chèn độc lập.
    if (data.networthSnapshots?.length) {
      ok(
        (
          await sb.from('networth_snapshots').insert(
            data.networthSnapshots.map((s) => ({
              id: s.id,
              user_id: uid,
              snapshot_on: s.snapshot_on,
              net_worth: s.net_worth,
            })),
          )
        ).error,
      )
    }

    // tags trước, rồi liên kết (composite FK tới cả transactions lẫn tags).
    if (data.tags?.length) {
      ok(
        (
          await sb.from('tags').insert(
            data.tags.map((t) => ({
              id: t.id,
              user_id: uid,
              name: t.name,
              color: t.color,
              sort_order: t.sort_order,
            })),
          )
        ).error,
      )
    }

    if (data.transactionTags?.length) {
      ok(
        (
          await sb.from('transaction_tags').insert(
            data.transactionTags.map((l) => ({
              transaction_id: l.transaction_id,
              tag_id: l.tag_id,
              user_id: uid,
            })),
          )
        ).error,
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

    // 4) Hồ sơ: khôi phục tên hiển thị, ngày bắt đầu tháng, tiền gốc.
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
          })
          .eq('user_id', uid)
      ).error,
    )
  },
}
