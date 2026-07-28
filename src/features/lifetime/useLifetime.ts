// Nạp dữ liệu Lifetime và memo hoá bản chiếu. Đây là chỗ DUY NHẤT gọi projectLifetime
// cho phần UI — mọi màn con nhận YearRow[] qua prop, không tự chiếu lại.
import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { repo } from '../../data'
import {
  useAccountBalances,
  useAccounts,
  useAssetGroupSettings,
  useCategories,
  useDebtPayments,
  useDebts,
  useProfile,
  useRangeTransactions,
  useRates,
} from '../../hooks/queries'
import type { CurrencyCode } from '../../lib/currencies'
import { addDaysISO, toISODate } from '../../lib/dates'
import type { LifeScenarioRow } from '../../types/database.types'
import { assetBreakdown, type AssetGroupSetting } from '../assets/aggregate'
import { debtSummary } from '../debts/aggregate'
import { suggestBaseline } from './baseline'
import {
  projectLifetime,
  type LifetimeEvent,
  type LifetimeInput,
  type LifetimePhase,
  type YearRow,
} from './project'

// Đủ trùm MAX_MONTHS (12) của suggestBaseline kể cả tháng lệch ngày.
const BASELINE_LOOKBACK_DAYS = 366

// Khớp default của DB (migration 0031) — dùng khi tạo kịch bản đầu tiên từ chi tiêu
// thật, vì lúc đó người dùng chưa chỉnh gì nên cứ để đúng mặc định của cột.
const DEFAULT_END_AGE = 90
const DEFAULT_REAL_RETURN_BPS = 200
const DEFAULT_BAND_SPREAD_BPS = 150

