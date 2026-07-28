// Nạp dữ liệu Lifetime và memo hoá bản chiếu. Đây là chỗ DUY NHẤT gọi projectLifetime
// cho phần UI — mọi màn con nhận YearRow[] qua prop, không tự chiếu lại.
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { repo } from '../../data'
import { useAccounts, useCategories, useProfile, useRangeTransactions } from '../../hooks/queries'
import type { CurrencyCode } from '../../lib/currencies'
import { addDaysISO, toISODate } from '../../lib/dates'
import { suggestBaseline } from './baseline'
import {
  projectLifetime,
  type LifetimeEvent,
  type LifetimeInput,
  type LifetimePhase,
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

  const scenarios = scenariosQ.data ?? []
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

  // `input` được nhớ đệm và trả ra CÙNG với `rows` (thay vì chỉ trả `rows`) vì Task 9
  // (`InsightCards`) cần đúng object này cho `minimumReturnBps(input)` — hàm đó tự dò
  // lại `projectLifetime` với `realReturnBps` khác. Dựng lại `input` một lần nữa ở
  // `LifetimePage` là lặp code và có thể lệch khỏi bản đã dùng để ra `rows`.
  const input = useMemo<LifetimeInput | null>(() => {
    const birthYear = profileQ.data?.birth_year
    if (!active || !birthYear) return null
    return {
      // Năm hiện tại đọc một lần ở tầng UI. project.ts KHÔNG được gọi Date.
      // Đây là ranh giới CÓ Ý: `useLifetime.ts` được đọc đồng hồ, `project.ts` và
      // `insights.ts` thì không. `purity.test.ts` canh đúng hai file kia theo TÊN chứ
      // không quét cả thư mục, nên dòng này hợp lệ — nếu nó làm phép thử đỏ thì ai đó
      // đã nới ENGINE_FILE_PATTERN thành cả `features/lifetime/`; sửa pattern, ĐỪNG bỏ
      // `new Date()` ở đây rồi đi đọc đồng hồ trong engine.
      currentYear: new Date().getFullYear(),
      birthYear,
      endAge: active.end_age,
      displayCurrency: active.display_currency as CurrencyCode,
      startingAssetsMinor: active.starting_assets_minor,
      realReturnBps: active.real_return_bps,
      bandSpreadBps: active.band_spread_bps,
      inflationBps: profileQ.data?.annual_inflation_bps ?? 200,
      nominalTerms: active.nominal_terms,
      phases: phases.map(
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
      events: events.map(
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
    }
  }, [active, phases, events, profileQ.data])

  const rows = useMemo(() => (input ? projectLifetime(input) : []), [input])

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

  const createScenario = useMutation({ mutationFn: repo.createLifeScenario })
  const createPhase = useMutation({ mutationFn: repo.createLifePhase })

  async function ensureFirstScenario() {
    const profile = profileQ.data
    if (!profile) return // needsBirthYear đứng trước bước này nên profile luôn đã tải
    const currency = profile.base_currency as CurrencyCode
    const currencyOf = (id: string): CurrencyCode =>
      (accounts.find((a) => a.id === id)?.currency as CurrencyCode | undefined) ?? currency

    const baseline = suggestBaseline(txsQ.data ?? [], categories, currencyOf, currency, todayISO)

    const scenario = await createScenario.mutateAsync({
      name: 'Kịch bản của tôi',
      display_currency: currency,
      end_age: DEFAULT_END_AGE,
      real_return_bps: DEFAULT_REAL_RETURN_BPS,
      band_spread_bps: DEFAULT_BAND_SPREAD_BPS,
      starting_assets_minor: 0,
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
    profile: profileQ.data,
    isLoading: profileQ.isLoading || scenariosQ.isLoading || phasesQ.isLoading || eventsQ.isLoading,
    // `== null` (không phải `=== null`): dữ liệu demo/local cũ hơn migration 0031 có
    // thể thiếu hẳn khoá `birth_year` (undefined) chứ không phải `null` — bắt cả hai
    // ca vẫn an toàn hơn, vì mục đích là "chưa CÓ năm sinh dùng được" chứ không phải
    // phân biệt hai giá trị rỗng khác nhau.
    needsBirthYear: !!profileQ.data && profileQ.data.birth_year == null,
    ensureFirstScenario,
    isCreatingFirstScenario: createScenario.isPending || createPhase.isPending,
  }
}
