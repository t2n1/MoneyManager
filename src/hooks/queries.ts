import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  repo,
  type AccountPatch,
  type AssetGroupSettingPatch,
  type CategoryPatch,
  type DateRange,
  type DebtPatch,
  type NewAccount,
  type NewCategory,
  type NewDebt,
  type NewDebtPayment,
  type NewRecurringRule,
  type NewSavingsGoal,
  type NewTransaction,
  type NewValuation,
  type ProfilePatch,
  type RecurringRulePatch,
  type NewTag,
  type SavingsGoalPatch,
  type TagPatch,
  type TransactionPatch,
  type TxFilter,
} from '../data'
import { addMonths, getMonthRange, monthKeyForDate, monthKeyString, toISODate, type MonthKey } from '../lib/dates'
import { buildBudgetReport, carryFromPreviousMonth, type BudgetReport } from '../features/budgets/progress'
import { fetchRates } from '../lib/rates'
import type { CurrencyCode } from '../lib/money'
import type { TransactionRow } from '../types/database.types'
import { runRecurringCatchUp } from '../lib/recurring'
import { runCardAutopayCatchUp } from '../lib/cardAutopay'
import { useProfile } from './useProfile'

export { useProfile }

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: ProfilePatch) => repo.updateProfile(patch),
    onSettled: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  })
}

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

/** Một giao dịch theo id (vd: mở từ lịch sử trả nợ). null nếu đã bị xóa. */
export function useTransaction(id: string | null) {
  return useQuery({
    queryKey: ['transaction', id],
    queryFn: () => repo.getTransaction(id!),
    enabled: !!id,
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
  // Giao dịch có thể mang nhãn → liên kết nhãn đổi theo
  qc.invalidateQueries({ queryKey: ['transactionTags'] })
}

// --- Nhãn cắt ngang danh mục ---

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => repo.getTags(),
    staleTime: 5 * 60_000,
  })
}

export function useTransactionTags() {
  return useQuery({
    queryKey: ['transactionTags'],
    queryFn: () => repo.getTransactionTags(),
    staleTime: 60_000,
  })
}

function invalidateTags(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['tags'] })
  qc.invalidateQueries({ queryKey: ['transactionTags'] })
}

export function useCreateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewTag) => repo.createTag(input),
    onSettled: () => invalidateTags(qc),
  })
}

export function useUpdateTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TagPatch }) => repo.updateTag(id, patch),
    onSettled: () => invalidateTags(qc),
  })
}

export function useDeleteTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.deleteTag(id),
    onSettled: () => invalidateTags(qc),
  })
}

export function useSetTransactionTags() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ transactionId, tagIds }: { transactionId: string; tagIds: string[] }) =>
      repo.setTransactionTags(transactionId, tagIds),
    onSettled: () => invalidateTags(qc),
  })
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
        recurring_rule_id: null,
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

export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.deleteAccount(id),
    onSettled: () => invalidateAccounts(qc),
  })
}

// --- Đầu tư: giá trị thị trường (mục AE) ---

export function useAccountValuations() {
  return useQuery({
    queryKey: ['valuations'],
    queryFn: () => repo.getAccountValuations(),
    staleTime: 60_000,
  })
}

function invalidateValuations(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['valuations'] })
  // Số dư (view) lộ market_value → Tổng tài sản / Tài sản ròng phụ thuộc snapshot
  qc.invalidateQueries({ queryKey: ['balances'] })
}

export function useUpsertValuation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewValuation) => repo.upsertValuation(input),
    onSettled: () => invalidateValuations(qc),
  })
}

export function useDeleteValuation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.deleteValuation(id),
    onSettled: () => invalidateValuations(qc),
  })
}

// --- Mục tiêu tiết kiệm (mục AD) ---

export function useSavingsGoals() {
  return useQuery({
    queryKey: ['savingsGoals'],
    queryFn: () => repo.getSavingsGoals(),
    staleTime: 60_000,
  })
}

function invalidateSavingsGoals(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['savingsGoals'] })
}

export function useCreateSavingsGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewSavingsGoal) => repo.createSavingsGoal(input),
    onSettled: () => invalidateSavingsGoals(qc),
  })
}

export function useUpdateSavingsGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SavingsGoalPatch }) =>
      repo.updateSavingsGoal(id, patch),
    onSettled: () => invalidateSavingsGoals(qc),
  })
}

export function useDeleteSavingsGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.deleteSavingsGoal(id),
    onSettled: () => invalidateSavingsGoals(qc),
  })
}

