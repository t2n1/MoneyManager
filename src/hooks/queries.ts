import { useMemo } from 'react'
import type { NewLifetimeVerdictSnapshot } from '../data/repo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  repo,
  type AccountPatch,
  type AssetGroupSettingPatch,
  type BenefitTxFilter,
  type CategoryPatch,
  type DateRange,
  type DebtPatch,
  type FundTradePatch,
  type NewAccount,
  type NewCategory,
  type NewDebt,
  type NewDebtPayment,
  type NewFundTrade,
  type NewPlannedExpense,
  type NewRecurringRule,
  type NewRelative,
  type NewTrip,
  type NewSavingsGoal,
  type NewStockTrade,
  type NewTransaction,
  type NewValuation,
  type PlannedExpensePatch,
  type ProfilePatch,
  type RecurringRulePatch,
  type RelativePatch,
  type NewTag,
  type NewTagGroup,
  type SavingsGoalPatch,
  type StockTradePatch,
  type TagPatch,
  type TagGroupPatch,
  type TransactionPatch,
  type TxFilter,
} from '../data'
import { addMonths, getMonthRange, monthKeyString, toISODate, type MonthKey } from '../lib/dates'
import { transferCategoryIds } from '../features/categories/kind'
import { buildBudgetReport, carryFromPreviousMonth, type BudgetReport } from '../features/budgets/progress'
import { fetchRates } from '../lib/rates'
import type { CurrencyCode } from '../lib/money'
import type { TransactionRow } from '../types/database.types'
import { runRecurringCatchUp } from '../lib/recurring'
import { runCardAutopayCatchUp } from '../lib/cardAutopay'
import { useProfile } from './useProfile'

export { useProfile }

/** Khoá để nơi khác đếm được "đang có lượt ghi hồ sơ chạy" bằng `useIsMutating`. */
export const PROFILE_MUTATION_KEY = ['profile-update'] as const

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    // mutationKey KHÔNG dùng để cache gì cả — nó chỉ để `useDensitySync` biết mà tạm
    // ngừng bơm giá trị từ hồ sơ vào bản sao trong lúc đang gửi. Xem useDensity.ts.
    mutationKey: PROFILE_MUTATION_KEY,
    mutationFn: (patch: ProfilePatch) => repo.updateProfile(patch),
    // PHẢI return promise này (không phải gọi rồi bỏ qua): React Query đợi promise
    // của onSettled này xong rồi mới chạy onSettled truyền vào .mutate() ở nơi gọi.
    // NotificationSettingsPage dựa vào thứ tự đó để xoá bản nháp pendingOff ĐÚNG LÚC
    // dữ liệu mới đã về cache — bỏ return sẽ làm công tắc nhảy giật về trạng thái cũ.
    onSettled: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  })
}

/** Tỷ giá quy đổi về base currency của profile (cache 12h + localStorage). */
export function useRates() {
  const { data: profile } = useProfile()
  const base = profile?.base_currency ?? 'JPY'
  const query = useQuery({
    queryKey: ['rates', base],
    queryFn: async () => {
      const rates = await fetchRates(base)
      // Tích lịch sử tỷ giá cho luật "tỷ giá đẹp" ở đợt sau. Ghi hỏng thì kệ —
      // không được làm hỏng việc lấy tỷ giá (mục H của spec).
      void Promise.resolve().then(() =>
        repo.recordFxRates(toISODate(new Date()), base, rates)
      ).catch(() => {})
      return rates
    },
    staleTime: 12 * 3600_000,
    gcTime: 24 * 3600_000,
    retry: 1,
  })
  // `isSuccess` được trả ra vì có nơi cần biết tỷ giá ĐÃ VỀ hay chưa, không chỉ
  // "đã hết loading": `rates === undefined` sau khi query lỗi cũng là hết loading.
  // Bộ luật thông báo dùng nó làm cổng dọn trạng thái (mục E) — dọn khi chưa có tỷ
  // giá là xóa oan mọi thông báo tính từ tiền ngoại tệ.
  return { base, rates: query.data, isLoading: query.isLoading, isSuccess: query.isSuccess }
}

/**
 * Lịch sử tỷ giá đã tích (fx_history) trong [from, to]. Bảng chỉ có dòng ở ngày người
 * dùng mở app và chỉ tích từ cuối 07/2026 — chỗ đọc tự chọn dòng gần nhất, không đòi đủ
 * từng ngày. Lịch sử không đổi ngược về quá khứ nên cache lâu được.
 */
