import { normalizeText } from '../features/transactions/filter'
import { addMonths, monthKeyString, parseMonthKey } from '../lib/dates'
import { getSupabase } from '../lib/supabase'
import type { CategoryType } from '../types/database.types'
import type {
  AccountPatch,
  AssetGroupSettingPatch,
  CategoryPatch,
  DebtPatch,
  NewAccount,
  NewCategory,
  NewDebt,
  NewDebtPayment,
  NewRecurringOccurrence,
  NewRecurringRule,
  NewTransaction,
  ProfilePatch,
  RecurringRulePatch,
  Repo,
  TransactionPatch,
  TxFilter,
} from './repo'

// Repo thật: mọi bảo mật nằm ở RLS phía Postgres.

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

  async createTransaction(input: NewTransaction) {
    const user_id = await currentUserId()
    const { data, error } = await getSupabase()
      .from('transactions')
      .insert({ ...input, user_id })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateTransaction(id: string, patch: TransactionPatch) {
    const { data, error } = await getSupabase()
      .from('transactions')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
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

  async upsertBudget(categoryId: string, monthKey: string, amount: number) {
    const user_id = await currentUserId()
    const { data, error } = await getSupabase()
      .from('budgets')
      .upsert(
        { user_id, category_id: categoryId, month_key: monthKey, amount },
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
      .select('category_id, amount')
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
      .map((r) => ({ user_id, category_id: r.category_id, month_key: monthKey, amount: r.amount }))
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
    const { data, error } = await getSupabase()
      .from('debts')
      .insert({ ...input, user_id })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateDebt(id: string, patch: DebtPatch) {
    const { data, error } = await getSupabase()
      .from('debts')
      .update(patch)
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
    const txIds = (payments ?? [])
      .map((p) => p.transaction_id)
      .filter((t): t is string => !!t)
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
      const { data: tx, error: eTx } = await sb
        .from('transactions')
        .insert({ ...input.transaction, user_id })
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
    const { error } = await getSupabase().from('transactions').insert({ ...input, user_id })
    if (error) {
      // 23505 = unique_violation: thiết bị khác đã sinh kỳ này → bỏ qua im lặng
      if (error.code === '23505') return false
      throw error
    }
    return true
  },
}
