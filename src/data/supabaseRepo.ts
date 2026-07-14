import { getSupabase } from '../lib/supabase'
import type { NewTransaction, Repo, TransactionPatch } from './repo'

// Repo thật: mọi bảo mật nằm ở RLS phía Postgres.

async function currentUserId(): Promise<string> {
  const {
    data: { user },
  } = await getSupabase().auth.getUser()
  if (!user) throw new Error('Chưa đăng nhập')
  return user.id
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
}