export function useFxHistory(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ['fxHistory', from, to],
    queryFn: () => repo.listFxHistory(from, to),
    enabled,
    staleTime: 12 * 3600_000,
    gcTime: 24 * 3600_000,
  })
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

/**
 * Id của những danh mục CHUYỂN TÀI SẢN (`kind = 'transfer'`).
 *
 * Mọi màn tính tổng chi phải truyền tập này vào hàm tổng hợp. Một hook để không màn nào
 * phải tự dựng nó — hai màn dựng hai tập khác nhau thì chi tháng 8 ra hai con số, đúng
 * cái lỗi cột `kind` được thêm để chấm dứt.
 *
 * Hook nằm ở đây, KHÔNG ở `features/categories/kind.ts`: file đó bị `reports/aggregate.ts`
 * import, mà aggregate lại nằm trong đồ thị import của bộ luật thông báo — thêm React vào
 * đó là `purity.test.ts` đỏ ngay.
 */
export function useTransferCategoryIds(): ReadonlySet<string> {
  const { data: categories = [] } = useCategories()
  return useMemo(() => transferCategoryIds(categories), [categories])
}

/** Lịch sử điểm sức khỏe đã chấm (migration 0048), cũ → mới. */
export function useHealthSnapshots() {
  return useQuery({
    queryKey: ['healthSnapshots'],
    queryFn: () => repo.getHealthSnapshots(),
    staleTime: 5 * 60_000,
  })
}

/**
 * Ghi điểm của tháng đang chạy.
 *
 * KHÔNG invalidate query `healthSnapshots` sau khi ghi: tab Sức khỏe đọc lịch sử để vẽ xu
 * hướng, và invalidate sẽ nạp lại rồi đưa chính điểm vừa ghi vào làm mốc "trước đó" — xu
 * hướng thành +0 vĩnh viễn. Điểm mới chỉ cần có mặt ở lần MỞ SAU.
 */
export function useUpsertHealthSnapshot() {
  return useMutation({
    mutationFn: (v: { monthOn: string; score: number; coverageBps: number }) =>
      repo.upsertHealthSnapshot(v.monthOn, v.score, v.coverageBps),
  })
}

/** Lịch sử kết luận tab Tương lai của một kịch bản (migration 0055), cũ → mới. */
export function useLifetimeVerdictSnapshots(scenarioId: string | undefined) {
  return useQuery({
    queryKey: ['lifetimeVerdictSnapshots', scenarioId],
    queryFn: () => repo.getLifetimeVerdictSnapshots(scenarioId as string),
    enabled: !!scenarioId,
    staleTime: 5 * 60_000,
  })
}

/**
 * Ghi kết luận của tháng đang chạy cho một kịch bản.
 *
 * KHÔNG invalidate `lifetimeVerdictSnapshots` sau khi ghi — cùng lý do với
 * `useUpsertHealthSnapshot`: dòng "so với N tháng trước" đọc lịch sử để so, và nạp lại
 * ngay là đưa chính dòng vừa ghi vào làm mốc so. Dòng mới chỉ cần có mặt ở lần MỞ SAU.
 */
export function useUpsertLifetimeVerdictSnapshot() {
  return useMutation({
    mutationFn: (input: NewLifetimeVerdictSnapshot) => repo.upsertLifetimeVerdictSnapshot(input),
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

export function invalidateTransactionData(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['transactions'] })
  qc.invalidateQueries({ queryKey: ['balances'] })
  qc.invalidateQueries({ queryKey: ['search'] })
  // Giao dịch có thể mang nhãn → liên kết nhãn đổi theo
  qc.invalidateQueries({ queryKey: ['transactionTags'] })
  // Và tổng chi cả đời của nhãn — nó đọc chính số tiền vừa đổi, không chỉ liên kết.
  qc.invalidateQueries({ queryKey: ['tagSpend'] })
  // Ghi/xoá phiếu lương làm tập dấu `給与 …` đổi — nút "Xoá mọi dòng phiếu lương" hiện
  // hay ẩn dựa vào tập này, nên bỏ sót nó là nút đứng sai trạng thái cho tới lần reload.
  qc.invalidateQueries({ queryKey: ['dauPhieuLuong'] })
}

/**
 * Các dấu `給与 …` đã có trong sổ.
 *
 * Dùng cho HAI việc: chống nhập trùng, và quyết định có hiện nút "Xoá mọi dòng phiếu
 * lương" hay không. Trước đây nút đó chỉ hiện khi `daGhi` — state của component, mất khi
 * reload — nên người dùng đã nhập ở lượt trước thì KHÔNG còn đường gỡ lô nào trong giao
 * diện, mà cũng không thể làm nút hiện lại (mọi kỳ đều đã nhập nên không có gì để ghi).
 */
export function useDauPhieuLuong() {
  return useQuery({
    queryKey: ['dauPhieuLuong'],
    queryFn: () => repo.listDauPhieuLuong(),
    staleTime: 60_000,
  })
}

// --- Khoản sắp chi (migration 0038) ---

export function usePlannedExpenses() {
  return useQuery({
    queryKey: ['plannedExpenses'],
    queryFn: () => repo.getPlannedExpenses(),
    staleTime: 60_000,
  })
}

/** Đổi khoản sắp chi có thể đổi cả nhãn của nó (migration 0044). */
function invalidatePlanned(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['plannedExpenses'] })
  qc.invalidateQueries({ queryKey: ['plannedExpenseTags'] })
}

