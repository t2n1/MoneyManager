// Trình sửa kịch bản — DRAWER bên phải, một cột. Dựng theo bản vẽ
// `Tuong Lai - Redesign.dc.html` (Claude Design project 00ddb792, gói
// `design_handoff_scenario_editor`).
//
// THAY GÌ so với `ScenarioEditorSheet` cũ. Bản cũ là một modal ba cột, mọi trường cùng
// một mức quan trọng, người dùng sửa số mà không thấy hậu quả, và nút "Xóa kịch bản"
// nằm ngay cạnh nút "Lưu". Bản này đổi bốn thứ:
//   1. DẢI KẾT QUẢ SỐNG ngay dưới header — ba con số (tự do tài chính · âm từ · cuối
//      đời) kèm delta so với bản đã lưu, và sparkline hai đường. Sửa tới đâu thấy tác
//      động tới đó, không phải đóng sheet ra xem đồ thị.
//   2. MỌI THỨ TREO Ở NHÁP. Bản cũ: khối 1 lưu bằng nút riêng, khối 2–4 ghi thẳng DB
//      lúc sheet con đóng — tức nửa màn hình lưu ngay, nửa kia không, và không có
//      đường nào hoàn tác. Nay một nút Lưu ở chân, một nút Bỏ thay đổi, hết.
//   3. Chặng đời có DẢI TỈ LỆ và sửa được ngay trên dòng; mốc cuộc đời sửa trên đúng
//      một dòng. Sheet con (`PhaseFormSheet`/`EventFormSheet`) rút về nút "⋯" và chỉ
//      còn giữ những trường không nhét nổi vào một hàng (tiền, tỷ giá, ghi chú…).
//   4. Tác vụ PHÁ HUỶ (Xóa · Đặt làm chính · Nhân bản) vào menu "⋮" ở header, không
//      còn nằm cạnh nút Lưu.
//
// KHÔNG SỞ HỮU BẢN NHÁP. `LifetimeView` giữ `draft` và truyền xuống (`working`/`saved`/
// `onEdit`), vì đồ thị, thẻ kết luận và thanh nháp ngoài trang đọc CÙNG bản nháp đó —
// hai nguồn thì drawer và trang nói hai chuyện khác nhau về cùng một kịch bản.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  MoreVertical,
  Plus,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { MoneyField } from '../../components/MoneyField'
