// Trình sửa kịch bản Lifetime: bốn khối theo thứ tự — kịch bản, chặng đời, sự
// kiện, "số này ở đâu ra" (xem docs/superpowers/plans/2026-07-29-lifetime.md,
// Task 11). STUB của Task 7 dừng ở đây; thân hàm bên dưới thay thế nó, giữ
// nguyên chữ ký props để LifetimePage không phải sửa lại chỗ gọi.
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Guide } from '../../components/Guide'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Copy, Plus, Sparkles, Star, Trash2, X } from 'lucide-react'
import { repo } from '../../data'
import type { LifeScenarioPatch } from '../../data/repo'
import { MoneyField } from '../../components/MoneyField'
import { useAccounts, useCategories, useRangeTransactions, useUpdateProfile } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { confirmDialog, showToast } from '../../lib/dialog'
import { CURRENCIES, formatMoney, type CurrencyCode } from '../../lib/money'
import { convertToBase, fetchRates } from '../../lib/rates'
import type {
  LifeEventRow,
  LifePhaseRow,
  LifeScenarioRow,
  ProfileRow,
} from '../../types/database.types'
import { Money } from '../../components/ui'
import { suggestBaseline } from './baseline'
import { pickActive } from './buildInput'
import { duplicateScenario } from './duplicate'
import { EventFormSheet } from './EventFormSheet'
import { PhaseFormSheet } from './PhaseFormSheet'
import type { PresetContext } from './presets'
import { phaseForYear } from './project'
import { baselineRange, makeCurrencyOf } from './useLifetime'

interface Props {
  scenario: LifeScenarioRow
  /** TOÀN BỘ kịch bản của người dùng — cần cho hai điều khiển ở khối 1: chặn xoá kịch
   *  bản CUỐI CÙNG (xoá xong thì màn Lifetime không còn gì để chiếu), và đặt
   *  `is_primary = false` cho các kịch bản KHÁC khi đổi kịch bản chính. Cả hai đều là
   *  quyết định về tập kịch bản, không đọc được từ mỗi `scenario`. */
  scenarios: LifeScenarioRow[]
  phases: LifePhaseRow[]
  events: LifeEventRow[]
  /** Bốn giá trị dưới đây do `LifetimePage` truyền xuống, sheet KHÔNG gọi
   *  `useLifetime()` lần hai: bản thứ hai mang `activeId` riêng nên `active` của nó
   *  có thể chỉ vào một kịch bản KHÁC cái đang sửa, kèm theo cả một bản chiếu 60 năm
   *  (có dải) tính song song với bản chiếu của trang. */
  profile: ProfileRow | undefined
  netWorth: number
  netWorthReliable: boolean
  netWorthLoading: boolean
  /**
   * Mở SẴN một form con ngay khi trình sửa hiện ra — dùng cho những nút nằm NGOÀI
   * sheet này (dải mốc cuộc đời dưới đồ thị, chip sự kiện trong Bảng theo năm). Trước
   * bản này mọi đường vào form chặng/sự kiện đều phải đi qua trình sửa rồi cuộn tìm,
   * tức người dùng bấm "Thêm sự kiện" ở ngoài vẫn phải bấm "Thêm sự kiện" lần nữa ở
   * trong.
   *
   * `undefined` = mở trình sửa như cũ, không form con nào.
   *
   * `event-edit` mang ID chứ không mang cả dòng: chỗ gọi từ đồ thị/bảng chỉ có
   * `YearEvent.id` (bản chiếu không giữ nguyên `LifeEventRow`). Không tìm thấy thì
   * KHÔNG mở form nào — thà đứng ở trình sửa với danh sách đầy đủ còn hơn mở một form
   * trống mà người dùng tưởng là sự kiện họ vừa bấm.
   */
  initialSheet?: EditorInitialSheet
  onClose: () => void
}

/** Form con mở sẵn khi trình sửa vừa hiện — xem prop `initialSheet`. */
export type EditorInitialSheet =
  | { kind: 'phase-new' }
  | { kind: 'phase-edit'; phaseId: string }
  | { kind: 'event-new' }
  | { kind: 'event-presets' }
  | { kind: 'event-edit'; eventId: string }

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

/** Bậc nhân cho toán hạng BÊN TRÁI của dòng tỷ giá giả định. Cố ý không có 10:
 *  nhảy thẳng 1 → 100 để ca thường gặp "1 đơn vị" (¥1 ≈ ₫172) không bị đổi thành
 *  "10 đơn vị" chỉ vì lẻ một chữ số. */
const FX_MULTIPLIERS = [1, 100, 1_000, 10_000, 100_000, 1_000_000] as const

/**
 * "¥1 ≈ ₫172", "₫100.000 ≈ ¥570" — tỷ giá giả định của một dòng, hiện ở danh sách
 * chặng/sự kiện (khác với dòng xem trước quy đổi trong form, vốn dùng số tiền THẬT
 * của dòng đang sửa — xem PhaseFormSheet/EventFormSheet).
 *
 * Nhân CẢ HAI vế lên cho tới khi vế phải còn giữ được khoảng 3 chữ số có nghĩa. Bản
 * đầu in cứng "1 đơn vị" bên trái rồi làm tròn vế phải theo minor unit của tiền hiển
 * thị, nên VND→JPY ở 0,0057 in ra "₫1 ≈ ¥0" — mất sạch thông tin, đúng ở ca mà
 * presets.ts gọi là "TRƯỜNG HỢP THƯỜNG GẶP NHẤT" của người dùng này (mẫu "Hỗ trợ bố
 * mẹ ở VN" sinh ra chính nó). Tệ hơn: `fx === 1` (điều kiện hiện dấu amber) KHÔNG
 * khớp 0,0057, nên một dòng đã khai ĐÚNG hiện ra y hệt một dòng chưa ai khai.
 */
function formatFxAssumption(fx: number, currency: CurrencyCode, display: CurrencyCode): string {
  // Ngưỡng theo MAJOR units: vế phải phải đạt ít nhất 100 đơn vị NHỎ NHẤT của tiền
  // hiển thị — ¥100/₫100 (0 chữ số thập phân) hay $1,00 (2 chữ số) — tức ~3 chữ số.
  const minMajor = 100 * 10 ** -CURRENCIES[display].decimals
  const mult =
    FX_MULTIPLIERS.find((m) => m * fx >= minMajor) ?? FX_MULTIPLIERS[FX_MULTIPLIERS.length - 1]
  const leftMinor = Math.round(mult * 10 ** CURRENCIES[currency].decimals)
  const rightMinor = Math.round(mult * fx * 10 ** CURRENCIES[display].decimals)
  return `${formatMoney(leftMinor, currency)} ≈ ${formatMoney(rightMinor, display)}`
}

const BAR_PALETTE = ['bg-green-500', 'bg-blue-400', 'bg-amber-400', 'bg-purple-400', 'bg-rose-400', 'bg-teal-400']

/** Token thẻ lồng của app cho một dòng danh sách bấm được. */
const ROW_CARD = 'min-h-11 w-full rounded-md bg-surface-sunken p-2.5 text-left active:scale-95'

/** Nút "thêm/chọn" xám của khối 2 & 3 (Thêm chặng · Chọn mẫu). Cùng lý do với
 *  `ROW_CARD`: ba nút cùng vai trò thì cùng một chuỗi class, không gõ lại từng nút. */
const ADD_BUTTON = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-surface-sunken text-sm font-medium text-fg-secondary active:scale-95'