export function useCreatePlannedExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewPlannedExpense) => repo.createPlannedExpense(input),
    onSettled: () => invalidatePlanned(qc),
  })
}

export function useUpdatePlannedExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: PlannedExpensePatch }) =>
      repo.updatePlannedExpense(id, patch),
    onSettled: () => invalidatePlanned(qc),
  })
}

export function useDeletePlannedExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.deletePlannedExpense(id),
    onSettled: () => invalidatePlanned(qc),
  })
}

// --- Nhãn cắt ngang danh mục ---

export function useTagGroups() {
  return useQuery({
    queryKey: ['tagGroups'],
    queryFn: () => repo.getTagGroups(),
    staleTime: 5 * 60_000,
  })
}

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

/**
 * Chi theo nhãn CẢ ĐỜI SỔ — chỉ cần cho trần nhãn kiểu 'total'. `enabled` để màn
 * nào không có nhãn nào đặt trần thì không tốn truy vấn nào.
 */
export function useTagSpend(enabled = true) {
  return useQuery({
    queryKey: ['tagSpend'],
    queryFn: () => repo.getTagSpend(),
    staleTime: 60_000,
    enabled,
  })
}

function invalidateTags(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['tags'] })
  qc.invalidateQueries({ queryKey: ['tagGroups'] })
  qc.invalidateQueries({ queryKey: ['transactionTags'] })
  qc.invalidateQueries({ queryKey: ['tagSpend'] })
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

export function useCreateTagGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewTagGroup) => repo.createTagGroup(input),
    onSettled: () => invalidateTags(qc),
  })
}

export function useUpdateTagGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TagGroupPatch }) =>
      repo.updateTagGroup(id, patch),
    onSettled: () => invalidateTags(qc),
  })
}

export function useDeleteTagGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.deleteTagGroup(id),
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

export function useDeleteTransactions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => repo.deleteTransactions(ids),
    onSettled: () => invalidateTransactionData(qc),
  })
}

/** Sửa hàng loạt ở Sổ (§4.2 mục 4): đổi danh mục cho nhiều khoản một lần. */
export function useSetTransactionsCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, categoryId }: { ids: string[]; categoryId: string | null }) =>
      repo.setTransactionsCategory(ids, categoryId),
    onSettled: () => invalidateTransactionData(qc),
  })
}

/** Sửa hàng loạt ở Sổ: gắn THÊM một nhãn cho nhiều khoản (không thay nhãn sẵn có). */
export function useAddTagToTransactions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, tagId }: { ids: string[]; tagId: string }) =>
      repo.addTagToTransactions(ids, tagId),
    onSettled: () => invalidateTags(qc),
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

/**
 * Chặng cuộc đời của trang Tương lai. `queryKey` cố ý TRÙNG với `useLifetime.ts:75` (nơi
 * gọi `repo.getLifePhases()` thẳng qua `useQuery` từ trước) — cùng khoá thì hai màn dùng
 * chung một lượt đọc và một bản cache, không phải hai.
 *
 * Ngoài trang Tương lai thì màn khác dùng nó để biết NĂM người dùng dự tính ngừng làm:
 * năm đó chỉ có một chỗ trong app, và ở đây.
 */
export function useLifePhases() {
  return useQuery({
    queryKey: ['lifePhases'],
    queryFn: () => repo.getLifePhases(),
    staleTime: 5 * 60_000,
  })
}

