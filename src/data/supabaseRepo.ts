import { getSupabase } from '../lib/supabase'
import type { CategoryType } from '../types/database.types'
import type {
  AccountPatch,
  CategoryPatch,
  NewAccount,
  NewCategory,
  NewTransaction,
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
    const text = filter.text?.trim()
    if (text) q = q.ilike('note', `%${text}%`)
    const { data, error } = await q
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
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
    await Promise.all(
      orderedIds.map((id, i) =>
        getSupabase().from('accounts').update({ sort_order: i }).eq('id', id),
      ),
    )
  },

  async createCategory(input: NewCategory) {
    const user_id = await currentUserId()
    const sort_order = await nextSortOrder('categories', input.type)
    const { data, error } = await getSupabase()
      .from('categories')
      .insert({ ...input, user_id, sort_order })
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
    await Promise.all(
      orderedIds.map((id, i) =>
        getSupabase().from('categories').update({ sort_order: i }).eq('id', id),
      ),
    )
  },
}