export function useLifetime() {
  const qc = useQueryClient()
  const [activeId, setActiveId] = useState<string | null>(null)

  const profileQ = useProfile()
  const scenariosQ = useQuery({
    queryKey: ['lifeScenarios'],
    queryFn: () => repo.getLifeScenarios(),
  })
  const phasesQ = useQuery({ queryKey: ['lifePhases'], queryFn: () => repo.getLifePhases() })
  const eventsQ = useQuery({ queryKey: ['lifeEvents'], queryFn: () => repo.getLifeEvents() })

  // useMemo (không phải `?? []` trần) để giữ NGUYÊN tham chiếu mảng rỗng qua các lần
  // render khi scenariosQ.data còn undefined (đang tải) — projectScenario ở dưới nhận
  // `scenarios` làm dep của useCallback, tham chiếu đổi mỗi render sẽ làm nó không bao
  // giờ ổn định (oxlint react-hooks/exhaustive-deps từng bắt đúng ca này).
  const scenarios = useMemo(() => scenariosQ.data ?? [], [scenariosQ.data])
  const active =
    scenarios.find((s) => s.id === activeId) ?? scenarios.find((s) => s.is_primary) ?? scenarios[0]

  const phases = useMemo(
    () => (phasesQ.data ?? []).filter((p) => p.scenario_id === active?.id),
    [phasesQ.data, active?.id],
  )
  const events = useMemo(
    () => (eventsQ.data ?? []).filter((e) => e.scenario_id === active?.id),
    [eventsQ.data, active?.id],
  )

  // `buildInputFor` là chỗ DUY NHẤT ráp `LifetimeInput` từ một `LifeScenarioRow` — dùng
  // chung cho `active` (ra `input`/`rows` bên dưới) VÀ cho `projectScenario` (chế độ so
  // sánh, Task 8 Step 4). Lọc phases/events theo `scenario.id` ngay TRONG hàm này (đọc
  // thẳng `phasesQ.data`/`eventsQ.data` chưa lọc), vì `phases`/`events` ở trên chỉ lọc
  // sẵn cho `active` — kịch bản so sánh cần một scenario_id khác.
  const buildInputFor = useCallback(
    (scenario: LifeScenarioRow, birthYear: number): LifetimeInput => ({
      // Năm hiện tại đọc một lần ở tầng UI. project.ts KHÔNG được gọi Date.
      // Đây là ranh giới CÓ Ý: `useLifetime.ts` được đọc đồng hồ, `project.ts` và
      // `insights.ts` thì không. `purity.test.ts` canh đúng hai file kia theo TÊN chứ
      // không quét cả thư mục, nên dòng này hợp lệ — nếu nó làm phép thử đỏ thì ai đó
      // đã nới ENGINE_FILE_PATTERN thành cả `features/lifetime/`; sửa pattern, ĐỪNG bỏ
      // `new Date()` ở đây rồi đi đọc đồng hồ trong engine.
      currentYear: new Date().getFullYear(),
      birthYear,
      endAge: scenario.end_age,
      displayCurrency: scenario.display_currency as CurrencyCode,
      startingAssetsMinor: scenario.starting_assets_minor,
      realReturnBps: scenario.real_return_bps,
      bandSpreadBps: scenario.band_spread_bps,
      inflationBps: profileQ.data?.annual_inflation_bps ?? 200,
      nominalTerms: scenario.nominal_terms,
      phases: (phasesQ.data ?? [])
        .filter((p) => p.scenario_id === scenario.id)
        .map(
          (p): LifetimePhase => ({
            startYear: p.start_year,
            label: p.label,
            country: p.country,
            currency: p.currency as CurrencyCode,
            annualIncomeMinor: p.annual_income_minor,
            annualExpenseMinor: p.annual_expense_minor,
            fxToDisplay: p.fx_to_display,
          }),
        ),
      events: (eventsQ.data ?? [])
        .filter((e) => e.scenario_id === scenario.id)
        .map(
          (e): LifetimeEvent => ({
            id: e.id,
            startYear: e.start_year,
            endYear: e.end_year,
            kind: e.kind,
            amountMinor: e.amount_minor,
            currency: e.currency as CurrencyCode,
            label: e.label,
            fxToDisplay: e.fx_to_display,
            inflate: e.inflate,
          }),
        ),
    }),
    [phasesQ.data, eventsQ.data, profileQ.data],
  )

  // `input` được nhớ đệm và trả ra CÙNG với `rows` (thay vì chỉ trả `rows`) vì Task 9
  // (`InsightCards`) cần đúng object này cho `minimumReturnBps(input)` — hàm đó tự dò
  // lại `projectLifetime` với `realReturnBps` khác. Dựng lại `input` một lần nữa ở
  // `LifetimePage` là lặp code và có thể lệch khỏi bản đã dùng để ra `rows`.
  const input = useMemo<LifetimeInput | null>(() => {
    const birthYear = profileQ.data?.birth_year
    if (!active || !birthYear) return null
    return buildInputFor(active, birthYear)
  }, [active, profileQ.data, buildInputFor])

  const rows = useMemo(() => (input ? projectLifetime(input) : []), [input])

  // Chiếu một kịch bản BẤT KỲ theo id — dùng cho chế độ so sánh (Task 8 Step 4, nút "So
  // sánh" ở LifetimePage). Đi qua đúng `buildInputFor` ở trên, không dựng input theo lối
  // riêng — tránh đúng thứ bình luận `input` cảnh báo (hai công thức build input lệch
  // nhau theo thời gian).
  const projectScenario = useCallback(
    (scenarioId: string): YearRow[] => {
      const birthYear = profileQ.data?.birth_year
      const scenario = scenarios.find((s) => s.id === scenarioId)
      if (!scenario || !birthYear) return []
      return projectLifetime(buildInputFor(scenario, birthYear))
    },
    [scenarios, profileQ.data, buildInputFor],
  )

  // --- Tạo kịch bản đầu tiên từ chi tiêu thật (thay wizard, xem LifetimePage) ---
  // Chỉ cần nạp accounts/categories/giao dịch khi CHƯA có kịch bản nào — tránh kéo cả
  // năm giao dịch về mỗi lần mở /lifetime một khi đã có kịch bản.
  const noScenarioYet = scenariosQ.isSuccess && scenarios.length === 0
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const todayISO = toISODate(new Date())
  const range = useMemo(
    () => ({ start: addDaysISO(todayISO, -BASELINE_LOOKBACK_DAYS), end: addDaysISO(todayISO, 1) }),
    [todayISO],
  )
  const txsQ = useRangeTransactions(range, noScenarioYet)

  // --- Tài sản ròng hiện tại → starting_assets_minor của kịch bản đầu tiên ---
  // Lỗi thứ 13 của kế hoạch: bản chiếu đầu tiên KHÔNG được bắt đầu từ 0 nếu người dùng
  // đang có tài sản thật — mở màn bằng một đồ thị "sắp cạn tiền" giả là ấn tượng đầu
  // tiên tệ nhất có thể. Dùng ĐÚNG công thức `AssetsPage.tsx` đang dùng
  // (`breakdown.total + debts.net + breakdown.cardDebt`, cùng điều kiện "đáng tin"),
  // KHÔNG tự cộng lại từ đầu — hai chỗ tính hai lối khác nhau sẽ trôi lệch nhau theo
  // thời gian, và người dùng sẽ thấy trang Tài sản báo một số còn Lifetime báo số khác.
  const balancesQ = useAccountBalances()
  const groupSettingsQ = useAssetGroupSettings()
  const { base: baseCurrency, rates, isSuccess: ratesOk } = useRates()
  const debtsQ = useDebts()
  const debtPaymentsQ = useDebtPayments()

  const settingsForBreakdown = useMemo<AssetGroupSetting[]>(
    () =>
      (groupSettingsQ.data ?? []).map((s) => ({
        name: s.name,
        sortOrder: s.sort_order,
        includeInTotals: s.include_in_totals,
        hidden: s.is_hidden,
      })),
    [groupSettingsQ.data],
  )
  const breakdown = useMemo(
    () => assetBreakdown(balancesQ.data ?? [], baseCurrency, rates ?? {}, settingsForBreakdown, todayISO),
    [balancesQ.data, baseCurrency, rates, settingsForBreakdown, todayISO],
  )
  const debtsAgg = useMemo(
    () => debtSummary(debtsQ.data ?? [], debtPaymentsQ.data ?? [], baseCurrency, rates ?? {}),
    [debtsQ.data, debtPaymentsQ.data, baseCurrency, rates],
  )
  const netWorth = breakdown.total + debtsAgg.net + breakdown.cardDebt
  // Chưa tải xong: chưa biết gì cả, đừng vội kết luận đáng tin hay không.
  const netWorthLoading =
    !balancesQ.isSuccess ||
    !groupSettingsQ.isSuccess ||
    !ratesOk ||
    !debtsQ.isSuccess ||
    !debtPaymentsQ.isSuccess
  // Đã tải xong NHƯNG thiếu tỷ giá cho một phần tài khoản/công nợ → tổng bị thiếu ÂM
  // THẦM (không phải bằng 0, mà là một số THẤP HƠN THẬT). Đây là ca `netWorthReliable`
  // ở AssetsPage.tsx tồn tại để bắt — không được lờ đi.
  const netWorthMissingRate = breakdown.hasMissingRate || debtsAgg.hasMissingRate || breakdown.cardHasMissingRate
  const netWorthReliable = !netWorthLoading && !netWorthMissingRate

  const createScenario = useMutation({ mutationFn: repo.createLifeScenario })
  const createPhase = useMutation({ mutationFn: repo.createLifePhase })

  async function ensureFirstScenario() {
    const profile = profileQ.data
    if (!profile) return // needsBirthYear đứng trước bước này nên profile luôn đã tải
    const currency = profile.base_currency as CurrencyCode
    const currencyOf = (id: string): CurrencyCode =>
      (accounts.find((a) => a.id === id)?.currency as CurrencyCode | undefined) ?? currency

    const baseline = suggestBaseline(txsQ.data ?? [], categories, currencyOf, currency, todayISO)

    // Đáng tin → dùng tài sản ròng hiện tại (cùng đơn vị `currency` = profile.base_currency,
    // khớp `display_currency` mới tạo nên không cần quy đổi). Không đáng tin (thiếu tỷ giá,
    // hoặc chưa tải xong) → 0, KHÔNG được điền một số thiếu rồi im lặng — LifetimePage hiện
    // dòng chữ giải thích khi `!netWorthReliable` (xem ScenarioEditorSheet, Task 11, để sửa lại).
    const scenario = await createScenario.mutateAsync({
      name: 'Kịch bản của tôi',
      display_currency: currency,
      end_age: DEFAULT_END_AGE,
      real_return_bps: DEFAULT_REAL_RETURN_BPS,
      band_spread_bps: DEFAULT_BAND_SPREAD_BPS,
      starting_assets_minor: netWorthReliable ? netWorth : 0,
      nominal_terms: false,
      is_primary: true,
    })
    await createPhase.mutateAsync({
      scenario_id: scenario.id,
      start_year: new Date().getFullYear(),
      label: 'Hiện tại',
      country: null,
      currency,
      annual_income_minor: baseline.annualIncomeMinor,
      annual_expense_minor: baseline.annualExpenseMinor,
      // Chặng nền cùng tiền với hiển thị của chính kịch bản mới tạo → 1 là ĐÚNG, không
      // phải giá trị mặc định bị bỏ quên (khác hẳn ca banner Task 7 cảnh báo).
      fx_to_display: 1,
    })
    await qc.invalidateQueries({ queryKey: ['lifeScenarios'] })
    await qc.invalidateQueries({ queryKey: ['lifePhases'] })
    setActiveId(scenario.id)
  }

  return {
    scenarios,
    active,
    activeId: active?.id ?? null,
    setActiveId,
    phases,
    events,
    rows,
    /** `LifetimeInput` đã dùng để ra `rows` — Task 9 (`InsightCards`) cần nguyên bản này. */
    input,
    /** Chiếu một kịch bản khác theo id, dùng cho chế độ so sánh ở `LifetimeChartCard`
     *  (Task 8). Trả `[]` nếu id không khớp kịch bản nào hoặc chưa có năm sinh. */
    projectScenario,
    profile: profileQ.data,
    isLoading: profileQ.isLoading || scenariosQ.isLoading || phasesQ.isLoading || eventsQ.isLoading,
    // `== null` (không phải `=== null`): dữ liệu demo/local cũ hơn migration 0031 có
    // thể thiếu hẳn khoá `birth_year` (undefined) chứ không phải `null` — bắt cả hai
    // ca vẫn an toàn hơn, vì mục đích là "chưa CÓ năm sinh dùng được" chứ không phải
    // phân biệt hai giá trị rỗng khác nhau.
    needsBirthYear: !!profileQ.data && profileQ.data.birth_year == null,
    ensureFirstScenario,
    isCreatingFirstScenario: createScenario.isPending || createPhase.isPending,
    /** Tài sản ròng hiện tại (base currency) — số sẽ dùng làm `starting_assets_minor`
     *  khi tạo kịch bản đầu tiên. `LifetimePage` hiện số này ở trạng thái "chưa có kịch
     *  bản" để minh bạch, và hiện cảnh báo khi `netWorthReliable` là false. */
    netWorth,
    netWorthReliable,
    netWorthLoading,
  }
}
