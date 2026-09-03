// Bàn sửa kịch bản — thẻ nằm THẲNG trong trang Tương lai, ngay dưới đồ thị, chia 5 tab.
// Dựng theo bản vẽ `Tuong Lai - Redesign v5.dc.html` (Claude Design project 00ddb792).
//
// THAY GÌ so với `ScenarioEditorDrawer` (v1). Bản v1 là một drawer bên phải: mở ra là
// một lớp phủ che mất đồ thị, mà đồ thị chính là thứ nói cho người dùng biết cú sửa vừa
// rồi làm gì. Nên drawer phải tự vẽ lại một dải kết quả tí hon ở đầu nó — một bản sao
// nghèo nàn của thứ đang bị nó che. v5 bỏ lớp phủ: mọi ô sửa nằm cùng một mặt phẳng với
// đồ thị, sửa tới đâu nhìn lên thấy tới đó, và dải kết quả tí hon biến mất vì không còn
// lý do tồn tại.
//
// NĂM TAB thay cho một cuộn dọc dài: bản v1 xếp chặng · mốc · lợi suất · nâng cao thành
// một cột cuộn, và mục cuối nằm dưới màn hình thứ hai. Tab cũng là chỗ đặt được con số
// đếm ("3 chặng", "2 bật") — người dùng biết có gì trong đó trước khi bấm vào.
//
// KHÔNG SỞ HỮU BẢN NHÁP. `LifetimeView` giữ `draft` và truyền xuống (`working`/`saved`/
// `onEdit`) — cùng lý do đã ghi ở drawer: đồ thị, thẻ kết luận và thanh nháp đọc CÙNG
// bản nháp đó. Cũng KHÔNG có nút Lưu/Bỏ: chúng nằm ở thanh nháp dán trên đầu thẻ đồ thị.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, MoreVertical, Plus, Star, Trash2, X } from 'lucide-react'
import { MoneyField } from '../../components/MoneyField'
import { Guide } from '../../components/Guide'
import { ActionButton, IconButton, Money, Num, SectionTitle, SegmentedControl, Select } from '../../components/ui'
import { useUpdateProfile } from '../../hooks/queries'
import { confirmDialog, showToast } from '../../lib/dialog'
import { CURRENCIES, formatCompact, formatMoney, type CurrencyCode } from '../../lib/money'
import { convertToBase, fetchRates } from '../../lib/rates'
import type { LifeEventRow, LifePhaseRow, LifeScenarioRow, ProfileRow } from '../../types/database.types'
import { repo } from '../../data'
import type { BaselineSuggestion } from './baseline'
import { pickActive } from './buildInput'
import {
  addDraftPhase,
  patchDraftEvent,
  patchDraftPhase,
  removeDraftEvent,
  removeDraftPhase,
  setDraftCurrency,
  setPhaseCurrency,
  type DraftChange,
  type DraftEvent,
  type DraftPhase,
  type ScenarioDraft,
} from './draft'
import { changeParts } from './draftText'
import { eventSpan } from './eventSpan'
import { duplicateScenario } from './duplicate'
import { EventFormSheet } from './EventFormSheet'
import { convertMinorToday, currencyAt, type FxOf } from './fxModel'
import { minimumReturnBps } from './insights'
import { PhaseFormSheet } from './PhaseFormSheet'
import type { LifetimeInput, StressConfig } from './project'
import { StressPanel } from './StressPanel'

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
 * Hẹp hơn ràng buộc DB (−5…20 và 0…10) là CÓ CHỦ Ý — dải đó phủ mọi giả định thực tế, và
 * một thanh trượt dài 25 điểm phần trăm thì mỗi pixel là 0,1%. Nhưng hẹp lại mở ra một
 * cái bẫy: kịch bản đã lưu 12% mà thanh tối đa 10% thì núm dán ở mép phải, và cú kéo đầu
 * tiên — kể cả kéo sang phải — âm thầm hạ con số của người dùng xuống. Nên biên NỚI RA
 * vừa đủ chứa giá trị đang có (xem `sliderBound`).
 */
const RETURN_MIN_BPS = -200
const RETURN_MAX_BPS = 1000
const SPREAD_MIN_BPS = 0
const SPREAD_MAX_BPS = 500
const SLIDER_STEP_BPS = 25
const INFLATION_MAX_BPS = 400

/** Tông nền các đoạn trên dải tỉ lệ chặng đời — luân phiên, chỉ để tách đoạn. */
const PHASE_TONES = [
  'bg-state-good-bg',
  'bg-accent-muted-bg',
  'bg-state-warn-bg',
  'bg-surface-sunken',
  'bg-state-bad-bg',
]

/**
 * DÁNG của một ô nhập — CỐ Ý không mang bề rộng và không mang lề.
 *
 * Hai tiện ích bề rộng cùng hạng thì THỨ TỰ TRONG CSS quyết định, không phải thứ tự
 * trong chuỗi class; gộp `w-full` vào đây rồi nối thêm `w-[4.75rem]` ở chỗ dùng là ra
 * full width. Đã vấp một lần ở bản drawer (hàng mốc tràn ngang, 2026-08-24). Guard:
 * `designSystem.test.ts` → "không có hai tiện ích bề rộng cùng hiệu lực".
 */
const FIELD_BOX =
  'rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-fg-primary'
const FIELD_INPUT = `mt-0.5 block w-full ${FIELD_BOX}`
const FIELD_LABEL = 'block text-2xs uppercase tracking-label text-fg-muted'
const PANEL_NOTE = 'text-2xs leading-relaxed text-fg-disabled'

/** Nới biên thanh trượt vừa đủ chứa `value` — xem JSDoc `RETURN_MIN_BPS`. */
function sliderBound(min: number, max: number, value: number, step: number) {
  return {
    min: Math.min(min, Math.floor(value / step) * step),
    max: Math.max(max, Math.ceil(value / step) * step),
  }
}

