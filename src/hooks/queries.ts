import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { repo, type DateRange, type NewTransaction, type TransactionPatch } from '../data'
import { getMonthRange, type MonthKey } from '../lib/dates'
import { fetchRates } from '../lib/rates'
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

function invalidateTransactionData(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['transactions'] })
  qc.invalidateQueries({ queryKey: ['balances'] })
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