import { ActionButton, Collapse, IconButton, Money, SegmentedControl } from '../../components/ui'
import { useAccounts, useCategories, useRangeTransactions, useUpdateProfile } from '../../hooks/queries'
import { toISODate } from '../../lib/dates'
import { confirmDialog, showToast } from '../../lib/dialog'
import { CURRENCIES, formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import { convertToBase, fetchRates } from '../../lib/rates'
import type { LifeEventRow, LifePhaseRow, LifeScenarioRow, ProfileRow } from '../../types/database.types'
import { repo } from '../../data'
import { suggestBaseline } from './baseline'
import { pickActive } from './buildInput'
import {
  addDraftPhase,
  patchDraftEvent,
  patchDraftPhase,
  removeDraftEvent,
  removeDraftPhase,
  setDraftCurrency,
  type DraftChange,
  type DraftEvent,
  type DraftPhase,
  type ScenarioDraft,
} from './draft'
import { changeParts } from './draftText'
import { duplicateScenario } from './duplicate'
import { moneyDelta, SPARK_H, SPARK_W, stripSpark, yearDelta, type DeltaTone } from './editorStrip'
import { EventFormSheet } from './EventFormSheet'
import { fireYear, firstNegativeYear } from './insights'
import { PhaseFormSheet } from './PhaseFormSheet'
import type { YearRow } from './project'
import { baselineRange, makeCurrencyOf } from './useLifetime'

/** Ô nhập năm sinh khớp ràng buộc DB (migration 0031: `birth_year between 1900 and 2100`). */
const MIN_BIRTH_YEAR = 1900
const MAX_BIRTH_YEAR = 2100
/** Khớp check constraint của `life_scenarios` (migration 0031). */
const MIN_END_AGE = 50
const MAX_END_AGE = 120
/** Khoảng năm của chặng/mốc — khớp `check (start_year between 1900 and 2200)`. */
const MIN_YEAR = 1900
const MAX_YEAR = 2200

/**
 * Biên hai thanh trượt, theo bản vẽ (−2%…10% và 0…5%, bước 0,25%).
 *
 * Ràng buộc DB rộng hơn hẳn (−5…20 và 0…10). Bản vẽ hẹp hơn là CÓ CHỦ Ý — dải đó phủ
 * mọi giả định thực tế, và một thanh trượt dài 25 điểm phần trăm thì mỗi pixel là 0,1%.
 * Nhưng hẹp lại cũng mở ra một cái bẫy: kịch bản đã lưu 12% mà thanh trượt tối đa 10%
 * thì núm dán ở mép phải, và cú kéo đầu tiên — kể cả kéo sang phải — âm thầm hạ con số
 * của người dùng xuống. Nên biên NỚI RA vừa đủ chứa giá trị đang có (xem `sliderBound`).
 */
const RETURN_MIN_BPS = -200
const RETURN_MAX_BPS = 1000
const SPREAD_MIN_BPS = 0
const SPREAD_MAX_BPS = 500
const SLIDER_STEP_BPS = 25

/** Tông màu nền của các đoạn trên dải tỉ lệ chặng đời — luân phiên, chỉ để tách đoạn. */
const PHASE_TONES = [
  'bg-state-good-bg',
  'bg-accent-muted-bg',
  'bg-state-warn-bg',
  'bg-surface-sunken',
  'bg-state-bad-bg',
]

const DELTA_CLASS: Record<DeltaTone, string> = {
  good: 'text-money-in',
  bad: 'text-money-out',
  same: 'text-fg-muted',
}

/** Nới biên thanh trượt vừa đủ chứa `value` — xem JSDoc `RETURN_MIN_BPS`. */
function sliderBound(min: number, max: number, value: number, step: number) {
  return {
    min: Math.min(min, Math.floor(value / step) * step),
    max: Math.max(max, Math.ceil(value / step) * step),
  }
}

/** Mốc màn hình hẹp của bản vẽ. `< 720px` → hàng trường chặng thành lưới 2 cột và hàng
 *  mốc gói xuống dòng. Dùng `sm:`/`md:` của Tailwind thay vì đo `window.innerWidth`:
 *  media query không cần state, không cần listener, và đúng ngay ở lần render đầu. */
const FIELD_LABEL = 'block text-3xs uppercase tracking-[.08em] text-fg-muted'
const FIELD_INPUT =
  'mt-0.5 block w-full rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg-primary'
const SECTION_HEAD = 'text-2xs font-semibold uppercase tracking-[.1em] text-fg-muted'

/**
 * Ô nhập NĂM giữ chữ đang gõ trong state riêng.
 *
 * Không nối thẳng `value={String(year)}` + `onChange` ghi vào nháp: năm hợp lệ phải có
 * bốn chữ số, nên gõ lại một năm ("2" → "20" → "205" → "2059") đi qua ba giá trị KHÔNG
 * hợp lệ. Ghi thẳng thì chúng bị chặn và ô nhảy về giá trị cũ ngay ký tự đầu — ô coi
 * như không sửa được bằng bàn phím, chỉ còn mũi lên/xuống.
 *
 * Ghi vào nháp ngay khi chuỗi thành một năm hợp lệ (để dải kết quả sống đúng nghĩa
 * "sửa tới đâu thấy tới đó"), và lúc `blur` thì kéo ô về giá trị nháp — nên bỏ dở một
 * năm sai giữa đường không để lại chuỗi rác trên màn.
 */
function YearInput({
  id,
  value,
  onCommit,
  ariaLabel,
  className = '',
}: {
  /** Bắt buộc khi ô nằm trong một <label htmlFor> — nhãn phải có đích để trỏ vào. */
  id?: string
  value: number
  onCommit: (year: number) => void
  ariaLabel: string
  className?: string
}) {
  const [text, setText] = useState(String(value))
  const [editing, setEditing] = useState(false)
  // Prop thắng khi KHÔNG gõ dở: giá trị có thể đổi từ ngoài (bỏ thay đổi, kéo chip mốc
  // trên đồ thị, đổi kịch bản). Trong lúc gõ thì để nguyên chuỗi của người dùng.
  const shown = editing ? text : String(value)

  return (
    <input
      id={id}
      inputMode="numeric"
      value={shown}
      aria-label={ariaLabel}
      onFocus={() => {
        setText(String(value))
        setEditing(true)
      }}
      onChange={(e) => {
        const next = e.target.value
        setText(next)
        const n = Number(next)
        if (Number.isInteger(n) && n >= MIN_YEAR && n <= MAX_YEAR) onCommit(n)
      }}
      onBlur={() => setEditing(false)}
      className={`${FIELD_INPUT} font-mono tabular-nums ${className}`}
    />
  )
}

/**
 * Ô nhập năm KẾT THÚC của một mốc — để trống nghĩa là "mãi" (`endYear: null`).
 *
 * Tách khỏi `YearInput` vì chuỗi rỗng ở đây là một giá trị HỢP LỆ, không phải trạng thái
 * gõ dở: ô rỗng phải ghi `null` vào nháp ngay. Gộp hai ô làm một là có một tham số
 * `nullable` rồi hai nhánh `if` trong cả `onChange` lẫn `onBlur`.
 */
function EndYearInput({
  value,
  startYear,
  onCommit,
}: {
  value: number | null
  startYear: number
  onCommit: (year: number | null) => void
}) {
  const [text, setText] = useState(value === null ? '' : String(value))
  const [editing, setEditing] = useState(false)
  const shown = editing ? text : value === null ? '' : String(value)

  return (
    <input
      inputMode="numeric"
      value={shown}
      placeholder="mãi"
      aria-label="Đến năm (để trống là mãi)"
      onFocus={() => {
        setText(value === null ? '' : String(value))
        setEditing(true)
      }}
      onChange={(e) => {
        const next = e.target.value
        setText(next)
        if (next.trim() === '') {
          onCommit(null)
          return
        }
        const n = Number(next)
        // Kẹp về năm bắt đầu: một mốc kết thúc TRƯỚC khi bắt đầu không có nghĩa gì, và
        // DB không có check nào bắt nó (chỉ có biên 1900–2200 cho từng cột riêng).
        if (Number.isInteger(n) && n >= MIN_YEAR && n <= MAX_YEAR) onCommit(Math.max(startYear, n))
      }}
      onBlur={() => setEditing(false)}
      className={`${FIELD_INPUT} w-[4.625rem] shrink-0 text-center font-mono tabular-nums`}
    />
  )
}

interface Props {
  /** Kịch bản ĐÃ LƯU — menu "⋮" (nhân bản · đặt chính · xoá) làm việc trên bản này. */
  scenario: LifeScenarioRow
  /** TOÀN BỘ kịch bản: cần cho hai câu chặn của menu "⋮" — không xoá kịch bản CUỐI
   *  CÙNG, và bỏ cờ `is_primary` ở các kịch bản KHÁC khi đặt kịch bản chính. */
  scenarios: LifeScenarioRow[]
  /** Dòng DB thật của kịch bản này — chỉ dùng cho "Nhân bản" (nó chép từ bản ĐÃ LƯU). */
  phaseRows: LifePhaseRow[]
  eventRows: LifeEventRow[]
  profile: ProfileRow | undefined
  netWorth: number
  netWorthReliable: boolean
  netWorthLoading: boolean
  /** Ảnh chụp dữ liệu ĐÃ LƯU, và bản đang xem (nháp nếu có). */
  saved: ScenarioDraft
  working: ScenarioDraft
  changes: DraftChange[]
  /** Bản chiếu của `working`, và của `saved` (null khi chưa có nháp để so). */
  rows: YearRow[]
  savedRows: YearRow[] | null
  currentYear: number
  onEdit: (mut: (d: ScenarioDraft) => ScenarioDraft) => void
  /**
   * Ghi nháp vào kịch bản. `LifetimeView` sở hữu phép này (thanh nháp đầu trang dùng
   * chung). Trả về `true` khi đã ghi xong — drawer chỉ tự đóng ở đường thành công.
   */
  onCommit: () => Promise<boolean>
  onDiscard: () => void
  saving: boolean
  onSelectScenario: (id: string) => void
  refreshTree: () => Promise<void>
  /** Dải chip "thêm nhanh từ mẫu". Do `LifetimeView` dựng: nó đã có tỷ giá hôm nay và
   *  `PresetContext`, dựng bản thứ hai ở đây là hai đường thêm mẫu cho hai kết quả. */
  presetChips: ReactNode
  /** Mốc cần đưa vào tầm mắt khi drawer vừa mở — vào từ chip mốc trên đồ thị. */
  focusEventId?: string
  onClose: () => void
}

export function ScenarioEditorDrawer({
  scenario,
  scenarios,
  phaseRows,
  eventRows,
  profile,
  netWorth,
  netWorthReliable,
  netWorthLoading,
  saved,
  working,
  changes,
  rows,
  savedRows,
  currentYear,
  onEdit,
  onCommit,
  onDiscard,
  saving,
  onSelectScenario,
  refreshTree,
  presetChips,
  focusEventId,
  onClose,
}: Props) {
  const qc = useQueryClient()
  const updateProfileMut = useUpdateProfile()
  const uid = useId()

  const [menuOpen, setMenuOpen] = useState(false)
  const [advOpen, setAdvOpen] = useState(false)
  const [catsOpen, setCatsOpen] = useState(false)
  const [phaseSheet, setPhaseSheet] = useState<DraftPhase | null>(null)
  const [eventSheet, setEventSheet] = useState<DraftEvent | null>(null)
  const [switchingCurrency, setSwitchingCurrency] = useState(false)
  const [busy, setBusy] = useState(false)
  /** true trong lúc chờ một hộp thoại xác nhận — chặn Esc của drawer đóng đè lên nó
   *  (dialog.tsx có Esc riêng; cùng lý do đã ghi ở PhaseFormSheet). */
  const [confirming, setConfirming] = useState(false)
  /** Bộ đếm cho `seed` của `addDraftPhase` — hai chặng trùng id thì React dựng nhầm. */
  const phaseSeed = useRef(0)

  const currency = working.displayCurrency
  const dirty = changes.length > 0
  const phases = working.phases
  const events = working.events

  // --- Năm sinh: KHÔNG thuộc kịch bản, nằm ở `profiles` ------------------------------
  //
  // Nên nó không đi qua `ScenarioDraft` (một bản nháp kịch bản không được mang một
  // trường của hồ sơ — `planDraftSave` sẽ phải biết về bảng thứ tư). Thay vào đó nó là
  // state của drawer, đếm vào `dirty` của chân trang, và lệnh Lưu ghi nó cùng lúc.
  const savedBirthYear = profile?.birth_year ?? null
  const [birthYear, setBirthYear] = useState(String(savedBirthYear ?? ''))
  const birthYearNum = Number(birthYear)
  const birthYearValid =
    Number.isInteger(birthYearNum) &&
    birthYearNum >= MIN_BIRTH_YEAR &&
    birthYearNum <= MAX_BIRTH_YEAR
  const birthDirty = birthYearValid && birthYearNum !== savedBirthYear
  /** Năm sinh dùng để TÍNH tuổi trên màn này — lấy giá trị đang gõ khi nó hợp lệ, để
   *  dòng "Tuổi 65" dưới mỗi thẻ chặng đổi theo ngay lúc sửa ở Nâng cao. */
  const shownBirthYear = birthYearValid ? birthYearNum : (savedBirthYear ?? currentYear)
  const lastYear = shownBirthYear + working.endAge

  const somethingToSave = dirty || birthDirty

  // --- Dải kết quả -------------------------------------------------------------------
  //
  // SO ĐƯỢC TIỀN hay không là một câu hỏi riêng, tách khỏi "có bản nháp hay không":
  // bản chiếu đã lưu tính bằng tiền hiển thị CŨ, bản nháp tính bằng tiền MỚI. Đặt hai
  // con số đó cạnh nhau ("3億 → 299M, +296M") không nói người dùng giàu thêm — nó chỉ
  // nói tỷ giá yên/đô. Nên khi tiền hiển thị vừa đổi thì mọi phép so theo TIỀN tắt đi
  // (delta cuối đời, đường xám sparkline, mẩu "cuối đời" ở chân), còn phép so theo NĂM
  // vẫn giữ: năm đạt tự do tài chính và năm âm không có đơn vị tiền nào.
  const moneyComparable = saved.displayCurrency === working.displayCurrency

  const fire = rows.length > 0 ? fireYear(rows) : null
  const neg = rows.length > 0 ? firstNegativeYear(rows, 'low') : null
  const endMinor = rows.length > 0 ? rows[rows.length - 1].assetsEndMinor : 0
  const savedFire = savedRows ? fireYear(savedRows) : undefined
  const savedNeg = savedRows ? firstNegativeYear(savedRows, 'low') : undefined
  const savedEndMinor =
    savedRows && moneyComparable
      ? savedRows.length > 0
        ? savedRows[savedRows.length - 1].assetsEndMinor
        : null
      : undefined

  const fireDelta = yearDelta(fire, savedFire, 'không đạt', false)
  const negDelta = yearDelta(neg, savedNeg, 'không âm', true)
  const endDelta = moneyDelta(endMinor, savedEndMinor)

  const spark = useMemo(
    () =>
      stripSpark(
        rows.map((r) => r.assetsEndMinor),
        savedRows && moneyComparable ? savedRows.map((r) => r.assetsEndMinor) : null,
      ),
    [rows, savedRows, moneyComparable],
  )

  // --- "Số thật 12 tháng gần nhất" ---------------------------------------------------
  //
  // Chặng ĐANG HIỆU LỰC hôm nay là chặng cuối cùng đã bắt đầu — cùng luật với
  // `draftPhaseIndex` và `phaseForYear` của engine.
  const currentPhaseIndex = useMemo(() => {
    let best = -1
    for (let i = 0; i < phases.length; i++) if (phases[i].startYear <= currentYear) best = i
    return best === -1 && phases.length > 0 ? 0 : best
  }, [phases, currentYear])
  const currentPhase = currentPhaseIndex === -1 ? null : phases[currentPhaseIndex]

  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const baselineBase = (profile?.base_currency as CurrencyCode | undefined) ?? 'JPY'
  const todayISO = toISODate(new Date())
  // Cùng khoảng ngày với useLifetime.ts — dùng chung helper thay vì chép lại hằng số
  // (hai hằng số thì một ngày nào đó chúng lệch nhau và khối này báo một con số khác
  // con số đã dùng để tạo kịch bản).
  const range = useMemo(() => baselineRange(todayISO), [todayISO])
  const txsQ = useRangeTransactions(range)
  // Truyền NGUYÊN txs, không tự lọc theo tiền trước — suggestBaseline tự lọc bằng
  // currencyOf(t.account_id) (xem baseline.ts). useMemo vì hàm này lọc tới 366 ngày
  // giao dịch: không nhớ đệm thì mỗi ký tự gõ vào bất kỳ ô nào của drawer đều chạy lại.
  const baseline = useMemo(
    () =>
      currentPhase
        ? suggestBaseline(
            txsQ.data ?? [],
            categories,
            makeCurrencyOf(accounts, baselineBase),
            currentPhase.currency,
            todayISO,
          )
        : null,
    [currentPhase, txsQ.data, categories, accounts, baselineBase, todayISO],
  )
  // byCategory đã sắp theo annualMinor ngay trong suggestBaseline — lấy top 3 trực tiếp.
  // Bỏ danh mục có `annualMinor` ÂM (hoàn ròng): thanh tỉ lệ với share âm cho width âm,
  // trình duyệt kẹp về 0 và mất thông tin một cách im lặng.
  const topCats = baseline ? baseline.byCategory.filter((c) => c.annualMinor > 0).slice(0, 3) : []

  // --- Tài sản ròng thật, quy về tiền hiển thị ---------------------------------------
  //
  // Tỷ giá tra theo tiền hiển thị của BẢN NHÁP (có thể vừa đổi ở Nâng cao), không theo
  // `scenario.display_currency`: con số dưới nút "Lấy lại theo tài sản ròng" phải theo
  // đúng đơn vị mà nó sắp ghi vào.
  const ratesQ = useQuery({
    queryKey: ['lifetime-rates-for', currency],
    queryFn: () => fetchRates(currency),
    staleTime: 12 * 3600_000,
    gcTime: 24 * 3600_000,
    retry: 1,
  })
  const netWorthInDisplay = useMemo(() => {
    if (!profile) return null
    const base = profile.base_currency as CurrencyCode
    if (base === currency) return netWorth
    const rates = ratesQ.data
    // Thiếu tỷ giá thì trả `null`, KHÔNG nhân bừa 1:1 — quy ước `hasMissingRate` của
    // cả repo: thà thiếu còn hơn bịa (xem lib/rates.ts).
    if (!rates) return null
    return convertToBase(netWorth, base, currency, rates)
  }, [profile, currency, netWorth, ratesQ.data])

  /**
   * Những dòng vừa bị `setDraftCurrency` đặt tỷ giá về 1 vì đổi tiền hiển thị.
   *
   * Phải NÓI RA tên từng dòng, không chỉ một câu chung: người dùng cần biết phải mở "⋯"
   * của dòng NÀO để khai lại. Bản trình sửa cũ có đúng khối này (`resetNotice`) và nó là
   * thứ duy nhất nối một cú đổi dropdown với việc "giờ có 4 dòng đang mang tỷ giá sai".
   */
  const fxResetLabels = useMemo(() => {
    if (saved.displayCurrency === currency) return []
    const out: string[] = []
    for (const p of phases) {
      const sp = saved.phases.find((x) => x.id === p.id)
      if (sp && sp.fxToDisplay !== 1 && p.fxToDisplay === 1) out.push(p.label)
    }
    for (const e of events) {
      const se = saved.events.find((x) => x.id === e.id)
      if (se && se.fxToDisplay !== 1 && e.fxToDisplay === 1) out.push(e.label)
    }
    return out
  }, [saved, currency, phases, events])

  /** Hai chặng cùng `startYear` = vi phạm `unique (scenario_id, start_year)`. Chặn nút
   *  Lưu chứ không để lần ghi đâm vào ràng buộc DB rồi trả về một lỗi Postgres thô. */
  const hasDuplicateYear = useMemo(() => {
    const seen = new Set<number>()
    for (const p of phases) {
      if (seen.has(p.startYear)) return true
      seen.add(p.startYear)
    }
    return false
  }, [phases])

  // --- Menu "⋮" ---------------------------------------------------------------------
  /**
   * "Đang là kịch bản chính" suy từ `pickActive` — CÙNG hàm mà `buildLifetimeInput` (bộ
   * luật nhắc lệch) và thẻ Lifetime ở /assets dùng — chứ không đọc thẳng cờ
   * `scenario.is_primary`. Hai nguồn thì chúng nói ngược nhau được: nếu lệnh bỏ cờ ở các
   * kịch bản KHÁC lỗi giữa đường thì còn HAI dòng cùng `is_primary`, và `pickActive` chọn
   * dòng có `sort_order` nhỏ hơn — có thể là dòng kia. Lúc đó cờ nói "tôi là chính"
   * trong khi cả bộ luật lẫn thẻ ở /assets đang đọc kịch bản khác.
   */
  const isEffectivePrimary = pickActive(scenarios)?.id === scenario.id
  const isOnlyScenario = scenarios.length <= 1

  async function handleDuplicate() {
    setMenuOpen(false)
    // Bản sao dựng từ dòng ĐÃ LƯU, nên nhân bản giữa lúc còn nháp cho ra một bản sao
    // KHÔNG mang thay đổi đó. Chặn thẳng, đừng tạo bản sao lệch.
    if (dirty) {
      showToast(
        'Đang có thay đổi chưa lưu. Bản sao dựng từ bản đã lưu nên sẽ không mang thay đổi đó — bấm "Lưu thay đổi" trước, hoặc "Bỏ thay đổi".',
        'error',
      )
      return
    }
    setBusy(true)
    try {
      // Thân phép chép nằm ở `duplicate.ts` — dùng CHUNG với nút "Kịch bản mới" ở dải
      // chip. Hai bản chép tay là cách chúng trôi lệch nhau. `afterCreate` là chỗ làm
      // mới cache, chạy kể cả khi chép dòng lỗi.
      const copy = await duplicateScenario({
        scenario,
        phases: phaseRows,
        events: eventRows,
        afterCreate: refreshTree,
      })
      onSelectScenario(copy.id)
      showToast(`Đã nhân bản thành "${copy.name}".`, 'success')
    } catch (err) {
      // Kịch bản sao được tạo TRƯỚC khi chép chặng/mốc, nên lỗi giữa đường để lại một
      // bản sao thiếu dòng. Không tự dọn hộ (xoá bản ghi thay người dùng nguy hiểm hơn),
      // nhưng phải NÓI RA để họ biết có thứ cần xoá.
      const detail = err instanceof Error ? err.message : 'lỗi không rõ'
      showToast(
        `Không nhân bản xong (${detail}). Có thể đã có một bản sao thiếu dòng trong dải chip kịch bản — kiểm và xoá nếu cần.`,
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  /**
   * Đặt `true` cho kịch bản này TRƯỚC, rồi mới bỏ cờ ở các kịch bản khác. Lỗi giữa
   * đường thì còn HAI kịch bản cùng `is_primary` — `pickActive` xử lý được ca đó (lấy
   * `sort_order` nhỏ nhất trong nhóm primary). Làm ngược lại (bỏ cờ trước) mà lỗi thì
   * còn KHÔNG kịch bản nào primary, tức mất hẳn ý định người dùng vừa bày tỏ.
   */
  async function handleMakePrimary() {
    setMenuOpen(false)
    if (isEffectivePrimary) return
    setBusy(true)
    try {
      await repo.updateLifeScenario(scenario.id, { is_primary: true })
      await Promise.all(
        scenarios
          .filter((s) => s.id !== scenario.id && s.is_primary)
          .map((s) => repo.updateLifeScenario(s.id, { is_primary: false })),
      )
      showToast(`"${scenario.name}" là kịch bản chính từ giờ.`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không đặt được kịch bản chính.', 'error')
    } finally {
      await refreshTree()
      setBusy(false)
    }
  }

  /**
   * Xoá kịch bản này (kèm mọi chặng/mốc — cascade ở Postgres, tự dọn ở demoRepo).
   *
   * CÓ hỏi lại, khác mọi phép xoá khác trong drawer: xoá chặng/mốc chỉ đụng bản nháp và
   * "Bỏ thay đổi" là undo, còn cái này ghi thẳng DB và không hoàn tác được. Bản vẽ ghi
   * "nên có confirm ở app thật" — đây là chỗ đó.
   */
  async function handleDeleteScenario() {
    setMenuOpen(false)
    if (isOnlyScenario) return
    setConfirming(true)
    const ok = await confirmDialog({
      title: `Xóa kịch bản "${scenario.name}"?`,
      message: `Xóa luôn ${phaseRows.length} chặng đời và ${eventRows.length} mốc của kịch bản này. Không hoàn tác được. Các kịch bản khác không bị ảnh hưởng.`,
      confirmLabel: 'Xóa',
      cancelLabel: 'Giữ lại',
      danger: true,
    })
    setConfirming(false)
    if (!ok) return
    setBusy(true)
    try {
      await repo.deleteLifeScenario(scenario.id)
      const rest = scenarios.filter((s) => s.id !== scenario.id)
      if (rest.length > 0) onSelectScenario(rest[0].id)
      showToast(`Đã xóa kịch bản "${scenario.name}".`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không xóa được kịch bản.', 'error')
    } finally {
      // `finally` và ĐÓNG cả ở đường lỗi: lệnh xoá có thể đã commit rồi mới lỗi (timeout
      // mạng trong lúc Postgres đã ghi). Để drawer mở thì nó còn đang trỏ vào một kịch
      // bản không còn tồn tại.
      await refreshTree()
      setBusy(false)
      onClose()
    }
  }

  // --- Đổi tiền hiển thị -------------------------------------------------------------
  /**
   * Đổi tiền hiển thị: quy đổi TÀI SẢN KHỞI ĐIỂM theo tỷ giá hôm nay, và đặt lại tỷ giá
   * giả định của mọi chặng/mốc không còn khớp (`setDraftCurrency`).
   *
   * `starting_assets_minor` lưu THEO `display_currency`, nên đổi dropdown mà không quy
   * đổi con số là biến ¥11.000.000 thành $110.000 — sai ~150 lần, đúng ở điểm khởi đầu
   * bản chiếu, và không có dòng nào trên màn nói ra.
   *
   * KHÔNG tra được tỷ giá thì KHÔNG ĐỔI GÌ CẢ. Bản cũ cho đổi rồi treo một dòng amber
   * "con số này còn tính theo tiền cũ" và bỏ trường đó ra khỏi lệnh ghi — ba trạng thái
   * để người dùng tự gỡ. Chặn ngay là một trạng thái, và không có ca nào con số sai kịp
   * xuất hiện trên màn.
   */
  async function handleCurrencyChange(next: CurrencyCode) {
    if (next === currency) return
    setSwitchingCurrency(true)
    try {
      const rates = await qc.fetchQuery({
        queryKey: ['lifetime-rates-for', next],
        queryFn: () => fetchRates(next),
        staleTime: 12 * 3600_000,
        gcTime: 24 * 3600_000,
      })
      const converted = convertToBase(working.startingAssetsMinor, currency, next, rates)
      if (converted === null) {
        showToast(
          `Chưa có tỷ giá ${currency} → ${next} nên chưa đổi được tiền hiển thị — tài sản khởi điểm sẽ sai đơn vị. Thử lại khi có mạng.`,
          'error',
        )
        return
      }
      onEdit((d) => ({ ...setDraftCurrency(d, next), startingAssetsMinor: converted }))
      showToast(
        `Tiền hiển thị nay là ${next}. Tỷ giá giả định của những dòng tính bằng tiền khác đã đặt lại về 1 — khai lại trước khi lưu.`,
        'success',
      )
    } catch {
      showToast('Chưa lấy được tỷ giá hôm nay nên chưa đổi được tiền hiển thị.', 'error')
    } finally {
      setSwitchingCurrency(false)
    }
  }

  // --- Lưu -------------------------------------------------------------------------
  async function handleSave() {
    if (!somethingToSave || saving || busy) return
    // Năm sinh nằm ở bảng khác nên ghi RIÊNG, và ghi TRƯỚC: `onCommit` đóng drawer, nên
    // ghi sau là ghi vào một component đã tháo.
    if (birthDirty) {
      setBusy(true)
      try {
        await updateProfileMut.mutateAsync({ birth_year: birthYearNum })
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Không lưu được năm sinh.', 'error')
        setBusy(false)
        return
      }
      setBusy(false)
    }
    if (!dirty) {
      onClose()
      return
    }
    // Đóng CHỈ KHI đã ghi xong. Lỗi mạng thì để drawer mở với nguyên bản nháp: đóng lại
    // là bỏ người dùng trước một trang trông như đã lưu.
    if (await onCommit()) onClose()
  }

  // Đóng bằng Esc — TRỪ khi một sheet con hoặc hộp thoại xác nhận đang mở đè lên: lúc
  // đó Esc phải đóng cái ở trên trước (chúng tự có Esc riêng và `stopPropagation`).
  useEffect(() => {
    if (phaseSheet || eventSheet || confirming) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phaseSheet, eventSheet, confirming, onClose])

  // Bấm ra ngoài menu "⋮" thì đóng menu. `mousedown` chứ không `click`: một cú bấm vào
  // một item của menu sẽ chạy handler của item TRƯỚC khi listener này thấy `click`, nên
  // dùng `click` là menu đóng hai lần và không sao, nhưng dùng `mousedown` thì thứ tự
  // rõ ràng hơn và không đua với `onClick` của item.
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  // Mốc vào từ chip trên đồ thị: đưa đúng dòng đó vào tầm mắt. `focusEventId` đọc MỘT
  // LẦN lúc gắn (drawer dựng lại mỗi lần mở), nên không cần dep và không mở lại khi
  // người dùng vừa cuộn đi.
  const focusRowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    focusRowRef.current?.scrollIntoView({ block: 'center' })
  }, [])

  const returnBound = sliderBound(
    RETURN_MIN_BPS,
    RETURN_MAX_BPS,
    working.realReturnBps,
    SLIDER_STEP_BPS,
  )
  const spreadBound = sliderBound(
    SPREAD_MIN_BPS,
    SPREAD_MAX_BPS,
    working.bandSpreadBps,
    SLIDER_STEP_BPS,
  )

  const footerParts = changeParts(changes, currency, savedEndMinor ?? null, endMinor)
  const footerNote = birthDirty
    ? [`năm sinh ${savedBirthYear ?? '—'} → ${birthYearNum}`, ...footerParts].join(' · ')
    : footerParts.join(' · ')

  /** Năm kết thúc của một chặng — chặng sau bắt đầu năm nào thì chặng này dừng năm trước
   *  đó; chặng cuối chạy tới hết bản chiếu. Cùng luật với `phaseRange` (summary.ts). */
  const phaseEnd = (i: number) => (i + 1 < phases.length ? phases[i + 1].startYear - 1 : lastYear)

  return (
    <>
      {/* Backdrop: bấm = ĐÓNG drawer, KHÔNG bỏ nháp. Nháp vẫn còn và thanh nháp ngoài
          trang vẫn hiện nó — cùng hợp đồng với nút ✕. */}
      <div
        className="fixed inset-0 z-40 bg-black/40 animate-overlay-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Sửa kịch bản"
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[38.75rem] flex-col border-l border-border-panel bg-surface-page shadow-[-0.75rem_0_2rem_rgb(0_0_0/0.12)] animate-sheet-pop"
      >
        {/* ---------- Header ---------- */}
        <header className="flex shrink-0 items-start gap-2.5 border-b border-border-panel px-4 pb-3 pt-3.5">
          <div className="min-w-0 flex-1">
            <p className={`${SECTION_HEAD} mb-1`}>Kịch bản</p>
            {/* Ô nhập trông như CHỮ: tên kịch bản là tiêu đề của cả drawer, mà một
                tiêu đề bọc trong khung input đọc như một trường phụ. Viền chỉ hiện
                lúc hover/focus — ring toàn cục lo phần focus. */}
            <input
              value={working.name}
              onChange={(e) => {
                const v = e.target.value
                onEdit((d) => ({ ...d, name: v }))
              }}
              aria-label="Tên kịch bản"
              className="-ml-1.5 block w-full rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-xl font-bold text-fg-primary transition hover:border-border-strong focus:bg-surface"
            />
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs text-fg-muted">
              {isEffectivePrimary && (
                <span className="inline-flex items-center gap-1 rounded-full border border-state-good-border bg-state-good-bg px-2 font-semibold text-state-good-fg">
                  <Star className="h-3 w-3 shrink-0 fill-current" aria-hidden="true" />
                  Kịch bản chính
                </span>
              )}
              <span>
                {phases.length} chặng · {events.length} mốc · chiếu {currentYear}–{lastYear}
              </span>
            </p>
          </div>
          <div ref={menuRef} className="relative flex shrink-0 gap-1">
            <IconButton
              aria-label="Tác vụ khác"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              disabled={busy}
            >
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </IconButton>
            <IconButton aria-label="Đóng" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" aria-hidden="true" />
            </IconButton>
            {menuOpen && (
              <div className="absolute right-0 top-10 z-10 w-[14.5rem] rounded-lg border border-border-panel bg-surface p-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => void handleDuplicate()}
                  className="block min-h-11 w-full rounded-md px-2.5 text-left text-sm font-medium text-fg-primary transition hover:bg-surface-sunken active:scale-95"
                >
                  Nhân bản kịch bản
                </button>
                <button
                  type="button"
                  onClick={() => void handleMakePrimary()}
                  disabled={isEffectivePrimary}
                  className="block min-h-11 w-full rounded-md px-2.5 text-left text-sm font-medium text-fg-primary transition hover:bg-surface-sunken active:scale-95 disabled:text-fg-disabled disabled:hover:bg-transparent"
                >
                  {isEffectivePrimary ? 'Đang là kịch bản chính' : 'Đặt làm kịch bản chính'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteScenario()}
                  disabled={isOnlyScenario}
                  className="block min-h-11 w-full rounded-md px-2.5 text-left text-sm font-medium text-money-out transition hover:bg-state-bad-bg active:scale-95 disabled:text-fg-disabled disabled:hover:bg-transparent"
                >
                  Xóa kịch bản
                </button>
                <p className="mx-1.5 mb-1 mt-0.5 text-2xs leading-relaxed text-fg-disabled">
                  {isOnlyScenario
                    ? 'Đây là kịch bản duy nhất nên chưa xóa được — nhân bản trước đã.'
                    : 'Xóa là bỏ hẳn kịch bản này khỏi danh sách.'}
                </p>
              </div>
            )}
          </div>
        </header>

        {/* ---------- Dải kết quả sống ---------- */}
        <div className="flex shrink-0 items-center gap-3.5 border-b border-border-panel bg-surface-chrome px-4 py-2.5">
          <div className="flex min-w-0 flex-1 gap-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-3xs uppercase tracking-[.08em] text-fg-muted">Tự do tài chính</p>
              <p
                className={`mt-0.5 truncate font-mono text-lg font-semibold tabular-nums ${fire !== null ? 'text-money-in' : 'text-money-out'}`}
              >
                {fire !== null ? fire : 'Không đạt'}
              </p>
              {/* Dòng delta LUÔN chiếm chỗ (`&nbsp;` khi rỗng): thiếu nó thì lần sửa đầu
                  tiên làm cả dải kết quả nhảy xuống 14px, đúng lúc mắt đang đọc số. */}
              <p className={`text-3xs ${DELTA_CLASS[fireDelta.tone]}`}>
                {fireDelta.text || ' '}
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-3xs uppercase tracking-[.08em] text-fg-muted">Âm từ</p>
              <p
                className={`mt-0.5 truncate font-mono text-lg font-semibold tabular-nums ${neg !== null ? 'text-money-out' : 'text-money-in'}`}
              >
                {neg !== null ? neg : 'Không'}
              </p>
              <p className={`text-3xs ${DELTA_CLASS[negDelta.tone]}`}>{negDelta.text || ' '}</p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-3xs uppercase tracking-[.08em] text-fg-muted">
                Lúc {working.endAge} tuổi
              </p>
              <p className="mt-0.5 truncate text-lg font-semibold">
                <Money amount={endMinor} currency={currency} compact />
              </p>
              <p className={`text-3xs ${DELTA_CLASS[endDelta.tone]}`}>
                {endDelta.diffMinor === null
                  ? endDelta.absent
                    ? ' '
                    : 'không đổi'
                  : `${endDelta.diffMinor > 0 ? '+' : '−'}${formatCompact(Math.abs(endDelta.diffMinor), currency)}`}
              </p>
            </div>
          </div>
          {spark.draft !== '' && (
            <svg
              viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
              preserveAspectRatio="none"
              // ẨN dưới sm. Đo thật ở 375px: sparkline 132px ăn hết chỗ và ba ô số còn
              // 55px mỗi ô — nhãn "TỰ DO TÀI CHÍNH" cụt, con số cụt. Bản vẽ chỉ nói tới
              // drawer full-width dưới 760px, không nói tới dải kết quả ở 375px; giữa
              // "một đường xu hướng không nhãn" và "ba con số đọc được", ba con số thắng
              // — đồ thị đầy đủ vẫn nằm ngay ngoài trang.
              className="hidden h-11 w-[8.25rem] shrink-0 sm:block"
              role="img"
              aria-label={`Tài sản ròng từ ${rows[0]?.year} đến ${rows[rows.length - 1]?.year}.`}
            >
              {/* Đường XÁM (bản đã lưu) vẽ TRƯỚC để đường xanh nằm trên nó. */}
              {spark.saved && (
                <path
                  d={spark.saved}
                  fill="none"
                  stroke="var(--color-fg-muted)"
                  strokeWidth="1.4"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <path
                d={spark.draft}
                fill="none"
                stroke="var(--color-money-in)"
                strokeWidth="1.8"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1="0"
                y1={spark.zeroY}
                x2={SPARK_W}
                y2={spark.zeroY}
                stroke="var(--color-border-strong)"
                strokeWidth="1"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
        </div>

        {/* ---------- Thân ---------- */}
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-5 pt-4">
          {/* ===== Chặng đời ===== */}
          <section>
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className={SECTION_HEAD}>Chặng đời</h3>
              <p className="text-2xs text-fg-disabled">
                thu · chi mỗi năm, tính từ năm bắt đầu chặng
              </p>
            </div>

            {/* Dải TỈ LỆ: mỗi chặng rộng theo số năm nó chiếm. Một danh sách thẻ nói
                "2024" và "2059" nhưng không nói chặng đầu dài gấp ba chặng sau — mà đó
                mới là thứ quyết định bản chiếu. */}
            {phases.length > 0 && (
              <div className="mt-2 flex h-6 overflow-hidden rounded-md border border-border-panel">
                {phases.map((p, i) => (
                  <div
                    key={p.id}
                    style={{ flexGrow: Math.max(1, phaseEnd(i) + 1 - p.startYear), flexBasis: 0 }}
                    title={`${p.label} · ${p.startYear}–${phaseEnd(i)} · thu ${formatCompact(p.annualIncomeMinor, p.currency)} / chi ${formatCompact(p.annualExpenseMinor, p.currency)}`}
                    className={`flex min-w-0 items-center justify-center border-border-panel ${PHASE_TONES[i % PHASE_TONES.length]} ${i + 1 < phases.length ? 'border-r' : ''}`}
                  >
                    <span className="truncate px-1 text-3xs font-medium text-fg-secondary">
                      {p.label}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-2 flex flex-col gap-2">
              {phases.map((p, i) => {
                const isCurrent = i === currentPhaseIndex
                const savingMinor = p.annualIncomeMinor - p.annualExpenseMinor
                const ratePct =
                  p.annualIncomeMinor === 0
                    ? null
                    : Math.round((savingMinor / p.annualIncomeMinor) * 100)
                // Trùng năm với một chặng khác = vi phạm `unique (scenario_id,
                // start_year)`. Bắt ở đây thay vì để lần Lưu đâm vào ràng buộc DB, và
                // chặn luôn nút Lưu bên dưới.
                const dupYear = phases.some((o) => o.id !== p.id && o.startYear === p.startYear)
                return (
                  <div
                    key={p.id}
                    className={`rounded-lg border p-2.5 ${
                      isCurrent
                        ? 'border-state-good-border bg-state-good-bg'
                        : 'border-border-panel bg-surface'
                    }`}
                  >
                    <div className="grid grid-cols-2 items-end gap-2 md:flex">
                      <label
                        htmlFor={`${uid}-py-${p.id}`}
                        className={`${FIELD_LABEL} min-w-0 md:w-[5.5rem] md:shrink-0`}
                      >
                        Từ năm
                        <YearInput
                          id={`${uid}-py-${p.id}`}
                          value={p.startYear}
                          ariaLabel={`Năm bắt đầu chặng ${p.label}`}
                          onCommit={(y) => onEdit((d) => patchDraftPhase(d, p.id, { startYear: y }))}
                        />
                      </label>
                      <label className={`${FIELD_LABEL} min-w-0 md:flex-1`}>
                        Tên chặng
                        <input
                          value={p.label}
                          aria-label="Tên chặng"
                          onChange={(e) => {
                            const v = e.target.value
                            onEdit((d) => patchDraftPhase(d, p.id, { label: v }))
                          }}
                          className={FIELD_INPUT}
                        />
                      </label>
                      <span className={`${FIELD_LABEL} min-w-0 text-money-in md:w-[7.5rem] md:shrink-0`}>
                        Thu / năm
                        <span className="mt-0.5 block">
                          <MoneyField
                            value={p.annualIncomeMinor}
                            currency={p.currency}
                            autoOpen={false}
                            ariaLabel={`Thu mỗi năm của chặng ${p.label}`}
                            onChange={(v) =>
                              onEdit((d) => patchDraftPhase(d, p.id, { annualIncomeMinor: v }))
                            }
                            className="w-full rounded-md border border-border-strong bg-surface px-2 py-1.5 text-right text-sm text-fg-primary"
                          />
                        </span>
                      </span>
                      <span className={`${FIELD_LABEL} min-w-0 text-money-out md:w-[7.5rem] md:shrink-0`}>
                        Chi / năm
                        <span className="mt-0.5 block">
                          <MoneyField
                            value={p.annualExpenseMinor}
                            currency={p.currency}
                            autoOpen={false}
                            ariaLabel={`Chi mỗi năm của chặng ${p.label}`}
                            onChange={(v) =>
                              onEdit((d) => patchDraftPhase(d, p.id, { annualExpenseMinor: v }))
                            }
                            className="w-full rounded-md border border-border-strong bg-surface px-2 py-1.5 text-right text-sm text-fg-primary"
                          />
                        </span>
                      </span>
                      <div className="col-span-2 flex justify-end gap-1 md:col-span-1 md:self-end">
                        <IconButton
                          aria-label={`Chi tiết chặng ${p.label}`}
                          title="Tiền, tỷ giá, quốc gia…"
                          onClick={() => setPhaseSheet(p)}
                        >
                          <MoreVertical className="h-4 w-4" aria-hidden="true" />
                        </IconButton>
                        {/* Chặng ĐẦU TIÊN không có nút xoá: bản chiếu phải bắt đầu từ
                            một chặng nào đó, và xoá hết chặng để lại một kịch bản không
                            chiếu được năm nào. */}
                        {i > 0 && (
                          <IconButton
                            aria-label={`Xóa chặng ${p.label}`}
                            title="Xóa chặng"
                            onClick={() => onEdit((d) => removeDraftPhase(d, p.id))}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </IconButton>
                        )}
                      </div>
                    </div>

                    <p className="mt-1.5 text-2xs text-fg-muted">
                      {isCurrent ? 'Chặng đang chạy' : `Tuổi ${p.startYear - shownBirthYear}`} ·{' '}
                      {p.startYear}–{phaseEnd(i)} · để dành{' '}
                      <Money amount={savingMinor} currency={p.currency} compact tone="bySign" />
                      /năm
                      {ratePct !== null && ` (${ratePct}%)`}
                    </p>
                    {dupYear && (
                      <p role="alert" className="mt-1 text-2xs text-money-out">
                        Đã có một chặng khác bắt đầu năm {p.startYear} — mỗi năm chỉ được một
                        chặng, sửa trước khi lưu.
                      </p>
                    )}

                    {/* Số THẬT từ sổ, gom vào đúng chặng đang chạy. Bản cũ dành cả một
                        CỘT THỨ BA cho khối này ("số này ở đâu ra"); ở đây nó là một
                        banner nằm trong chính cái thẻ mà nó nói về. */}
                    {isCurrent && baseline && (
                      <div className="mt-2 rounded-md border border-state-good-border bg-surface p-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="min-w-0 flex-1 text-2xs leading-relaxed text-fg-secondary">
                            Số thật {baseline.monthsCovered} tháng gần nhất: thu{' '}
                            <Money
                              amount={baseline.annualIncomeMinor}
                              currency={p.currency}
                              tone="in"
                              className="font-semibold"
                            />{' '}
                            · chi{' '}
                            <Money
                              amount={baseline.annualExpenseMinor}
                              currency={p.currency}
                              tone="out"
                              className="font-semibold"
                            />
                          </p>
                          <ActionButton
                            variant="primary"
                            onClick={() => {
                              onEdit((d) =>
                                patchDraftPhase(d, p.id, {
                                  annualIncomeMinor: baseline.annualIncomeMinor,
                                  annualExpenseMinor: baseline.annualExpenseMinor,
                                }),
                              )
                              showToast(
                                'Đã lấy số thật vào chặng đang chạy — chưa ghi, bấm Lưu ở dưới.',
                                'success',
                              )
                            }}
                          >
                            Dùng số này
                          </ActionButton>
                        </div>
                        {topCats.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => setCatsOpen((v) => !v)}
                              aria-expanded={catsOpen}
                              className="mt-1 min-h-11 text-2xs font-medium text-fg-accent transition active:scale-95"
                            >
                              {catsOpen ? 'Ẩn chi tiết các mục chi' : 'Số chi này gồm gì?'}
                            </button>
                            {catsOpen && (
                              <div className="mt-1 flex flex-col gap-1">
                                {topCats.map((c) => (
                                  <div key={c.categoryId} className="flex items-center gap-2">
                                    <span className="min-w-0 flex-1 truncate text-2xs text-fg-secondary">
                                      {c.name}
                                    </span>
                                    <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                                      <span
                                        style={{ width: `${Math.round(c.share * 100)}%` }}
                                        className="block h-full rounded-full bg-accent"
                                      />
                                    </span>
                                    <span className="shrink-0 text-2xs text-fg-muted">
                                      <Money amount={c.annualMinor} currency={p.currency} compact />{' '}
                                      · {Math.round(c.share * 100)}%
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <ActionButton
              // Viền GẠCH — bản vẽ: nút này thêm một dòng vào danh sách ngay trên nó,
              // khác hẳn "Lưu"/"Bỏ" ở chân. Viền liền làm nó đọc ngang hàng với chúng.
              className="mt-2 border-dashed"
              onClick={() => {
                const last = phases[phases.length - 1]
                // `currentYear + 1` là sàn: một chặng mới bắt đầu ở QUÁ KHỨ đổi ngay
                // chặng đang chạy, tức đổi cả bản chiếu từ hôm nay trở đi — không phải
                // thứ người dùng vừa yêu cầu khi bấm "Thêm chặng".
                let y = Math.max(currentYear + 1, (last?.startYear ?? currentYear) + 5)
                // Nhích tới năm còn trống: `unique (scenario_id, start_year)` chặn năm
                // trùng, và một chặng mới sinh ra đã kèm câu lỗi đỏ thì tệ hơn hẳn.
                while (phases.some((p) => p.startYear === y)) y += 1
                const seed = ++phaseSeed.current
                onEdit((d) =>
                  addDraftPhase(
                    d,
                    {
                      startYear: y,
                      label: 'Chặng mới',
                      // Kế thừa từ chặng CUỐI, không để 0: một chặng thu 0 chi 0 làm
                      // tài sản đứng yên, và đó là một giả định (sai) chứ không phải
                      // một ô trống chờ điền.
                      country: last?.country ?? null,
                      currency: last?.currency ?? currency,
                      annualIncomeMinor: last?.annualIncomeMinor ?? 0,
                      annualExpenseMinor: last?.annualExpenseMinor ?? 0,
                      fxToDisplay: last?.fxToDisplay ?? 1,
                    },
                    seed,
                  ),
                )
                showToast(`Đã thêm chặng từ năm ${y} — sửa tên, thu, chi bên dưới.`, 'success')
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Thêm chặng
            </ActionButton>
          </section>

          {/* ===== Mốc cuộc đời ===== */}
          <section>
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className={SECTION_HEAD}>Mốc cuộc đời</h3>
              <p className="text-2xs text-fg-disabled">
                {events.length > 0
                  ? 'kéo chip trên đồ thị cũng đổi được năm'
                  : 'chưa có mốc nào — thêm từ mẫu bên dưới'}
              </p>
            </div>

            <div className="mt-2 flex flex-col gap-1.5">
              {events.map((ev) => (
                <div
                  key={ev.id}
                  ref={ev.id === focusEventId ? focusRowRef : undefined}
                  className={`flex flex-wrap items-center gap-1.5 rounded-lg border p-2 md:flex-nowrap ${
                    ev.id === focusEventId
                      ? 'border-accent bg-surface'
                      : 'border-border-panel bg-surface'
                  }`}
                >
                  {/* Cặp nút thu/chi trong MỘT khung: chúng là hai giá trị của cùng một
                      trường, nên đặt rời nhau đọc thành hai công tắc độc lập.
                      `aria-pressed` bắt buộc — trạng thái ở đây chỉ thể hiện bằng màu. */}
                  <div
                    role="group"
                    aria-label={`Loại của mốc ${ev.label}`}
                    className="flex shrink-0 overflow-hidden rounded-md border border-border-strong"
                  >
                    <button
                      type="button"
                      aria-label="Là khoản thu"
                      aria-pressed={ev.kind === 'income'}
                      onClick={() => onEdit((d) => patchDraftEvent(d, ev.id, { kind: 'income' }))}
                      className={`flex h-8 w-8 items-center justify-center transition active:scale-95 ${
                        ev.kind === 'income'
                          ? 'bg-state-good-bg text-money-in'
                          : 'bg-surface text-fg-disabled'
                      }`}
                    >
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Là khoản chi"
                      aria-pressed={ev.kind === 'expense'}
                      onClick={() => onEdit((d) => patchDraftEvent(d, ev.id, { kind: 'expense' }))}
                      className={`flex h-8 w-8 items-center justify-center transition active:scale-95 ${
                        ev.kind === 'expense'
                          ? 'bg-state-bad-bg text-money-out'
                          : 'bg-surface text-fg-disabled'
                      }`}
                    >
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <input
                    value={ev.label}
                    aria-label="Tên mốc"
                    onChange={(e) => {
                      const v = e.target.value
                      onEdit((d) => patchDraftEvent(d, ev.id, { label: v }))
                    }}
                    className={`${FIELD_INPUT} mt-0 min-w-0 flex-1`}
                  />
                  <YearInput
                    value={ev.startYear}
                    ariaLabel="Từ năm"
                    className="mt-0 w-[4.625rem] shrink-0 text-center"
                    onCommit={(y) =>
                      onEdit((d) => {
                        // GIỮ NGUYÊN độ dài: dời một mốc 22 năm sang trước hai năm là
                        // dời cả khoảng, không phải kéo dài nó thêm hai năm. Bản vẽ ghi
                        // rõ ("endYear dịch theo").
                        const cur = d.events.find((x) => x.id === ev.id)
                        if (!cur) return d
                        const span = cur.endYear === null ? null : cur.endYear - cur.startYear
                        return patchDraftEvent(d, ev.id, {
                          startYear: y,
                          endYear: span === null ? null : y + span,
                        })
                      })
                    }
                  />
                  <span className="shrink-0 text-xs text-fg-disabled" aria-hidden="true">
                    →
                  </span>
                  <EndYearInput
                    value={ev.endYear}
                    startYear={ev.startYear}
                    onCommit={(y) => onEdit((d) => patchDraftEvent(d, ev.id, { endYear: y }))}
                  />
                  <span className="w-full shrink-0 md:w-[7.25rem]">
                    <MoneyField
                      value={ev.amountMinor}
                      currency={ev.currency}
                      autoOpen={false}
                      ariaLabel={`Số tiền mỗi năm của mốc ${ev.label}`}
                      onChange={(v) => onEdit((d) => patchDraftEvent(d, ev.id, { amountMinor: v }))}
                      className={`w-full rounded-md border border-border-strong bg-surface px-2 py-1.5 text-right text-sm font-medium ${
                        ev.kind === 'income' ? 'text-money-in' : 'text-money-out'
                      }`}
                    />
                  </span>
                  <div className="flex shrink-0 gap-1">
                    <IconButton
                      aria-label={`Chi tiết mốc ${ev.label}`}
                      title="Tiền, tỷ giá, lạm phát, ghi chú…"
                      onClick={() => setEventSheet(ev)}
                    >
                      <MoreVertical className="h-4 w-4" aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      aria-label={`Xóa mốc ${ev.label}`}
                      variant="ghost"
                      title="Xóa"
                      onClick={() => onEdit((d) => removeDraftEvent(d, ev.id))}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2.5">{presetChips}</div>
          </section>

          {/* ===== Điểm khởi đầu & lợi suất ===== */}
          <section>
            <h3 className={`${SECTION_HEAD} mb-2`}>Điểm khởi đầu &amp; lợi suất</h3>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-3xs uppercase tracking-[.08em] text-fg-muted">
                  Tài sản khởi điểm
                </p>
                <div className="flex gap-1.5">
                  {/* Công tắc Dương/Nợ ròng là NGUỒN DUY NHẤT của dấu: MoneyField cho gõ
                      biểu thức (NumPad có phím −) nên "5 − 9" ra −4, mà cột này không có
                      check nào ở DB — số âm cứ thế lưu vào trong khi công tắc chỉ "Dương". */}
                  <div className="shrink-0">
                    <SegmentedControl
                      size="sm"
                      stretch={false}
                      value={working.startingAssetsMinor < 0 ? 'neg' : 'pos'}
                      onChange={(v) =>
                        onEdit((d) => ({
                          ...d,
                          startingAssetsMinor:
                            v === 'neg'
                              ? -Math.abs(d.startingAssetsMinor)
                              : Math.abs(d.startingAssetsMinor),
                        }))
                      }
                      items={[
                        { value: 'pos', label: 'Dương' },
                        { value: 'neg', label: 'Nợ ròng' },
                      ]}
                      label="Tài sản khởi điểm là dương hay nợ ròng"
                    />
                  </div>
                  <span className="min-w-0 flex-1">
                    <MoneyField
                      value={Math.abs(working.startingAssetsMinor)}
                      currency={currency}
                      autoOpen={false}
                      ariaLabel="Tài sản khởi điểm"
                      onChange={(v) =>
                        onEdit((d) => ({
                          ...d,
                          startingAssetsMinor:
                            d.startingAssetsMinor < 0 ? -Math.abs(v) : Math.abs(v),
                        }))
                      }
                      className="w-full rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-right text-sm text-fg-primary"
                    />
                  </span>
                </div>
                {/* Tài sản ròng THẬT chỉ đề nghị khi nó đáng tin: `netWorthReliable`
                    false nghĩa là có khoản thiếu tỷ giá, và lúc đó con số dưới nút là
                    một cái sàn chứ không phải tổng (quy ước `hasMissingRate` toàn repo). */}
                {netWorthLoading ? (
                  <p className="mt-1 text-2xs text-fg-disabled">Đang tính tài sản ròng…</p>
                ) : netWorthReliable ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (netWorthInDisplay === null) return
                      onEdit((d) => ({ ...d, startingAssetsMinor: netWorthInDisplay }))
                      showToast('Đã lấy lại theo tài sản ròng hiện tại.', 'success')
                    }}
                    disabled={netWorthInDisplay === null}
                    className="mt-1 min-h-11 text-2xs font-medium text-fg-accent transition active:scale-95 disabled:text-fg-disabled"
                  >
                    {netWorthInDisplay === null
                      ? `Chưa quy đổi được tài sản ròng sang ${currency}`
                      : `Lấy lại theo tài sản ròng hiện tại (${formatMoney(netWorthInDisplay, currency)})`}
                  </button>
                ) : (
                  <p className="mt-1 text-2xs text-fg-warn">
                    Tài sản ròng đang thiếu tỷ giá cho vài khoản nên chưa dùng làm điểm khởi
                    đầu được — nó là một cái sàn, không phải tổng.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-4">
              <div className="min-w-[12.5rem] flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <label
                    htmlFor={`${uid}-return`}
                    className="text-3xs uppercase tracking-[.08em] text-fg-muted"
                  >
                    Lợi suất thực / năm
                  </label>
                  <span className="font-mono text-sm font-semibold tabular-nums text-fg-primary">
                    {working.realReturnBps / 100}%
                  </span>
                </div>
                <input
                  id={`${uid}-return`}
                  type="range"
                  min={returnBound.min}
                  max={returnBound.max}
                  step={SLIDER_STEP_BPS}
                  value={working.realReturnBps}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    onEdit((d) => ({ ...d, realReturnBps: v }))
                  }}
                  className="mt-1 h-6 w-full cursor-pointer accent-[var(--color-accent)]"
                />
                <p className="text-2xs text-fg-disabled">đã trừ lạm phát — có thể âm</p>
              </div>
              <div className="min-w-[12.5rem] flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <label
                    htmlFor={`${uid}-spread`}
                    className="text-3xs uppercase tracking-[.08em] text-fg-muted"
                  >
                    Dải dao động ±
                  </label>
                  <span className="font-mono text-sm font-semibold tabular-nums text-fg-primary">
                    ±{working.bandSpreadBps / 100}%
                  </span>
                </div>
                <input
                  id={`${uid}-spread`}
                  type="range"
                  min={spreadBound.min}
                  max={spreadBound.max}
                  step={SLIDER_STEP_BPS}
                  value={working.bandSpreadBps}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    onEdit((d) => ({ ...d, bandSpreadBps: v }))
                  }}
                  className="mt-1 h-6 w-full cursor-pointer accent-[var(--color-fg-warn)]"
                />
                <p className="text-2xs text-fg-disabled">
                  nhánh bi quan {(working.realReturnBps - working.bandSpreadBps) / 100}% · lạc quan{' '}
                  {(working.realReturnBps + working.bandSpreadBps) / 100}%
                </p>
              </div>
            </div>
          </section>

          {/* ===== Nâng cao ===== */}
          <section className="border-t border-border-subtle pt-3">
            <button
              type="button"
              onClick={() => setAdvOpen((v) => !v)}
              aria-expanded={advOpen}
              aria-controls={`${uid}-adv`}
              className="flex min-h-11 w-full items-center gap-1.5 text-left transition active:scale-95"
            >
              <span className={SECTION_HEAD}>Nâng cao</span>
              <span className="min-w-0 truncate text-2xs text-fg-disabled">
                sinh {birthYear || '—'} · đến {working.endAge} tuổi · {currency}
              </span>
              <ChevronDown
                className={`ml-auto h-4 w-4 shrink-0 text-fg-muted transition-transform ${advOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
            <Collapse open={advOpen} id={`${uid}-adv`}>
              <div>
                <div className="mt-2.5 flex flex-wrap gap-3">
                  <label className={`${FIELD_LABEL} min-w-[7.5rem] flex-1`}>
                    Năm sinh
                    <input
                      inputMode="numeric"
                      value={birthYear}
                      onChange={(e) => setBirthYear(e.target.value)}
                      className={`${FIELD_INPUT} font-mono tabular-nums`}
                    />
                  </label>
                  <label className={`${FIELD_LABEL} min-w-[7.5rem] flex-1`}>
                    Chiếu đến tuổi
                    <input
                      inputMode="numeric"
                      value={String(working.endAge)}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (Number.isInteger(n) && n >= MIN_END_AGE && n <= MAX_END_AGE) {
                          onEdit((d) => ({ ...d, endAge: n }))
                        }
                      }}
                      className={`${FIELD_INPUT} font-mono tabular-nums`}
                    />
                  </label>
                  <label className={`${FIELD_LABEL} min-w-[7.5rem] flex-1`}>
                    Tiền hiển thị
                    <select
                      value={currency}
                      disabled={switchingCurrency}
                      onChange={(e) => void handleCurrencyChange(e.target.value as CurrencyCode)}
                      className={FIELD_INPUT}
                    >
                      {(Object.keys(CURRENCIES) as CurrencyCode[]).map((c) => (
                        <option key={c} value={c}>
                          {CURRENCIES[c].label} ({c})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {!birthYearValid && (
                  <p role="alert" className="mt-1.5 text-2xs text-money-out">
                    Năm sinh phải là số nguyên trong khoảng {MIN_BIRTH_YEAR}–{MAX_BIRTH_YEAR}.
                  </p>
                )}
                {fxResetLabels.length > 0 && (
                  <p
                    role="alert"
                    className="mt-2 rounded-md border border-state-warn-border bg-state-warn-bg px-2.5 py-2 text-2xs leading-relaxed text-fg-warn"
                  >
                    Đổi tiền hiển thị nên tỷ giá giả định của {fxResetLabels.length} dòng đã đặt
                    lại về 1: {fxResetLabels.join(' · ')}. Mở "⋯" của từng dòng khai lại trước
                    khi lưu — để 1 là coi hai đồng tiền khác nhau bằng nhau.
                  </p>
                )}
                <p className="mt-2.5 text-2xs leading-relaxed text-fg-disabled">
                  Năm sinh nằm ở Cài đặt → Hồ sơ và dùng chung cho mọi kịch bản — sửa ở đây
                  là sửa ở đó. Cách hiển thị giá (hôm nay / danh nghĩa) và lạm phát nằm ở cột
                  Giả định ngoài trang: chúng đổi cách đọc đồ thị, không phải dữ liệu kịch bản.
                </p>
              </div>
            </Collapse>
          </section>
        </div>

        {/* ---------- Chân sticky ---------- */}
        <footer className="flex shrink-0 flex-wrap items-center gap-2.5 border-t border-border-panel bg-surface-chrome px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="min-w-[10rem] flex-1 text-2xs leading-relaxed text-fg-muted">
            {somethingToSave
              ? footerNote
                ? `Đang đổi: ${footerNote}.`
                : 'Có thay đổi chưa lưu.'
              : 'Chưa có gì thay đổi — đồ thị ngoài trang cập nhật ngay khi bạn sửa.'}
          </p>
          <ActionButton
            onClick={() => {
              if (dirty) onDiscard()
              else onClose()
            }}
            disabled={saving || busy}
            className="bg-surface"
          >
            {dirty ? 'Bỏ thay đổi' : 'Đóng'}
          </ActionButton>
          <ActionButton
            variant="primary"
            onClick={() => void handleSave()}
            disabled={!somethingToSave || saving || busy || hasDuplicateYear}
          >
            {saving || busy ? 'Đang lưu…' : 'Lưu thay đổi'}
          </ActionButton>
        </footer>
      </aside>

      {phaseSheet && (
        <PhaseFormSheet
          displayCurrency={currency}
          phases={phases}
          phase={phaseSheet}
          onApply={(patch) => onEdit((d) => patchDraftPhase(d, phaseSheet.id, patch))}
          onRemove={() => onEdit((d) => removeDraftPhase(d, phaseSheet.id))}
          onClose={() => setPhaseSheet(null)}
        />
      )}
      {eventSheet && (
        <EventFormSheet
          displayCurrency={currency}
          event={eventSheet}
          onApply={(patch) => onEdit((d) => patchDraftEvent(d, eventSheet.id, patch))}
          onRemove={() => onEdit((d) => removeDraftEvent(d, eventSheet.id))}
          onClose={() => setEventSheet(null)}
        />
      )}
    </>
  )
}