/**
 * Ô nhập NĂM giữ chữ đang gõ trong state riêng.
 *
 * Không nối thẳng `value={String(year)}` + `onChange` ghi vào nháp: năm hợp lệ phải có
 * bốn chữ số, nên gõ lại một năm ("2" → "20" → "205" → "2059") đi qua ba giá trị KHÔNG
 * hợp lệ. Ghi thẳng thì chúng bị chặn và ô nhảy về giá trị cũ ngay ký tự đầu — ô coi như
 * không sửa được bằng bàn phím, chỉ còn mũi lên/xuống.
 */
function YearInput({
  id,
  value,
  onCommit,
  ariaLabel,
  className = '',
}: {
  id?: string
  value: number
  onCommit: (year: number) => void
  ariaLabel: string
  className?: string
}) {
  const [text, setText] = useState(String(value))
  const [editing, setEditing] = useState(false)
  // Prop thắng khi KHÔNG gõ dở: giá trị đổi được từ ngoài (bỏ nháp, kéo chip trên đồ
  // thị, đổi kịch bản). Trong lúc gõ thì để nguyên chuỗi của người dùng.
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
      className={`font-mono tabular-nums ${className}`}
    />
  )
}

/**
 * Ô nhập năm KẾT THÚC của một mốc — để trống nghĩa là "mãi" (`endYear: null`).
 *
 * Tách khỏi `YearInput` vì chuỗi rỗng ở đây là một giá trị HỢP LỆ, không phải trạng thái
 * gõ dở: ô rỗng phải ghi `null` vào nháp ngay.
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
      className={`${FIELD_BOX} w-[4.75rem] shrink-0 text-center font-mono tabular-nums`}
    />
  )
}

type WbTab = 'phases' | 'events' | 'yield' | 'stress' | 'read'

interface Props {
  /** Kịch bản ĐÃ LƯU — menu "⋮" (nhân bản · đặt chính · xoá) làm việc trên bản này. */
  scenario: LifeScenarioRow
  /** TOÀN BỘ kịch bản: cần cho hai câu chặn của menu "⋮" — không xoá kịch bản CUỐI
   *  CÙNG, và bỏ cờ `is_primary` ở các kịch bản KHÁC khi đặt kịch bản chính. */
  scenarios: LifeScenarioRow[]
  /** Dòng DB thật của kịch bản này — chỉ dùng cho "Nhân bản" (chép từ bản ĐÃ LƯU). */
  phaseRows: LifePhaseRow[]
  eventRows: LifeEventRow[]
  profile: ProfileRow | undefined
  /** Số thật 12 tháng từ sổ, theo tiền của chặng đang chạy — LifetimeView tính (cùng nguồn
   *  với dòng "đời thật" trong hộp kết luận). null khi chưa có chặng. */
  baseline: BaselineSuggestion | null
  netWorth: number
  netWorthReliable: boolean
  netWorthLoading: boolean
  /** Bản đang xem — nháp nếu có, không thì ảnh chụp dữ liệu đã lưu. */
  working: ScenarioDraft
  changes: DraftChange[]
  /** `LifetimeInput` đã dùng để ra bản chiếu — cho `minimumReturnBps`. */
  input: LifetimeInput | null
  currentYear: number
  onEdit: (mut: (d: ScenarioDraft) => ScenarioDraft) => void
  onSelectScenario: (id: string) => void
  refreshTree: () => Promise<void>
  /** Dải chip "thêm nhanh từ mẫu". Do `LifetimeView` dựng: nó đã có `PresetContext`. */
  presetChips: ReactNode
  // --- Lớp XEM, không thuộc kịch bản: không đi qua nháp, không cần lưu ---
  stress: StressConfig
  onStress: (next: StressConfig) => void
  stressNegativeYear: number | null
  baseNegativeYear: number | null
  nominal: boolean
  onNominal: (next: boolean) => void
  inflationBps: number
  onInflation: (bps: number) => void
  /** Tỷ giá HÔM NAY, do trang dựng — cùng bảng mà bản chiếu dùng để chuẩn hoá. */
  fxOf: FxOf
  /** Mốc cần đưa vào tầm mắt — vào từ chip mốc trên đồ thị. */
  focusEventId?: string
}