// --- Lịch sử tài sản ròng (mục AF) ---

export function useNetWorthSnapshots() {
  return useQuery({
    queryKey: ['networthSnapshots'],
    queryFn: () => repo.getNetWorthSnapshots(),
    staleTime: 5 * 60_000,
  })
}

export function useUpsertNetWorthSnapshot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ snapshotOn, netWorth }: { snapshotOn: string; netWorth: number }) =>
      repo.upsertNetWorthSnapshot(snapshotOn, netWorth),
    onSettled: () => qc.invalidateQueries({ queryKey: ['networthSnapshots'] }),
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

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.deleteCategory(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['budgets'] })
    },
  })
}

// --- Nhóm tài sản ---

export function useAssetGroupSettings() {
  return useQuery({
    queryKey: ['assetGroupSettings'],
    queryFn: () => repo.getAssetGroupSettings(),
    staleTime: 5 * 60_000,
  })
}

/** Đổi/gán nhóm ảnh hưởng cả accounts + balances + cài đặt nhóm. */
function invalidateAssetGroups(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['assetGroupSettings'] })
  qc.invalidateQueries({ queryKey: ['accounts'] })
  qc.invalidateQueries({ queryKey: ['balances'] })
}

export function useUpsertAssetGroupSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, patch }: { name: string; patch: AssetGroupSettingPatch }) =>
      repo.upsertAssetGroupSetting(name, patch),
    onSettled: () => invalidateAssetGroups(qc),
  })
}

export function useRenameAssetGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ oldName, newName }: { oldName: string; newName: string }) =>
      repo.renameAssetGroup(oldName, newName),
    onSettled: () => invalidateAssetGroups(qc),
  })
}

export function useDeleteAssetGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, reassignTo }: { name: string; reassignTo: string | null }) =>
      repo.deleteAssetGroup(name, reassignTo),
    onSettled: () => invalidateAssetGroups(qc),
  })
}

export function useReorderAssetGroups() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orderedNames: string[]) => repo.reorderAssetGroups(orderedNames),
    onSettled: () => invalidateAssetGroups(qc),
  })
}

export function useAssignAccountsToGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ accountIds, group }: { accountIds: string[]; group: string | null }) =>
      repo.assignAccountsToGroup(accountIds, group),
    onSettled: () => invalidateAssetGroups(qc),
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
      rollover,
    }: {
      categoryId: string
      monthKey: string
      amount: number
      rollover?: boolean
    }) => repo.upsertBudget(categoryId, monthKey, amount, rollover),
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
  const prevMonthKey = addMonths(monthKey, -1)
  const budgetsQ = useBudgets(monthKeyStr)
  const { data: monthTxs, isLoading: txLoading } = useMonthTransactions(monthKey)
  // Dồn hạn mức (mục AH): cần budgets + giao dịch tháng trước để tính phần chưa tiêu
  const prevBudgetsQ = useBudgets(monthKeyString(prevMonthKey))
  const { data: prevMonthTxs } = useMonthTransactions(prevMonthKey)
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { base, rates } = useRates()

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? base
  // Model "đặt ở cha trước": hạn mức đặt ở danh mục CHA là trần chung cho cả
  // nhóm (spent = tổng chi cha + con); hạn mức ở CON của nhóm đã có trần chỉ là
  // mốc theo dõi. parentOf cho progress biết quan hệ cha–con để tính trần nhóm.
  const parentById = new Map(categories.map((c) => [c.id, c.parent_id]))
  const parentOf = (categoryId: string): string | null => parentById.get(categoryId) ?? null

  const budgets = budgetsQ.data
  const hasRollover = !!budgets?.some((b) => b.rollover)
  const carry =
    hasRollover && prevBudgetsQ.data && prevMonthTxs
      ? carryFromPreviousMonth(prevBudgetsQ.data, prevMonthTxs, currencyOf, base, rates ?? {}, parentOf)
      : new Map<string, number>()
  const report =
    budgets && monthTxs
      ? buildBudgetReport(budgets, monthTxs, currencyOf, base, rates ?? {}, parentOf, carry)
      : undefined

  return { report, isLoading: budgetsQ.isLoading || txLoading }
}

// --- Nợ / cho vay (mục F) ---

export function useDebts() {
  return useQuery({
    queryKey: ['debts'],
    queryFn: () => repo.getDebts(),
    staleTime: 60_000,
  })
}

