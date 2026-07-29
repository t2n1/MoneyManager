// Trình sửa kịch bản Lifetime: bốn khối theo thứ tự — kịch bản, chặng đời, sự
// kiện, "số này ở đâu ra" (xem docs/superpowers/plans/2026-07-29-lifetime.md,
// Task 11). STUB của Task 7 dừng ở đây; thân hàm bên dưới thay thế nó, giữ
// nguyên chữ ký props để LifetimePage không phải sửa lại chỗ gọi.
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Copy, Plus, Sparkles, X } from 'lucide-react'
import { repo } from '../../data'
import type { LifeScenarioPatch } from '../../data/repo'
import { MoneyField } from '../../components/MoneyField'
import { useAccounts, useCategories, useRangeTransactions, useUpdateProfile } from '../../hooks/queries'
import { addDaysISO, toISODate } from '../../lib/dates'
import { showToast } from '../../lib/dialog'
import { CURRENCIES, formatMoney, type CurrencyCode } from '../../lib/money'
import { convertToBase, fetchRates } from '../../lib/rates'
import type { LifeEventRow, LifePhaseRow, LifeScenarioRow } from '../../types/database.types'
import { suggestBaseline } from './baseline'
import { EventFormSheet } from './EventFormSheet'
import { PhaseFormSheet } from './PhaseFormSheet'
import type { PresetContext } from './presets'
import { useLifetime } from './useLifetime'

interface Props {
  scenario: LifeScenarioRow
  phases: LifePhaseRow[]
  events: LifeEventRow[]
  onClose: () => void
}

/** Ô nhập năm sinh khớp ràng buộc DB (migration 0031: `birth_year between 1900 and 2100`). */
const MIN_BIRTH_YEAR = 1900
const MAX_BIRTH_YEAR = 2100
/** Khớp check constraint của `life_scenarios` (migration 0031). */
const MIN_END_AGE = 50
const MAX_END_AGE = 120
const MIN_REAL_RETURN_PCT = -5
const MAX_REAL_RETURN_PCT = 20
const MIN_BAND_SPREAD_PCT = 0
const MAX_BAND_SPREAD_PCT = 10
/** Đủ trùm MAX_MONTHS (12) của suggestBaseline — cùng hằng số với useLifetime.ts. */
const BASELINE_LOOKBACK_DAYS = 366

/** Chặng đang hiệu lực cho `year`: chặng muộn nhất có start_year <= year, hoặc
 *  chặng đầu tiên nếu mọi chặng đều ở tương lai — cùng luật với `phaseForYear`
 *  (private) trong project.ts, viết lại ở đây vì hàm đó không export. */
function currentPhaseOf(phases: LifePhaseRow[], year: number): LifePhaseRow | undefined {
  const sorted = [...phases].sort((a, b) => a.start_year - b.start_year)
  let found: LifePhaseRow | undefined = sorted[0]
  for (const p of sorted) {
    if (p.start_year <= year) found = p
    else break
  }
  return found
}

/** "1 ¥ ≈ $0,01" — tỷ giá giả định của một dòng, hiện ở danh sách chặng/sự kiện
 *  (khác với dòng xem trước quy đổi trong form, vốn dùng số tiền THẬT của dòng
 *  đang sửa — xem PhaseFormSheet/EventFormSheet). */
function formatFxAssumption(fx: number, currency: CurrencyCode, display: CurrencyCode): string {
  const oneUnitMinor = 10 ** CURRENCIES[currency].decimals
  const convertedMinor = Math.round(fx * 10 ** CURRENCIES[display].decimals)
  return `${formatMoney(oneUnitMinor, currency)} ≈ ${formatMoney(convertedMinor, display)}`
}

const BAR_PALETTE = ['bg-green-500', 'bg-blue-400', 'bg-amber-400', 'bg-purple-400', 'bg-rose-400', 'bg-teal-400']

