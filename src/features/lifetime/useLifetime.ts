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
import { fetchRates } from '../../lib/rates'
import { showToast } from '../../lib/dialog'
import type { LifeScenarioRow } from '../../types/database.types'
import { assetBreakdown, type AssetGroupSetting } from '../assets/aggregate'
import { debtSummary } from '../debts/aggregate'
import type { CurrencyOf } from '../reports/aggregate'
import { suggestBaseline } from './baseline'
import { DEFAULT_INFLATION_BPS, pickActive } from './buildInput'
import { fxOfRates, normalizeToPhaseCurrency } from './fxModel'
import { duplicateScenario } from './duplicate'
import {
  projectLifetime,
  type LifetimeEvent,
  type LifetimeInput,
  type LifetimePhase,
  type YearRow,
} from './project'

/** Đủ trùm MAX_MONTHS (12) của suggestBaseline kể cả tháng lệch ngày.
 *  Export vì `ScenarioEditorDrawer` cũng nạp giao dịch cho `suggestBaseline` — hai
 *  chỗ mà hai hằng số thì một ngày nào đó chúng lệch nhau và khối "Số này ở đâu ra"
 *  báo một con số khác con số đã dùng để tạo kịch bản. */
export const BASELINE_LOOKBACK_DAYS = 366

/** Khoảng ngày cần nạp cho `suggestBaseline`, tính từ `todayISO`. Dùng chung với
 *  `ScenarioEditorDrawer` — xem `BASELINE_LOOKBACK_DAYS`. */
export function baselineRange(todayISO: string): { start: string; end: string } {
  return { start: addDaysISO(todayISO, -BASELINE_LOOKBACK_DAYS), end: addDaysISO(todayISO, 1) }
}

/** `(accountId) => tiền của tài khoản đó`, rơi về `fallback` khi không tra được —
 *  đúng hình dạng `CurrencyOf` mà `suggestBaseline` tự lọc bằng (xem baseline.ts) và
 *  đúng pattern sẵn có trong repo (vd `LedgerPage.tsx`). Dùng chung để hai chỗ gọi
 *  `suggestBaseline` không lọc theo hai luật khác nhau. */