/**
 * Tra số cho một mốc. Là mutation chứ không phải query: nó chỉ chạy khi người dùng BẤM,
 * và không có gì để invalidate — kết quả không được lưu ở đâu cả, nó vào bản nháp rồi
 * người dùng tự quyết.
 */
export function useTraSo() {
  return useMutation({
    mutationFn: ({ van, tien }: { van: string; tien: CurrencyCode }) => repo.traSo(van, tien),
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

// --- Cổ phiếu Việt Nam: bảng giá + sổ lệnh (migration 0035) ---

/**
 * `enabled` (cùng khuôn `useRangeTransactions`/`useTagSpend`) để màn nào KHÔNG phải màn
 * đầu tư thì không tốn một lượt đọc cả bảng. Cần vì `useAccountPortfolio` chạy cho MỌI
 * tài khoản của trang chi tiết: thiếu cổng này thì mở một cái ví tiền mặt cũng kéo về
 * bảng giá và sổ lệnh — bốn truy vấn mà trước đợt gộp danh mục chỉ chạy trong hai khu
 * danh mục (đã xoá), tức chỉ với tài khoản đầu tư.
 */
export function useStockPrices(enabled = true) {
  return useQuery({
    queryKey: ['stockPrices'],
    queryFn: () => repo.getStockPrices(),
    // Giá chỉ đổi sau khi sàn đóng cửa và cron chạy — 5 phút là dư sức tươi.
    staleTime: 5 * 60_000,
    enabled,
  })
}

export function useStockTrades(enabled = true) {
  return useQuery({
    queryKey: ['stockTrades'],
    queryFn: () => repo.getStockTrades(),
    staleTime: 60_000,
    enabled,
  })
}

function invalidateStockTrades(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['stockTrades'] })
  // Sổ lệnh đổi → tiền chưa mua và giá trị danh mục đổi theo.
  qc.invalidateQueries({ queryKey: ['valuations'] })
  // Từ migration 0054, sổ lệnh KÉO THEO dòng tiền thật khi tài khoản đã khai ví (xem
  // features/assets/stockTradePosting.ts) — nên số dư, danh sách giao dịch và bộ đếm
  // "lệnh còn thiếu" đều đổi. Chú thích cũ ở đây nói "số dư (view) không đổi vì sổ lệnh
  // không phải dòng tiền"; câu đó đúng cho tới 0054 và nay đã sai.
  invalidateTransactionData(qc)
  qc.invalidateQueries({ queryKey: ['stockTradesWithoutTransfer'] })
}

export function useCreateStockTrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewStockTrade) => repo.createStockTrade(input),
    onSettled: () => invalidateStockTrades(qc),
  })
}

export function useUpdateStockTrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: StockTradePatch }) =>
      repo.updateStockTrade(id, patch),
    onSettled: () => invalidateStockTrades(qc),
  })
}

export function useDeleteStockTrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.deleteStockTrade(id),
    onSettled: () => invalidateStockTrades(qc),
  })
}

/**
 * Bao nhiêu lệnh cổ phiếu chưa có dòng chuyển tiền (migration 0054).
 *
 * Dải nhắc ở tab Cổ phiếu VN đọc đúng số này, và nút "Ghi bù" ghi đúng ngần ấy dòng —
 * cùng một hàm thuần tính cả hai nên chúng không thể nói hai số khác nhau.
 */
export function useStockTradesWithoutTransfer() {
  return useQuery({
    queryKey: ['stockTradesWithoutTransfer'],
    queryFn: () => repo.countStockTradesWithoutTransfer(),
  })
}

export function useBackfillStockTradeTransfers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => repo.backfillStockTradeTransfers(),
    onSettled: () => invalidateStockTrades(qc),
  })
}

// --- Quỹ đầu tư Nhật (migration 0045) ---

export function useFunds() {
  return useQuery({
    queryKey: ['funds'],
    queryFn: () => repo.getFunds(),
  })
}

/** `enabled`: cùng lý do như `useStockPrices` — xem chú thích ở đó. */
export function useFundPrices(enabled = true) {
  return useQuery({
    queryKey: ['fundPrices'],
    queryFn: () => repo.getFundPrices(),
    enabled,
  })
}

export function useFundTrades(enabled = true) {
  return useQuery({
    queryKey: ['fundTrades'],
    queryFn: () => repo.getFundTrades(),
    enabled,
  })
}