export function useDebtPayments() {
  return useQuery({
    queryKey: ['debtPayments'],
    queryFn: () => repo.getDebtPayments(),
    staleTime: 60_000,
  })
}

function invalidateDebts(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['debts'] })
  qc.invalidateQueries({ queryKey: ['debtPayments'] })
}

export function useCreateDebt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewDebt) => repo.createDebt(input),
    // Có thể kèm giao dịch giải ngân → làm mới giao dịch + số dư
    onSettled: () => {
      invalidateDebts(qc)
      invalidateTransactionData(qc)
    },
  })
}

export function useUpdateDebt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: DebtPatch }) => repo.updateDebt(id, patch),
    onSettled: () => invalidateDebts(qc),
  })
}

export function useDeleteDebt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.deleteDebt(id),
    // Xóa nợ có thể xóa giao dịch liên kết → làm mới cả giao dịch + số dư
    onSettled: () => {
      invalidateDebts(qc)
      invalidateTransactionData(qc)
    },
  })
}

export function useCreateDebtPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewDebtPayment) => repo.createDebtPayment(input),
    // Có thể sinh giao dịch thật → làm mới giao dịch + số dư
    onSettled: () => {
      invalidateDebts(qc)
      invalidateTransactionData(qc)
    },
  })
}

export function useDeleteDebtPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.deleteDebtPayment(id),
    onSettled: () => {
      invalidateDebts(qc)
      invalidateTransactionData(qc)
    },
  })
}

// --- Giao dịch định kỳ (mục C+D) ---

export function useRecurringRules() {
  return useQuery({
    queryKey: ['recurringRules'],
    queryFn: () => repo.listRecurringRules(),
    staleTime: 60_000,
  })
}

function invalidateRecurringRules(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['recurringRules'] })
}

export function useCreateRecurringRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewRecurringRule) => repo.createRecurringRule(input),
    onSettled: () => invalidateRecurringRules(qc),
  })
}

export function useUpdateRecurringRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: RecurringRulePatch }) =>
      repo.updateRecurringRule(id, patch),
    onSettled: () => invalidateRecurringRules(qc),
  })
}

export function useDeleteRecurringRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.deleteRecurringRule(id),
    // Xóa rule set null recurring_rule_id trên giao dịch (mất badge) → làm mới giao dịch
    onSettled: () => {
      invalidateRecurringRules(qc)
      invalidateTransactionData(qc)
    },
  })
}

/**
 * Chạy catch-up khi mở app: sinh giao dịch định kỳ rồi tự động trả thẻ (theo thứ
 * tự, vì tự trả thẻ đọc số dư sau khi định kỳ đã ghi). mutateAsync trả về số giao
 * dịch đã tạo của từng loại.
 */
export function useRunRecurringCatchUp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const today = toISODate(new Date())
      const recurring = await runRecurringCatchUp(repo, today)
      const autopay = await runCardAutopayCatchUp(repo, today)
      return { recurring, autopay }
    },
    onSuccess: ({ recurring, autopay }) => {
      invalidateRecurringRules(qc)
      if (recurring > 0 || autopay > 0) invalidateTransactionData(qc)
    },
  })
}

/** Số danh mục vượt ngân sách trong "tháng hiện tại" — cho badge cảnh báo. */
export function useBudgetAlert(): { overCount: number; monthKey: MonthKey } {
  const { data: profile } = useProfile()
  const monthStartDay = profile?.month_start_day ?? 1
  const monthKey = monthKeyForDate(toISODate(new Date()), monthStartDay)
  const { report } = useBudgetReport(monthKey)
  return { overCount: report?.overCount ?? 0, monthKey }
}

// --- Thông báo (mục AO) ---

export function useNotificationState() {
  return useQuery({
    queryKey: ['notificationState'],
    queryFn: () => repo.getNotificationState(),
    staleTime: 60_000,
  })
}

function invalidateNotificationState(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['notificationState'] })
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (keys: string[]) => repo.markNotificationsRead(keys),
    onSettled: () => invalidateNotificationState(qc),
  })
}

export function useDismissNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: string) => repo.dismissNotification(key),
    onSettled: () => invalidateNotificationState(qc),
  })
}

export function useDeleteNotificationStates() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (keys: string[]) => repo.deleteNotificationStates(keys),
    onSettled: () => invalidateNotificationState(qc),
  })
}

export function usePruneNotificationState() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (beforeISO: string) => repo.pruneNotificationState(beforeISO),
    onSettled: () => invalidateNotificationState(qc),
  })
}