/** Nút phụ dưới nút Lưu của khối 1 (đặt kịch bản chính · xoá kịch bản) — phần chung;
 *  màu chữ khác nhau nên nối thêm ở chỗ dùng. */
const BLOCK1_ACTION =
  'inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-medium active:scale-95 disabled:opacity-50'

export function ScenarioEditorSheet({
  scenario,
  scenarios,
  phases,
  events,
  profile,
  netWorth,
  netWorthReliable,
  netWorthLoading,
  initialSheet,
  onClose,
}: Props) {
  const qc = useQueryClient()
  const updateProfileMut = useUpdateProfile()

  // --- Khối 1: Kịch bản ---
  const [name, setName] = useState(scenario.name)
  const [birthYear, setBirthYear] = useState(String(profile?.birth_year ?? ''))
  const [endAge, setEndAge] = useState(String(scenario.end_age))
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>(scenario.display_currency as CurrencyCode)
  const [assetsSign, setAssetsSign] = useState<1 | -1>(scenario.starting_assets_minor < 0 ? -1 : 1)
  const [assetsAbs, setAssetsAbs] = useState(Math.abs(scenario.starting_assets_minor))
  // Đơn vị mà con số trong ô "Tài sản khởi điểm" ĐANG được tính theo.
  // `starting_assets_minor` lưu THEO `display_currency`, nên đổi dropdown mà không
  // quy đổi con số là biến ¥11.000.000 thành $110.000 (sai ~150 lần) mà không ai
  // thấy — cả dòng amber ở đây lẫn banner Task 7 vốn chỉ nói về TỶ GIÁ, không nói
  // một chữ nào về tài sản khởi điểm.
  const [assetsCurrency, setAssetsCurrency] = useState<CurrencyCode>(
    scenario.display_currency as CurrencyCode,
  )
  // true khi con số trong ô tài sản khởi điểm do NGƯỜI DÙNG đặt (gõ tay, hoặc bấm
  // "lấy lại theo tài sản ròng"); false khi nó chỉ vừa bị effect quy đổi tiền hiển
  // thị viết lại. Cần phân biệt vì quy đổi làm tròn ở CẢ HAI chiều: đổi hiển thị
  // JPY→USD→JPY trả về một con số có thể lệch vài đơn vị nhỏ nhất so với số đã lưu
  // (¥→$ mất phần lẻ dưới cent, $→¥ mất phần lẻ dưới yên), nên so thẳng `!==` sẽ bật
  // "· chưa lưu" và đòi xác nhận bỏ thay đổi cho một sửa đổi mà người dùng đã tự
  // hoàn tác. Đổi hiển thị mà CHƯA đổi lại thì `currencyChanged` bên dưới vẫn bắt
  // được, nên không mất dấu thay đổi thật nào.
  const [assetsTouched, setAssetsTouched] = useState(false)
  const [realReturnPct, setRealReturnPct] = useState(String(scenario.real_return_bps / 100))
  const [bandSpreadPct, setBandSpreadPct] = useState(String(scenario.band_spread_bps / 100))
  const [nominalTerms, setNominalTerms] = useState(scenario.nominal_terms)
  const [savingScenario, setSavingScenario] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [settingPrimary, setSettingPrimary] = useState(false)
  // true trong lúc chờ MỘT hộp thoại xác nhận nào đó (bỏ thay đổi, hoặc xoá kịch bản) —
  // chặn Esc của sheet này đóng đè lên hộp thoại (dialog.tsx có Esc riêng; cùng lý do đã
  // ghi ở PhaseFormSheet).
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
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

  const currencyChanged = displayCurrency !== scenario.display_currency
  // Khối 1 KHÔNG tự lưu (khác khối 2–4, vốn ghi ngay khi sheet con đóng), nên đóng
  // sheet giữa lúc đang sửa là mất trắng — và giả định tự nhiên của người dùng là
  // "mình lưu rồi" vì mọi thứ khác trong sheet đúng là đã lưu thật.
  const block1Dirty =
    name !== scenario.name ||
    birthYear !== String(profile?.birth_year ?? '') ||
    endAge !== String(scenario.end_age) ||
    currencyChanged ||
    assetsSign !== (scenario.starting_assets_minor < 0 ? -1 : 1) ||
    // `assetsTouched &&`: xem chú thích của state đó — không có nó thì một vòng
    // JPY→USD→JPY làm lệch con số vài đơn vị nhỏ nhất và sheet báo "chưa lưu" oan.
    (assetsTouched && Math.abs(assetsAbs) !== Math.abs(scenario.starting_assets_minor)) ||
    realReturnPct !== String(scenario.real_return_bps / 100) ||
    bandSpreadPct !== String(scenario.band_spread_bps / 100) ||
    nominalTerms !== scenario.nominal_terms

  // Tỷ giá "hôm nay" cho tiền hiển thị ĐANG CHỌN trong form (có thể khác tiền đã
  // lưu nếu người dùng vừa đổi dropdown) — dùng cho nút "lấy lại tài sản ròng hiện
  // tại" VÀ cho việc quy đổi tài sản khởi điểm khi đổi dropdown: cả hai con số đó
  // phải theo đúng đơn vị người dùng SẮP lưu.
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

  // Đổi dropdown tiền hiển thị → quy đổi luôn con số trong ô tài sản khởi điểm.
  // Quy đổi từ `assetsCurrency` (đơn vị con số ĐANG theo) chứ không từ
  // `scenario.display_currency`, nên đổi qua đổi lại nhiều lần vẫn cộng dồn đúng và
  // không xoá mất con số người dùng vừa tự sửa. Thiếu tỷ giá thì KHÔNG nhân bừa:
  // để nguyên số, `assetsStale` bật lên và dòng amber nói thẳng ra — sai một cách
  // nhìn thấy được, cùng nguyên tắc với fx_to_display = 1.
  const assetsStale = assetsCurrency !== displayCurrency
  useEffect(() => {
    if (assetsCurrency === displayCurrency) return
    const rates = pendingRatesQ.data
    if (!rates) return
    const converted = convertToBase(assetsAbs, assetsCurrency, displayCurrency, rates)
    if (converted === null) return
    setAssetsAbs(Math.abs(converted))
    setAssetsCurrency(displayCurrency)
  }, [assetsAbs, assetsCurrency, displayCurrency, pendingRatesQ.data])

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
  // (Không còn `createScenarioMut`: phép tạo bản sao đã sang `duplicate.ts`. Trạng thái
  // "đang chạy" của nút Nhân bản vốn đọc từ `duplicating` ở trên, không đọc từ mutation.)
  const deleteScenarioMut = useMutation({ mutationFn: (id: string) => repo.deleteLifeScenario(id) })

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

      await updateScenarioMut.mutateAsync({
        id: scenario.id,
        patch: {
          name: name.trim(),
          display_currency: displayCurrency,
          end_age: endAgeNum,
          real_return_bps: Math.round(realReturnNum * 100),
          band_spread_bps: Math.round(bandSpreadNum * 100),
          // Math.abs: `assetsAbs` đi qua MoneyField, mà MoneyField cho gõ biểu thức
          // (NumPad có phím −) nên "5 − 9" ra −4. Công tắc Dương/Âm là NGUỒN DUY
          // NHẤT của dấu; cột này không có check nào ở DB nên số âm cứ thế lưu vào
          // và công tắc lại đang chỉ "Dương".
          //
          // BỎ HẲN trường này ra khỏi patch khi `assetsStale`: cột lưu THEO
          // `display_currency`, nên ghi một con số còn đang tính theo tiền CŨ vào
          // đây là biến ¥11.000.000 thành $110.000 (sai ~150 lần) đúng ở điểm khởi
          // đầu bản chiếu — rồi lần lưu đó còn tự dán nhãn "đã quy đổi" và xoá mất
          // dòng cảnh báo duy nhất. Không chặn lưu (quyết định đã chốt), chỉ không
          // để lần lưu tẩy trắng một con số biết là sai: giữ nguyên giá trị cũ
          // trong DB và giữ nguyên `assetsCurrency` bên dưới để dòng amber sống qua
          // lần lưu, còn nhắc người dùng gõ lại bằng tay.
          ...(assetsStale ? {} : { starting_assets_minor: assetsSign * Math.abs(assetsAbs) }),
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

      // CHỈ khi con số trong ô thật sự đã theo đơn vị mới. `assetsStale` thì
      // `starting_assets_minor` vừa bị bỏ khỏi patch (xem trên), nên ô vẫn đang tính
      // theo `assetsCurrency` cũ — dán nhãn mới ở đây là tắt luôn dòng amber duy nhất
      // đang nói cho người dùng biết con số chưa đổi đơn vị và chưa được lưu.
      if (!assetsStale) setAssetsCurrency(displayCurrency)
      showToast('Đã lưu kịch bản.', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không lưu được kịch bản.', 'error')
    } finally {
      // Làm mới cache trong `finally`, KHÔNG ở cuối `try` — cùng lỗi đã vá một lần cho
      // `handleDuplicate`. Hàm này ghi NHIỀU lần tuần tự: profile → kịch bản
      // (`display_currency`) → từng lệnh đặt lại `fx_to_display`. Lỗi ở một lệnh đặt lại
      // để DB mang tiền hiển thị MỚI trong khi vài dòng còn tỷ giá của tiền CŨ, còn cache
      // giữ nguyên kịch bản cũ — lúc đó `mismatchCount` ở LifetimePage đếm theo
      // `display_currency` CŨ và có thể ra 0, tức banner cảnh báo tắt ngóm suốt cả
      // staleTime, đúng trên đường code vừa sinh ra những tỷ giá biết chắc là sai.
      await invalidateScenarioTree()
      await qc.invalidateQueries({ queryKey: ['profile'] })
      setSavingScenario(false)
    }
  }

  async function handleDuplicate() {
    // Bản sao dựng từ `scenario.*` (bản ĐÃ LƯU), nên nhân bản giữa lúc khối 1 còn
    // sửa dở cho ra một bản sao KHÔNG mang thay đổi đó — rồi `onClose()` ở dưới
    // đóng sheet mang luôn thay đổi đi. Chặn thẳng, đừng tạo bản sao lệch.
    if (block1Dirty) {
      showToast(
        'Khối "Kịch bản" đang có thay đổi chưa lưu. Bản sao dựng từ bản đã lưu nên sẽ không mang thay đổi đó — bấm "Lưu thay đổi kịch bản" trước, hoặc đóng sheet để bỏ thay đổi.',
        'error',
      )
      return
    }
    setDuplicating(true)
    try {
      // Thân phép chép nằm ở `duplicate.ts` — dùng CHUNG với nút "Kịch bản mới" ở dải
      // chip của LifetimeView. Hai bản chép tay là cách chúng trôi lệch nhau (xem đầu
      // file đó). `afterCreate` là chỗ làm mới cache, chạy kể cả khi chép dòng lỗi.
      const copy = await duplicateScenario({
        scenario,
        phases,
        events,
        afterCreate: invalidateScenarioTree,
      })
      showToast(`Đã nhân bản thành "${copy.name}" — chọn ở dải chip kịch bản để xem/sửa.`, 'success')
      onClose()
    } catch (err) {
      // Kịch bản sao được tạo TRƯỚC khi chép chặng/sự kiện, nên lỗi giữa đường để
      // lại một bản sao thiếu dòng. Không tự dọn hộ (xoá bản ghi thay người dùng
      // nguy hiểm hơn), nhưng phải NÓI RA để họ biết có thứ cần xoá.
      const detail = err instanceof Error ? err.message : 'lỗi không rõ'
      showToast(
        `Không nhân bản xong (${detail}). Có thể đã có một bản sao thiếu dòng trong dải chip kịch bản — kiểm và xoá nếu cần.`,
        'error',
      )
    } finally {
      setDuplicating(false)
    }
  }

  /** Kịch bản DUY NHẤT thì không cho xoá: xoá xong màn Lifetime rơi về trạng thái "chưa
   *  có kịch bản nào" và nút tạo lại dựng một kịch bản khác hoàn toàn từ chi tiêu thật —
   *  tức không phải một phép xoá, mà là xoá cả tính năng rồi khởi động lại. */
  const isOnlyScenario = scenarios.length <= 1

  /**
   * Xoá kịch bản này (kèm mọi chặng/sự kiện của nó — cascade ở Postgres, tự dọn ở
   * demoRepo). `repo.deleteLifeScenario` có từ lúc dựng lược đồ nhưng CHƯA CÓ CHỖ GỌI
   * nào, trong khi `handleDuplicate` ở trên lại bảo người dùng "kiểm và xoá nếu cần" một
   * bản sao dở dang, và `ensureFirstScenario` có thể sinh ra kịch bản thiếu chặng. Dải
   * chip kịch bản trước đây chỉ có đường lớn thêm.
   */
  async function handleDeleteScenario() {
    if (isOnlyScenario) {
      showToast(
        'Đây là kịch bản duy nhất — xoá đi thì màn Lifetime không còn gì để chiếu. Nhân bản hoặc tạo thêm một kịch bản khác trước, rồi hãy xoá cái này.',
        'error',
      )
      return
    }
    setConfirmingDelete(true)
    const ok = await confirmDialog({
      title: `Xóa kịch bản "${scenario.name}"?`,
      message: `Xóa luôn ${phases.length} chặng đời và ${events.length} sự kiện của kịch bản này. Không hoàn tác được. Các kịch bản khác không bị ảnh hưởng.`,
      confirmLabel: 'Xóa',
      cancelLabel: 'Giữ lại',
      danger: true,
    })
    setConfirmingDelete(false)
    if (!ok) return
    setDeleting(true)
    try {
      await deleteScenarioMut.mutateAsync(scenario.id)
      showToast(`Đã xóa kịch bản "${scenario.name}".`, 'success')
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không xóa được kịch bản.', 'error')
      // ĐÓNG cả ở đường lỗi, cùng lý do với `finally` bên dưới: lệnh xoá có thể đã commit
      // rồi mới lỗi (timeout mạng). Để sheet mở thì lần làm mới cache ngay sau đây rút
      // dòng đang sửa đi, `active` lành về kịch bản còn lại, và sheet — vốn khởi tạo mọi ô
      // của khối 1 bằng `useState(scenario.*)` — vẫn giữ giá trị của kịch bản ĐÃ XOÁ trong
      // khi `scenario.id` đã trỏ sang kịch bản khác. Bấm "Lưu thay đổi kịch bản" lúc đó là
      // ghi đè tên/tuổi/lợi suất/tài sản khởi điểm của kịch bản chết lên kịch bản còn
      // sống. `key={active.id}` ở LifetimePage đỡ chung lớp lỗi này, đây là lớp thứ hai.
      onClose()
    } finally {
      // `finally`: xoá kịch bản là một lệnh, nhưng lỗi vẫn có thể xảy ra SAU khi hàng
      // đã đi (timeout mạng trong lúc Postgres đã commit). Không làm mới thì dải chip
      // còn hiện một kịch bản không còn tồn tại, và bấm vào nó là một trang trống.
      await invalidateScenarioTree()
      setDeleting(false)
    }
  }

  /**
   * "Đang là kịch bản chính" suy từ `pickActive` — CÙNG hàm mà `buildLifetimeInput` (bộ
   * luật nhắc lệch) và thẻ Lifetime ở /assets dùng — chứ không đọc thẳng cờ
   * `scenario.is_primary`. Hai nguồn thì chúng nói ngược nhau được: nếu lệnh bỏ cờ ở các
   * kịch bản KHÁC trong `handleMakePrimary` lỗi giữa đường thì còn HAI dòng cùng
   * `is_primary`, và `pickActive` chọn dòng có `sort_order` nhỏ hơn — có thể là dòng kia.
   * Lúc đó cờ nói "tôi là chính" trong khi cả bộ luật lẫn thẻ ở /assets đang đọc kịch bản
   * khác, và nhãn này khẳng định một điều không đúng.
   *
   * Dùng luôn cho câu chặn ở đầu `handleMakePrimary`: chặn theo cờ thì đúng ca lệch trên,
   * nút hiện ra ("Đặt làm kịch bản chính") nhưng bấm vào lại thoát ngay — không có đường
   * nào chữa được thế lệch. Chặn theo `pickActive` thì bấm lần nữa chạy lại đúng hai lệnh
   * ghi đó và dọn được cờ dư.
   */
  const isEffectivePrimary = pickActive(scenarios)?.id === scenario.id

  /**
   * Đặt kịch bản này làm KỊCH BẢN CHÍNH. `is_primary` trước đây chỉ được ghi `true` một
   * lần lúc tạo kịch bản đầu tiên và `false` cho mọi bản sao, không có đường nào đổi —
   * nên sau khi nhân bản, bộ luật nhắc lệch (`buildLifetimeInput`) và thẻ Lifetime ở
   * /assets vẫn dính vào bản gốc dù người dùng đã chuyển hẳn sang làm việc với bản sao.
   *
   * Đặt `true` cho kịch bản này TRƯỚC, rồi mới bỏ cờ ở các kịch bản khác. Lỗi giữa
   * đường thì còn HAI kịch bản cùng `is_primary` — `pickActive` (buildInput.ts) xử lý
   * được ca đó (lấy `sort_order` nhỏ nhất trong nhóm primary). Làm ngược lại (bỏ cờ
   * trước) mà lỗi thì còn KHÔNG kịch bản nào primary, tức mất hẳn ý định người dùng vừa
   * bày tỏ.
   */
  async function handleMakePrimary() {
    if (isEffectivePrimary) return
    setSettingPrimary(true)
    try {
      await repo.updateLifeScenario(scenario.id, { is_primary: true })
      await Promise.all(
        scenarios
          .filter((s) => s.id !== scenario.id && s.is_primary)
          .map((s) => repo.updateLifeScenario(s.id, { is_primary: false })),
      )
      showToast(`"${scenario.name}" là kịch bản chính từ giờ.`, 'success')
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Không đặt được kịch bản chính.',
        'error',
      )
    } finally {
      await invalidateScenarioTree()
      setSettingPrimary(false)
    }
  }

  // --- Khối 2 & 3: sheet con cho chặng/sự kiện ---
  //
  // Cả hai khởi tạo từ `initialSheet` bằng HÀM khởi tạo của useState, tức đọc ĐÚNG MỘT
  // LẦN lúc gắn. Không dùng useEffect: LifetimeView dựng sheet này với `key={active.id}`
  // và chỉ khi `editorOpen`, nên mỗi lần mở là một lần gắn mới — còn một effect theo
  // `initialSheet` sẽ mở lại form con mỗi khi người dùng vừa đóng nó mà prop chưa đổi.
  const [phaseSheet, setPhaseSheet] = useState<{ phase?: LifePhaseRow } | null>(() => {
    if (initialSheet?.kind === 'phase-new') return {}
    if (initialSheet?.kind === 'phase-edit') {
      // Không tìm thấy → `null`, KHÔNG rơi về `{}`: xem JSDoc prop `initialSheet`.
      const row = phases.find((p) => p.id === initialSheet.phaseId)
      return row ? { phase: row } : null
    }
    return null
  })
  // `presets: true` = vào từ nút "Chọn mẫu" của khối Chặng đời — mở thẳng danh
  // sách mẫu thay vì form sự kiện trống (mẫu có thể sinh cả chặng lẫn sự kiện).
  const [eventSheet, setEventSheet] = useState<{ event?: LifeEventRow; presets?: boolean } | null>(
    () => {
      if (initialSheet?.kind === 'event-new') return {}
      if (initialSheet?.kind === 'event-presets') return { presets: true }
      if (initialSheet?.kind === 'event-edit') {
        // Không tìm thấy → `null`, KHÔNG rơi về `{}`: xem JSDoc prop `initialSheet`.
        const row = events.find((e) => e.id === initialSheet.eventId)
        return row ? { event: row } : null
      }
      return null
    },
  )
  const sortedPhases = useMemo(() => [...phases].sort((a, b) => a.start_year - b.start_year), [phases])
  const sortedEvents = useMemo(() => [...events].sort((a, b) => a.start_year - b.start_year), [events])

  const currentYear = new Date().getFullYear() // đọc đồng hồ ở tầng UI — được phép (baseline.ts/project.ts thuần thì không).
  // CÙNG MỘT luật với engine: `phaseForYear` của project.ts, generic theo `startYear`
  // nên chỉ cần bọc `start_year` của từng dòng lại (xem JSDoc ở đó).
  const currentPhase = useMemo(
    () => phaseForYear(sortedPhases.map((p) => ({ startYear: p.start_year, row: p })), currentYear)?.row,
    [sortedPhases, currentYear],
  )

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
  const todayISO = toISODate(new Date())
  // Cùng khoảng ngày với useLifetime.ts — dùng chung helper thay vì chép lại hằng số
  // (hai hằng số thì một ngày nào đó chúng lệch nhau và khối này báo một con số khác
  // con số đã dùng để tạo kịch bản).
  const range = useMemo(() => baselineRange(todayISO), [todayISO])
  const txsQ = useRangeTransactions(range)
  // Truyền NGUYÊN txs, không tự lọc theo tiền trước — suggestBaseline tự lọc
  // bằng currencyOf(t.account_id) (xem baseline.ts, sửa sau lỗi thứ 8 của plan).
  // useMemo vì hàm này lọc tới 366 ngày giao dịch: không nhớ đệm thì mỗi ký tự gõ
  // vào ô tên / năm sinh / lợi suất / dải đều chạy lại cả vòng lọc đó.
  const baseline = useMemo(
    () =>
      currentPhase
        ? suggestBaseline(
            txsQ.data ?? [],
            categories,
            makeCurrencyOf(accounts, baselineBase),
            currentPhase.currency as CurrencyCode,
            todayISO,
          )
        : null,
    [currentPhase, txsQ.data, categories, accounts, baselineBase, todayISO],
  )
  const positiveCats = baseline ? baseline.byCategory.filter((c) => c.share > 0) : []
  const totalPositiveShare = positiveCats.reduce((s, c) => s + c.share, 0)
  // Hoàn ròng (annualMinor âm) hiện thành DÒNG CHỮ, không vẽ đoạn — vẽ đoạn với
  // share âm sẽ cho width âm (trình duyệt kẹp về 0, mất thông tin im lặng).
  const refundCats = baseline ? baseline.byCategory.filter((c) => c.annualMinor < 0) : []
  // byCategory đã sắp theo annualMinor (không phải share) ngay trong suggestBaseline
  // — lấy top 3 trực tiếp là an toàn, không cần tự sắp lại theo share (đảo thứ tự
  // khi tổng chi âm, xem cảnh báo ở task-11-brief.md).
  const top3 = baseline ? baseline.byCategory.slice(0, 3) : []

  // Chặng đang dùng đúng số sổ thì nút "Lấy số này vào chặng" thành vô nghĩa — thay
  // bằng một câu xác nhận, đỡ một cú bấm không đổi gì.
  const phaseMatchesBaseline =
    !!currentPhase &&
    !!baseline &&
    currentPhase.annual_income_minor === baseline.annualIncomeMinor &&
    currentPhase.annual_expense_minor === baseline.annualExpenseMinor

  const [pullingBaseline, setPullingBaseline] = useState(false)
  /** Ghi thu/chi nền vừa đếm từ sổ vào chặng đang hiệu lực — đường tắt cho ca "kịch
   *  bản tạo lúc sổ chưa có dữ liệu (vd thu = 0 vì chưa ghi lương), giờ sổ đã đủ". */
  async function handlePullBaseline() {
    if (!currentPhase || !baseline || pullingBaseline) return
    setPullingBaseline(true)
    try {
      await repo.updateLifePhase(currentPhase.id, {
        annual_income_minor: baseline.annualIncomeMinor,
        annual_expense_minor: baseline.annualExpenseMinor,
      })
      showToast(`Đã cập nhật thu chi của chặng "${currentPhase.label}" theo sổ.`, 'success')
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Không cập nhật được chặng theo sổ.',
        'error',
      )
    } finally {
      // Chỉ cần làm mới chặng — kịch bản/sự kiện không đổi trong đường này.
      await qc.invalidateQueries({ queryKey: ['lifePhases'] })
      setPullingBaseline(false)
    }
  }

  /** Đóng sheet — hỏi trước nếu khối 1 còn thay đổi chưa lưu (xem `block1Dirty`). */
  async function handleDismiss() {
    if (!block1Dirty) {
      onClose()
      return
    }
    setConfirmingDiscard(true)
    const ok = await confirmDialog({
      title: 'Bỏ thay đổi chưa lưu?',
      message:
        'Khối "Kịch bản" có thay đổi chưa bấm "Lưu thay đổi kịch bản" — đóng bây giờ là mất. Chặng đời và sự kiện đã lưu ngay lúc sửa nên không ảnh hưởng.',
      confirmLabel: 'Bỏ thay đổi',
      cancelLabel: 'Ở lại',
      danger: true,
    })
    setConfirmingDiscard(false)
    if (ok) onClose()
  }

  // `handleDismiss` được dựng lại mỗi render (nó đọc `block1Dirty`), nên giữ bản mới
  // nhất trong một ref thay vì đưa vào deps của effect dưới — đưa vào deps thì mỗi
  // ký tự gõ trong khối 1 sẽ gỡ rồi gắn lại listener keydown.
  const dismissRef = useRef(handleDismiss)
  dismissRef.current = handleDismiss

  // Đóng bằng Esc — TRỪ khi một sheet con (chặng/sự kiện) hoặc hộp thoại xác nhận
  // bỏ thay đổi đang mở đè lên: lúc đó Esc phải đóng cái ở trên trước (chúng tự có
  // Esc riêng), không đóng luôn cả trình sửa kịch bản.
  useEffect(() => {
    if (phaseSheet || eventSheet || confirmingDiscard || confirmingDelete) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') void dismissRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phaseSheet, eventSheet, confirmingDiscard, confirmingDelete])

  const field =
    'w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm dark:text-gray-100'
  const label_ = 'mb-1 block text-xs font-medium text-fg-muted'

  // `useId` chứ không phải id viết cứng: sheet này mở ĐỒNG THỜI với PhaseFormSheet /
  // EventFormSheet, và id trùng thì `htmlFor` bắt vào ô ĐẦU TIÊN khớp trong DOM — nhãn
  // trỏ sai ô còn tệ hơn không có nhãn.
  const uid = useId()
  const errorLine = 'mb-2 text-xs text-money-out'

  return (
    <>
      {/* Mobile: bottom sheet một cột như cũ. Từ lg: choán TOÀN màn hình, bốn khối
          trải thành ba cột (kịch bản · chặng+sự kiện · số này ở đâu ra) — mỗi cột tự
          cuộn riêng để form dài của khối 1 không đẩy hai danh sách ra khỏi tầm mắt.
          `lg:overflow-y-hidden` (không phải `lg:overflow-hidden`): phải thắng đúng
          thuộc tính mà `overflow-y-auto` của mobile đã đặt. */}
      <div
        className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-stretch animate-overlay-in"
        onClick={() => void handleDismiss()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Sửa kịch bản"
          className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:flex lg:h-full lg:max-h-none lg:max-w-none lg:flex-col lg:overflow-y-hidden lg:rounded-none lg:px-8 lg:py-5 animate-sheet-in lg:animate-sheet-pop"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-3 flex items-center justify-between gap-2 lg:mx-auto lg:w-full lg:max-w-6xl lg:shrink-0">
            <h2 className="text-base font-bold text-fg-primary">
              Sửa kịch bản
              {block1Dirty && (
                <span className="ml-2 text-xs font-medium text-fg-warn">· chưa lưu</span>
              )}
            </h2>
            <button
              type="button"
              onClick={() => void handleDismiss()}
              aria-label="Đóng"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md transition active:scale-95 hover:bg-surface-sunken"
            >
              <X className="h-5 w-5 text-fg-muted" />
            </button>
          </div>

          {/* Thân ba cột (chỉ từ lg). `lg:min-h-0` bắt buộc: item flex mặc định
              min-height auto, không có nó thì lưới cao theo nội dung và cả trang cuộn
              thay vì từng cột. */}
          <div className="lg:mx-auto lg:grid lg:min-h-0 lg:w-full lg:max-w-6xl lg:flex-1 lg:grid-cols-3 lg:items-stretch lg:gap-8">
          {/* --- Khối 1: Kịch bản --- */}
          <section className="mb-4 border-b border-border-subtle pb-4 lg:mb-0 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:pb-2 lg:pr-1">
            {/* Mobile không cần tiêu đề (khối 1 mở màn ngay dưới tựa sheet), nhưng lên
                ba cột thì cột nào cũng phải có tên. */}
            <h3 className="mb-2 hidden text-sm font-semibold text-fg-secondary lg:block">
              Kịch bản
            </h3>
            <label htmlFor={`${uid}-name`} className={label_}>
              Tên kịch bản
            </label>
            <input id={`${uid}-name`} value={name} onChange={(e) => setName(e.target.value)} className={`mb-1 ${field}`} />
            {!nameValid && (
              <p role="alert" className={errorLine}>
                Tên kịch bản không được để trống.
              </p>
            )}
            {nameValid && <div className="mb-2" />}

            <label htmlFor={`${uid}-birth`} className={label_}>
              Năm sinh
            </label>
            <input
              id={`${uid}-birth`}
              inputMode="decimal"
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              className={`mb-1 ${field}`}
            />
            {!birthYearValid && (
              <p role="alert" className={errorLine}>
                Năm sinh phải trong khoảng {MIN_BIRTH_YEAR}–{MAX_BIRTH_YEAR}.
              </p>
            )}
            {birthYearValid && <div className="mb-2" />}

            <label htmlFor={`${uid}-endage`} className={label_}>
              Tuổi kết thúc chiếu
            </label>
            <input
              id={`${uid}-endage`}
              inputMode="decimal"
              value={endAge}
              onChange={(e) => setEndAge(e.target.value)}
              className={`mb-1 ${field}`}
            />
            {!endAgeValid && (
              <p role="alert" className={errorLine}>
                Tuổi kết thúc phải trong khoảng {MIN_END_AGE}–{MAX_END_AGE}.
              </p>
            )}
            {endAgeValid && <div className="mb-2" />}

            <label htmlFor={`${uid}-display`} className={label_}>
              Tiền hiển thị (đồ thị và bảng năm)
            </label>
            <select
              id={`${uid}-display`}
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
            {/* `|| assetsStale`: dòng cảnh báo tài sản khởi điểm phải SỐNG QUA lần
                lưu. Lưu xong thì `scenario.display_currency` đã là tiền mới nên
                `currencyChanged` tắt, mà `assetsStale` vẫn còn (ô chưa quy đổi được,
                và trường đó cũng vừa bị bỏ khỏi patch) — treo cả khối vào riêng
                `currencyChanged` là xoá đúng câu duy nhất còn nói con số đang sai đơn
                vị. Banner Task 7 không đỡ hộ: nó chỉ đếm dòng có fx_to_display = 1,
                không biết gì về tài sản khởi điểm. */}
            {(currencyChanged || assetsStale) && (
              <div className="mb-3 flex items-start gap-1 text-xs text-fg-warn">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <div className="space-y-1">
                  {currencyChanged && (
                    <p>
                      Lưu sẽ đặt lại tỷ giá về 1 cho mọi chặng/sự kiện đang dùng tiền khác{' '}
                      {CURRENCIES[displayCurrency].label} — số cũ dù sao cũng đã tính theo đơn vị hiển thị khác
                      nên không còn đúng. Khai lại từng dòng ở khối "Chặng đời"/"Sự kiện" bên dưới sau khi lưu.
                    </p>
                  )}
                  {/* Tài sản khởi điểm lưu THEO tiền hiển thị, nên đổi tiền là phải
                      đổi cả con số. Nói ra bằng chữ để người dùng kiểm được, không
                      im lặng sửa số dưới tay họ. */}
                  {assetsStale ? (
                    <p>
                      Chưa có tỷ giá để quy đổi <b>tài sản khởi điểm</b>: con số trong ô vẫn đang tính theo{' '}
                      {CURRENCIES[assetsCurrency].label} (
                      <span className="tabular-nums">
                        {formatMoney(assetsSign * Math.abs(assetsAbs), assetsCurrency)}
                      </span>
                      ). Lưu kịch bản sẽ BỎ QUA ô này — ghi vào là ghi sai đơn vị. Sửa lại tay cho đúng{' '}
                      {CURRENCIES[displayCurrency].label} rồi lưu lần nữa.
                    </p>
                  ) : (
                    currencyChanged && (
                      <p>
                        Đã quy đổi <b>tài sản khởi điểm</b> sang {CURRENCIES[displayCurrency].label} theo tỷ giá
                        hôm nay:{' '}
                        <span className="tabular-nums">
                          {formatMoney(assetsSign * Math.abs(assetsAbs), displayCurrency)}
                        </span>{' '}
                        — kiểm lại trước khi lưu.
                      </p>
                    )
                  )}
                </div>
              </div>
            )}

            {/* Nhãn của một NHÓM (công tắc dấu + ô tiền), không của một control — nên
                `role="group"` + `aria-labelledby`, không phải <label htmlFor>. Và
                `aria-pressed` là bắt buộc chứ không phải thêm cho đẹp: Dương/Âm chỉ khác
                nhau bằng MÀU, thiếu nó thì người dùng screen reader không biết tài sản đang
                được coi là dương hay âm — mà đó là dấu của TOÀN BỘ bản chiếu. Cùng cách với
                nhóm "Loại" ở EventFormSheet. */}
            <span id={`${uid}-assets`} className={label_}>
              Tài sản khởi điểm
            </span>
            <div role="group" aria-labelledby={`${uid}-assets`} className="mb-1 flex gap-2">
              <button
                type="button"
                aria-pressed={assetsSign === 1}
                onClick={() => setAssetsSign(1)}
                className={`min-h-11 flex-1 rounded-md text-sm font-medium transition active:scale-95 ${
                  assetsSign === 1
                    ? 'bg-accent text-fg-on-accent'
                    : 'border border-border-strong text-fg-secondary'
                }`}
              >
                Dương
              </button>
              <button
                type="button"
                aria-pressed={assetsSign === -1}
                onClick={() => setAssetsSign(-1)}
                className={`min-h-11 flex-1 rounded-md text-sm font-medium transition active:scale-95 ${
                  assetsSign === -1
                    ? 'bg-accent text-fg-on-accent'
                    : 'border border-border-strong text-fg-secondary'
                }`}
              >
                Âm (đang nợ ròng)
              </button>
            </div>
            <div className="mb-1">
              <MoneyField
                value={Math.abs(assetsAbs)}
                // Math.abs: MoneyField cho gõ biểu thức ("5 − 9" ra −4) nhưng dấu ở
                // đây do công tắc Dương/Âm quyết định — xem handleSaveScenario.
                onChange={(v) => {
                  setAssetsAbs(Math.abs(v))
                  setAssetsTouched(true)
                }}
                // Đơn vị THẬT của con số, không phải đơn vị sắp lưu: khi thiếu tỷ giá
                // để quy đổi thì hai thứ đó lệch nhau, và dán nhãn theo đơn vị mới là
                // đúng cái làm người dùng tin con số đã đổi đơn vị (xem `assetsStale`).
                currency={assetsCurrency}
                // Ô phụ: khối 1 không có ô tiền CHÍNH nào (ô này nằm giữa một loạt ô
                // chữ/số), tự bung NumPad ở đây là chèn bàn phím vào giữa form dài
                // nhất của app — xem hợp đồng `autoOpen` trong MoneyField.tsx.
                autoOpen={false}
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
                // Người dùng CHỦ Ý đặt con số này, không phải effect quy đổi — tính là
                // sửa thật để `block1Dirty` bắt được (xem `assetsTouched`).
                setAssetsTouched(true)
                // Con số này đã tính theo tiền hiển thị đang chọn.
                setAssetsCurrency(displayCurrency)
              }}
              // Lúc bị vô hiệu hoá, nhãn nút CHÍNH LÀ câu giải thích vì sao không
              // lấy được số — nên không hạ tương phản xuống mức "chữ mờ" như nút
              // disabled thường; đây là chữ phải đọc được.
              className="mb-3 min-h-11 text-left text-xs font-medium text-fg-accent transition active:scale-95 disabled:text-gray-600 dark:disabled:text-gray-300"
            >
              {netWorthLoading
                ? 'Đang tính tài sản ròng hiện tại…'
                : !netWorthReliable
                  ? 'Thiếu tỷ giá cho một phần tài khoản/công nợ nên chưa tính được tài sản ròng đáng tin.'
                  : netWorthInDisplay === null
                    ? 'Thiếu tỷ giá để quy đổi tài sản ròng sang tiền hiển thị này.'
                    : `Lấy lại theo tài sản ròng hiện tại (${formatMoney(netWorthInDisplay, displayCurrency)})`}
            </button>

            <label htmlFor={`${uid}-return`} className={label_}>
              Lợi suất thực mỗi năm (%, đã trừ lạm phát — có thể âm)
            </label>
            <input
              id={`${uid}-return`}
              inputMode="decimal"
              value={realReturnPct}
              onChange={(e) => setRealReturnPct(e.target.value)}
              className={`mb-1 ${field}`}
            />
            {!realReturnValid && (
              <p role="alert" className={errorLine}>
                Lợi suất thực phải trong khoảng {MIN_REAL_RETURN_PCT}% đến {MAX_REAL_RETURN_PCT}%.
              </p>
            )}
            {realReturnValid && <div className="mb-2" />}

            {/* KHÔNG viết "nửa dải" — đó là từ của người viết engine. Nói bằng điều
                người dùng thấy trên đồ thị: hai nhánh bi quan/lạc quan lệch bao nhiêu. */}
            <label htmlFor={`${uid}-band`} className={label_}>
              Dải dao động: lợi suất lệch ± bao nhiêu %/năm (vẽ nhánh bi quan/lạc quan)
            </label>
            <input
              id={`${uid}-band`}
              inputMode="decimal"
              value={bandSpreadPct}
              onChange={(e) => setBandSpreadPct(e.target.value)}
              className={`mb-1 ${field}`}
            />
            {!bandSpreadValid && (
              <p role="alert" className={errorLine}>
                Độ rộng dải phải trong khoảng {MIN_BAND_SPREAD_PCT}% đến {MAX_BAND_SPREAD_PCT}%.
              </p>
            )}
            {bandSpreadValid && <div className="mb-2" />}

            {/* KHÔNG viết "giá danh nghĩa" trần — từ chuyên ngành. Nói bằng hệ quả người
                dùng thấy: số tương lai có cộng lạm phát hay quy hết về giá hôm nay. */}
            <label className="mb-1 flex min-h-11 items-center gap-2 text-sm text-fg-secondary">
              <input
                type="checkbox"
                checked={nominalTerms}
                onChange={(e) => setNominalTerms(e.target.checked)}
                className="h-4 w-4"
              />
              Hiện số tiền tương lai đã cộng lạm phát (mặc định: quy hết về giá hôm nay)
            </label>
            <p className="mb-3 text-xs text-fg-muted">
              Tỷ lệ lạm phát lấy từ Cài đặt → Hồ sơ.
            </p>

            {resetNotice && (resetNotice.phaseLabels.length > 0 || resetNotice.eventLabels.length > 0) && (
              <div className="mb-3 rounded-lg bg-state-warn-bg text-state-warn-fg p-2.5 text-xs">
                <p className="font-semibold">
                  Đã đặt lại tỷ giá về 1 cho {resetNotice.phaseLabels.length + resetNotice.eventLabels.length} dòng —
                  khai lại tỷ giá cho các dòng này bên dưới:
                </p>
                {resetNotice.phaseLabels.length > 0 && <p className="mt-1">Chặng: {resetNotice.phaseLabels.join(', ')}</p>}
                {resetNotice.eventLabels.length > 0 && <p className="mt-1">Sự kiện: {resetNotice.eventLabels.join(', ')}</p>}
                <button
                  type="button"
                  onClick={() => setResetNotice(null)}
                  className="mt-1.5 min-h-11 font-semibold underline underline-offset-2 transition active:scale-95"
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
                className="min-h-11 flex-1 rounded-md bg-accent text-fg-on-accent text-sm font-semibold transition active:scale-95 disabled:opacity-50"
              >
                {savingScenario ? 'Đang lưu…' : 'Lưu thay đổi kịch bản'}
              </button>
              <button
                type="button"
                onClick={handleDuplicate}
                disabled={duplicating}
                title="Tạo một bản sao độc lập từ kịch bản này để thử phương án khác"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border-strong px-3 text-sm font-medium text-fg-secondary transition active:scale-95 disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
                {duplicating ? 'Đang nhân bản…' : 'Nhân bản'}
              </button>
            </div>

            {/* Kịch bản chính + xoá. Đặt DƯỚI nút Lưu, cùng khối 1: cả hai là thao tác
                trên chính kịch bản này, không phải trên chặng/sự kiện của nó. */}
            <div className="mt-2 flex items-center justify-between gap-2">
              {isEffectivePrimary ? (
                <span className="flex min-h-11 items-center gap-1.5 text-xs font-medium text-fg-accent">
                  <Star className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Đang là kịch bản chính
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleMakePrimary}
                  disabled={settingPrimary}
                  // Nhãn nói ra HỆ QUẢ, không chỉ tên thao tác: "kịch bản chính" một
                  // mình không cho biết nó quyết định điều gì.
                  title="Kịch bản chính là kịch bản mà thông báo nhắc lệch và thẻ Lifetime ở trang Tài sản đọc theo"
                  className={`${BLOCK1_ACTION} px-3 text-fg-accent hover:bg-accent-muted-bg`}
                >
                  <Star className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {settingPrimary ? 'Đang đặt…' : 'Đặt làm kịch bản chính'}
                </button>
              )}
              <button
                type="button"
                onClick={handleDeleteScenario}
                disabled={deleting || isOnlyScenario}
                title={
                  isOnlyScenario
                    ? 'Không xóa được kịch bản duy nhất — tạo hoặc nhân bản thêm một kịch bản trước'
                    : 'Xóa kịch bản này cùng mọi chặng đời và sự kiện của nó'
                }
                className={`${BLOCK1_ACTION} px-3 text-money-out hover:bg-state-bad-bg`}
              >
                <Trash2 className="h-4 w-4 shrink-0" />
                {deleting ? 'Đang xóa…' : 'Xóa kịch bản'}
              </button>
            </div>
            {/* Vì sao nút xoá bị mờ — nút disabled không đọc được `title` bằng chạm trên
                mobile, nên nói ra bằng chữ thay vì để người dùng bấm mãi không ra gì. */}
            {isOnlyScenario && (
              <p className="mt-1 text-xs text-fg-muted">
                Đây là kịch bản duy nhất nên chưa xóa được — nhân bản hoặc tạo thêm một kịch bản
                khác trước.
              </p>
            )}
          </section>

          {/* Cột giữa: chặng đời + sự kiện chung một cột — cùng là "dòng thời gian
              người dùng khai", và gộp lại thì ba cột mới cân nhau. */}
          <div className="lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-border-subtle lg:pb-2 lg:pl-8 lg:pr-1">
          {/* --- Khối 2: Chặng đời --- */}
          <section className="mb-4 border-b border-border-subtle pb-4">
            <h3 className="mb-2 text-sm font-semibold text-fg-secondary">Chặng đời</h3>
            {sortedPhases.length === 0 ? (
              <p className="mb-2 text-xs text-fg-muted">Chưa có chặng nào.</p>
            ) : (
              <ul className="mb-2 flex flex-col gap-2">
                {sortedPhases.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => setPhaseSheet({ phase: p })} className={ROW_CARD}>
                      <span className="block text-sm font-semibold text-fg-primary">
                        {p.label} · {p.start_year}
                      </span>
                      <span className="block text-xs tabular-nums text-fg-muted">
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
                        <span className="mt-0.5 flex items-center gap-1 text-xs tabular-nums text-fg-muted">
                          {p.fx_to_display === 1 && (
                            <AlertCircle className="h-3 w-3 shrink-0 text-fg-warn" aria-hidden="true" />
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
                className={`${ADD_BUTTON} flex-1`}
              >
                <Plus className="h-4 w-4" /> Thêm chặng
              </button>
              <button
                type="button"
                onClick={() => setEventSheet({ presets: true })}
                className={`${ADD_BUTTON} flex-1`}
              >
                <Sparkles className="h-4 w-4" /> Chọn mẫu
              </button>
            </div>
          </section>

          {/* --- Khối 3: Sự kiện --- */}
          {/* `lg:` bỏ gạch chân + đệm đáy: trên ba cột nó là khối CUỐI của cột giữa
              (khối 4 đã sang cột phải), gạch ngăn cách thành gạch mồ côi. */}
          <section className="mb-4 border-b border-border-subtle pb-4 lg:mb-0 lg:border-b-0 lg:pb-0">
            <h3 className="mb-2 text-sm font-semibold text-fg-secondary">Sự kiện</h3>
            {sortedEvents.length === 0 ? (
              <p className="mb-2 text-xs text-fg-muted">Chưa có sự kiện nào.</p>
            ) : (
              <ul className="mb-2 flex flex-col gap-2">
                {sortedEvents.map((e) => {
                  const mismatch = e.currency !== scenario.display_currency
                  const suspicious = mismatch && e.fx_to_display === 1
                  return (
                    <li key={e.id}>
                      <button type="button" onClick={() => setEventSheet({ event: e })} className={ROW_CARD}>
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-fg-primary">{e.label}</span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-fg-primary">
                            {formatMoney(e.amount_minor, e.currency as CurrencyCode)}
                          </span>
                        </span>
                        <span className="block text-xs text-fg-muted">
                          {e.kind === 'income' ? 'Thu' : 'Chi'} · {e.start_year}
                          {e.end_year !== null ? `–${e.end_year}` : ' – hết đời'} · {e.currency}
                        </span>
                        {mismatch && (
                          <span
                            className={`mt-0.5 flex items-center gap-1 text-xs tabular-nums ${
                              suspicious ? 'text-fg-warn' : 'text-fg-muted'
                            }`}
                          >
                            {suspicious && <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />}
                            Tỷ giá giả định:{' '}
                            {formatFxAssumption(e.fx_to_display, e.currency as CurrencyCode, scenario.display_currency as CurrencyCode)}{' '}
                            · sửa được
                          </span>
                        )}
                        {e.note && (
                          <span className="mt-0.5 block text-xs italic text-fg-muted">{e.note}</span>
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
              className={`${ADD_BUTTON} w-full`}
            >
              <Plus className="h-4 w-4" /> Thêm sự kiện
            </button>
          </section>

          </div>

          {/* --- Khối 4: Số này ở đâu ra — LUÔN MỞ, số nền sai thì cả bản chiếu sai theo --- */}
          <section className="lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-border-subtle lg:pb-2 lg:pl-8 lg:pr-1">
            <h3 className="mb-2 text-sm font-semibold text-fg-secondary">Số này ở đâu ra</h3>
            {!currentPhase || !baseline ? (
              <p className="text-xs text-fg-muted">
                Chưa có chặng nào.
                <Guide as="span"> Thêm một chặng để xem số liệu chi tiêu thật đứng sau giả định.</Guide>
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-fg-secondary">
                  Sổ {baseline.monthsCovered} tháng gần nhất, quy ra năm: thu{' '}
                  <Money
                    amount={baseline.annualIncomeMinor}
                    currency={currentPhase.currency as CurrencyCode}
                    className="text-xs"
                  />{' '}
                  · chi{' '}
                  {/* Tiền âm phải đỏ (token bắt buộc): chi nền âm là ca cả chặng toàn
                      hoàn tiền — hiếm nhưng có, và để xám thì đọc thành chi dương. */}
                  <Money
                    amount={baseline.annualExpenseMinor}
                    currency={currentPhase.currency as CurrencyCode}
                    tone={baseline.annualExpenseMinor < 0 ? 'out' : 'neutral'}
                    className="text-xs"
                  />
                  .
                </p>
                {/* Sổ chỉ có chi mà không có thu là ca sinh ra "bản chiếu phá sản oan"
                    ngoài đời (2026-08): người nhập sao kê thẻ thì sổ toàn khoản chi,
                    lương không bao giờ được ghi. Phải nói RÕ vì sao app đếm ra 0 và
                    ghi thế nào thì nó mới đếm được. */}
                {baseline.annualIncomeMinor === 0 && baseline.annualExpenseMinor > 0 && (
                  <p className="flex items-start gap-1 text-xs text-fg-warn">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Sổ 12 tháng qua không có khoản nào ghi loại "Thu nhập" nên app đếm thu = 0.
                    Có lương hay thu nhập khác thì ghi vào sổ dạng "Thu nhập" (nhập sao kê thẻ
                    không có nó đâu), hoặc sửa tay số thu của chặng ở khối Chặng đời.
                  </p>
                )}
                {/* Dưới 3 tháng thì con số quy năm còn dao động mạnh (một tháng lệch là
                    cả năm lệch theo ×12) — bản chiếu 60 năm dựng trên nó phải nói rõ độ
                    tin, không được để người dùng coi như số đã ổn định. */}
                {baseline.monthsCovered < 3 && (
                  <p className="flex items-start gap-1 text-xs text-fg-warn">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Mới có {baseline.monthsCovered} tháng ghi chép nên số nền này còn dễ lệch mạnh
                    — bản chiếu sẽ chính xác dần khi bạn ghi thêm.
                  </p>
                )}
                {/* Đường tắt "sổ đã đủ, kéo số mới vào kế hoạch" — không có nó thì
                    cách duy nhất là mở chặng ra gõ lại hai con số bằng tay. Khi chặng
                    ĐÃ khớp sổ thì nút là một cú bấm không đổi gì → thay bằng câu xác
                    nhận. Ghi ngay không hỏi lại: hai con số sẽ ghi hiện ngay dòng
                    trên, và sửa lại được ở khối Chặng đời. */}
                {phaseMatchesBaseline ? (
                  <p className="text-xs text-fg-muted">
                    Chặng "{currentPhase.label}" đang dùng đúng hai số này.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handlePullBaseline()}
                    disabled={pullingBaseline}
                    className={`${ADD_BUTTON} w-full disabled:opacity-60`}
                  >
                    {pullingBaseline ? 'Đang cập nhật…' : `Lấy hai số này vào chặng "${currentPhase.label}"`}
                  </button>
                )}
                {positiveCats.length > 0 && (
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
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
                  <p key={c.categoryId} className="text-xs text-fg-muted">
                    {c.name}: hoàn ròng{' '}
                    {/* Màu theo dấu của con số ĐANG HIỆN. `refundCats` lọc annualMinor
                        < 0 nên `-c.annualMinor` luôn dương và dòng này không đỏ — giữ
                        điều kiện để nó không lệ thuộc vào bộ lọc ở trên. */}
                    <span className={`tabular-nums ${-c.annualMinor < 0 ? 'text-money-out' : ''}`}>
                      {formatMoney(-c.annualMinor, currentPhase.currency as CurrencyCode)}
                    </span>
                  </p>
                ))}
                {top3.length > 0 && (
                  <ul className="space-y-0.5">
                    {top3.map((c) => (
                      <li key={c.categoryId} className="flex items-center justify-between text-xs text-fg-secondary">
                        <span className="truncate">{c.name}</span>
                        {/* byCategory sắp giảm dần theo annualMinor, nên khi cả chặng
                            toàn hoàn tiền thì top 3 chính là ba con số ÂM. */}
                        <span
                          className={`shrink-0 tabular-nums ${
                            c.annualMinor < 0 ? 'text-money-out' : ''
                          }`}
                        >
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
          phases={phases}
          event={eventSheet.event}
          buildPresetCtx={buildPresetCtx}
          initialPresetsOpen={eventSheet.presets ?? false}
          onClose={() => setEventSheet(null)}
        />
      )}
    </>
  )
}