/**
 * Bỏ cache đúng bộ key mà `invalidateStockTrades` bỏ ở trên — KHÔNG phải `['accounts']`
 * như suy đoán ban đầu: sổ lệnh quỹ không phải dòng tiền nên số dư (view) không đổi, chỉ
 * snapshot giá trị đầu tư (`valuations`) mới có thể đổi theo.
 */
function invalidateFundTrades(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['fundTrades'] })
  qc.invalidateQueries({ queryKey: ['valuations'] })
}

export function useCreateFundTrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewFundTrade) => repo.createFundTrade(input),
    onSettled: () => invalidateFundTrades(qc),
  })
}

export function useUpdateFundTrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: FundTradePatch }) =>
      repo.updateFundTrade(id, patch),
    onSettled: () => invalidateFundTrades(qc),
  })
}

export function useDeleteFundTrade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.deleteFundTrade(id),
    onSettled: () => invalidateFundTrades(qc),
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

// --- Người thân nhận tiền (migration 0056) ---

// --- Chuyến đi (migration 0058) ---

export function useTrips() {
  return useQuery({
    queryKey: ['trips'],
    queryFn: () => repo.listTrips(),
    staleTime: 5 * 60_000,
  })
}

function invalidateTrips(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['trips'] })
}

export function useCreateTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewTrip) => repo.createTrip(input),
    onSettled: () => invalidateTrips(qc),
  })
}

export function useDeleteTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => repo.deleteTrip(id),
    onSettled: () => invalidateTrips(qc),
  })
}

export function useRelatives() {
  return useQuery({
    queryKey: ['relatives'],
    queryFn: () => repo.getRelatives(),
    staleTime: 5 * 60_000,
  })
}

function invalidateRelatives(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['relatives'] })
}

export function useCreateRelative() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NewRelative) => repo.createRelative(input),
    onSettled: () => invalidateRelatives(qc),
  })
}

export function useUpdateRelative() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: RelativePatch }) => repo.updateRelative(id, patch),
    onSettled: () => invalidateRelatives(qc),
  })
}

/**
 * Giao dịch cho màn Quyền lợi. queryKey nằm dưới 'transactions' để `invalidateTransactionData`
 * (ghi/sửa/xoá giao dịch) làm mới luôn — gán người nhận xong là số đổi ngay.
 */
export function useBenefitTransactions(range: DateRange, filter: BenefitTxFilter, enabled = true) {
  return useQuery({
    queryKey: ['transactions', 'benefit', range.start, range.end, filter.categoryIds, filter.toAccountIds],
    queryFn: () => repo.listBenefitTransactions(range, filter),
    enabled,
    staleTime: 60_000,
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

// --- Thu dự kiến của tháng (migration 0041) ---

/** Thu dự kiến người dùng khai; `null` = chưa khai → dùng trung bình 3 tháng. */
export function useMonthPlan(monthKey: string) {
  return useQuery({
    queryKey: ['month-plan', monthKey],
    queryFn: () => repo.getMonthPlan(monthKey),
  })
}

function invalidateMonthPlans(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['month-plan'] })
}

export function useUpsertMonthPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ monthKey, expectedIncome }: { monthKey: string; expectedIncome: number }) =>
      repo.upsertMonthPlan(monthKey, expectedIncome),
    onSettled: () => invalidateMonthPlans(qc),
  })
}

export function useDeleteMonthPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (monthKey: string) => repo.deleteMonthPlan(monthKey),
    onSettled: () => invalidateMonthPlans(qc),
  })
}