export function ScenarioEditorSheet({ scenario, phases, events, onClose }: Props) {
  const qc = useQueryClient()
  const { profile, netWorth, netWorthReliable, netWorthLoading } = useLifetime()
  const updateProfileMut = useUpdateProfile()

  // --- Khối 1: Kịch bản ---
  const [name, setName] = useState(scenario.name)
  const [birthYear, setBirthYear] = useState(String(profile?.birth_year ?? ''))
  const [endAge, setEndAge] = useState(String(scenario.end_age))
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>(scenario.display_currency as CurrencyCode)
  const [assetsSign, setAssetsSign] = useState<1 | -1>(scenario.starting_assets_minor < 0 ? -1 : 1)
  const [assetsAbs, setAssetsAbs] = useState(Math.abs(scenario.starting_assets_minor))
  const [realReturnPct, setRealReturnPct] = useState(String(scenario.real_return_bps / 100))
  const [bandSpreadPct, setBandSpreadPct] = useState(String(scenario.band_spread_bps / 100))
  const [nominalTerms, setNominalTerms] = useState(scenario.nominal_terms)
  const [savingScenario, setSavingScenario] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  // Danh sách dòng bị đặt lại tỷ giá về 1 sau khi đổi display_currency — hiện ra
  // để người dùng biết phải khai lại tỷ giá cho những dòng nào (quyết định đã
  // chốt: RESET chứ không chỉ cảnh báo, xem task-11-brief.md).
  const [resetNotice, setResetNotice] = useState<{ phaseLabels: string[]; eventLabels: string[] } | null>(null)

  const nameValid = name.trim() !== ''
  const birthYearNum = Number(birthYear)
  const birthYearValid = Number.isInteger(birthYearNum) && birthYearNum >= MIN_BIRTH_YEAR && birthYearNum <= MAX_BIRTH_YEAR
  const endAgeNum = Number(endAge)
  const endAgeValid = Number.isInteger(endAgeNum) && endAgeNum >= MIN_END_AGE && endAgeNum <= MAX_END_AGE
  const realReturnNum = Number(realReturnPct)
  const realReturnValid = Number.isFinite(realReturnNum) && realReturnNum >= MIN_REAL_RETURN_PCT && realReturnNum <= MAX_REAL_RETURN_PCT
  const bandSpreadNum = Number(bandSpreadPct)
  const bandSpreadValid = Number.isFinite(bandSpreadNum) && bandSpreadNum >= MIN_BAND_SPREAD_PCT && bandSpreadNum <= MAX_BAND_SPREAD_PCT
  const canSaveScenario =
    nameValid && birthYearValid && endAgeValid && realReturnValid && bandSpreadValid && !savingScenario

  // Tỷ giá "hôm nay" cho tiền hiển thị ĐANG CHỌN trong form (có thể khác tiền đã
  // lưu nếu người dùng vừa đổi dropdown) — dùng riêng cho nút "lấy lại tài sản
  // ròng hiện tại" (số đó phải theo đúng đơn vị người dùng SẮP lưu).
  const pendingRatesQ = useQuery({
    queryKey: ['lifetime-rates-for', displayCurrency],
    queryFn: () => fetchRates(displayCurrency),
    staleTime: 12 * 3600_000,
    gcTime: 24 * 3600_000,
    retry: 1,
  })
  const netWorthInDisplay = (() => {
    if (!profile) return null
    const base = profile.base_currency as CurrencyCode
    if (base === displayCurrency) return netWorth
    const rates = pendingRatesQ.data
    if (!rates) return null
    return convertToBase(netWorth, base, displayCurrency, rates)
  })()

  // Tỷ giá "hôm nay" cho tiền hiển thị ĐÃ LƯU của kịch bản — dùng để dựng
  // `ctx.fxOf` cho mẫu (presets) và cho "Nhân bản kịch bản": cả hai thao tác đó
  // tạo bản ghi thật gắn với trạng thái HIỆN ĐANG LƯU của kịch bản, không phải
  // giá trị đang gõ dở trong dropdown ở trên.
  const savedRatesQ = useQuery({
    queryKey: ['lifetime-rates-for', scenario.display_currency],
    queryFn: () => fetchRates(scenario.display_currency as CurrencyCode),
    staleTime: 12 * 3600_000,
    gcTime: 24 * 3600_000,
    retry: 1,
  })
  // 1 currency = ? display, theo MAJOR units. `Rates` ở lib/rates.ts là chiều
  // NGƯỢC ("1 base đổi được rates[X] đơn vị X"), nên phải nghịch đảo (1/rate) —
  // xem JSDoc convertLifetimeMinor trong project.ts. Nếu fetchRates lỗi mạng và
  // chưa từng có cache, savedRatesQ.data vẫn undefined → trả null, mẫu vẫn tạo
  // được bản ghi nhưng fx_to_display rơi về 1 và bị banner + dấu cảnh báo bắt —
  // sai một cách nhìn thấy được, đúng chủ ý của presets.ts (fxForEvent).
  function fxOf(currency: CurrencyCode): number | null {
    if (currency === scenario.display_currency) return 1
    const rates = savedRatesQ.data
    if (!rates) return null
    const r = rates[currency]
    return r ? 1 / r : null
  }

  const updateScenarioMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: LifeScenarioPatch }) => repo.updateLifeScenario(id, patch),
  })
  const createScenarioMut = useMutation({ mutationFn: repo.createLifeScenario })

  async function invalidateScenarioTree() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['lifeScenarios'] }),
      qc.invalidateQueries({ queryKey: ['lifePhases'] }),
      qc.invalidateQueries({ queryKey: ['lifeEvents'] }),
    ])
  }

  async function handleSaveScenario() {
    if (!canSaveScenario) return
    setSavingScenario(true)
    try {
      if (profile && birthYearNum !== profile.birth_year) {
        await updateProfileMut.mutateAsync({ birth_year: birthYearNum })
      }

      const currencyChanged = displayCurrency !== scenario.display_currency
      await updateScenarioMut.mutateAsync({
        id: scenario.id,
        patch: {
          name: name.trim(),
          display_currency: displayCurrency,
          end_age: endAgeNum,
          real_return_bps: Math.round(realReturnNum * 100),
          band_spread_bps: Math.round(bandSpreadNum * 100),
          starting_assets_minor: assetsSign * assetsAbs,
          nominal_terms: nominalTerms,
        },
      })

      if (currencyChanged) {
        // RESET chứ không chỉ cảnh báo (quyết định đã chốt): số cũ dù đúng hay
        // sai đều đã vô nghĩa — nó là tỷ giá quy về một đơn vị hiển thị KHÁC.
        // Không điều kiện theo giá trị fx hiện tại — mọi dòng khác tiền hiển thị
        // MỚI đều bị đặt lại, kể cả dòng người dùng từng khai đúng cho tiền cũ.
        const affectedPhases = phases.filter((p) => p.currency !== displayCurrency)
        const affectedEvents = events.filter((e) => e.currency !== displayCurrency)
        await Promise.all([
          ...affectedPhases.map((p) => repo.updateLifePhase(p.id, { fx_to_display: 1 })),
          ...affectedEvents.map((e) => repo.updateLifeEvent(e.id, { fx_to_display: 1 })),
        ])
        setResetNotice(
          affectedPhases.length + affectedEvents.length > 0
            ? { phaseLabels: affectedPhases.map((p) => p.label), eventLabels: affectedEvents.map((e) => e.label) }
            : null,
        )
      } else {
        setResetNotice(null)
      }

      await invalidateScenarioTree()
      await qc.invalidateQueries({ queryKey: ['profile'] })
      showToast('Đã lưu kịch bản.', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không lưu được kịch bản.', 'error')
    } finally {
      setSavingScenario(false)
    }
  }

  async function handleDuplicate() {
    setDuplicating(true)
    try {
      const copy = await createScenarioMut.mutateAsync({
        name: `${scenario.name} (bản sao)`,
        display_currency: scenario.display_currency,
        end_age: scenario.end_age,
        real_return_bps: scenario.real_return_bps,
        band_spread_bps: scenario.band_spread_bps,
        starting_assets_minor: scenario.starting_assets_minor,
        nominal_terms: scenario.nominal_terms,
        is_primary: false,
      })
      await Promise.all([
        ...phases.map((p) =>
          repo.createLifePhase({
            scenario_id: copy.id,
            start_year: p.start_year,
            label: p.label,
            country: p.country,
            currency: p.currency,
            annual_income_minor: p.annual_income_minor,
            annual_expense_minor: p.annual_expense_minor,
            fx_to_display: p.fx_to_display,
          }),
        ),
        ...events.map((e) =>
          repo.createLifeEvent({
            scenario_id: copy.id,
            start_year: e.start_year,
            end_year: e.end_year,
            kind: e.kind,
            amount_minor: e.amount_minor,
            currency: e.currency,
            label: e.label,
            note: e.note,
            fx_to_display: e.fx_to_display,
            inflate: e.inflate,
          }),
        ),
      ])
      await invalidateScenarioTree()
      showToast(`Đã nhân bản thành "${copy.name}" — chọn ở dải chip kịch bản để xem/sửa.`, 'success')
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không nhân bản được kịch bản.', 'error')
    } finally {
      setDuplicating(false)
    }
  }

  // --- Khối 2 & 3: sheet con cho chặng/sự kiện ---
  const [phaseSheet, setPhaseSheet] = useState<{ phase?: LifePhaseRow } | null>(null)
  // `presets: true` = vào từ nút "Chọn mẫu" của khối Chặng đời — mở thẳng danh
  // sách mẫu thay vì form sự kiện trống (mẫu có thể sinh cả chặng lẫn sự kiện).
  const [eventSheet, setEventSheet] = useState<{ event?: LifeEventRow; presets?: boolean } | null>(null)
  const sortedPhases = [...phases].sort((a, b) => a.start_year - b.start_year)
  const sortedEvents = [...events].sort((a, b) => a.start_year - b.start_year)

  const currentYear = new Date().getFullYear() // đọc đồng hồ ở tầng UI — được phép (baseline.ts/project.ts thuần thì không).
  const currentPhase = currentPhaseOf(phases, currentYear)

  function buildPresetCtx(year: number): PresetContext {
    return {
      scenarioId: scenario.id,
      year,
      currency: currentPhase?.currency ?? scenario.display_currency,
      country: currentPhase?.country ?? null,
      currentIncomeMinor: currentPhase?.annual_income_minor ?? 0,
      currentExpenseMinor: currentPhase?.annual_expense_minor ?? 0,
      fxToDisplay: currentPhase?.fx_to_display ?? 1,
      displayCurrency: scenario.display_currency as CurrencyCode,
      fxOf,
    }
  }

  // --- Khối 4: "số này ở đâu ra" — luôn mở, đọc từ chặng đang hiệu lực HÔM NAY ---
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const baselineBase = (profile?.base_currency as CurrencyCode | undefined) ?? 'JPY'
  const currencyOf = (id: string): CurrencyCode =>
    (accounts.find((a) => a.id === id)?.currency as CurrencyCode | undefined) ?? baselineBase
  const todayISO = toISODate(new Date())
  const range = { start: addDaysISO(todayISO, -BASELINE_LOOKBACK_DAYS), end: addDaysISO(todayISO, 1) }
  const txsQ = useRangeTransactions(range)
  // Truyền NGUYÊN txs, không tự lọc theo tiền trước — suggestBaseline tự lọc
  // bằng currencyOf(t.account_id) (xem baseline.ts, sửa sau lỗi thứ 8 của plan).
  const baseline = currentPhase
    ? suggestBaseline(txsQ.data ?? [], categories, currencyOf, currentPhase.currency as CurrencyCode, todayISO)
    : null
  const positiveCats = baseline ? baseline.byCategory.filter((c) => c.share > 0) : []
  const totalPositiveShare = positiveCats.reduce((s, c) => s + c.share, 0)
  // Hoàn ròng (annualMinor âm) hiện thành DÒNG CHỮ, không vẽ đoạn — vẽ đoạn với
  // share âm sẽ cho width âm (trình duyệt kẹp về 0, mất thông tin im lặng).
  const refundCats = baseline ? baseline.byCategory.filter((c) => c.annualMinor < 0) : []
  // byCategory đã sắp theo annualMinor (không phải share) ngay trong suggestBaseline
  // — lấy top 3 trực tiếp là an toàn, không cần tự sắp lại theo share (đảo thứ tự
  // khi tổng chi âm, xem cảnh báo ở task-11-brief.md).
  const top3 = baseline ? baseline.byCategory.slice(0, 3) : []

  // Đóng bằng Esc — TRỪ khi một sheet con (chặng/sự kiện) đang mở đè lên: lúc đó
  // Esc phải đóng sheet con trước (PhaseFormSheet/EventFormSheet tự có Esc riêng),
  // không đóng luôn cả trình sửa kịch bản.
  useEffect(() => {
    if (phaseSheet || eventSheet) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phaseSheet, eventSheet, onClose])

  const field =
    'w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm outline-green-500 dark:text-gray-100'
  const label_ = 'mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400'

  return (
    <>
      <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 lg:items-center" onClick={onClose}>
        <div
          className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white dark:bg-gray-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">Sửa kịch bản</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg active:scale-95 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* --- Khối 1: Kịch bản --- */}
          <section className="mb-4 border-b border-gray-100 dark:border-gray-800 pb-4">
            <label className={label_}>Tên kịch bản</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={`mb-3 ${field}`} />

            <label className={label_}>Năm sinh</label>
            <input
              inputMode="decimal"
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              className={`mb-1 ${field}`}
            />
            {!birthYearValid && (
              <p role="alert" className="mb-2 text-xs text-red-600 dark:text-red-400">
                Năm sinh phải trong khoảng {MIN_BIRTH_YEAR}–{MAX_BIRTH_YEAR}.
              </p>
            )}
            {birthYearValid && <div className="mb-2" />}

            <label className={label_}>Tuổi kết thúc chiếu</label>
            <input
              inputMode="decimal"
              value={endAge}
              onChange={(e) => setEndAge(e.target.value)}
              className={`mb-1 ${field}`}
            />
            {!endAgeValid && (
              <p role="alert" className="mb-2 text-xs text-red-600 dark:text-red-400">
                Tuổi kết thúc phải trong khoảng {MIN_END_AGE}–{MAX_END_AGE}.
              </p>
            )}
            {endAgeValid && <div className="mb-2" />}

            <label className={label_}>Tiền hiển thị (đồ thị và bảng năm)</label>
            <select
              value={displayCurrency}
              onChange={(e) => setDisplayCurrency(e.target.value as CurrencyCode)}
              className={`mb-3 ${field}`}
            >
              {(Object.keys(CURRENCIES) as CurrencyCode[]).map((c) => (
                <option key={c} value={c}>
                  {CURRENCIES[c].label} ({c})
                </option>
              ))}
            </select>
            {displayCurrency !== scenario.display_currency && (
              <p className="mb-3 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Lưu sẽ đặt lại tỷ giá về 1 cho mọi chặng/sự kiện đang dùng tiền khác{' '}
                {CURRENCIES[displayCurrency].label} — số cũ dù sao cũng đã tính theo đơn vị hiển thị khác nên
                không còn đúng. Khai lại từng dòng ở khối "Chặng đời"/"Sự kiện" bên dưới sau khi lưu.
              </p>
            )}

            <label className={label_}>Tài sản khởi điểm</label>
            <div className="mb-1 flex gap-2">
              <button
                type="button"
                onClick={() => setAssetsSign(1)}
                className={`min-h-11 flex-1 rounded-lg text-sm font-medium active:scale-95 ${
                  assetsSign === 1
                    ? 'bg-green-600 text-white'
                    : 'border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                Dương
              </button>
              <button
                type="button"
                onClick={() => setAssetsSign(-1)}
                className={`min-h-11 flex-1 rounded-lg text-sm font-medium active:scale-95 ${
                  assetsSign === -1
                    ? 'bg-red-600 text-white'
                    : 'border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                }`}
              >
                Âm (đang nợ ròng)
              </button>
            </div>
            <div className="mb-1">
              <MoneyField
                value={assetsAbs}
                onChange={setAssetsAbs}
                currency={displayCurrency}
                ariaLabel="Tài sản khởi điểm"
                className={`text-right font-semibold ${field}`}
              />
            </div>
            <button
              type="button"
              disabled={netWorthLoading || !netWorthReliable || netWorthInDisplay === null}
              onClick={() => {
                if (netWorthInDisplay === null) return
                setAssetsSign(netWorthInDisplay < 0 ? -1 : 1)
                setAssetsAbs(Math.abs(netWorthInDisplay))
              }}
              className="mb-3 min-h-11 text-left text-xs font-medium text-green-700 dark:text-green-400 disabled:text-gray-400 dark:disabled:text-gray-600"
            >
              {netWorthLoading
                ? 'Đang tính tài sản ròng hiện tại…'
                : !netWorthReliable
                  ? 'Thiếu tỷ giá cho một phần tài khoản/công nợ nên chưa tính được tài sản ròng đáng tin.'
                  : netWorthInDisplay === null
                    ? 'Thiếu tỷ giá để quy đổi tài sản ròng sang tiền hiển thị này.'
                    : `Lấy lại theo tài sản ròng hiện tại (${formatMoney(netWorthInDisplay, displayCurrency)})`}
            </button>

            <label className={label_}>Lợi suất thực mỗi năm (%, đã trừ lạm phát — có thể âm)</label>
            <input
              inputMode="decimal"
              value={realReturnPct}
              onChange={(e) => setRealReturnPct(e.target.value)}
              className={`mb-1 ${field}`}
            />
            {!realReturnValid && (
              <p role="alert" className="mb-2 text-xs text-red-600 dark:text-red-400">
                Lợi suất thực phải trong khoảng {MIN_REAL_RETURN_PCT}% đến {MAX_REAL_RETURN_PCT}%.
              </p>
            )}
            {realReturnValid && <div className="mb-2" />}

            <label className={label_}>Độ rộng dải dao động (%, nửa dải)</label>
            <input
              inputMode="decimal"
              value={bandSpreadPct}
              onChange={(e) => setBandSpreadPct(e.target.value)}
              className={`mb-1 ${field}`}
            />
            {!bandSpreadValid && (
              <p role="alert" className="mb-2 text-xs text-red-600 dark:text-red-400">
                Độ rộng dải phải trong khoảng {MIN_BAND_SPREAD_PCT}% đến {MAX_BAND_SPREAD_PCT}%.
              </p>
            )}
            {bandSpreadValid && <div className="mb-2" />}

            <label className="mb-3 flex min-h-11 items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={nominalTerms}
                onChange={(e) => setNominalTerms(e.target.checked)}
                className="h-4 w-4"
              />
              Tính theo giá danh nghĩa (mặc định: giá hôm nay)
            </label>

            {resetNotice && (resetNotice.phaseLabels.length > 0 || resetNotice.eventLabels.length > 0) && (
              <div className="mb-3 rounded-lg bg-amber-50 dark:bg-amber-900/40 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                <p className="font-semibold">
                  Đã đặt lại tỷ giá về 1 cho {resetNotice.phaseLabels.length + resetNotice.eventLabels.length} dòng —
                  khai lại tỷ giá cho các dòng này bên dưới:
                </p>
                {resetNotice.phaseLabels.length > 0 && <p className="mt-1">Chặng: {resetNotice.phaseLabels.join(', ')}</p>}
                {resetNotice.eventLabels.length > 0 && <p className="mt-1">Sự kiện: {resetNotice.eventLabels.join(', ')}</p>}
                <button
                  type="button"
                  onClick={() => setResetNotice(null)}
                  className="mt-1.5 min-h-11 font-semibold underline underline-offset-2"
                >
                  Đã hiểu
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveScenario}
                disabled={!canSaveScenario}
                className="min-h-11 flex-1 rounded-lg bg-green-600 text-sm font-semibold text-white active:scale-95 disabled:opacity-50"
              >
                {savingScenario ? 'Đang lưu…' : 'Lưu thay đổi kịch bản'}
              </button>
              <button
                type="button"
                onClick={handleDuplicate}
                disabled={duplicating}
                title="Tạo một bản sao độc lập từ kịch bản này để thử phương án khác"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 px-3 text-sm font-medium text-gray-600 dark:text-gray-300 active:scale-95 disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
                {duplicating ? 'Đang nhân bản…' : 'Nhân bản'}
              </button>
            </div>
          </section>

          {/* --- Khối 2: Chặng đời --- */}
          <section className="mb-4 border-b border-gray-100 dark:border-gray-800 pb-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Chặng đời</h3>
            {sortedPhases.length === 0 ? (
              <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Chưa có chặng nào.</p>
            ) : (
              <ul className="mb-2 flex flex-col gap-2">
                {sortedPhases.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setPhaseSheet({ phase: p })}
                      className="min-h-11 w-full rounded-lg border border-gray-200 dark:border-gray-700 p-2.5 text-left active:scale-95"
                    >
                      <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {p.label} · {p.start_year}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">
                        Thu {formatMoney(p.annual_income_minor, p.currency as CurrencyCode)} · Chi{' '}
                        {formatMoney(p.annual_expense_minor, p.currency as CurrencyCode)}
                      </span>
                      {/* Chỉ hiện khi khác tiền hiển thị: cùng tiền thì engine bỏ qua
                          fx_to_display hoàn toàn (convertLifetimeMinor short-circuit khi
                          from === to) — hiện "$1 ≈ $150" cho một chặng đã cùng USD với
                          hiển thị là số vô nghĩa (giá trị cũ còn sót lại từ trước khi đổi
                          display_currency, không phải giả định đang dùng). Bắt được khi
                          kiểm bằng preview: đổi hiển thị sang USD trong lúc chặng "Chuyển
                          sang Mỹ" cũng đã là USD lộ ra đúng ca này. */}
                      {p.currency !== scenario.display_currency && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                          {p.fx_to_display === 1 && (
                            <AlertCircle className="h-3 w-3 shrink-0 text-amber-500" aria-hidden="true" />
                          )}
                          Tỷ giá giả định:{' '}
                          {formatFxAssumption(p.fx_to_display, p.currency as CurrencyCode, scenario.display_currency as CurrencyCode)}{' '}
                          · sửa được
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPhaseSheet({})}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 active:scale-95"
              >
                <Plus className="h-4 w-4" /> Thêm chặng
              </button>
              <button
                type="button"
                onClick={() => setEventSheet({ presets: true })}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 active:scale-95"
              >
                <Sparkles className="h-4 w-4" /> Chọn mẫu
              </button>
            </div>
          </section>

          {/* --- Khối 3: Sự kiện --- */}
          <section className="mb-4 border-b border-gray-100 dark:border-gray-800 pb-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Sự kiện</h3>
            {sortedEvents.length === 0 ? (
              <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Chưa có sự kiện nào.</p>
            ) : (
              <ul className="mb-2 flex flex-col gap-2">
                {sortedEvents.map((e) => {
                  const mismatch = e.currency !== scenario.display_currency
                  const suspicious = mismatch && e.fx_to_display === 1
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => setEventSheet({ event: e })}
                        className="min-h-11 w-full rounded-lg border border-gray-200 dark:border-gray-700 p-2.5 text-left active:scale-95"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{e.label}</span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-700 dark:text-gray-200">
                            {formatMoney(e.amount_minor, e.currency as CurrencyCode)}
                          </span>
                        </span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                          {e.kind === 'income' ? 'Thu' : 'Chi'} · {e.start_year}
                          {e.end_year !== null ? `–${e.end_year}` : ' – hết đời'} · {e.currency}
                        </span>
                        {mismatch && (
                          <span
                            className={`mt-0.5 flex items-center gap-1 text-xs ${
                              suspicious ? 'text-amber-700 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'
                            }`}
                          >
                            {suspicious && <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />}
                            Tỷ giá giả định:{' '}
                            {formatFxAssumption(e.fx_to_display, e.currency as CurrencyCode, scenario.display_currency as CurrencyCode)}{' '}
                            · sửa được
                          </span>
                        )}
                        {e.note && (
                          <span className="mt-0.5 block text-xs italic text-gray-400 dark:text-gray-500">{e.note}</span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setEventSheet({})}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 active:scale-95"
            >
              <Plus className="h-4 w-4" /> Thêm sự kiện
            </button>
          </section>

          {/* --- Khối 4: Số này ở đâu ra — LUÔN MỞ, số nền sai thì cả bản chiếu sai theo --- */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Số này ở đâu ra</h3>
            {!currentPhase || !baseline ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Chưa có chặng nào — thêm một chặng để xem số liệu chi tiêu thật đứng sau giả định.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  Chi {formatMoney(baseline.annualExpenseMinor, currentPhase.currency as CurrencyCode)}/năm lấy từ{' '}
                  {baseline.monthsCovered} tháng gần nhất của chặng "{currentPhase.label}".
                </p>
                {positiveCats.length > 0 && (
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                    {positiveCats.map((c, i) => (
                      <div
                        key={c.categoryId}
                        title={`${c.name}: ${Math.round(c.share * 100)}%`}
                        className={BAR_PALETTE[i % BAR_PALETTE.length]}
                        style={{ width: `${totalPositiveShare > 0 ? (c.share / totalPositiveShare) * 100 : 0}%` }}
                      />
                    ))}
                  </div>
                )}
                {refundCats.map((c) => (
                  <p key={c.categoryId} className="text-xs text-gray-500 dark:text-gray-400">
                    {c.name}: hoàn ròng {formatMoney(-c.annualMinor, currentPhase.currency as CurrencyCode)}
                  </p>
                ))}
                {top3.length > 0 && (
                  <ul className="space-y-0.5">
                    {top3.map((c) => (
                      <li key={c.categoryId} className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
                        <span className="truncate">{c.name}</span>
                        <span className="shrink-0 tabular-nums">
                          {formatMoney(c.annualMinor, currentPhase.currency as CurrencyCode)} ({Math.round(c.share * 100)}%)
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {phaseSheet && (
        <PhaseFormSheet
          scenarioId={scenario.id}
          displayCurrency={scenario.display_currency as CurrencyCode}
          phases={phases}
          phase={phaseSheet.phase}
          onClose={() => setPhaseSheet(null)}
        />
      )}
      {eventSheet && (
        <EventFormSheet
          scenarioId={scenario.id}
          displayCurrency={scenario.display_currency as CurrencyCode}
          event={eventSheet.event}
          buildPresetCtx={buildPresetCtx}
          initialPresetsOpen={eventSheet.presets ?? false}
          onClose={() => setEventSheet(null)}
        />
      )}
    </>
  )
}
