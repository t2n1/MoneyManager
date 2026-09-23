// Tầng dữ liệu dùng chung của tab Tài sản. Cả hai tab con "Hiện tại" và "Diễn biến" đều
// cần cùng một phép tính (số dư → assetBreakdown → cộng công nợ), nên tính một chỗ thay vì
// bê nguyên xuống hai component hoặc chọc prop qua vỏ AssetsPage.
//
// Gọi hook này ở hai component KHÔNG tốn thêm request: react-query dùng chung cache, và
// mọi phép dẫn xuất đều nằm trong useMemo.
import { useMemo } from 'react'
import {
  useAccountBalances,
  useAssetGroupSettings,
  useDebtPayments,
  useDebts,
  useRates,
} from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { loadStatus, mergeLoad } from '../../lib/loadStatus'
import { debtSummary } from '../debts/aggregate'
import {
  assetBreakdown,
  assetCurrencyGroups,
  assetTypeGroups,
  type AssetGroupSetting,
} from './aggregate'

export function useAssetsData() {
  const todayISO = toISODate(new Date())
  const balancesQ = useAccountBalances()
  const groupSettingsQ = useAssetGroupSettings()
  const debtsQ = useDebts()
  const debtPaymentsQ = useDebtPayments()
  const { base, rates, isLoading: ratesLoading } = useRates()
  const balances = useMemo(() => balancesQ.data ?? [], [balancesQ.data])
  const groupSettings = useMemo(() => groupSettingsQ.data ?? [], [groupSettingsQ.data])
  const debts = useMemo(() => debtsQ.data ?? [], [debtsQ.data])
  const debtPayments = useMemo(() => debtPaymentsQ.data ?? [], [debtPaymentsQ.data])

  // Tài sản ròng cần ĐỦ năm nguồn. Bản trước chỉ chờ số dư: nợ/cho vay về sau thì vài giây
  // đầu ô Ròng in tổng tài sản CHƯA trừ nợ, nhóm chưa về thì mọi tài khoản dồn vào "chưa
  // phân nhóm" — và tệ nhất, `netWorthReliable` bật lên nên ảnh chụp lịch sử GHI con số
  // tạm đó vào DB. Tỷ giá chỉ chờ lúc đang tải: lỗi tỷ giá là thiếu thật, cờ
  // `hasMissingRate` lo phần đó.
  const load = mergeLoad(
    loadStatus(balancesQ),
    loadStatus(groupSettingsQ),
    loadStatus(debtsQ),
    loadStatus(debtPaymentsQ),
    ratesLoading ? 'pending' : 'ready',
  )
  /** Còn nguồn đang tải — nơi hiển thị in "Đang tính…", không in số. */
  const isLoading = load === 'pending'
  /** Có nguồn đã hỏng hẳn — nơi hiển thị nói không tải được, cũng không in số. */
  const loadFailed = load === 'failed'

  // Tài sản ròng = tổng tài sản gộp + (cho vay còn lại − mình nợ còn lại), quy đổi base
  const debtsSummary = useMemo(
    () => debtSummary(debts, debtPayments, base, rates ?? {}),
    [debts, debtPayments, base, rates],
  )

  const settings: AssetGroupSetting[] = useMemo(
    () =>
      groupSettings.map((s) => ({
        name: s.name,
        sortOrder: s.sort_order,
        includeInTotals: s.include_in_totals,
        hidden: s.is_hidden,
      })),
    [groupSettings],
  )

  const breakdown = useMemo(
    () => assetBreakdown(balances, base, rates ?? {}, settings, todayISO),
    [balances, base, rates, settings, todayISO],
  )

  // Nhóm theo mục đích: bỏ nhóm ẩn / tài khoản ẩn, và nhóm rỗng
  const purposeGroups = useMemo(
    () =>
      breakdown.groups
        .filter((g) => !g.hidden)
        .map((g) => ({ ...g, accounts: g.accounts.filter((a) => !a.hidden) }))
        .filter((g) => g.accounts.length > 0),
    [breakdown.groups],
  )

  // Nhóm theo loại tài khoản (Tiền mặt / Ngân hàng…) — cùng tập tài sản tính vào tổng
  const typeGroups = useMemo(() => assetTypeGroups(breakdown), [breakdown])
  // Nhóm theo đồng tiền (JPY / VND / USD) — đo mức phơi nhiễm tỷ giá
  const currencyGroups = useMemo(() => assetCurrencyGroups(breakdown), [breakdown])

  // Tài khoản đầu tư đang tính vào tổng — đầu vào cho khu Hiệu quả đầu tư
  const investmentAccounts = useMemo(
    () =>
      breakdown.groups
        .filter((g) => g.includeInTotals && !g.hidden)
        .flatMap((g) => g.accounts)
        .filter((a) => a.type === 'investment' && !a.hidden && a.includeInTotals),
    [breakdown.groups],
  )

  // Tài sản ròng để ghi lịch sử (mục AF): chỉ ghi khi số liệu tin cậy (không thiếu tỷ giá)
  const netWorth = breakdown.total + debtsSummary.net + breakdown.cardDebt
  const netWorthReliable =
    load === 'ready' &&
    !breakdown.hasMissingRate &&
    !debtsSummary.hasMissingRate &&
    !breakdown.cardHasMissingRate

  return {
    todayISO,
    isLoading,
    loadFailed,
    base,
    rates,
    balances,
    breakdown,
    debtsSummary,
    purposeGroups,
    typeGroups,
    currencyGroups,
    investmentAccounts,
    netWorth,
    netWorthReliable,
  }
}