/** Kết hợp budgets + giao dịch tháng + tỷ giá → báo cáo tiến độ ngân sách. */
export function useBudgetReport(monthKey: MonthKey): {
  report: BudgetReport | undefined
  isLoading: boolean
  /**
   * Báo cáo đã tính từ ĐỦ nguồn dữ liệu hay chưa. Khác hẳn `report !== undefined`:
   * `report` có ngay khi budgets + giao dịch tháng về, nhưng nó vẫn được dựng với
   * `rates ?? {}` và `carry` rỗng, nên thiếu tỷ giá là mọi giao dịch ngoại tệ bị
   * BỎ ÂM THẦM khỏi `spent` (progress.ts), còn thiếu dữ liệu tháng trước là
   * `budgeted` thiếu phần dồn. Số hiện tạm trên trang Ngân sách thì được (có dòng
   * cảnh báo "có thể thiếu"), nhưng ai lấy báo cáo này để QUYẾT ĐỊNH thì phải chờ
   * cờ này — xem cổng dọn trạng thái thông báo (mục E).
   */
  isComplete: boolean
} {
  const monthKeyStr = monthKeyString(monthKey)
  const prevMonthKey = addMonths(monthKey, -1)
  const budgetsQ = useBudgets(monthKeyStr)
  const { data: monthTxs, isLoading: txLoading, isSuccess: txOk } = useMonthTransactions(monthKey)
  // Dồn hạn mức (mục AH): cần budgets + giao dịch tháng trước để tính phần chưa tiêu
  const prevBudgetsQ = useBudgets(monthKeyString(prevMonthKey))
  const { data: prevMonthTxs, isSuccess: prevTxOk } = useMonthTransactions(prevMonthKey)
  const accountsQ = useAccounts()
  const categoriesQ = useCategories()
  const { data: accounts = [] } = accountsQ
  const { data: categories = [] } = categoriesQ
  const { base, rates, isSuccess: ratesOk } = useRates()

  const currencyOf = (id: string): CurrencyCode =>
    accounts.find((a) => a.id === id)?.currency ?? base
  // Model "đặt ở cha trước": hạn mức đặt ở danh mục CHA là trần chung cho cả
  // nhóm (spent = tổng chi cha + con); hạn mức ở CON của nhóm đã có trần chỉ là
  // mốc theo dõi. parentOf cho progress biết quan hệ cha–con để tính trần nhóm.
  const parentById = new Map(categories.map((c) => [c.id, c.parent_id]))
  const parentOf = (categoryId: string): string | null => parentById.get(categoryId) ?? null
  // Danh mục chuyển tài sản không có trần (migration 0046). Suy ở đây, một chỗ, cho cả
  // báo cáo tháng này lẫn phép tính dồn hạn mức tháng trước — hai bên lệch nhau thì phần
  // dồn sẽ mang theo chi của một khoản không còn được tính.
  const transferIds = transferCategoryIds(categories)

  const budgets = budgetsQ.data
  const hasRollover = !!budgets?.some((b) => b.rollover)
  const carry =
    hasRollover && prevBudgetsQ.data && prevMonthTxs
      ? carryFromPreviousMonth(
          prevBudgetsQ.data,
          prevMonthTxs,
          currencyOf,
          base,
          rates ?? {},
          parentOf,
          transferIds,
        )
      : new Map<string, number>()
  const report =
    budgets && monthTxs
      ? buildBudgetReport(
          budgets,
          monthTxs,
          currencyOf,
          base,
          rates ?? {},
          parentOf,
          carry,
          transferIds,
        )
      : undefined

  // Chỉ hỏi tháng trước khi thật sự có hạn mức bật dồn — người không dùng dồn thì
  // không phải chờ hai query đó (chúng vẫn chạy, nhưng không được quyền chặn cờ).
  const isComplete =
    budgetsQ.isSuccess &&
    txOk &&
    accountsQ.isSuccess &&
    categoriesQ.isSuccess &&
    ratesOk &&
    (!hasRollover || (prevBudgetsQ.isSuccess && prevTxOk))

  return { report, isLoading: budgetsQ.isLoading || txLoading, isComplete }
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

export function invalidateDebts(qc: ReturnType<typeof useQueryClient>) {
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

/** Nhãn của các khoản sắp chi (migration 0044). */
export function usePlannedExpenseTags() {
  return useQuery({
    queryKey: ['plannedExpenseTags'],
    queryFn: () => repo.listPlannedExpenseTags(),
    staleTime: 60_000,
  })
}

/** Nhãn của các quy tắc định kỳ (migration 0042). */
export function useRecurringRuleTags() {
  return useQuery({
    queryKey: ['recurringRuleTags'],
    queryFn: () => repo.listRecurringRuleTags(),
    staleTime: 60_000,
  })
}

function invalidateRecurringRules(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['recurringRules'] })
  // Sửa quy tắc có thể đổi cả nhãn của nó
  qc.invalidateQueries({ queryKey: ['recurringRuleTags'] })
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

// `useBudgetAlert` đã xoá: nó chỉ trả `overCount` cho dải đỏ ở đầu màn Nhập, và dải đó
// bị bỏ (nó hiện ở cả mười dạng, kể cả bảy dạng không thuộc danh mục nào). Cảnh báo thay
// thế nói về ĐÚNG một danh mục nên đọc thẳng `useBudgetReport().report.lines` —
// xem `capWarning` trong TransactionForm.tsx.

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