export function ScenarioWorkbench({
  scenario,
  scenarios,
  phaseRows,
  eventRows,
  profile,
  baseline,
  netWorth,
  netWorthReliable,
  netWorthLoading,
  working,
  changes,
  input,
  currentYear,
  onEdit,
  onSelectScenario,
  refreshTree,
  presetChips,
  stress,
  onStress,
  stressNegativeYear,
  baseNegativeYear,
  nominal,
  onNominal,
  inflationBps,
  onInflation,
  fxOf,
  focusEventId,
}: Props) {
  const qc = useQueryClient()
  const updateProfileMut = useUpdateProfile()
  const uid = useId()

  // Vào từ một chip mốc trên đồ thị thì mở thẳng tab Sự kiện — không thì người dùng bấm
  // vào mốc rồi rơi xuống một bảng chặng đời và phải tự tìm tiếp.
  const [tab, setTab] = useState<WbTab>(focusEventId ? 'events' : 'phases')
  const [menuOpen, setMenuOpen] = useState(false)
  const [catsOpen, setCatsOpen] = useState(false)
  const [phaseSheet, setPhaseSheet] = useState<DraftPhase | null>(null)
  const [eventSheet, setEventSheet] = useState<DraftEvent | null>(null)
  const [switchingCurrency, setSwitchingCurrency] = useState(false)
  const [busy, setBusy] = useState(false)
  /** Bộ đếm cho `seed` của `addDraftPhase` — hai chặng trùng id thì React dựng nhầm. */
  const phaseSeed = useRef(0)

  const currency = working.displayCurrency
  const dirty = changes.length > 0
  const phases = working.phases
  const events = working.events

  // --- Năm sinh: KHÔNG thuộc kịch bản, nằm ở `profiles` ------------------------------
  //
  // Nên nó không đi qua `ScenarioDraft` (một bản nháp kịch bản không được mang một
  // trường của hồ sơ — `planDraftSave` sẽ phải biết về bảng thứ tư). Nó ghi NGAY khi
  // hợp lệ, khác mọi ô khác trong bàn này: nó là dữ liệu hồ sơ dùng chung cho MỌI kịch
  // bản, nên treo nó trong nháp của một kịch bản là hứa sai ("bỏ nháp" sẽ không hoàn tác
  // được nó).
  const savedBirthYear = profile?.birth_year ?? null
  const [birthYear, setBirthYear] = useState(String(savedBirthYear ?? ''))
  const birthYearNum = Number(birthYear)
  const birthYearValid =
    Number.isInteger(birthYearNum) && birthYearNum >= MIN_BIRTH_YEAR && birthYearNum <= MAX_BIRTH_YEAR
  const shownBirthYear = birthYearValid ? birthYearNum : (savedBirthYear ?? currentYear)
  const lastYear = shownBirthYear + working.endAge

  async function commitBirthYear() {
    if (!birthYearValid || birthYearNum === savedBirthYear) return
    try {
      await updateProfileMut.mutateAsync({ birth_year: birthYearNum })
      showToast('Đã lưu năm sinh vào hồ sơ.', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không lưu được năm sinh.', 'error')
    }
  }

  // --- "Số thật 12 tháng gần nhất" ---------------------------------------------------
  const currentPhaseIndex = useMemo(() => {
    let best = -1
    for (let i = 0; i < phases.length; i++) if (phases[i].startYear <= currentYear) best = i
    return best === -1 && phases.length > 0 ? 0 : best
  }, [phases, currentYear])

  // `baseline` (số thật 12 tháng theo tiền của chặng đang chạy) đến từ props: LifetimeView
  // tính MỘT lần cho cả thẻ chặng này và dòng "đời thật" trong hộp kết luận. Hai nơi tự
  // tính là hai con số có thể lệch nhau trên cùng một màn.
  // Bỏ danh mục có `annualMinor` ÂM (hoàn ròng): thanh tỉ lệ với share âm cho width âm,
  // trình duyệt kẹp về 0 và mất thông tin một cách im lặng.
  const topCats = baseline ? baseline.byCategory.filter((c) => c.annualMinor > 0).slice(0, 3) : []

  // --- Tài sản ròng thật, quy về tiền hiển thị ---------------------------------------
  const ratesQ = useMemo(() => qc.getQueryData<Record<string, number>>(['lifetime-rates-for', currency]), [qc, currency])
  const netWorthInDisplay = useMemo(() => {
    if (!profile) return null
    const base = profile.base_currency as CurrencyCode
    if (base === currency) return netWorth
    // Thiếu tỷ giá thì `null`, KHÔNG nhân bừa 1:1 — quy ước `hasMissingRate` của repo.
    if (!ratesQ) return null
    return convertToBase(netWorth, base, currency, ratesQ)
  }, [profile, currency, netWorth, ratesQ])

  // --- Menu "⋮" ---------------------------------------------------------------------
  /**
   * "Đang là kịch bản chính" suy từ `pickActive` — CÙNG hàm mà bộ luật thông báo và thẻ
   * Lifetime ở /assets dùng — chứ không đọc thẳng cờ `scenario.is_primary`. Hai nguồn
   * thì chúng nói ngược nhau được: lệnh bỏ cờ ở các kịch bản KHÁC lỗi giữa đường là còn
   * HAI dòng cùng `is_primary`, và `pickActive` chọn dòng `sort_order` nhỏ hơn.
   */
  const isEffectivePrimary = pickActive(scenarios)?.id === scenario.id
  const isOnlyScenario = scenarios.length <= 1

  async function handleDuplicate() {
    setMenuOpen(false)
    // Bản sao dựng từ dòng ĐÃ LƯU, nên nhân bản giữa lúc còn nháp cho ra một bản sao
    // KHÔNG mang thay đổi đó. Chặn thẳng, đừng tạo bản sao lệch.
    if (dirty) {
      showToast(
        'Đang có thay đổi chưa lưu. Bản sao dựng từ bản đã lưu nên sẽ không mang thay đổi đó — bấm "Lưu vào kịch bản" ở thanh nháp trước, hoặc "Bỏ".',
        'error',
      )
      return
    }
    setBusy(true)
    try {
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
      // bản sao thiếu dòng. Không tự dọn hộ, nhưng phải NÓI RA.
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
   * Đặt `true` cho kịch bản này TRƯỚC, rồi mới bỏ cờ ở các kịch bản khác. Lỗi giữa đường
   * thì còn HAI kịch bản cùng `is_primary` — `pickActive` xử lý được ca đó. Làm ngược
   * lại mà lỗi thì còn KHÔNG kịch bản nào primary, tức mất hẳn ý định vừa bày tỏ.
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
   * Xoá kịch bản (kèm mọi chặng/mốc — cascade ở Postgres, tự dọn ở demoRepo).
   *
   * CÓ hỏi lại, khác mọi phép xoá khác ở đây: xoá chặng/mốc chỉ đụng bản nháp và "Bỏ" ở
   * thanh nháp là undo, còn cái này ghi thẳng DB và không hoàn tác được.
   */
  async function handleDeleteScenario() {
    setMenuOpen(false)
    if (isOnlyScenario) return
    const ok = await confirmDialog({
      title: `Xóa kịch bản "${scenario.name}"?`,
      message: `Xóa luôn ${phaseRows.length} chặng đời và ${eventRows.length} mốc của kịch bản này. Không hoàn tác được. Các kịch bản khác không bị ảnh hưởng.`,
      confirmLabel: 'Xóa',
      cancelLabel: 'Giữ lại',
      danger: true,
    })
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
      // `finally`: lệnh xoá có thể đã commit rồi mới lỗi (timeout mạng trong lúc
      // Postgres đã ghi). Không làm mới thì dải chip còn một kịch bản không tồn tại.
      await refreshTree()
      setBusy(false)
    }
  }

  // --- Đổi tiền hiển thị -------------------------------------------------------------
  /**
   * Đổi TIỀN HIỂN THỊ: quy đổi tài sản khởi điểm theo tỷ giá hôm nay.
   *
   * `starting_assets_minor` lưu THEO `display_currency`, nên đổi dropdown mà không quy
   * đổi con số là biến ¥11.000.000 thành $110.000 — sai ~150 lần, đúng ở điểm khởi đầu
   * bản chiếu, và không có dòng nào trên màn nói ra.
   *
   * KHÔNG tra được tỷ giá thì KHÔNG ĐỔI GÌ CẢ — một trạng thái thay vì ba, và không có
   * ca nào con số sai kịp xuất hiện trên màn.
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
      showToast(`Tiền hiển thị nay là ${next}.`, 'success')
    } catch {
      showToast('Chưa lấy được tỷ giá hôm nay nên chưa đổi được tiền hiển thị.', 'error')
    } finally {
      setSwitchingCurrency(false)
    }
  }

  // Bấm ra ngoài menu "⋮" thì đóng menu.
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  // Vào từ một chip mốc trên đồ thị (hoặc từ Bảng theo năm): nhảy sang tab Mốc và cuộn
  // đúng dòng đó vào tầm mắt.
  //
  // Chạy lại theo `focusEventId` chứ không chỉ một lần lúc gắn: bàn sửa nằm THẲNG trong
  // trang nên nó không hề tháo ra giữa hai lần bấm chip — một effect `[]` sẽ chỉ nhắm
  // đúng ở lần bấm ĐẦU TIÊN rồi im lặng ở mọi lần sau.
  const focusRowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!focusEventId) return
    setTab('events')
  }, [focusEventId])
  useEffect(() => {
    if (!focusEventId || tab !== 'events') return
    focusRowRef.current?.scrollIntoView({ block: 'center' })
  }, [focusEventId, tab])

  const returnBound = sliderBound(RETURN_MIN_BPS, RETURN_MAX_BPS, working.realReturnBps, SLIDER_STEP_BPS)
  const spreadBound = sliderBound(SPREAD_MIN_BPS, SPREAD_MAX_BPS, working.bandSpreadBps, SLIDER_STEP_BPS)

  /** Năm kết thúc của một chặng — chặng sau bắt đầu năm nào thì chặng này dừng năm
   *  trước đó; chặng cuối chạy tới hết bản chiếu. Cùng luật với `phaseRange`. */
  const phaseEnd = (i: number) => (i + 1 < phases.length ? phases[i + 1].startYear - 1 : lastYear)

  /** Hai chặng cùng `startYear` = vi phạm `unique (scenario_id, start_year)`. */
  const dupYears = useMemo(() => {
    const seen = new Set<number>()
    const dup = new Set<number>()
    for (const p of phases) {
      if (seen.has(p.startYear)) dup.add(p.startYear)
      seen.add(p.startYear)
    }
    return dup
  }, [phases])

  const footerNote = dirty
    ? `Đang đổi: ${changeParts(changes, currency, null, null).join(' · ')}.`
    : 'Sửa gì ở đây đồ thị đổi ngay; chưa có gì được ghi cho tới khi bấm Lưu ở thanh nháp.'

  const stressCount = Object.values(stress).filter((v) => v.on).length
  const minRetBps = input ? minimumReturnBps(input) : null
  const minReturnFoot =
    minRetBps === null
      ? 'Không có mức lợi suất nào trong khoảng dò khiến bản chiếu hết năm âm — phải đổi thu, chi hoặc mốc.'
      : minRetBps === 0
        ? 'Thu chi đã tự đủ: không cần lợi suất nào để tránh năm âm.'
        : `Cần ít nhất ${minRetBps / 100}%/năm để không năm nào âm.`

  const TABS: { id: WbTab; label: string; badge: string }[] = [
    { id: 'phases', label: 'Chặng đời', badge: String(phases.length) },
    { id: 'events', label: 'Mốc cuộc đời', badge: String(events.length) },
    { id: 'yield', label: 'Khởi điểm & lợi suất', badge: `${working.realReturnBps / 100}%` },
    { id: 'stress', label: 'Stress test', badge: stressCount ? `${stressCount} bật` : '' },
    { id: 'read', label: 'Cách đọc & phạm vi', badge: '' },
  ]

  return (
    <>
      <section className="rounded-xl bg-surface shadow-sm dark:border dark:border-border-panel dark:shadow-none">
        {/* ---------- Đầu thẻ ---------- */}
        <div className="flex flex-wrap items-center gap-2.5 px-4 pb-2 pt-3">
          <SectionTitle className="shrink-0">Sửa kịch bản</SectionTitle>
          <input
            value={working.name}
            onChange={(e) => {
              const v = e.target.value
              onEdit((d) => ({ ...d, name: v }))
            }}
            aria-label="Tên kịch bản"
            className={`w-[9.5rem] shrink-0 rounded-md border border-border-panel bg-surface px-2 py-1.5 text-sm font-semibold text-fg-primary sm:w-[16rem]`}
          />
          {isEffectivePrimary && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-state-good-border bg-state-good-bg px-2 text-2xs font-semibold text-state-good-fg">
              <Star className="h-3 w-3 shrink-0 fill-current" aria-hidden="true" />
              Kịch bản chính
            </span>
          )}
          <p className="min-w-[10rem] flex-1 text-2xs leading-relaxed text-fg-muted">{footerNote}</p>
          <div ref={menuRef} className="relative shrink-0">
            <IconButton
              aria-label="Tác vụ khác"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              disabled={busy}
            >
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </IconButton>
            {menuOpen && (
              <div className="absolute right-0 top-10 z-30 w-[14.5rem] rounded-lg border border-border-panel bg-surface p-1 shadow-lg">
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
        </div>

        {/* ---------- Dải tab ---------- */}
        <div
          role="tablist"
          aria-label="Phần cần sửa"
          className="flex flex-wrap items-center gap-x-[1.125rem] border-b border-border-panel px-4"
        >
          {TABS.map((t) => {
            const on = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.id)}
                className={`-mb-px inline-flex min-h-10 items-center gap-1.5 border-b-2 px-0.5 text-sm transition ${
                  on
                    ? 'border-accent font-semibold text-fg-primary'
                    : 'border-transparent font-medium text-fg-muted hover:text-fg-secondary'
                }`}
              >
                {t.label}
                {t.badge && (
                  <span
                    className={`rounded-full border px-1.5 font-mono text-2xs font-semibold tabular-nums ${
                      on
                        ? 'border-state-good-border bg-state-good-bg text-state-good-fg'
                        : 'border-border-panel bg-surface-page text-fg-muted'
                    }`}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ===================== TAB: CHẶNG ĐỜI ===================== */}
        {tab === 'phases' && (
          <div className="px-4 pb-2 pt-3.5">
            <Guide className={PANEL_NOTE}>
              Thu · chi mỗi năm, tính từ năm bắt đầu chặng. Mỗi chặng khai bằng tiền của
              nước đó; mốc cuộc đời tự tính theo tiền của chặng nó rơi vào.
            </Guide>

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
                    <span className="truncate px-1 text-2xs font-medium text-fg-secondary">
                      {p.label}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-2.5 flex max-w-[55rem] flex-col gap-2">
              {phases.map((p, i) => {
                const isCurrent = i === currentPhaseIndex
                const savingMinor = p.annualIncomeMinor - p.annualExpenseMinor
                const ratePct =
                  p.annualIncomeMinor === 0
                    ? null
                    : Math.round((savingMinor / p.annualIncomeMinor) * 100)
                const sym = CURRENCIES[p.currency].symbol
                return (
                  <div
                    key={p.id}
                    className={`rounded-lg border p-2.5 ${
                      isCurrent
                        ? 'border-state-good-border bg-state-good-bg'
                        : 'border-border-panel bg-surface'
                    }`}
                  >
                    <div className="grid grid-cols-2 items-end gap-2 lg:flex">
                      <label
                        htmlFor={`${uid}-py-${p.id}`}
                        className={`${FIELD_LABEL} min-w-0 lg:w-[5.5rem] lg:shrink-0`}
                      >
                        Từ năm
                        <YearInput
                          id={`${uid}-py-${p.id}`}
                          value={p.startYear}
                          ariaLabel={`Năm bắt đầu chặng ${p.label}`}
                          className={`mt-0.5 block w-full ${FIELD_BOX}`}
                          onCommit={(y) => onEdit((d) => patchDraftPhase(d, p.id, { startYear: y }))}
                        />
                      </label>
                      <label className={`${FIELD_LABEL} min-w-0 lg:flex-1`}>
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
                      {/* Ô TIỀN của chặng — từ v5 đây là nơi DUY NHẤT khai tiền. Mốc
                          cuộc đời không còn tiền riêng, chúng đọc theo chặng. */}
                      <label className={`${FIELD_LABEL} min-w-0 lg:w-[6.5rem] lg:shrink-0`}>
                        Tiền
                        <Select
                          value={p.currency}
                          aria-label={`Đơn vị tiền của chặng ${p.label}`}
                          onChange={(e) => {
                            const v = e.target.value as CurrencyCode
                            // `setPhaseCurrency`, KHÔNG phải `patchDraftPhase`: đổi tiền
                            // của chặng phải gắn nhãn lại mọi mốc rơi vào nó, không thì
                            // màn hình và bản chiếu nói hai con số khác nhau.
                            onEdit((d) => setPhaseCurrency(d, p.id, v))
                          }} wrapClassName="mt-0.5 block w-full">
                          {(Object.keys(CURRENCIES) as CurrencyCode[]).map((c) => (
                            <option key={c} value={c}>
                              {CURRENCIES[c].symbol} {c}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <span className={`${FIELD_LABEL} min-w-0 text-money-in lg:w-[8rem] lg:shrink-0`}>
                        Thu / năm ({sym})
                        <span className="mt-0.5 block">
                          <MoneyField
                            value={p.annualIncomeMinor}
                            currency={p.currency}
                            autoOpen={false}
                            ariaLabel={`Thu mỗi năm của chặng ${p.label}`}
                            onChange={(v) =>
                              onEdit((d) => patchDraftPhase(d, p.id, { annualIncomeMinor: v }))
                            }
                            className={`w-full text-right ${FIELD_BOX}`}
                          />
                        </span>
                      </span>
                      <span className={`${FIELD_LABEL} min-w-0 text-money-out lg:w-[8rem] lg:shrink-0`}>
                        Chi / năm ({sym})
                        <span className="mt-0.5 block">
                          <MoneyField
                            value={p.annualExpenseMinor}
                            currency={p.currency}
                            autoOpen={false}
                            ariaLabel={`Chi mỗi năm của chặng ${p.label}`}
                            onChange={(v) =>
                              onEdit((d) => patchDraftPhase(d, p.id, { annualExpenseMinor: v }))
                            }
                            className={`w-full text-right ${FIELD_BOX}`}
                          />
                        </span>
                      </span>
                      <div className="col-span-2 flex justify-end gap-1 lg:col-span-1 lg:self-end">
                        <IconButton
                          aria-label={`Chi tiết chặng ${p.label}`}
                          title="Quốc gia…"
                          onClick={() => setPhaseSheet(p)}
                        >
                          <MoreVertical className="h-4 w-4" aria-hidden="true" />
                        </IconButton>
                        {/* Chặng ĐẦU TIÊN không có nút xoá: bản chiếu phải bắt đầu từ
                            một chặng nào đó. */}
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

                    <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                      <p className="min-w-0 text-2xs text-fg-muted">
                        {isCurrent ? 'Chặng đang chạy' : `Tuổi ${p.startYear - shownBirthYear}`} ·{' '}
                        {p.startYear}–{phaseEnd(i)} · để dành{' '}
                        <Money amount={savingMinor} currency={p.currency} compact tone="bySign" />
                        /năm
                        {ratePct !== null && ` (${ratePct}%)`}
                        {/* Chặng khai bằng tiền khác tiền hiển thị thì kèm luôn con số
                            đã quy đổi: không có nó, "để dành 250万/năm" của một chặng ₫
                            đọc như 250万 YÊN. */}
                        {p.currency !== currency &&
                          (() => {
                            // Tỷ giá HÔM NAY, không phải `p.fxToDisplay` — trường đó
                            // trong bản nháp còn mang con số ĐÃ LƯU (người dùng từng gõ
                            // tay ở mô hình cũ), nên dùng nó cho ra một câu "≈" sai hẳn.
                            // Đi qua `convertMinorToday`, KHÔNG nhân thẳng minor × tỷ giá: USD 2 lẻ,
                            // JPY 0 lẻ — nhân thẳng từng cho ra "1.8億/năm" thay vì ~162万.
                            const inDisplay = convertMinorToday(savingMinor, p.currency, currency, fxOf)
                            if (inDisplay === null) return ' · chưa có tỷ giá để quy đổi'
                            return (
                              <>
                                {' · ≈ '}
                                <Money
                                  amount={inDisplay}
                                  currency={currency}
                                  compact
                                  tone="muted"
                                />
                                /năm theo {currency}
                              </>
                            )
                          })()}
                      </p>
                      {/* Số THẬT từ sổ, ngay trong thẻ chặng đang chạy. Bản v1 dành cả
                          một CỘT THỨ BA cho khối này ("số này ở đâu ra").
                          KHÔNG để `shrink-0` ở đây: bề ngang tự nhiên của khối là ~500px,
                          nên trên điện thoại nó không chịu co, đẩy `<main>` (overflow-y-auto
                          → overflow-x thành auto) thành cuộn NGANG cả trang. `min-w-0` cho
                          nó xuống dòng riêng rồi co vừa thẻ. */}
                      {isCurrent && baseline && (
                        <div className="flex min-w-0 flex-wrap items-center gap-2.5 rounded-md border border-state-good-border bg-surface px-2.5 py-1.5">
                          <p className="text-2xs leading-relaxed text-fg-secondary">
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
                          {topCats.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setCatsOpen((v) => !v)}
                              aria-expanded={catsOpen}
                              className="shrink-0 text-2xs font-medium text-fg-accent transition active:scale-95"
                            >
                              {catsOpen ? 'Ẩn chi tiết' : 'Gồm gì?'}
                            </button>
                          )}
                          <ActionButton
                            variant="primary"
                            className="shrink-0"
                            onClick={() => {
                              onEdit((d) =>
                                patchDraftPhase(d, p.id, {
                                  annualIncomeMinor: baseline.annualIncomeMinor,
                                  annualExpenseMinor: baseline.annualExpenseMinor,
                                }),
                              )
                              showToast(
                                'Đã lấy số thật vào chặng đang chạy — chưa ghi, bấm Lưu ở thanh nháp.',
                                'success',
                              )
                            }}
                          >
                            Dùng số này
                          </ActionButton>
                        </div>
                      )}
                    </div>

                    {dupYears.has(p.startYear) && (
                      <p role="alert" className="mt-1 text-2xs text-money-out">
                        Có hai chặng cùng bắt đầu năm {p.startYear} — mỗi năm chỉ được một
                        chặng, sửa trước khi lưu.
                      </p>
                    )}

                    {isCurrent && catsOpen && topCats.length > 0 && (
                      <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-x-6 gap-y-1 border-t border-border-subtle pt-2">
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
                              <Money amount={c.annualMinor} currency={p.currency} compact /> ·{' '}
                              {Math.round(c.share * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-2.5 flex flex-wrap items-end gap-5">
              <ActionButton
                className="border-dashed"
                onClick={() => {
                  const last = phases[phases.length - 1]
                  // `currentYear + 1` là sàn: một chặng mới bắt đầu ở QUÁ KHỨ đổi ngay
                  // chặng đang chạy, tức đổi cả bản chiếu từ hôm nay trở đi.
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
                  showToast(`Đã thêm chặng từ năm ${y} — sửa tên, tiền, thu, chi bên dưới.`, 'success')
                }}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Thêm chặng
              </ActionButton>

              {/* Tuổi bắt đầu chặng CUỐI — thanh trượt riêng vì đó là con số người dùng
                  vặn nhiều nhất ("nghỉ hưu sớm hai năm thì sao"), mà gõ vào ô "Từ năm"
                  của chặng cuối thì phải tự cộng trừ với năm sinh. */}
              {phases.length > 1 && (
                <div className="min-w-[15rem] max-w-[22.5rem] flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <label
                      htmlFor={`${uid}-retire`}
                      className="min-w-0 truncate text-2xs uppercase tracking-label text-fg-muted"
                    >
                      {phases[phases.length - 1].label} từ tuổi
                    </label>
                    <span className="font-mono text-sm font-semibold tabular-nums text-fg-primary">
                      {phases[phases.length - 1].startYear - shownBirthYear} tuổi (
                      {phases[phases.length - 1].startYear})
                    </span>
                  </div>
                  <input
                    id={`${uid}-retire`}
                    type="range"
                    // Sàn = năm sau chặng kế cuối: kéo xuống dưới nó là đảo thứ tự hai
                    // chặng, mà thứ tự chặng là thứ quyết định cả bản chiếu.
                    min={Math.max(
                      currentYear - shownBirthYear + 1,
                      phases[phases.length - 2].startYear - shownBirthYear + 1,
                    )}
                    max={80}
                    step={1}
                    value={phases[phases.length - 1].startYear - shownBirthYear}
                    onChange={(e) => {
                      const y = shownBirthYear + Number(e.target.value)
                      const id = phases[phases.length - 1].id
                      onEdit((d) => patchDraftPhase(d, id, { startYear: y }))
                    }}
                    className="mt-1 h-6 w-full cursor-pointer accent-[var(--color-accent)]"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================== TAB: MỐC CUỘC ĐỜI ===================== */}
        {tab === 'events' && (
          <div className="px-4 pb-2 pt-3.5">
            <Guide className={PANEL_NOTE}>
              {events.length > 0
                ? 'Kéo chip trên đồ thị cũng đổi được năm. Mỗi mốc tính bằng tiền của chặng nó rơi vào.'
                : 'Chưa có mốc nào — thêm từ mẫu bên dưới.'}
            </Guide>

            <div className="mt-2 flex max-w-[51.25rem] flex-col gap-1.5">
              {events.map((ev) => {
                const evCur = currencyAt(phases, ev.startYear, currency)
                return (
                  <div
                    key={ev.id}
                    ref={ev.id === focusEventId ? focusRowRef : undefined}
                    className={`flex flex-col gap-1 rounded-lg border bg-surface p-2 ${
                      ev.id === focusEventId ? 'border-accent' : 'border-border-panel'
                    }`}
                  >
                  <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
                    {/* Cặp nút thu/chi trong MỘT khung: chúng là hai giá trị của cùng
                        một trường. `aria-pressed` bắt buộc — trạng thái chỉ thể hiện
                        bằng màu. */}
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
                      className={`${FIELD_BOX} min-w-0 flex-1`}
                    />
                    <YearInput
                      value={ev.startYear}
                      ariaLabel="Từ năm"
                      className={`${FIELD_BOX} w-[4.75rem] shrink-0 text-center`}
                      onCommit={(y) =>
                        onEdit((d) => {
                          // GIỮ NGUYÊN độ dài: dời một mốc 22 năm sang trước hai năm là
                          // dời cả khoảng, không phải kéo dài nó thêm hai năm.
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
                    <span className="shrink-0 text-sm text-fg-disabled" aria-hidden="true">
                      →
                    </span>
                    <EndYearInput
                      value={ev.endYear}
                      startYear={ev.startYear}
                      onCommit={(y) => onEdit((d) => patchDraftEvent(d, ev.id, { endYear: y }))}
                    />
                    {/* Ký hiệu tiền CHỈ ĐỂ ĐỌC: từ v5 mốc không tự khai tiền nữa, nó
                        theo chặng phủ năm bắt đầu. Vẫn phải hiện ra — thiếu nó thì một
                        hàng số trần không nói được 4.200.000 là yên hay đồng. */}
                    <span
                      title={`Tính bằng ${evCur} — theo chặng mà năm ${ev.startYear} rơi vào`}
                      className="shrink-0 font-mono text-sm text-fg-disabled"
                    >
                      {CURRENCIES[evCur].symbol}
                    </span>
                    <div className="flex w-full items-center gap-2 md:contents">
                      <span className="min-w-0 flex-1 md:w-[8.75rem] md:flex-none">
                        <MoneyField
                          value={ev.amountMinor}
                          currency={evCur}
                          autoOpen={false}
                          ariaLabel={`Số tiền mỗi năm của mốc ${ev.label}`}
                          onChange={(v) =>
                            // Ghi kèm `currency`: dòng dưới DB có thể còn mang tiền cũ
                            // (xem `fxModel.ts` — không có migration hàng loạt), nên lần
                            // người dùng chạm vào nó là lúc nó tự lành về mô hình mới.
                            onEdit((d) =>
                              patchDraftEvent(d, ev.id, {
                                amountMinor: v,
                                currency: evCur,
                                fxToDisplay: 1,
                              }),
                            )
                          }
                          className={`w-full text-right font-medium ${FIELD_BOX} ${
                            ev.kind === 'income' ? 'text-money-in' : 'text-money-out'
                          }`}
                        />
                      </span>
                      <div className="flex shrink-0 gap-1">
                        <IconButton
                          aria-label={`Chi tiết mốc ${ev.label}`}
                          title="Lạm phát, ghi chú…"
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
                  </div>
                    {/* Số tiền của mốc là số MỖI NĂM. Kéo hai năm là trừ hai lần — hàng
                        trên không nói ra nên "Chi phí cưới 2029 → 2030 · ¥3,000,000" đọc
                        như cưới tốn 3M trong khi bản chiếu trừ 6M (2026-09-02). */}
                    {(() => {
                      const span = eventSpan(ev.startYear, ev.endYear, ev.amountMinor)
                      if (span === null) return null
                      return (
                        <p className="text-2xs text-fg-muted">
                          {span.kind === 'open' ? (
                            'Số mỗi năm, chạy tới hết đời.'
                          ) : (
                            <>
                              Số mỗi năm × <Num tone="muted">{span.years}</Num> năm ={' '}
                              <Money
                                amount={span.totalMinor}
                                currency={evCur}
                                tone={ev.kind === 'income' ? 'in' : 'out'}
                                className="font-semibold"
                              />{' '}
                              cả khoảng.
                            </>
                          )}
                        </p>
                      )
                    })()}
                  </div>
                )
              })}
            </div>

            <div className="mt-3">{presetChips}</div>
          </div>
        )}

        {/* ===================== TAB: KHỞI ĐIỂM & LỢI SUẤT ===================== */}
        {tab === 'yield' && (
          <div className="px-4 pb-2 pt-3.5">
            <Guide className={PANEL_NOTE}>Điểm bắt đầu của đường và tốc độ nó lớn lên.</Guide>
            <div className="mt-2.5 flex flex-wrap gap-6">
              <div className="min-w-[17.5rem] max-w-[25rem] flex-1">
                <p className="mb-1 text-2xs uppercase tracking-label text-fg-muted">
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
                      className={`w-full text-right ${FIELD_BOX}`}
                    />
                  </span>
                </div>
                {/* Tài sản ròng THẬT chỉ đề nghị khi nó đáng tin: `netWorthReliable`
                    false nghĩa là có khoản thiếu tỷ giá, và lúc đó con số là một cái SÀN
                    chứ không phải tổng (quy ước `hasMissingRate` toàn repo). */}
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
                    className="mt-1 min-h-11 text-left text-2xs font-medium text-fg-accent transition active:scale-95 disabled:text-fg-disabled"
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

              <div className="min-w-[13.75rem] max-w-[20rem] flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <label
                    htmlFor={`${uid}-return`}
                    className="text-2xs uppercase tracking-label text-fg-muted"
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

              <div className="min-w-[13.75rem] max-w-[20rem] flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <label
                    htmlFor={`${uid}-spread`}
                    className="text-2xs uppercase tracking-label text-fg-muted"
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
            <p className="mt-3 border-t border-border-subtle pt-2 text-2xs leading-relaxed text-fg-muted">
              {minReturnFoot}
            </p>
          </div>
        )}

        {/* ===================== TAB: STRESS TEST ===================== */}
        {tab === 'stress' && (
          <div className="px-4 pb-2 pt-3.5">
            <StressPanel
              variant="inline"
              value={stress}
              onChange={onStress}
              currency={currency}
              minYear={currentYear}
              maxYear={lastYear}
              baseNegativeYear={baseNegativeYear}
              stressNegativeYear={stressNegativeYear}
              birthYear={shownBirthYear}
            />
          </div>
        )}

        {/* ===================== TAB: CÁCH ĐỌC & PHẠM VI ===================== */}
        {tab === 'read' && (
          <div className="px-4 pb-2 pt-3.5">
            <Guide className={PANEL_NOTE}>
              Đổi cách đọc đồ thị và phạm vi chiếu — không phải dữ liệu kịch bản.
            </Guide>
            <div className="mt-2.5 flex flex-wrap items-start gap-6">
              <div className="min-w-[15rem] max-w-[21.25rem] flex-1">
                <span className="block text-2xs uppercase tracking-label text-fg-muted">
                  Giá hiển thị
                </span>
                <div className="mt-1 w-fit">
                  <SegmentedControl
                    size="sm"
                    stretch={false}
                    value={nominal ? 'nominal' : 'today'}
                    onChange={(v) => onNominal(v === 'nominal')}
                    items={[
                      { value: 'today', label: 'Hôm nay' },
                      { value: 'nominal', label: 'Danh nghĩa' },
                    ]}
                    label="Giá hiển thị"
                  />
                </div>
                {nominal && (
                  <div className="mt-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <label
                        htmlFor={`${uid}-infl`}
                        className="text-2xs uppercase tracking-label text-fg-muted"
                      >
                        Lạm phát
                      </label>
                      <span className="font-mono text-sm font-semibold tabular-nums text-fg-primary">
                        {inflationBps / 100}%
                      </span>
                    </div>
                    <input
                      id={`${uid}-infl`}
                      type="range"
                      min={0}
                      max={INFLATION_MAX_BPS}
                      step={SLIDER_STEP_BPS}
                      value={inflationBps}
                      onChange={(e) => onInflation(Number(e.target.value))}
                      className="mt-1 h-6 w-full cursor-pointer accent-[var(--color-fg-warn)]"
                    />
                  </div>
                )}
              </div>

              <div className="min-w-[15rem] max-w-[21.25rem] flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <label
                    htmlFor={`${uid}-endage`}
                    className="text-2xs uppercase tracking-label text-fg-muted"
                  >
                    Chiếu đến tuổi
                  </label>
                  <span className="font-mono text-sm font-semibold tabular-nums text-fg-primary">
                    {working.endAge} tuổi ({lastYear})
                  </span>
                </div>
                <input
                  id={`${uid}-endage`}
                  type="range"
                  min={70}
                  max={100}
                  step={1}
                  value={Math.min(Math.max(working.endAge, 70), 100)}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (v >= MIN_END_AGE && v <= MAX_END_AGE) onEdit((d) => ({ ...d, endAge: v }))
                  }}
                  className="mt-1 h-6 w-full cursor-pointer accent-[var(--color-accent)]"
                />
              </div>

              <label className={`${FIELD_LABEL} min-w-0 max-w-[10rem] flex-1`}>
                Năm sinh
                <input
                  inputMode="numeric"
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  onBlur={() => void commitBirthYear()}
                  className={`${FIELD_INPUT} font-mono tabular-nums`}
                />
              </label>

              <label className={`${FIELD_LABEL} min-w-0 max-w-[13.75rem] flex-1`}>
                Tiền hiển thị
                <Select
                  value={currency}
                  disabled={switchingCurrency}
                  onChange={(e) => void handleCurrencyChange(e.target.value as CurrencyCode)} wrapClassName="mt-0.5 block w-full">
                  {(Object.keys(CURRENCIES) as CurrencyCode[]).map((c) => (
                    <option key={c} value={c}>
                      {CURRENCIES[c].label} ({c})
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            {!birthYearValid && (
              <p role="alert" className="mt-1.5 text-2xs text-money-out">
                Năm sinh phải là số nguyên trong khoảng {MIN_BIRTH_YEAR}–{MAX_BIRTH_YEAR}.
              </p>
            )}
            {/* Tách hai vế. Vế đầu là NGỮ NGHĨA LƯU, phải hiện cả ở Gọn: cả màn này chạy
                theo nếp nháp-rồi-Lưu, nên đúng một ô ghi thẳng là ngoại lệ — mà ngoại lệ
                không nói ra thì người dùng gõ xong, không bấm Lưu, và vẫn bị ghi. Vế sau
                (tỷ giá, đổi tiền hiển thị) là chữ dạy thuần. */}
            <p className="mt-3 border-t border-border-subtle pt-2 text-2xs leading-relaxed text-fg-muted">
              Năm sinh dùng chung cho mọi kịch bản (Cài đặt → Hồ sơ) nên nó ghi ngay, không
              đợi Lưu.
              <Guide as="span">
                {' '}
                Bản chiếu coi như tỷ giá hôm nay giữ nguyên mãi — đổi tiền hiển thị chỉ đổi
                cách đọc, không đụng số bạn đã nhập.
              </Guide>
            </p>
          </div>
        )}
      </section>

      {phaseSheet && (
        <PhaseFormSheet
          phases={phases}
          phase={phaseSheet}
          onApply={(patch) => onEdit((d) => patchDraftPhase(d, phaseSheet.id, patch))}
          onRemove={() => onEdit((d) => removeDraftPhase(d, phaseSheet.id))}
          onClose={() => setPhaseSheet(null)}
        />
      )}
      {eventSheet && (
        <EventFormSheet
          event={eventSheet}
          currency={currencyAt(phases, eventSheet.startYear, currency)}
          onApply={(patch) => onEdit((d) => patchDraftEvent(d, eventSheet.id, patch))}
          onRemove={() => onEdit((d) => removeDraftEvent(d, eventSheet.id))}
          onClose={() => setEventSheet(null)}
        />
      )}
    </>
  )
}