export function makeCurrencyOf(
  accounts: { id: string; currency: string }[],
  fallback: CurrencyCode,
): CurrencyOf {
  return (id) => (accounts.find((a) => a.id === id)?.currency as CurrencyCode | undefined) ?? fallback
}

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
  // `pickActive` là hàm DÙNG CHUNG với `buildLifetimeInput` (buildInput.ts) — luật "kịch
  // bản nào đang hiệu lực" phải là MỘT luật, không phải một bản ở đây và một bản ở đó.
  // Bản cũ viết `find(is_primary) ?? scenarios[0]`, tức luật hoà (nhiều bản cùng
  // is_primary, hoặc không bản nào) nằm ẩn trong câu `order by` của tầng dữ liệu.
  const active = scenarios.find((s) => s.id === activeId) ?? pickActive(scenarios)

  // Tỷ giá HÔM NAY, nền là tiền hiển thị của kịch bản đang xem.
  //
  // Từ bản vẽ v5, tỷ giá KHÔNG còn là thứ người dùng gõ tay vào từng dòng — mọi phép quy
  // đổi của bản chiếu đi qua bảng này (xem `fxModel.ts`). Nên nó phải nạp ở ĐÂY, cạnh ba
  // query kia, chứ không nạp trong component: `projectScenario` (chế độ so sánh) cũng
  // cần đúng bảng đó, và hai chỗ nạp riêng là hai bản chiếu của cùng một kịch bản có thể
  // dùng hai tỷ giá khác nhau.
  //
  // `staleTime` 12 giờ: nguồn chỉ đổi số một lần mỗi ngày (xem lib/rates.ts).
  const ratesQ = useQuery({
    queryKey: ['lifetime-rates-for', active?.display_currency],
    queryFn: () => fetchRates(active?.display_currency as CurrencyCode),
    enabled: !!active,
    staleTime: 12 * 3600_000,
    gcTime: 24 * 3600_000,
    retry: 1,
  })

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
    (scenario: LifeScenarioRow, birthYear: number): LifetimeInput => {
      const display = scenario.display_currency as CurrencyCode
      const rawPhases = (phasesQ.data ?? [])
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
        )
      const rawEvents = (eventsQ.data ?? [])
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
        )
      // Tiền nằm trên CHẶNG, mốc suy từ chặng, tỷ giá lấy hôm nay — xem `fxModel.ts`.
      // Đặt ở ĐÂY, chỗ duy nhất ráp input, nên mọi bản chiếu của tầng UI (kể cả chế độ
      // so sánh) đều đã chuẩn hoá; engine bên dưới không biết gì về luật này.
      const norm = normalizeToPhaseCurrency(
        rawPhases,
        rawEvents,
        display,
        fxOfRates(display, ratesQ.data ?? {}),
      )
      return {
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
      // Hằng số dùng chung với `buildInput.ts` (buildInput.test.ts ghim giá trị) — hai
      // con số cho cùng một giá trị rơi về, một cái có test một cái không, là cách bản
      // chiếu của màn Lifetime và bản chiếu của bộ luật thông báo bắt đầu lệch nhau.
      inflationBps: profileQ.data?.annual_inflation_bps ?? DEFAULT_INFLATION_BPS,
        nominalTerms: scenario.nominal_terms,
        phases: norm.phases,
        events: norm.events,
      }
    },
    [phasesQ.data, eventsQ.data, profileQ.data, ratesQ.data],
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
  const range = useMemo(() => baselineRange(todayISO), [todayISO])
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
  /** Đang chạy `duplicateActiveScenario` — nút "Kịch bản mới" đọc để tự chặn bấm đúp
   *  (phép chép ghi nhiều dòng, bấm hai lần là hai kịch bản trùng tên). */
  const [duplicating, setDuplicating] = useState(false)

  /**
   * Tạo kịch bản đầu tiên: một dòng `life_scenarios` rồi một dòng `life_phases`. Hai
   * lệnh ghi TUẦN TỰ (chặng cần `scenario.id`), nên có đúng một cửa sổ lỗi ở giữa —
   * và đây là NÚT ĐẦU TIÊN người dùng mới bấm, không phải một đường hiếm.
   *
   * Không có `catch` thì lỗi ở `createPhase` là một unhandled rejection: một kịch bản
   * KHÔNG có chặng nào đã nằm trong DB, không toast, không câu nào. Không làm mới
   * `['lifeScenarios']` thì `scenarios.length === 0` vẫn đúng nên trang đứng nguyên ở
   * trạng thái 2 và bấm lần nữa tạo thêm một kịch bản mồ côi — lặp vô hạn. Và
   * `buildLifetimeInput` trả `undefined` cho kịch bản chính không có chặng, nên bộ luật
   * thông báo cũng im: không một bề mặt nào nói cho người dùng biết chuyện gì đã xảy ra.
   *
   * Nên: làm mới cache trong `finally` GATED theo "dòng kịch bản đã vào DB chưa" (cùng
   * khuôn `ScenarioEditorDrawer.handleDuplicate`), và
   * `setActiveId` luôn — kịch bản thiếu chặng vẫn phải hiện ra ở dải chip để người dùng
   * mở trình sửa mà thêm chặng hoặc xoá nó đi.
   */
  async function ensureFirstScenario() {
    const profile = profileQ.data
    if (!profile) {
      // `needsBirthYear` chỉ bắt ca profile ĐÃ TẢI mà chưa khai năm sinh (`!!profileQ.data
      // && …`), nên nó FALSE khi query profile LỖI — trang rơi vào trạng thái 2 và nút
      // "Tạo kịch bản…" hiện ra bình thường. `return` trần trước đây làm nút đó thành một
      // ngõ cụt im lặng: bấm, spinner nhá một nhịp, không có gì xảy ra, mãi mãi. Nút cũng
      // đã bị `disabled` ở LifetimePage khi thiếu `profile`, đây là lớp thứ hai cho mọi
      // chỗ gọi khác.
      showToast(
        'Chưa tải được thông tin người dùng (năm sinh, tiền gốc) nên chưa tạo được kịch bản — kiểm tra mạng rồi mở lại màn này.',
        'error',
      )
      return
    }
    const currency = profile.base_currency as CurrencyCode

    // `null` cho tới khi dòng kịch bản THẬT SỰ vào DB — quyết định cả việc có phải làm
    // mới cache hay không, lẫn câu chữ của toast lỗi (lỗi ngay ở dòng đầu không để lại
    // gì, lỗi sau đó để lại một kịch bản thiếu chặng cần dọn).
    let scenarioId: string | null = null
    try {
      const baseline = suggestBaseline(
        txsQ.data ?? [],
        categories,
        makeCurrencyOf(accounts, currency),
        currency,
        todayISO,
      )

      // Đáng tin → dùng tài sản ròng hiện tại (cùng đơn vị `currency` = profile.base_currency,
      // khớp `display_currency` mới tạo nên không cần quy đổi). Không đáng tin (thiếu tỷ giá,
      // hoặc chưa tải xong) → 0, KHÔNG được điền một số thiếu rồi im lặng — LifetimePage hiện
      // dòng chữ giải thích khi `!netWorthReliable` (xem ScenarioEditorDrawer, để sửa lại).
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
      scenarioId = scenario.id
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
      // Sổ có chi mà không có một khoản "Thu nhập" nào (người nhập sao kê thẻ thường
      // vậy — sao kê toàn khoản chi, lương không bao giờ được ghi): kịch bản vừa tạo
      // sẽ chiếu "âm từ năm sau" ngay màn đầu tiên. KHÔNG chặn tạo (số 0 là thật theo
      // sổ, và người thất nghiệp/nghỉ hưu có thật), nhưng phải nói ngay tại lúc con số
      // được chép vào — để im là người dùng tưởng app tính sai (đã xảy ra 2026-08).
      if (baseline.annualIncomeMinor === 0 && baseline.annualExpenseMinor > 0) {
        showToast(
          'Sổ 12 tháng qua không có khoản thu nào nên kịch bản tạm coi thu = 0 — bấm dòng "Giả định" để nhập thu nhập của bạn.',
          'info',
          8000,
        )
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'lỗi không rõ'
      showToast(
        scenarioId === null
          ? `Không tạo được kịch bản (${detail}). Chưa có gì được lưu — thử lại.`
          // "Thêm chặng" là NHÃN THẬT của một nút có trên màn (dải Mốc cuộc đời dưới đồ
          // thị). Câu cũ bảo "bấm nút bút chì" — nút đó đã bị xoá lúc header rút gọn,
          // nên câu hướng dẫn chỉ vào một cái nút không tồn tại.
          : `Đã tạo kịch bản nhưng chưa tạo được chặng nền (${detail}). Kịch bản đang thiếu chặng nên chưa chiếu được gì — bấm "Thêm chặng" ở dải Mốc cuộc đời, hoặc xoá kịch bản đó rồi thử lại.`,
        'error',
      )
    } finally {
      if (scenarioId !== null) {
        await qc.invalidateQueries({ queryKey: ['lifeScenarios'] })
        await qc.invalidateQueries({ queryKey: ['lifePhases'] })
        setActiveId(scenarioId)
      }
    }
  }

  /**
   * Tạo thêm một kịch bản: bản sao của kịch bản ĐANG XEM, rồi CHỌN LUÔN bản sao đó.
   *
   * Vì sao là bản sao chứ không phải một kịch bản trống: một kịch bản trống không chiếu
   * ra gì (`projectLifetime` cần ít nhất một chặng), nên nút "Kịch bản mới" sẽ dẫn thẳng
   * tới một đồ thị rỗng — người dùng phải khai lại từ đầu thu, chi, tài sản khởi điểm.
   * Còn `ensureFirstScenario` thì KHÔNG dùng lại được ở đây: nó dựng chặng nền từ 12
   * tháng giao dịch (query đó chỉ bật khi chưa có kịch bản nào) và đặt `is_primary: true`
   * — tức nút này sẽ âm thầm cướp kịch bản chính, thứ mà thông báo và thẻ ở trang Tài
   * sản đọc theo.
   *
   * `setActiveId` ngay sau khi tạo, khác với nút "Nhân bản" trong trình sửa (nút đó đóng
   * sheet rồi bảo người dùng tự chọn ở dải chip): ở đây người dùng đang NHÌN dải chip,
   * nên bấm xong mà không có gì đổi là một nút không phản hồi.
   */
  async function duplicateActiveScenario() {
    if (!active || duplicating) return
    setDuplicating(true)
    let copyId: string | null = null
    try {
      const copy = await duplicateScenario({
        scenario: active,
        phases,
        events,
        afterCreate: async () => {
          await qc.invalidateQueries({ queryKey: ['lifeScenarios'] })
          await qc.invalidateQueries({ queryKey: ['lifePhases'] })
          await qc.invalidateQueries({ queryKey: ['lifeEvents'] })
        },
      })
      copyId = copy.id
      showToast(`Đã tạo "${copy.name}" — sửa tên và các con số trong "Sửa kịch bản".`, 'success')
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'lỗi không rõ'
      showToast(
        `Không tạo được kịch bản mới (${detail}). Có thể đã có một bản sao thiếu dòng trong dải chip — kiểm và xoá nếu cần.`,
        'error',
      )
    } finally {
      // Chọn bản sao KỂ CẢ khi chép dòng lỗi giữa chừng: dòng kịch bản đã vào DB rồi,
      // và người dùng cần nhìn thấy nó để sửa nốt hoặc xoá đi (đúng thứ toast lỗi vừa
      // dặn). `copyId` còn null nghĩa là chưa có gì được tạo — đứng yên ở kịch bản cũ.
      if (copyId !== null) setActiveId(copyId)
      setDuplicating(false)
    }
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
    /** Nhân bản kịch bản đang xem rồi chọn luôn bản sao — nút "Kịch bản mới" ở dải chip. */
    duplicateActiveScenario,
    duplicatingScenario: duplicating,
    /** Tài sản ròng hiện tại (base currency) — số sẽ dùng làm `starting_assets_minor`
     *  khi tạo kịch bản đầu tiên. `LifetimePage` hiện số này ở trạng thái "chưa có kịch
     *  bản" để minh bạch, và hiện cảnh báo khi `netWorthReliable` là false. */
    netWorth,
    netWorthReliable,
    netWorthLoading,
  }
}
