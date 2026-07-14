import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  repo,
  type AccountPatch,
  type CategoryPatch,
  type DateRange,
  type NewAccount,
  type NewCategory,
  type NewTransaction,
  type TransactionPatch,
  type TxFilter,
} from '../data'
import { getMonthRange, monthKeyForDate, monthKeyString, toISODate, type MonthKey } from '../lib/dates'
import { buildBudgetReport, type BudgetReport } from '../features/budgets/progress'
import { fetchRates } from '../lib/rates'
import type { CurrencyCode } from '../lib/money'
import type { TransactionRow } from '../types/database.types'
import { useProfile } from './useProfile'

export { useProfile }

/** Tỷ giá quy đổi về base currency của profile (cache 12h + localStorage). */
export function useRates() {
  const { data: profile } = useProfile()
  const base = profile?.base_currency ?? 'JPY'
  const query = useQuery({
    queryKey: ['rates', base],
    queryFn: () => fetchRates(base),
    staleTime: 12 * 3600_000,
    gcTime: 24 * 3600_000,
    retry: 1,
  })
  return { base, rates: query.data, isLoading: query.isLoading }
}

export function useAccounts() {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: () => repo.getAccounts(),
    staleTime: 5 * 60_000,
  })
}

export function useAccountBalances() {
  return useQuery({
    queryKey: ['balances'],
    queryFn: () => repo.getAccountBalances(),
  })
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => repo.getCategories(),
    staleTime: 5 * 60_000,
  })
}

/** Giao dịch của "tháng" đang xem (tôn trọng month_start_day trong profile). */
export function useMonthTransactions(monthKey: MonthKey) {
  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const range = getMonthRange(monthKey, monthStartDay)
  const query = useQuery({
    queryKey: ['transactions', range.start, range.end],
    queryFn: () => repo.listTransactions(range),
    enabled: !!profile,
  })
  return { range, ...query }
}

/** Giao dịch trong một khoảng ngày tùy ý (cho báo cáo nhiều tháng). */
export function useRangeTransactions(range: DateRange, enabled = true) {
  return useQuery({
    queryKey: ['transactions', range.start, range.end],
    queryFn: () => repo.listTransactions(range),
    enabled,
  })
}

/** Tìm kiếm giao dịch theo bộ lọc (ghi chú, loại, danh mục, tài khoản, khoảng ngày). */
export function useSearchTransactions(filter: TxFilter, enabled = true) {
  return useQuery({
    queryKey: ['search', filter],
    queryFn: () => repo.searchTransactions(filter),
    enabled,
  })
}

function invalidateTransactionData(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['transactions'] })
  qc.invalidateQueries({ queryKey: ['balances'] })
  qc.invalidateQueries({ queryKey: ['search'] })
}

export function useCreateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewTransaction) => repo.createTransaction(input),
    // Optimistic: chèn ngay vào cache của tháng chứa occurred_on để UI phản hồi tức thì
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ['transactions'] })
      const snapshots = qc.getQueriesData<TransactionRow[]>({ queryKey: ['transactions'] })
      const optimistic: TransactionRow = {
        ...input,
        id: `optimistic-${Date.now()}`,
        user_id: 'me',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      for (const [key, rows] of snapshots) {
        const [, start, end] = key as ['transactions', string, string]
        if (rows && input.occurred_on >= start && input.occurred_on < end) {
          qc.setQueryData<TransactionRow[]>(key, [optimistic, ...rows])
        }
      }
      return { snapshots }
    },
    onError: (_err, _input, ctx) => {
      for (const [key, rows] of ctx?.snapshots ?? []) qc.setQueryData(key, rows)
    },
    onSettled: () => invalidateTransactionData(qc),
  })
}

export function useUpdateTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TransactionPatch }) =>
      repo.updateTransaction(id, patch),
    onSettled: () => invalidateTransactionData(qc),
  })
}

export function useDeleteTransaction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.deleteTransaction(id),
    onSettled: () => invalidateTransactionData(qc),
  })
}

// --- Quản lý tài khoản & danh mục (GĐ2) ---

function invalidateAccounts(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['accounts'] })
  qc.invalidateQueries({ queryKey: ['balances'] })
}

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewAccount) => repo.createAccount(input),
    onSettled: () => invalidateAccounts(qc),
  })
}

export function useUpdateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: AccountPatch }) =>
      repo.updateAccount(id, patch),
    onSettled: () => invalidateAccounts(qc),
  })
}

export function useReorderAccounts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orderedIds: string[]) => repo.reorderAccounts(orderedIds),
    onSettled: () => invalidateAccounts(qc),
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewCategory) => repo.createCategory(input),
    onSettled: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CategoryPatch }) =>
      repo.updateCategory(id, patch),
    onSettled: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

export function useReorderCategories() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orderedIds: string[]) => repo.reorderCategories(orderedIds),
    onSettled: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

// --- Ngân sách tháng (GĐ3) ---

export function useBudgets(monthKey: string) {
  return useQuery({
    queryKey: ['budgets', monthKey],
    queryFn: () => repo.listBudgets(monthKey),
  })
}

function invalidateBudgets(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['budgets'] })
}

export function useUpsertBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      categoryId,
      monthKey,
      amount,
    }: {
      categoryId: string
      monthKey: string
      amount: number
    }) => repo.upsertBudget(categoryId, monthKey, amount),
    onSettled: () => invalidateBudgets(qc),
  })
}

export function useDeleteBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.deleteBudget(id),
    onSettled: () => invalidateBudgets(qc),
  })
}

export function useCopyBudgetsFromPreviousMonth() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (monthKey: string) => repo.copyBudgetsFromPreviousMonth(monthKey),
    onSettled: () => invalidateBudgets(qc),
  })
}

/** Kết hợp budgets + giao dịch tháng + tỷ giá → báo cáo tiến độ ngân sách. */
export function useBudgetReport(monthKey: MonthKey): {
  report: BudgetReport | undefined
  isLoading: boolean
} {
  const monthKeyStr = monthKeyString(monthKey)
  const budgetsQ = useBudgets(monthKeyStr)
  const { data: monthTxs, isLoading: txLoading } = useMonthTransactions(monthKey)
  const { data: accounts = [] } = useAccounts()
  const { base, rates } = useRates()

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? base

  const budgets = budgetsQ.data
  const report =
    budgets && monthTxs
      ? buildBudgetReport(budgets, monthTxs, currencyOf, base, rates ?? {})
      : undefined

  return { report, isLoading: budgetsQ.isLoading || txLoading }
}

/** Số danh mục vượt ngân sách trong "tháng hiện tại" — cho badge cảnh báo. */
export function useBudgetAlert(): { overCount: number; monthKey: MonthKey } {
  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const monthKey = monthKeyForDate(toISODate(new Date()), monthStartDay)
  const { report } = useBudgetReport(monthKey)
  return { overCount: report?.overCount ?? 0, monthKey }
}
