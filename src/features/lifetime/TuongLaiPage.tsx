// Trang riêng cho "Tương lai" — console dòng thời gian tài chính cả đời (tách khỏi Tài
// sản 2026-09-09, xem docs/superpowers/specs/2026-09-09-tuong-lai-console-design.md).
//
// Trước đây đây là tab con thứ ba của Tài sản (`/assets?view=future`). Route cũ và
// `/lifetime` đều chuyển tiếp sang đây (xem App.tsx) để bookmark và lịch sử trình duyệt
// của người dùng còn dùng được.
//
// VAI CỦA FILE NÀY, theo spec §10: vỏ trang. Ba cổng (bề ngang ≥1280px · năm sinh · đã
// có kịch bản chưa), khung ba vùng, và THỨ TỰ MƯỜI HAI HÀNG của bản vẽ. Nó không tự vẽ
// gì — vùng vẽ là `TimelinePlot`, bố cục là `ConsoleFrame`, còn dock / dải chặng / bảng
// chọn nhanh là các task kế tiếp cắm vào đúng ô đã chừa.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Plus, Star } from 'lucide-react'
import {
  ActionButton,
  Card,
  EmptyState,
  FilterChip,
  Money,
  Num,
  PageHeader,
  SectionTitle,
  SegmentedControl,
  actionButtonClass,
} from '../../components/ui'
import { EstimateMark } from '../../components/EstimateMark'
import { repo } from '../../data'
import {
  useAccountBalances,
  useAccounts,
  useCategories,
  useLifetimeVerdictSnapshots,
  usePlannedExpenses,
  useRangeTransactions,
  useSavingsGoals,
  useUpsertLifetimeVerdictSnapshot,
} from '../../hooks/queries'
import type { CurrencyCode } from '../../lib/currencies'
import { getMonthRange, monthKeyForDate, toISODate } from '../../lib/dates'
import { showToast } from '../../lib/dialog'
import { fetchRates } from '../../lib/rates'
import { suggestBaseline } from './baseline'
import { biggestExpenseItem, buildBigExpenseMap, type GoalLikeInput } from './bigExpenses'
import { BigExpenseMapSection } from './BigExpenseMapSection'
import { ConsoleFrame } from './ConsoleFrame'
import {
  addDraftEvent,
  addDraftPhase,
  addedEventId,
  addedPhaseId,
  applyPreset,
  draftChanges,
  draftFromRows,
  draftPhaseIndex,
  draftToInput,
  patchDraftEvent,
  patchDraftPhase,
  presetEventId,
  removeDraftEvent,
  removeDraftPhase,
  setPhaseCurrency,
  type DraftPhase,
  type ScenarioDraft,
} from './draft'
import { DraftBanner } from './DraftBanner'
import { changeParts } from './draftText'
import { currencyAt, fxOfRates, normalizeToPhaseCurrency } from './fxModel'
import { assetsAtAge, firstNegativeYear } from './insights'
import { InsightCards } from './InsightCards'
import { PhaseLane } from './PhaseLane'
import { PlanDock, type DockSelection } from './PlanDock'
import { blockPhaseStartYearAtNeighbours, clampPhaseStartYear, freePhaseStartYear } from './phaseYear'
import { PIN_TOP, clampQuickBoardLeft, viewRange } from './plotFrame'
import type { LifePreset, PresetContext, PresetResult } from './presets'
import { hasStress, NO_STRESS, phaseForYear, projectLifetime, type StressConfig } from './project'
import { QuickAddBoard } from './QuickAddBoard'
import { applySpanToResult } from './quickAddApply'
import type { SpanApply, YearSpan } from './quickAddRange'
import { scaleExpenses } from './quickTune'
import { QuickTuneRow } from './QuickTuneRow'
import { realityCheck } from './realityCheck'
import { commitDraft, saveDraftAsNewScenario } from './saveDraft'
import { defaultStress, StressPanel } from './StressPanel'
import { lifetimeVerdict } from './summary'
import { topLayer } from './topLayer'
import {
  TimelinePlot,
  type ComparisonLine,
  type PlotPoint,
  type PlotZoom,
  type TimelinePlotHandle,
} from './TimelinePlot'
import { applyRetireTrial, buildRetireTrial, RETIRE_TRIAL_MIN_END_AGE } from './tryRetire'
import { UNDO_WINDOW_MS, makeUndo } from './undoStack'
import { useConsoleKeys } from './useConsoleKeys'
import { baselineRange, makeCurrencyOf, useLifetime } from './useLifetime'
import { verdictDrift, type VerdictPoint } from './verdictHistory'
import { YearTableSection } from './YearTableView'

/** Ô nhập năm sinh khớp ràng buộc DB (migration 0031: `birth_year between 1900 and 2100`). */
const MIN_BIRTH_YEAR = 1900
const MAX_BIRTH_YEAR = 2100

/**
 * Màu cho các đường KỊCH BẢN SO SÁNH. Lấy thang `--chart-slice-*` đã có sẵn (họ xanh
 * dương) chứ không thêm sắc mới: đường chính, dải và ngưỡng FIRE đã dùng hết họ xanh lá,
 * nên một đường so sánh cũng xanh lá là hai nét cùng họ chồng nhau đúng ở chỗ chúng tách
 * ra — tức chỗ cần đọc.
 */
const COMPARE_COLORS = [
  'var(--chart-slice-1)',
  'var(--chart-slice-2)',
  'var(--chart-slice-3)',
  'var(--chart-slice-4)',
  'var(--chart-slice-5)',
] as const

/**
 * Chỗ neo DỌC của bảng chọn nhanh, pixel trong hộp vùng vẽ đã đo. Dùng chính `PIN_TOP`
 * (mép trên hàng icon mốc) thay vì một con số mới: bảng là lớp phủ tạm, và neo nó ở mép
 * trên là chỗ duy nhất luôn đủ chiều cao cho nó ở MỌI kích cỡ chữ — xem lời ghi tại chỗ
 * dùng. Là toạ độ trong hộp đã đo nên nó ở px, cùng hệ với `plotFrame.ts`.
 */
const QUICK_TOP_PX = PIN_TOP

/**
 * Chặng phủ một năm. MỘT chỗ trả lời câu đó cho cả hai chỗ cần (tên chặng của mốc đang
 * chọn, và tiền của một mốc trống vừa sinh) — `phaseForYear` (project.ts) đã tự rơi về
 * chặng SỚM NHẤT cho một năm nằm trước chặng đầu tiên, cùng luật mà `currencyAt`
 * (fxModel.ts) dùng: nói một mốc không thuộc chặng nào là bảo khoản chi năm 2020 tính
 * bằng đơn vị khác hẳn khoản chi năm 2026 của cùng một chặng.
 */
function phaseCovering(phases: readonly DraftPhase[], year: number): DraftPhase | null {
  return phaseForYear([...phases].sort((a, b) => a.startYear - b.startYear), year) ?? null
}

const ZOOM_ITEMS = [
  { value: '10', label: '10 năm' },
  { value: '20', label: '20 năm' },
  { value: 'all', label: 'Cả đời' },
] as const

export function TuongLaiPage() {
  return (
    <div className="flex flex-col gap-3 p-3 lg:p-6">
      <PageHeader title="Tương lai" flush />

      {/* Console dòng thời gian là màn CHỈ CHO MÁY TÍNH (quyết định 2026-09-09, xem spec
          §1). Cần 1280px để chứa rail + vùng vẽ + dock 24,5rem cùng lúc.

          Cổng bằng CSS chứ không đo bằng JS: đọc `innerWidth` trong render thì lần vẽ đầu
          luôn sai ở SSR/hydrate, và không nghe theo Cài đặt → Cỡ chữ (src/lib/fontScale.ts
          đổi `--app-font-scale` → đổi font-size gốc → breakpoint rem của Tailwind đổi
          theo, còn một ngưỡng px đo bằng JS thì đứng yên).

          Mốc dùng là `xl` = 80rem = 1280px — mặc định Tailwind v4, KHÔNG bị override:
          không có `@theme` nào khai lại `--breakpoint-xl` hay `screens` trong
          src/index.css (đã kiểm bằng grep). Đúng luôn 1280px cần, không phải bịa tiện ích
          mới. */}
      <div className="xl:hidden">
        <EmptyState>
          Màn Tương lai cần máy tính (từ 1280px) để đủ chỗ cho rail, vùng vẽ và bảng vặn
          thử cùng lúc. Mở lại bằng máy tính, hoặc phóng rộng cửa sổ trình duyệt.
        </EmptyState>
      </div>
      {/* `block` chứ không `flex`: chính `ConsoleFrame` bên trong là khối flex, và cái
          bọc này chỉ có một việc — bật/tắt theo bề ngang. `min-w-0` để cột vẽ bên trong
          co được (không có nó thì SVG 100% đẩy cả trang cuộn ngang). */}
      <div className="hidden min-w-0 xl:block">
        <TuongLaiConsole />
      </div>
    </div>
  )
}

/**
 * Ruột console. Tách khỏi vỏ để cổng bề ngang là CSS thuần: ở dưới 1280px cây này không
 * được dựng, nên không có query nào chạy và không có ResizeObserver nào bám vào một hộp
 * đang `display:none` (pane ẩn làm phép đo sai — rAF ngừng, transition đứng ở 0).
 */
function TuongLaiConsole() {
  const {
    scenarios,
    active,
    activeId,
    setActiveId,
    phases,
    events,
    rows,
    input,
    projectScenario,
    profile,
    isLoading,
    needsBirthYear,
    ensureFirstScenario,
    isCreatingFirstScenario,
    netWorth,
    netWorthReliable,
    netWorthLoading,
    duplicateActiveScenario,
    duplicatingScenario,
  } = useLifetime()

  // --- Cách ĐỌC bản chiếu (không thuộc kịch bản, không được ghi) ----------------------
  const [zoom, setZoom] = useState<PlotZoom>('all')
  const [showBand, setShowBand] = useState(true)
  const [showFire, setShowFire] = useState(true)
  const [log, setLog] = useState(false)
  const [hintsOpen, setHintsOpen] = useState(false)
  const [compareOn, setCompareOn] = useState(false)
  const [creating, setCreating] = useState(false)

  // --- Bản nháp (spec §12) -----------------------------------------------------------
  //
  // `null` = đang xem đúng bản đã lưu. Khác `null` = có một bản sao đang được vặn trong
  // bộ nhớ; KHÔNG có gì xuống Supabase cho tới khi bấm "Lưu vào kế hoạch" ở hàng 9
  // (`QuickTuneRow`) hoặc một trong ba nút của thanh nháp.
  //
  // Cùng khuôn với `LifetimeView` (màn cũ, sẽ nghỉ): nháp không tự biến mất khi trùng lại
  // bản gốc — `changes.length` mới là thứ quyết định thanh nháp hiện hay không.
  const [draft, setDraft] = useState<ScenarioDraft | null>(null)
  /** Đang chạy lệnh ghi — hai nút Lưu khoá lại để một cú bấm đôi không ra hai lệnh. */
  const [saving, setSaving] = useState(false)
  /**
   * Vị trí thanh "Chi mỗi năm ±" (hàng 9), PHẦN TRĂM so với bản đã lưu.
   *
   * State RIÊNG chứ không suy ra từ nháp: hiệu ứng của nó nằm rải trên `annualExpenseMinor`
   * của mọi chặng khai số tuyệt đối, và dò ngược một phần trăm chung từ mấy con số đã làm
   * tròn là một phép đoán — sửa tay chi của một chặng trong dock là đủ để phép đoán đó ra
   * số khác. Nó rơi về 0 ở đúng những chỗ nháp rơi (đổi kịch bản, Lưu, Bỏ).
   */
  const [expenseAdjPct, setExpenseAdjPct] = useState(0)
  /**
   * Cú sốc của hàng 10 (`StressPanel`). KHÔNG thuộc bản nháp và không bao giờ được ghi:
   * "nếu năm 2030 khủng hoảng" là một câu hỏi, không phải một dự định của người dùng (xem
   * đầu file StressPanel.tsx). Vì vậy nó ở một state riêng, và thanh nháp KHÔNG bật lên
   * khi bật cú sốc.
   */
  const [stress, setStress] = useState<StressConfig>(NO_STRESS)
  /** Hàng 10 đang bung hay còn là chip thu gọn. */
  const [stressOpen, setStressOpen] = useState(false)
  /** Bộ đếm sinh id cho chặng/mốc vừa thêm — hai dòng trùng id thì React dựng nhầm và
   *  `planDraftSave` ghi nhầm (xem `addDraftPhase`). MỘT bộ đếm cho cả ba đường thêm
   *  (chặng, mốc, mẫu): hai bộ đếm độc lập là hai chuỗi số có thể gặp nhau. */
  const newIdSeed = useRef(0)
  /** Đang chọn chặng/mốc nào — `pick`/`sel` của bản vẽ. Dock đọc để dispatch. */
  const [sel, setSel] = useState<DockSelection>({ type: 'none' })

  // --- Bảng chọn nhanh (Task 13) ------------------------------------------------------
  //
  // State ở TRANG chứ trong `TimelinePlot`: bảng phải đóng được bằng `Esc` (lớp bàn phím
  // ở đây), và nó ghi vào bản nháp — cả hai thứ đó sống ở trang. Vùng vẽ chỉ báo ra cử
  // chỉ và chỗ bấm, vì chỉ nó biết phép chiếu năm→pixel.
  const [quick, setQuick] = useState<{ span: YearSpan; at: PlotPoint } | null>(null)
  /** Tay cầm của vùng vẽ — `←`/`→` khi không chọn gì dời vạch rê chuột qua đây. */
  const plotRef = useRef<TimelinePlotHandle>(null)

  // --- Hoàn tác một bậc cho việc XOÁ (Task 14) ---------------------------------------
  //
  // `makeUndo` (undoStack.ts, thuần, có phép thử) — một bậc, cửa sổ 9 giây, đúng thời
  // lượng toast của bản vẽ. Không viết bản thứ hai ở đây.
  const undo = useMemo(() => makeUndo<ScenarioDraft>(), [])
  /** Câu trên toast, ví dụ `Đã xoá mốc "Mua nhà"`. `null` = không có toast. */
  const [undoLabel, setUndoLabel] = useState<string | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hideUndoToast = useCallback(() => {
    if (undoTimer.current !== null) {
      clearTimeout(undoTimer.current)
      undoTimer.current = null
    }
    setUndoLabel(null)
  }, [])
  // Dọn hẹn giờ lúc rời màn: một `setUndoLabel` gọi sau khi cây đã tháo là một cảnh báo
  // trong console và một chỗ rò bộ nhớ nhỏ.
  useEffect(() => () => hideUndoToast(), [hideUndoToast])

  // Đổi kịch bản thì nháp phải rơi: nó là bản sao của kịch bản CŨ, giữ lại là âm thầm áp
  // thu/chi/mốc của kịch bản này lên kịch bản kia. Lựa chọn cũng rơi — id không còn thuộc
  // kịch bản đang xem. Bản chụp hoàn tác CŨNG rơi: nó chứa chặng/mốc của kịch bản cũ, và
  // bấm "Hoàn tác" sau khi đổi kịch bản sẽ đổ nguyên chúng vào kịch bản mới.
  useEffect(() => {
    setDraft(null)
    setExpenseAdjPct(0)
    setSel({ type: 'none' })
    setQuick(null)
    undo.clear()
    hideUndoToast()
  }, [activeId, undo, hideUndoToast])

  /** Ảnh chụp bản ĐÃ LƯU, dạng nháp — gốc quy chiếu của mọi phép so và mọi lệnh ghi. */
  const savedDraft = useMemo(
    () => (active ? draftFromRows(active, phases, events) : null),
    [active, phases, events],
  )
  const working = draft ?? savedDraft

  /** Sửa bản nháp. Chưa có nháp thì tạo từ bản đã lưu — người dùng không phải "bắt đầu
   *  một bản nháp", họ chỉ bấm một chặng rồi gõ. */
  const editDraft = useCallback(
    (mut: (d: ScenarioDraft) => ScenarioDraft) => {
      setDraft((cur) => {
        const base = cur ?? savedDraft
        return base ? mut(base) : cur
      })
    },
    [savedDraft],
  )

  /**
   * Gieo lại bộ cú sốc MỘT LẦN cho mỗi kịch bản.
   *
   * Vì sao không dùng thẳng `NO_STRESS`: nhãn của từng công tắc in ra chính mấy con số
   * bên trong, nên trước khi bật thì dòng phụ đọc thành "chi thêm 0 năm 0". Và mang
   * nguyên bộ sốc của kịch bản này sang kịch bản khác thì mấy con số năm trong đó có thể
   * rơi ngoài khoảng chiếu của kịch bản mới mà không ai để ý — xem `defaultStress`.
   */
  const stressSeededFor = useRef<string | null>(null)
  useEffect(() => {
    if (!active || !input || stressSeededFor.current === active.id) return
    stressSeededFor.current = active.id
    setStress(defaultStress(input.currentYear, rows[0]?.expenseMinor ?? 0))
  }, [active, input, rows])

  /**
   * Tỷ giá HÔM NAY, nền là tiền hiển thị của kịch bản. CÙNG `queryKey` với `useLifetime`
   * nên React Query trả thẳng từ cache — không có lượt tải thứ hai.
   *
   * Trang cần nó cho đúng một việc: biết bản chiếu có dòng nào KHÔNG quy đổi được hay
   * không. `useLifetime` chuẩn hoá tiền bên trong rồi bỏ cờ `hasMissingRate` đi, nên nếu
   * không tự tra lại thì màn này im lặng về một tổng đang bị thiếu.
   */
  const ratesQ = useQuery({
    queryKey: ['lifetime-rates-for', active?.display_currency],
    queryFn: () => fetchRates(active?.display_currency as CurrencyCode),
    enabled: !!active,
    staleTime: 12 * 3600_000,
    gcTime: 24 * 3600_000,
    retry: 1,
  })
  const pageFxOf = useMemo(
    () => fxOfRates((active?.display_currency as CurrencyCode) ?? 'JPY', ratesQ.data ?? {}),
    [active?.display_currency, ratesQ.data],
  )

  /**
   * Bản chiếu ĐANG XEM — từ bản NHÁP, không từ dòng đã lưu. Đây là điều làm dock có
   * nghĩa: vặn tới đâu đồ thị đổi tới đó (spec §12).
   *
   * `draftToInput` đè phases/events của nháp lên input đã ráp, mà nháp mang `fxToDisplay`
   * ĐÃ LƯU — con số cũ, không phải tỷ giá hôm nay. Nên phải chuẩn hoá LẠI sau đó, đúng
   * như `buildInputFor` làm cho bản đã lưu: thiếu bước này thì đổi tiền của một chặng
   * xong, bản chiếu vẫn nhân theo tỷ giá cũ (đã bắt được trên app thật 2026-08-24).
   */
  const shownInput = useMemo(() => {
    if (!input || !working) return input
    const base = draftToInput(input, working)
    const norm = normalizeToPhaseCurrency(base.phases, base.events, base.displayCurrency, pageFxOf)
    return { ...base, phases: norm.phases, events: norm.events }
  }, [input, working, pageFxOf])
  const shownRows = useMemo(() => (shownInput ? projectLifetime(shownInput) : []), [shownInput])

  // --- Nháp đang đổi những gì, và đường GHI (spec §12) --------------------------------
  //
  // `changes` là DỮ LIỆU (`DraftChange[]`), không phải chuỗi — số tiền phải đi qua
  // `formatCompact` mà `draft.ts` cố ý không được biết tới. Hai chỗ hiện nó (thanh nháp ở
  // đầu trang và dòng chênh lệch ở hàng 9) dùng CÙNG `changeParts`, nên không có hai lối
  // nói cho cùng một cú vặn.
  const changes = useMemo(
    () => (savedDraft && draft ? draftChanges(savedDraft, draft) : []),
    [savedDraft, draft],
  )
  const dirty = changes.length > 0

  /**
   * "Trước" dùng chung cho cả thanh nháp lẫn hàng 9 — MỘT phép tính, hai nơi hiện
   * (`DraftBanner.endBeforeMinor` và tham số thứ ba của `changeParts` ở hàng 9). Từng có
   * hai bản chép tay của đúng ba dòng này; gộp lại vì nó khoá một hợp đồng tế nhị của
   * `changeParts`: `null` khi tiền hiển thị của nháp đã đổi so với bản đã lưu, bởi lúc đó
   * so "3M → 299M" chỉ nói lên TỶ GIÁ chứ không phải một khoản lời/lỗ thật.
   */
  const endBeforeMinor = useMemo(
    () =>
      !working || working.displayCurrency !== savedDraft?.displayCurrency || rows.length === 0
        ? null
        : rows[rows.length - 1].assetsEndMinor,
    [working, savedDraft, rows],
  )

  /**
   * Bản chiếu CÓ cú sốc — `null` khi không cú nào bật.
   *
   * Đây là chỗ chứng minh "stress không sửa kế hoạch": nó chiếu từ `shownInput` (bản
   * nháp) với `stress` ghép vào ĐÚNG LÚC GỌI, không đi qua `setDraft` và không có đường
   * nào tới `commitDraft`. `projectLifetime` không sửa đối số của nó (xem project.ts), nên
   * `shownInput`, `working` và `draft` đều nguyên vẹn sau lượt chiếu này.
   */
  const stressRows = useMemo(() => {
    if (!shownInput || !hasStress(stress)) return null
    return projectLifetime({ ...shownInput, stress })
  }, [shownInput, stress])

  const qc = useQueryClient()
  const refreshTree = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['lifeScenarios'] }),
      qc.invalidateQueries({ queryKey: ['lifePhases'] }),
      qc.invalidateQueries({ queryKey: ['lifeEvents'] }),
    ])
  }, [qc])

  /** Bỏ nháp — đường ra không mất gì ngoài chính lượt vặn. */
  const discardDraft = useCallback(() => {
    setDraft(null)
    setExpenseAdjPct(0)
  }, [])

  /**
   * GHI nháp đè lên chính kịch bản của nó. Cùng khuôn `LifetimeView.handleCommit`.
   *
   * Dọn nháp SAU khi ghi xong, và KHÔNG dọn khi lỗi: dọn trước thì một lệnh hỏng để người
   * dùng nhìn lại bản cũ mà không biết mình vừa mất những gì, còn dọn khi lỗi là phạt họ
   * vì mạng hỏng.
   */
  const handleCommit = useCallback(async () => {
    if (!savedDraft || !draft || saving) return
    setSaving(true)
    try {
      await commitDraft({ saved: savedDraft, draft, afterWrite: refreshTree })
      setDraft(null)
      setExpenseAdjPct(0)
      showToast('Đã lưu vào kế hoạch.', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không lưu được.', 'error')
    } finally {
      setSaving(false)
    }
  }, [savedDraft, draft, saving, refreshTree])

  /**
   * Tạo một kịch bản MỚI mang nội dung nháp, để nguyên bản gốc.
   *
   * Đường ra quan trọng nhất của cả tính năng vặn thử và vì thế phải còn ở console: phần
   * lớn lượt vặn là để SO ("về VN thì sao"), mà bắt người dùng chọn giữa ghi đè kịch bản
   * đang có và mất hết những gì vừa vặn là ép họ hy sinh một trong hai câu trả lời.
   */
  const handleSaveAsNew = useCallback(async () => {
    if (!active || !draft || saving) return
    setSaving(true)
    try {
      const copy = await saveDraftAsNewScenario({
        draft,
        source: active,
        name: `${active.name} (thử)`,
        afterCreate: refreshTree,
      })
      setDraft(null)
      setExpenseAdjPct(0)
      setActiveId(copy.id)
      showToast(`Đã lưu thành "${copy.name}" — bản gốc giữ nguyên.`, 'success')
    } catch (err) {
      showToast(
        err instanceof Error
          ? `${err.message} — kiểm dải chip kịch bản, có thể đã tạo một bản dở dang.`
          : 'Không tạo được kịch bản mới.',
        'error',
      )
    } finally {
      setSaving(false)
    }
  }, [active, draft, saving, refreshTree, setActiveId])

  /**
   * Có dòng nào thiếu tỷ giá không. Quy ước toàn repo: thiếu rate thì LOẠI khoản đó ra
   * và bật cờ, KHÔNG bao giờ quy 1:1 — thà thiếu còn hơn bịa. Ở đây cờ đó thành dấu `≈`
   * trên tiêu đề và một câu nói rõ đơn vị nào chưa tra được.
   */
  const missingRateCurrencies = useMemo(() => {
    if (!shownInput) return []
    const coTien = new Set<CurrencyCode>()
    for (const p of shownInput.phases) coTien.add(p.currency)
    for (const e of shownInput.events) coTien.add(e.currency)
    return [...coTien].filter((c) => pageFxOf(c, shownInput.displayCurrency) === null)
  }, [shownInput, pageFxOf])

  // Ngày hôm nay ở dạng ISO — cần TRƯỚC `biggestExpense` bên dưới (bản đồ khoản lớn tính
  // "còn bao nhiêu tháng" từ ngày này), nên khai sớm hơn vị trí cũ (đứng cạnh `verdict`).
  const todayISO = toISODate(new Date())

  /**
   * Khoản lớn nhất — cho hàng "Khoản lớn nhất" của thẻ Tóm tắt kế hoạch (dock, trạng
   * thái không chọn gì). CÙNG bản đồ mà `BigExpenseMapSection` (hàng 12) đã dựng — ba
   * nguồn mốc (sự kiện kịch bản, khoản sắp chi, mục tiêu tiết kiệm), CÙNG ba hook đọc dữ
   * liệu — chỉ khác ở việc `biggestExpenseItem` chọn ra MỘT dòng nặng nhất thay vì vẽ cả
   * danh sách. Không tính lại: `buildBigExpenseMap`/`biggestExpenseItem` đều thuần, xem
   * bigExpenses.ts.
   */
  const { data: plannedForBigMap = [] } = usePlannedExpenses()
  const { data: goalsForBigMap = [] } = useSavingsGoals()
  const { data: balancesForBigMap = [] } = useAccountBalances()
  const biggestExpense = useMemo(() => {
    if (!shownInput) return null
    const balanceById = new Map(balancesForBigMap.map((b) => [b.id, b]))
    const goalInputs: GoalLikeInput[] = goalsForBigMap.map((g) => {
      const acc = balanceById.get(g.account_id)
      return {
        id: g.id,
        name: g.name,
        targetMinor: g.target_amount,
        progressMinor: acc ? (acc.market_value ?? acc.balance) : 0,
        currency: (acc?.currency ?? shownInput.displayCurrency) as CurrencyCode,
        targetDate: g.target_date,
      }
    })
    const map = buildBigExpenseMap({
      todayISO,
      displayCurrency: shownInput.displayCurrency,
      events: shownInput.events,
      planned: plannedForBigMap.filter((p) => p.status === 'planned'),
      goals: goalInputs,
      fxOf: pageFxOf,
    })
    const item = biggestExpenseItem(map)
    return item && item.remainingMinor !== null
      ? { label: item.label, amountMinor: item.remainingMinor }
      : null
  }, [shownInput, balancesForBigMap, goalsForBigMap, plannedForBigMap, pageFxOf, todayISO])

  // --- Kịch bản so sánh ---------------------------------------------------------------
  //
  // Một công tắc, vẽ MỌI kịch bản khác — đúng nút "So sánh" của bản vẽ, không phải một
  // nút "So" trên từng thẻ. Kịch bản khác ĐƠN VỊ TIỀN bị loại và nói ra lý do: một chuỗi
  // số USD vẽ lên trục ¥ là sai im lặng (xem chartSeries.ts).
  const comparisons = useMemo<ComparisonLine[]>(() => {
    if (!compareOn || !active) return []
    return scenarios
      .filter((s) => s.id !== active.id && s.display_currency === active.display_currency)
      .map((s, i) => ({
        id: s.id,
        name: s.name,
        rows: projectScenario(s.id),
        color: COMPARE_COLORS[i % COMPARE_COLORS.length],
      }))
      .filter((c) => c.rows.length > 0)
  }, [compareOn, active, scenarios, projectScenario])

  const compareSkipped = useMemo(() => {
    if (!compareOn || !active) return 0
    return scenarios.filter(
      (s) => s.id !== active.id && s.display_currency !== active.display_currency,
    ).length
  }, [compareOn, active, scenarios])

  // --- Kết luận (dải thống kê hàng 3) -------------------------------------------------
  const verdict = useMemo(
    () => (shownInput && shownRows.length > 0 ? lifetimeVerdict(shownRows, shownInput.birthYear) : null),
    [shownInput, shownRows],
  )
  const atEnd = useMemo(
    () => (shownInput && shownRows.length > 0 ? assetsAtAge(shownRows, shownInput.endAge) : null),
    [shownInput, shownRows],
  )

  const handleCreateFirst = useCallback(async () => {
    setCreating(true)
    try {
      await ensureFirstScenario()
    } finally {
      setCreating(false)
    }
  }, [ensureFirstScenario])

  // ===== Đường GHI và lớp BÀN PHÍM — khai TRƯỚC ba cổng bên dưới =====
  //
  // Vì sao ở đây chứ không cạnh chỗ dùng: `useConsoleKeys` là một HOOK, nên nó phải được
  // gọi vô điều kiện ở mọi lần render — sau một `return` sớm là vi phạm luật hook và React
  // sẽ nổ khi trạng thái tải đổi. Kéo theo đó, mọi thứ nó cần cũng phải khai trên này:
  // hai con số năm, và các đường dời/xoá.

  /** Năm hiện tại của bản chiếu. Rơi về năm thật của máy khi chưa tải xong — chỉ dùng cho
   *  lượt render trước cổng, lúc chưa có gì để sửa. */
  const currentYear = shownInput?.currentYear ?? new Date().getFullYear()
  /** Năm cuối bản chiếu — "đến năm" của chặng CUỐI (chặng cuối chạy tới hết bản chiếu). */
  const lastYear = shownRows.length > 0 ? shownRows[shownRows.length - 1].year : currentYear

  // --- SỐ THẬT 12 THÁNG TỪ SỔ (spec §13, "không được để mất") -------------------------
  //
  // MỘT phép tính, HAI chỗ đọc: dòng "đời thật" của hàng 4 (`realityCheck`) và ô "Lấy số
  // thật từ một danh mục…" trong dock (`chiTheoDanhMuc`). Hai chỗ tính riêng là hai con
  // số khác nhau cho cùng một câu "12 tháng qua bạn tiêu bao nhiêu".
  //
  // GIÁ PHẢI TRẢ, nói ra để không ai tưởng nó miễn phí: `useRangeTransactions` là một
  // query MÀN NÀY CHƯA TỪNG CHẠY. `useLifetime` cũng nạp dải này nhưng chỉ khi CHƯA có
  // kịch bản nào (để tạo kịch bản đầu tiên), tức đúng ca console không dựng gì. Cùng
  // `queryKey` (`['transactions', start, end]`) và cùng `baselineRange`, nên khi cả hai
  // cùng bật thì React Query trả một bảng, không tải hai lần. `useAccounts`/`useCategories`
  // thì `useLifetime` đã nạp vô điều kiện — hai lượt gọi này về từ cache.
  const { data: baselineAccounts = [] } = useAccounts()
  const { data: baselineCategories = [] } = useCategories()
  const baselineTxRange = useMemo(() => baselineRange(todayISO), [todayISO])
  const baselineTxQ = useRangeTransactions(baselineTxRange)
  /**
   * Chặng ĐANG CHẠY, đọc từ bản nháp — sổ chỉ nói được về hôm nay, nên số thật chỉ có
   * nghĩa khi đặt cạnh chặng của hôm nay. Cùng cặp `draftPhaseIndex` + `shownInput.phases`
   * mà màn cũ dùng (`draftToInput` giữ nguyên thứ tự chặng, nên chỉ số dùng chung được).
   */
  const baselinePhase = useMemo(() => {
    if (!working || !shownInput) return null
    const i = draftPhaseIndex(working, currentYear)
    return i >= 0 ? (shownInput.phases[i] ?? null) : null
  }, [working, shownInput, currentYear])
  /**
   * Thu/chi thật đã quy năm hoá, theo TIỀN CỦA CHẶNG đang chạy. `suggestBaseline` tự lọc
   * giao dịch cùng đơn vị tiền và KHÔNG quy đổi (xem baseline.ts) — truyền tiền hiển thị
   * vào đây thay vì tiền của chặng là lấy sai tập giao dịch.
   *
   * `null` CHO TỚI KHI sổ về (`isSuccess`), không rơi về một mảng rỗng: `suggestBaseline`
   * trên 0 giao dịch trả thu 0 / chi 0, thứ `realityCheck` đọc thành "kế hoạch để dành X,
   * sổ ghi 0" — một cảnh báo sai chớp lên ở mỗi lượt tải, và một cảnh báo sai ở đúng chỗ
   * người dùng tới để tin số. Quy ước toàn repo: thà thiếu còn hơn bịa.
   */
  const baseline = useMemo(
    () =>
      baselinePhase && baselineTxQ.isSuccess
        ? suggestBaseline(
            baselineTxQ.data ?? [],
            baselineCategories,
            makeCurrencyOf(baselineAccounts, (profile?.base_currency as CurrencyCode) ?? 'JPY'),
            baselinePhase.currency,
            todayISO,
          )
        : null,
    [
      baselinePhase,
      baselineTxQ.isSuccess,
      baselineTxQ.data,
      baselineCategories,
      baselineAccounts,
      profile?.base_currency,
      todayISO,
    ],
  )
  /** Kế hoạch vs sổ thật — hàng 4 hiện một dòng khi lệch đủ lớn (realityCheck.ts). */
  const reality = useMemo(
    () => (shownInput && baseline ? realityCheck(shownInput, baseline) : null),
    [shownInput, baseline],
  )

  // --- LỊCH SỬ KẾT LUẬN (migration 0055, spec §13) ------------------------------------
  //
  // Đây là NGOẠI LỆ DUY NHẤT của luật "mọi lệnh ghi đi qua bản nháp" trên màn này: một
  // dòng lịch sử không phải một dự định của người dùng để chờ họ bấm Lưu, nó là ảnh chụp
  // kết luận của THÁNG NÀY. Không ghi thì màn không có ký ức, và câu "kết luận của bạn đã
  // đổi so với tháng trước" không bao giờ nói được.
  //
  // Ghi từ `input`/`rows` (bản ĐÃ LƯU, chưa qua nháp, chưa qua cú sốc): lịch sử phải là
  // kế hoạch thật, không phải những lần vặn thử. Một dòng mỗi tháng tài chính mỗi kịch
  // bản; mở lại trong tháng thì ghi đè.
  const monthStartDay = profile?.month_start_day ?? 1
  const thisMonthOn = useMemo(
    () => getMonthRange(monthKeyForDate(todayISO, monthStartDay), monthStartDay).start,
    [todayISO, monthStartDay],
  )
  const verdictNow = useMemo((): VerdictPoint | null => {
    if (!input || rows.length === 0) return null
    const v = lifetimeVerdict(rows, input.birthYear)
    const end = assetsAtAge(rows, input.endAge)
    if (!end) return null
    return {
      month_on: thisMonthOn,
      fire_year: v.fireYear,
      negative_year: v.negativeYear,
      end_age: input.endAge,
      assets_end_minor: end.center,
      display_currency: input.displayCurrency,
    }
  }, [input, rows, thisMonthOn])
  const verdictHistoryQ = useLifetimeVerdictSnapshots(active?.id)
  const upsertVerdict = useUpsertLifetimeVerdictSnapshot()
  /**
   * Thẻ chống ghi lặp: MỘT lệnh ghi cho mỗi (kịch bản, kết luận) trong phiên.
   *
   * Không thể chỉ dựa vào mảng phụ thuộc của effect: `upsertVerdict` là kết quả
   * `useMutation`, một object MỚI ở mỗi lượt render, nên effect chạy lại sau mỗi lần
   * `setState` của cả trang (rê chuột trên đồ thị là hàng chục lượt). Khoá bằng chuỗi
   * NỘI DUNG của kết luận, nên Lưu nháp làm kết luận đổi thì ghi lại, còn render lại thì
   * không. `recordedVerdict` được đặt TRƯỚC khi gọi `mutate` — hai lượt effect của chế độ
   * Strict trong React không ra hai lệnh ghi.
   */
  const recordedVerdict = useRef<string | null>(null)
  useEffect(() => {
    if (!active || !verdictNow) return
    const key = `${active.id}|${JSON.stringify(verdictNow)}`
    if (recordedVerdict.current === key) return
    recordedVerdict.current = key
    upsertVerdict.mutate({ scenario_id: active.id, ...verdictNow })
  }, [active, verdictNow, upsertVerdict])
  /** Kết luận đã trôi thế nào so với mốc cũ nhất trong 6 tháng (verdictHistory.ts). */
  const drift = useMemo(
    () => (verdictNow ? verdictDrift(verdictHistoryQ.data ?? [], thisMonthOn, verdictNow) : null),
    [verdictNow, verdictHistoryQ.data, thisMonthOn],
  )

  /**
   * Dời năm bắt đầu của một chặng — đường ghi DUY NHẤT của dải chặng đời (kéo khối, kéo
   * hai mép, và ô năm trong dock đều về đây).
   *
   * Chặn ngay trong mutator và chặn theo `d.phases`, không theo `working.phases`: lượt kéo
   * gộp theo nhịp khung hình nên hai lần gọi liên tiếp có thể cùng đọc một `working` cũ,
   * và một phép chặn tính trên mảng cũ sẽ cho ra năm trùng với chặng vừa dời
   * (`unique (scenario_id, start_year)`, migration 0031).
   *
   * `clampPhaseStartYear` là chỗ DUY NHẤT khai luật này (Bất biến 1: chặng đầu khoá ở năm
   * hiện tại; Bất biến 2: sàn và không trùng năm) — cùng hàm mà ô năm trong dock dùng, nên
   * kéo và gõ không thể cho ra hai kết quả khác nhau. Hệ quả cần biết: kéo một chặng VƯỢT
   * QUA chặng bên cạnh thì nó nhận năm trống gần nhất và hai chặng ĐỔI THỨ TỰ, chứ không
   * bị chặn lại ở sát bên — đúng như gõ năm đó vào ô.
   *
   * ĐƯỜNG BÀN PHÍM KHÔNG ĐI QUA ĐÂY — xem `nudgePhase` ngay dưới.
   */
  const movePhaseStart = useCallback(
    (id: string, wanted: number) =>
      editDraft((d) =>
        patchDraftPhase(d, id, { startYear: clampPhaseStartYear(d.phases, id, wanted, currentYear) }),
      ),
    [editDraft, currentYear],
  )

  /**
   * `←`/`→` trên một chặng đang chọn: CHẶN tại chặng liền kề
   * (`blockPhaseStartYearAtNeighbours`), KHÔNG dò-năm-trống-rồi-nhảy như `movePhaseStart`.
   *
   * Đây là phát hiện review 2026-09-09 Finding 2, và nó đúng với cả lớp bàn phím toàn
   * trang: hai chặng liền năm (2035, 2036) — một cú → duy nhất trên chặng 2035 xin 2036,
   * thấy có người, `clampPhaseStartYear` NHẢY qua 2037 và hai chặng đổi thứ tự. Một cú bấm
   * phím còn CHỦ Ý hơn một cú kéo lỡ tay, nên nó phải là NO-OP khi sát hàng xóm. `PhaseLane`
   * tự bắt ←/→ trên chính khối (khi khối đang có tiêu điểm) và đi qua đúng hàm này — hai
   * đường, một luật.
   */
  const nudgePhase = useCallback(
    (id: string, step: number) =>
      editDraft((d) => {
        const p = d.phases.find((x) => x.id === id)
        if (!p) return d
        return patchDraftPhase(d, id, {
          startYear: blockPhaseStartYearAtNeighbours(d.phases, id, p.startYear + step),
        })
      }),
    [editDraft],
  )

  /**
   * Dời năm BẮT ĐẦU của một mốc — GIỮ NGUYÊN ĐỘ DÀI.
   *
   * Giữ độ dài là điều bản vẽ làm (dòng 1310) và nó đúng: kéo "Nuôi con 2031–2053" sang
   * 2033 là dời cả quãng nuôi con, không phải cắt ngắn nó 2 năm. Mốc "tới hết đời"
   * (`endYear === null`) không có độ dài nào để giữ, và nó phải Ở LẠI `null` — đặt một năm
   * cho nó là lặng lẽ biến "đến hết đời" thành một khoảng có hạn.
   *
   * Chặn trong `[currentYear, lastYear]`: lượt KÉO đã bị `xToYear` kẹp trong khung nhìn,
   * nhưng đường BÀN PHÍM (←/→) thì không — và một mốc lùi về trước năm hiện tại thì không
   * còn năm nào trong bản chiếu để rơi vào.
   */
  const moveEventStart = useCallback(
    (id: string, wanted: number) =>
      editDraft((d) => {
        const e = d.events.find((x) => x.id === id)
        if (!e) return d
        const sy = Math.max(currentYear, Math.min(lastYear, Math.round(wanted)))
        const span = e.endYear === null ? null : e.endYear - e.startYear
        return patchDraftEvent(d, id, {
          startYear: sy,
          endYear: span === null ? null : Math.min(lastYear, sy + span),
        })
      }),
    [editDraft, currentYear, lastYear],
  )

  /**
   * Đổi năm KẾT THÚC. Sàn là `startYear + 1` — cùng sàn mà màn cũ dùng
   * (`LifetimeChartCard`): một mốc có `endYear === startYear` thì thanh độ dài dài 0px và
   * cái chốt rơi đúng dưới icon của chính nó, tức kéo được vào đó rồi không kéo ra được.
   */
  const moveEventEnd = useCallback(
    (id: string, wanted: number) =>
      editDraft((d) => {
        const e = d.events.find((x) => x.id === id)
        if (!e) return d
        return patchDraftEvent(d, id, {
          endYear: Math.max(e.startYear + 1, Math.min(lastYear, Math.round(wanted))),
        })
      }),
    [editDraft, lastYear],
  )

  /**
   * XOÁ một chặng/mốc, có hoàn tác. MỘT đường cho cả nút "Xoá" trong dock LẪN phím
   * `Delete`/`Backspace` — hai đường là một chỗ để nút Xoá không chụp bản hoàn tác.
   *
   * Chụp `working` (cả bản nháp) TRƯỚC khi xoá, không chụp riêng dòng bị xoá: xoá một chặng
   * còn dời cả biên của chặng bên cạnh trên dải, và một bản chụp "chỉ dòng đó" phải tự dựng
   * lại thứ tự — `makeUndo` vốn tổng quát theo kiểu bản chụp đúng để tránh việc đó.
   *
   * Đọc `working` thẳng (không qua mutator của `setDraft`): xoá là một thao tác RỜI, không
   * phải chuỗi gộp theo nhịp khung hình như lượt kéo — và một tác dụng phụ (`undo.push`)
   * đặt trong mutator sẽ chạy HAI LẦN ở chế độ Strict của React.
   */
  const removeWithUndo = useCallback(
    (what: 'phase' | 'event', id: string) => {
      const base = working
      if (!base) return
      const label =
        what === 'phase'
          ? base.phases.find((p) => p.id === id)?.label
          : base.events.find((e) => e.id === id)?.label
      if (label === undefined) return
      const cau = `Đã xoá ${what === 'phase' ? 'chặng' : 'mốc'} "${label}"`
      undo.push(cau, base)
      setDraft(what === 'phase' ? removeDraftPhase(base, id) : removeDraftEvent(base, id))
      // Bỏ chọn NGAY: id vừa xoá không còn dòng nào, và dock rơi về thẻ tóm tắt thay vì
      // một panel rỗng.
      setSel({ type: 'none' })
      if (undoTimer.current !== null) clearTimeout(undoTimer.current)
      setUndoLabel(cau)
      // Toast tắt đúng lúc cửa sổ hoàn tác hết hạn — một nút "Hoàn tác" còn trên màn sau
      // khi `makeUndo` đã coi bản chụp là hết hạn thì bấm vào không làm gì cả.
      undoTimer.current = setTimeout(() => {
        undoTimer.current = null
        setUndoLabel(null)
      }, UNDO_WINDOW_MS)
    },
    [working, undo],
  )

  const deleteSelected = useCallback(() => {
    if (sel.id === undefined) return
    if (sel.type === 'phase' || sel.type === 'event') removeWithUndo(sel.type, sel.id)
  }, [sel, removeWithUndo])

  const doUndo = useCallback(() => {
    const e = undo.take()
    if (e === null) return
    setDraft(e.snapshot)
    hideUndoToast()
  }, [undo, hideUndoToast])

  /**
   * `Esc` — đóng thứ đang mở TRÊN CÙNG, một lớp mỗi lần bấm. Thứ tự ưu tiên là MỘT hàm
   * thuần có test (`topLayer`, `topLayer.ts`), không phải một chuỗi `if` viết tay ở đây —
   * xem lời ghi ở đó cho lý do (Finding 3, review 2026-09-09: hai lớp từng báo "đã xử lý
   * Esc" bằng hai cơ chế khác nhau mà không phép thử nào thấy được).
   *
   * Popover trong dock (`pick`) tự lo phần của nó bằng `Esc` RIÊNG, ở pha capture,
   * `preventDefault()` TRƯỚC khi sự kiện tới được listener của trang (xem
   * `PlanDockParts.tsx`) — nên nó không bao giờ thật sự chạy tới `closeTop`. Luôn truyền
   * `false` ở đây là đúng: `pick` sống trong `IdentityRow`, trang không có state đó. Cùng
   * lý do, `drawer` luôn `false` — `PlanListDrawer` chưa dựng.
   */
  const closeTop = useCallback(() => {
    const layer = topLayer({
      quick: quick !== null,
      pick: false,
      hints: hintsOpen,
      drawer: false,
      sel: sel.type !== 'none',
    })
    if (layer === 'quick') {
      setQuick(null)
      return
    }
    if (layer === 'hints') {
      setHintsOpen(false)
      return
    }
    if (layer === 'sel') {
      setSel((cur) => (cur.type === 'none' ? cur : { type: 'none' }))
    }
  }, [quick, hintsOpen, sel])

  /** `←`/`→` — thứ đang chọn, hoặc vạch rê chuột khi không chọn gì (README). */
  const nudge = useCallback(
    (step: -1 | 1) => {
      if (sel.type === 'phase' && sel.id !== undefined) {
        nudgePhase(sel.id, step)
        return
      }
      if (sel.type === 'event' && sel.id !== undefined) {
        const e = working?.events.find((x) => x.id === sel.id)
        if (e) moveEventStart(sel.id, e.startYear + step)
        return
      }
      plotRef.current?.nudgeHover(step)
    },
    [sel, working, nudgePhase, moveEventStart],
  )

  useConsoleKeys({ onClose: closeTop, onDelete: deleteSelected, onUndo: doUndo, onNudge: nudge })

  if (isLoading) return <EmptyState>Đang tải…</EmptyState>

  // --- Cổng 2: chưa khai năm sinh — không chiếu được gì nếu thiếu nó ---
  if (needsBirthYear) return <BirthYearCard />

  // --- Cổng 3: chưa có kịch bản nào ---
  if (scenarios.length === 0) {
    return (
      <Card as="section">
        <p className="text-sm text-fg-secondary">
          Màn này chiếu tài sản ròng của bạn tới hết đời, dựa trên thu chi nền và các mốc
          (cưới, sinh con, nghỉ hưu…). Tạo kịch bản đầu tiên từ đúng chi tiêu thật của bạn —
          không cần khai tay từng con số.
        </p>

        {/* Tài sản khởi điểm của kịch bản = tài sản ròng hiện tại. Hiện rõ số này TRƯỚC
            khi bấm: bắt đầu từ 0 dù đang có tiền là ấn tượng đầu tiên tệ nhất có thể. */}
        {!netWorthLoading && profile && (
          <p
            className={`mt-2 rounded-md p-2.5 text-sm ${
              netWorthReliable
                ? 'bg-surface-sunken text-fg-secondary'
                : 'bg-state-warn-bg text-state-warn-fg'
            }`}
          >
            {netWorthReliable ? (
              <>
                Tài sản khởi điểm sẽ lấy từ tài sản ròng hiện tại:{' '}
                <Money amount={netWorth} currency={profile.base_currency as CurrencyCode} />.
              </>
            ) : (
              <>
                Một phần tài khoản/công nợ chưa quy đổi được tỷ giá nên chưa tính được tài
                sản ròng đáng tin. Tài sản khởi điểm sẽ để 0 — sửa lại sau khi tạo.
              </>
            )}
          </p>
        )}

        {!profile && (
          <p className="mt-2 rounded-md bg-state-warn-bg p-2.5 text-sm text-state-warn-fg">
            Chưa tải được thông tin người dùng (năm sinh, tiền gốc) nên chưa tạo được kịch
            bản — kiểm tra mạng rồi mở lại màn này.
          </p>
        )}

        <ActionButton
          variant="primary"
          disabled={creating || netWorthLoading || !profile}
          onClick={() => void handleCreateFirst()}
          className="mt-3 w-full"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {creating || isCreatingFirstScenario
            ? 'Đang tạo…'
            : netWorthLoading
              ? 'Đang tính tài sản ròng…'
              : 'Tạo kịch bản từ chi tiêu thật của tôi'}
        </ActionButton>
      </Card>
    )
  }

  // `scenarios.length > 0` nên `active` luôn có giá trị ở nhánh này; guard chỉ để TS thu
  // hẹp kiểu cho phần JSX bên dưới, không phải một trạng thái thật sẽ xảy ra.
  if (!active || !input || !shownInput || !working) return <EmptyState>Đang tải…</EmptyState>

  const currency = active.display_currency as CurrencyCode
  const birthYear = shownInput.birthYear
  /** Bao nhiêu cú sốc đang bật — huy hiệu trên chip hàng 10 khi nó còn thu gọn. */
  const stressCount = Object.values(stress).filter((v) => v.on).length

  /**
   * Bao nhiêu "tin mới" đang nằm trong panel hàng 4 lúc nó còn gập — huy hiệu trên chip
   * "Gợi ý & cách đọc". Xem lời ghi tại chỗ dùng cho lý do và cho lý do BỎ nút thử nghỉ
   * việc ra khỏi phép đếm.
   *
   * `drift` chỉ được đếm khi KHÔNG có nháp, khớp đúng điều kiện truyền `drift` xuống
   * `InsightCards` — đếm một dòng sẽ không hiện là hứa một thứ không có.
   */
  const tinMoi = (reality?.meaningful === true ? 1 : 0) + (!dirty && drift?.changed === true ? 1 : 0)

  /**
   * Khoảng năm ĐANG XEM. Cùng `viewRange` mà `TimelinePlot` gọi (plotFrame.ts), không phải
   * một phép tính thứ hai: dải chặng đời phải xem đúng khoảng của đồ thị, lệch một năm là
   * khối chặng không còn nằm dưới đúng đoạn đường của nó.
   */
  const [laneX0, laneX1] = viewRange(currentYear, lastYear, zoom)

  /**
   * Các `startYear` của chặng — nam châm ±1 năm khi kéo mốc bám vào chúng (bản vẽ:
   * `snapYear`). Đọc từ BẢN NHÁP: kéo một chặng rồi kéo một mốc thì nam châm phải bám vào
   * ranh giới MỚI, không phải ranh giới đã lưu.
   */
  const phaseStarts = working.phases.map((p) => p.startYear).sort((a, b) => a - b)

  // --- Bộ prop cho dock ---------------------------------------------------------------
  //
  // Đọc chặng TỪ BẢN NHÁP (`working`), không từ `shownInput`: panel ghi vào nháp bằng
  // `patchDraftPhase`, nên nó phải hiện đúng dòng nháp — `shownInput.phases` đã bị
  // `normalizeToPhaseCurrency` đè lại `fxToDisplay` và không mang `id` nào để trỏ vào.
  const selPhase = sel.type === 'phase' ? working.phases.find((p) => p.id === sel.id) : undefined
  const dockPhase =
    selPhase === undefined
      ? undefined
      : {
          phases: working.phases,
          phase: selPhase,
          displayCurrency: currency,
          currentYear,
          lastYear,
          onPatch: (patch: Parameters<typeof patchDraftPhase>[2]) =>
            editDraft((d) => patchDraftPhase(d, selPhase.id, patch)),
          // `setPhaseCurrency` (KHÔNG phải `patchDraftPhase`): đổi tiền của chặng còn
          // phải gắn nhãn lại mọi mốc rơi vào nó, không thì màn hình và bản chiếu nói
          // hai con số khác nhau.
          //
          // KHÔNG quy đổi số tiền ở đây — xem JSDoc `setPhaseCurrency` (draft.ts) và
          // comment ở `doiTien` (PlanDockPhase.tsx): quyết định đã chốt 2026-09-09, giữ
          // nguyên luật cũ dù bản vẽ 1c đòi quy đổi.
          onCurrency: (next: CurrencyCode) => editDraft((d) => setPhaseCurrency(d, selPhase.id, next)),
          onDuplicate: () => {
            const seed = ++newIdSeed.current
            // Năm của bản sao: ngay sau bản gốc, nhích tới năm còn trống —
            // `unique (scenario_id, start_year)` chặn năm trùng.
            //
            // `freePhaseStartYear`, KHÔNG `clampPhaseStartYear` với một chặng giả nhét vào
            // mảng: chặng giả đó có thể SẮP XẾP thành chặng đầu (khi `selPhase.startYear +
            // 1` thấp hơn mọi chặng đang có — hiếm nhưng có thể qua đường "+ Chặng đời mới
            // từ đây" tạo một chặng ở năm thấp), và khi đó `clampPhaseStartYear` rơi vào
            // Bất biến 1 (chặng đầu luôn = `currentYear`) mà KHÔNG kiểm trùng — ra đúng
            // năm chặng đầu THẬT đang giữ. Đây là gốc rễ phát hiện review 2026-09-09 #1;
            // `freePhaseStartYear` (phaseYear.ts) là câu trả lời riêng cho "một chặng MỚI
            // được sinh ở năm nào", có kiểm trùng thật.
            const y = freePhaseStartYear(working.phases, selPhase.startYear + 1, currentYear, lastYear)
            editDraft((d) =>
              addDraftPhase(
                d,
                {
                  startYear: y,
                  label: `${selPhase.label} (bản sao)`,
                  country: selPhase.country,
                  currency: selPhase.currency,
                  annualIncomeMinor: selPhase.annualIncomeMinor,
                  annualExpenseMinor: selPhase.annualExpenseMinor,
                  incomePctOfPrev: selPhase.incomePctOfPrev,
                  expensePctOfPrev: selPhase.expensePctOfPrev,
                  color: selPhase.color,
                  icon: selPhase.icon,
                  fxToDisplay: selPhase.fxToDisplay,
                },
                seed,
              ),
            )
          },
          // MỘT đường xoá cho cả nút này lẫn phím Delete — nút bấm phải hoàn tác được
          // hệt như phím, không thì "có hoàn tác" là một câu chỉ đúng một nửa.
          onRemove: () => removeWithUndo('phase', selPhase.id),
        }

  const selEvent = sel.type === 'event' ? working.events.find((e) => e.id === sel.id) : undefined
  /**
   * Chặng phủ năm bắt đầu của mốc — nguồn TÊN chặng ("Rơi vào chặng Z") và NƯỚC cho nút
   * "Tra hộ".
   *
   * Luật rơi về giống `currencyAt` (fxModel.ts): một mốc nằm TRƯỚC chặng đầu tiên vẫn
   * thuộc chặng sớm nhất — nói nó không thuộc chặng nào là bảo một khoản chi năm 2020
   * tính bằng đơn vị khác hẳn khoản chi năm 2026 của cùng một chặng. ĐƠN VỊ TIỀN thì
   * vẫn đi qua chính `currencyAt`, chỗ duy nhất khai luật đó.
   */
  const evPhase = selEvent === undefined ? null : phaseCovering(working.phases, selEvent.startYear)

  /** `PresetContext` cho các chip "Thêm mốc từ mẫu" — đọc chặng ĐANG HIỆU LỰC, đúng
   *  khuôn `buildPresetCtx` của màn cũ (LifetimeView), không dựng luật thứ hai. */
  const buildPresetCtx = (year: number): PresetContext => {
    const i = draftPhaseIndex(working, currentYear)
    const p = i >= 0 ? working.phases[i] : undefined
    return {
      scenarioId: working.scenarioId,
      year,
      birthYear,
      currency: p?.currency ?? currency,
      country: p?.country ?? null,
      currentIncomeMinor: p?.annualIncomeMinor ?? 0,
      currentExpenseMinor: p?.annualExpenseMinor ?? 0,
      fxToDisplay: p?.fxToDisplay ?? 1,
      displayCurrency: currency,
      fxOf: (c) => pageFxOf(c, currency),
    }
  }

  /**
   * "Thử nghỉ việc từ <năm FIRE>" (spec §13, tryRetire.ts) — cắm mẫu Nghỉ hưu vào năm đó
   * và kéo tuổi chiếu lên `RETIRE_TRIAL_MIN_END_AGE`, TRONG BẢN NHÁP.
   *
   * Vì sao nút này phải còn: "Không bao giờ âm" ở dải hàng 3 là câu trả lời DỄ — mô hình
   * cho người dùng đi làm tới tuổi cuối kịch bản, nên tiền không thể âm. Câu hỏi thật của
   * mốc FIRE là "nghỉ đúng năm đó thì tiền có đủ tới già không", và đây là chỗ duy nhất
   * trong app hỏi nó.
   *
   * Đi qua `editDraft` như mọi lượt vặn khác: thanh nháp bật lên, Bỏ là về như cũ. Luật
   * "có nên mời hay không" nằm ở `canOfferRetireTrial` (tryRetire.ts) và `InsightCards`
   * gọi nó — không chép lại ở đây để nút và mẫu không trôi lệch nhau.
   */
  const handleTryRetire = (year: number) => {
    const result = buildRetireTrial(shownInput, active.id, year, pageFxOf)
    if (!result) {
      showToast('Chưa có chặng nào để dựa vào — thêm chặng trước rồi thử lại.', 'error')
      return
    }
    const seed = ++newIdSeed.current
    editDraft((d) => applyRetireTrial(d, result, seed))
    const stretched = working.endAge < RETIRE_TRIAL_MIN_END_AGE
    showToast(
      `Đã thêm chặng Nghỉ hưu từ ${year}${stretched ? ` và kéo tuổi chiếu tới ${RETIRE_TRIAL_MIN_END_AGE}` : ''}. Đọc lại kết luận ở trên; không muốn giữ thì bấm Bỏ ở thanh nháp.`,
      'success',
      8000,
    )
  }

  /**
   * Thêm một mẫu TỪ BẢNG CHỌN NHANH — khoảng năm đã được bảng dịch sẵn qua
   * `applySpanToPreset` + `applySpanToResult`, nên ở đây chỉ còn hai việc: né năm trùng
   * cho mẫu sinh CHẶNG, và nhắm con trỏ vào thứ vừa thêm.
   *
   * Né năm trùng bằng `freePhaseStartYear` (không `clampPhaseStartYear` với một chặng giả
   * nhét vào mảng) và chỉ né khi mẫu THẬT SỰ sinh chặng — đúng hai quyết định đã ghi ở
   * `onAddPreset` của dock, xem lời ghi dài ở đó cho lý do (review 2026-09-09 #1 và #2).
   * Ba mẫu sinh chặng đều đặt `start_year: ctx.year`, nên phải DỰNG LẠI mẫu ở năm mới
   * chứ không sửa `start_year` tại chỗ: mẫu còn tính vài số khác theo `ctx.year`
   * (`nghi-huu` lấy năm nhận 年金 từ tuổi 65).
   */
  const addPresetFromBoard = (preset: LifePreset, apply: SpanApply, result: PresetResult) => {
    const seed = ++newIdSeed.current
    const nam =
      result.phases.length > 0
        ? freePhaseStartYear(working.phases, apply.year, currentYear, lastYear)
        : apply.year
    const final =
      nam === apply.year
        ? result
        : applySpanToResult(preset.build(buildPresetCtx(nam)), { ...apply, year: nam })
    editDraft((d) => applyPreset(d, final, seed))
    // Nhắm con trỏ vào thứ vừa thêm (spec §14). Mẫu chỉ sinh chặng thì giữ nguyên lựa
    // chọn — không có mốc để nhắm tới.
    if (final.events.length > 0) setSel({ type: 'event', id: presetEventId(seed, 0) })
    setQuick(null)
    showToast(
      `Đã thêm "${preset.label}" vào năm ${nam} — kiểm lại số rồi kéo tới đúng năm.`,
      'success',
    )
  }

  /**
   * "+ Mốc trống": một mốc CHI 0 đồng đúng khoảng đã chọn, rồi mở ngay bảng sửa trong dock.
   *
   * Số 0 là có chủ đích, khác mọi mẫu: mẫu đoán hộ một con số có nguồn tra cứu, còn mốc
   * trống thì không có gì để đoán — một con số bịa ở đây sẽ đi thẳng vào bản chiếu mà
   * không có câu "số mặc định, kiểm tra lại" nào che.
   *
   * Tiền thì KHÔNG để trống: nó suy ra từ chặng phủ năm đó (`currencyAt`, luật v5 của
   * `fxModel.ts`) cùng đúng `fxToDisplay` của chặng ấy — để `1` khi chặng dùng đơn vị khác
   * tiền hiển thị là bật cờ cảnh báo thiếu tỷ giá cho một dòng vốn không thiếu gì.
   */
  const addBlankFromBoard = (span: YearSpan) => {
    const seed = ++newIdSeed.current
    const sy = Math.max(currentYear, Math.min(lastYear, span.startYear))
    // Khoảng một năm → mốc một năm (`endYear === startYear`), đúng mặc định của mọi mốc
    // một lần trong `presets.ts`. Không để `null`: "tới hết đời" là một lựa chọn người
    // dùng phải tự khai, không phải thứ một cú bấm nền sinh ra.
    const ey = span.endYear > span.startYear ? Math.min(lastYear, span.endYear) : sy
    editDraft((d) => {
      const ph = phaseCovering(d.phases, sy)
      const tien = currencyAt(d.phases, sy, currency)
      return addDraftEvent(
        d,
        {
          startYear: sy,
          endYear: ey,
          kind: 'expense',
          amountMinor: 0,
          currency: tien,
          label: 'Mốc mới',
          note: '',
          fxToDisplay: tien === currency ? 1 : (ph?.fxToDisplay ?? 1),
          inflate: true,
          enabled: true,
          amountShape: 'per_year',
          endAmountMinor: null,
          growthBps: 0,
          repeatEveryYears: null,
          icon: '',
          replacesMinor: 0,
          replacesLabel: '',
          color: '',
          assetValueMinor: 0,
          assetChangeBps: 0,
          loanMinor: 0,
          loanRateBps: 0,
          loanYears: 0,
        },
        seed,
      ).draft
    })
    setSel({ type: 'event', id: addedEventId(seed) })
    setQuick(null)
  }

  /**
   * Chi thật theo danh mục cho ô "Thay cho khoản đang tiêu nào" của panel mốc — thứ biến
   * ô chống-đếm-hai-lần (migration 0067) từ "gõ một con số bạn tự đoán" thành "chọn một
   * khoản bạn đang thật sự tiêu".
   *
   * Chỉ truyền khi ĐƠN VỊ TIỀN của mốc trùng đơn vị mà `baseline` được tính bằng:
   * `suggestBaseline` lọc giao dịch theo tiền của CHẶNG ĐANG CHẠY và không quy đổi, nên
   * với một mốc ở chặng dùng đồng khác thì mọi con số này sai đơn vị — thà không gợi ý
   * còn hơn gợi ý một số sai 165 lần. Danh mục có chi ≤ 0 (chỉ toàn hoàn tiền) bị loại:
   * "thay cho 0 đồng" không phải một lựa chọn có nghĩa.
   */
  const chiTheoDanhMuc =
    selEvent !== undefined &&
    baseline !== null &&
    baselinePhase !== null &&
    currencyAt(working.phases, selEvent.startYear, currency) === baselinePhase.currency
      ? baseline.byCategory
          .filter((c) => c.annualMinor > 0)
          .map((c) => ({ name: c.name, annualMinor: c.annualMinor }))
      : []

  const dockEvent =
    selEvent === undefined
      ? undefined
      : {
          event: selEvent,
          // Tiền của mốc SUY RA từ chặng, không tự khai (v5 — xem `fxModel.ts`).
          currency: currencyAt(working.phases, selEvent.startYear, currency),
          phaseLabel: evPhase?.label ?? null,
          chiTheoDanhMuc,
          chang:
            evPhase === null
              ? null
              : { nuoc: evPhase.country, tien: currencyAt(working.phases, selEvent.startYear, currency) },
          onPatch: (patch: Parameters<typeof patchDraftEvent>[2]) =>
            editDraft((d) => patchDraftEvent(d, selEvent.id, patch)),
          onAddPreset: (preset: LifePreset) => {
            // Mặc định 2 năm nữa, không phải năm nay: mốc cuộc đời gần như luôn ở tương
            // lai, và một mốc rơi đúng năm hiện tại thì chip của nó dán vào mép trái đồ
            // thị, chỗ khó kéo nhất. Cùng con số với màn cũ.
            const wanted = currentYear + 2
            const seed = ++newIdSeed.current
            const probe = preset.build(buildPresetCtx(wanted))
            // Phát hiện review 2026-09-09 #2: BA mẫu sinh CHẶNG (`cuoi`/`nghi-huu`/
            // `chuyen-nuoc`) đều đặt `start_year: ctx.year`, và trước đây `nam` luôn là
            // đúng MỘT giá trị cố định — bấm "Cưới" hai lần ra hai chặng cùng năm, Lưu nổ
            // `unique (scenario_id, start_year)`. Sáu mẫu còn lại chỉ sinh SỰ KIỆN (không
            // có ràng buộc unique theo năm), nên chỉ né năm khi mẫu THẬT SỰ sinh một chặng
            // — dò năm khác cho một mẫu không đụng bảng `life_phases` là đổi hành vi không
            // cần thiết.
            const nam =
              probe.phases.length > 0
                ? freePhaseStartYear(working.phases, wanted, currentYear, lastYear)
                : wanted
            const result = nam === wanted ? probe : preset.build(buildPresetCtx(nam))
            editDraft((d) => applyPreset(d, result, seed))
            // Nhắm con trỏ vào thứ vừa thêm (spec §14). Mẫu chỉ sinh chặng (không mốc
            // nào) thì giữ nguyên lựa chọn — không có mốc để nhắm tới.
            if (result.events.length > 0) setSel({ type: 'event', id: presetEventId(seed, 0) })
            showToast(
              `Đã thêm "${preset.label}" vào năm ${nam} — kiểm lại số rồi kéo tới đúng năm.`,
              'success',
            )
          },
          onDuplicate: () => {
            const seed = ++newIdSeed.current
            editDraft((d) => {
              const { id: _cu, ...rest } = selEvent
              return addDraftEvent(d, { ...rest, label: `${selEvent.label} (bản sao)` }, seed).draft
            })
            setSel({ type: 'event', id: addedEventId(seed) })
          },
          onNewPhaseFromHere: () => {
            const seed = ++newIdSeed.current
            // `freePhaseStartYear`, không `clampPhaseStartYear` với chặng giả nhét vào
            // mảng — đúng ca đã sinh ra phát hiện review 2026-09-09 #1: một mốc bị gõ tay
            // xuống một năm THẤP HƠN mọi chặng đang có (ô năm của mốc chỉ kẹp sàn ở 1900,
            // không kẹp theo `currentYear` — xem `onCommit` của `fromYear` ở
            // `PlanDockEvent.tsx`) làm chặng giả sắp xếp thành chặng ĐẦU, và
            // `clampPhaseStartYear` trả nguyên `currentYear` không kiểm trùng — đúng năm
            // chặng đầu thật đang giữ. Xem JSDoc `freePhaseStartYear` (phaseYear.ts).
            const y = freePhaseStartYear(working.phases, selEvent.startYear, currentYear, lastYear)
            editDraft((d) =>
              addDraftPhase(
                d,
                {
                  startYear: y,
                  label: `Sau "${selEvent.label}"`,
                  // Kế thừa từ chặng phủ năm đó, KHÔNG để 0: một chặng thu 0 chi 0 làm
                  // tài sản đứng yên, và đó là một giả định (sai) chứ không phải một ô
                  // trống chờ điền.
                  country: evPhase?.country ?? null,
                  currency: evPhase?.currency ?? currency,
                  annualIncomeMinor: evPhase?.annualIncomeMinor ?? 0,
                  annualExpenseMinor: evPhase?.annualExpenseMinor ?? 0,
                  // Phần trăm chặng trước KHÔNG kế thừa: chặng mới có một chặng trước
                  // KHÁC, nên "80% chặng trước" ở đây trả lời một câu hỏi khác hẳn.
                  incomePctOfPrev: null,
                  expensePctOfPrev: null,
                  color: '',
                  icon: '',
                  fxToDisplay: evPhase?.fxToDisplay ?? 1,
                },
                seed,
              ),
            )
            // Nhắm con trỏ vào chặng vừa sinh — người dùng bấm nút này là để sửa nó.
            setSel({ type: 'phase', id: addedPhaseId(seed) })
          },
          /** Cùng đường với phím Delete — xem `onRemove` của panel chặng. */
          onRemove: () => removeWithUndo('event', selEvent.id),
        }

  return (
    <ConsoleFrame
      // ===== HÀNG 2–4 của bản vẽ: phủ hết bề ngang, nằm trên hai cột =====
      top={
        <div className="flex min-w-0 flex-col gap-2.5">
          {/* --- THANH NHÁP -------------------------------------------------------
                  Ở ĐẦU khối, trên cả dải kịch bản: nó nói về TOÀN BỘ những gì đang
                  hiện bên dưới, và bản nháp ở console sinh ra từ mọi hướng (kéo mốc
                  trên trục, kéo khối chặng, gõ trong dock, ba thanh trượt hàng 9) — một
                  thanh nằm cạnh riêng một trong số đó sẽ nói về ít hơn phần nó cai.
                  Đây cũng là đường DUY NHẤT tới "Lưu thành kịch bản mới"; hàng 9 chỉ có
                  Lưu và Bỏ. */}
          {dirty && savedDraft && (
            <DraftBanner
              scenarioName={active.name}
              changes={changes}
              // "Trước" là bản chiếu của DỮ LIỆU ĐÃ LƯU — chính `rows` mà `useLifetime`
              // trả về, cùng chuỗi số mà đồ thị vẽ thành đường "trước khi đổi". Không
              // chiếu lại lần thứ hai ở đây: hai phép chiếu cho cùng một câu hỏi là hai
              // chỗ để lệch nhau.
              endBeforeMinor={endBeforeMinor}
              endAfterMinor={
                shownRows.length > 0 ? shownRows[shownRows.length - 1].assetsEndMinor : null
              }
              currency={currency}
              onCommit={() => void handleCommit()}
              onSaveAsNew={() => void handleSaveAsNew()}
              onDiscard={discardDraft}
              saving={saving}
            />
          )}

          {/* --- HÀNG 2: thanh kịch bản --------------------------------------------- */}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {scenarios.map((s) => {
              const on = s.id === activeId
              return (
                <FilterChip
                  key={s.id}
                  on={on}
                  size="sm"
                  onClick={() => setActiveId(s.id)}
                  title={`Mở kịch bản "${s.name}"`}
                  className="max-w-full"
                >
                  {s.is_primary && <Star className="h-3 w-3 shrink-0" aria-hidden="true" />}
                  <span className="truncate">{s.name}</span>
                  {s.is_primary && <span className="sr-only">(kịch bản chính)</span>}
                </FilterChip>
              )
            })}

            {scenarios.length > 1 && (
              <FilterChip
                on={compareOn}
                size="sm"
                onClick={() => setCompareOn((v) => !v)}
                title="Vẽ các kịch bản khác lên cùng đồ thị"
              >
                So sánh
              </FilterChip>
            )}

            <ActionButton
              onClick={() => void duplicateActiveScenario()}
              disabled={duplicatingScenario}
              className="whitespace-nowrap"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {duplicatingScenario ? 'Đang tạo…' : 'Kịch bản mới'}
            </ActionButton>

            {/* Bên phải: "Sinh 1994 · chiếu đến tuổi 70 · JPY". Ba con số quyết định
                cách đọc MỌI thứ bên dưới, nên chúng đứng cùng hàng với tên kịch bản
                chứ không nằm trong một hộp cài đặt nào. */}
            <p className="ml-auto shrink-0 truncate text-sm text-fg-muted">
              Sinh <Num tone="muted">{birthYear}</Num> · chiếu đến tuổi{' '}
              {/* `currency` là MÃ ba chữ ("JPY"), không phải số — <Num> chỉ dành cho số
                  (xem đầu file Num.tsx). Bọc nó là hiện văn xuôi bằng chữ mono. */}
              <Num tone="muted">{shownInput.endAge}</Num> · <span>{currency}</span>
            </p>
          </div>

          {/* --- HÀNG 3: dải thống kê ------------------------------------------------ */}
          <Card as="section" padding="panel" elevation="panel">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <SectionTitle role="block" className="shrink-0">
                {verdict === null
                  ? 'Chưa chiếu được năm nào'
                  : verdict.negativeYear !== null
                    ? `Nhánh bi quan cạn tiền từ ${verdict.negativeYear}`
                    : verdict.fireYear !== null
                      ? 'Đủ tiền tới hết đời, và có đạt tự do tài chính'
                      : 'Đủ tiền tới hết đời, nhưng chưa đạt tự do tài chính'}
              </SectionTitle>

              <StatCell label="Tự do tài chính">
                {verdict?.fireYear == null ? (
                  // "chưa đạt" là CHỮ, không phải số — không qua <Num> (xem đầu file
                  // Num.tsx: "Con số KHÔNG phải tiền").
                  <span className="text-fg-muted">chưa đạt</span>
                ) : (
                  <Num tone="in">
                    {verdict.fireYear} · {verdict.fireAge}t
                  </Num>
                )}
              </StatCell>

              <StatCell label={`Lúc ${shownInput.endAge} tuổi`}>
                {atEnd === null ? (
                  <Num tone="muted">—</Num>
                ) : (
                  <Money amount={atEnd.center} currency={currency} compact tone="bySign" />
                )}
              </StatCell>

              <StatCell label="Bi quan">
                {atEnd === null ? (
                  <Num tone="muted">—</Num>
                ) : (
                  <Money amount={atEnd.low} currency={currency} compact tone="bySign" />
                )}
              </StatCell>

              <div className="ml-auto shrink-0">
                {/* Huy hiệu "N tin mới" là hàng "chip lệch kế hoạch" mà bản vẽ xếp vào
                    hàng 3 — gộp vào chính chip này thay vì dựng một control thứ hai:
                    đích của nó (mở panel hàng 4) trùng khít đích của chip, và hai nút
                    cạnh nhau cùng mở một panel là hai đường vào cho một việc.

                    Vì sao cần: dòng "kế hoạch vs sổ thật" và dòng "so với N tháng trước"
                    nằm TRONG panel hàng 4, thứ mặc định đang gập. Không có dấu nào ở
                    ngoài thì một panel đang có tin xấu trông y hệt một panel không có gì
                    để nói. Cùng khuôn với huy hiệu "N đang bật" của chip Stress test ở
                    hàng 10.

                    Đếm HAI thứ, cố ý bỏ nút "Thử nghỉ việc": nút đó gần như luôn mời
                    được nên nó sẽ làm huy hiệu sáng mãi mãi, tức không còn là tin. */}
                <FilterChip
                  on={hintsOpen}
                  size="sm"
                  onClick={() => setHintsOpen((v) => !v)}
                  aria-expanded={hintsOpen}
                >
                  Gợi ý &amp; cách đọc
                  {tinMoi > 0 && !hintsOpen && (
                    <span className="text-fg-warn">
                      · <Num tone="warn">{tinMoi}</Num> tin mới
                    </span>
                  )}
                </FilterChip>
              </div>
            </div>
          </Card>

          {/* --- HÀNG 4: panel Gợi ý (ẩn/hiện) --------------------------------------

                  ĐÂY LÀ CHỖ Ở của ba tính năng §13 mà bản vẽ không có: đối chiếu chi
                  tiêu thật (`reality`), lịch sử kết luận (`drift`) và thử nghỉ hưu
                  (`onTryRetire`). Cả ba đã có sẵn prop trong `InsightCards` và cả ba nói
                  về CÙNG một thứ mà hộp này nói — "kết luận ở trên còn thiếu gì" — nên
                  chúng không đáng một hàng riêng trong mười hai hàng của bản vẽ.

                  ĐỌC BẢN NHÁP (`shownRows`/`shownInput`), không đọc bản đã lưu. Sửa từ
                  Task 7: hồi đó bản nháp chưa tồn tại nên hàng này lấy `rows`/`input` vì
                  đó là thứ duy nhất có. Từ Task 9 dải thống kê hàng 3 đọc bản nháp, và
                  hai hàng cạnh nhau nói về hai bản chiếu khác nhau là đánh đố — nhất là
                  khi hàng 4 chứa dòng "kế hoạch vs sổ thật", thứ phải đổi theo lượt vặn
                  để có nghĩa. */}
          {hintsOpen && profile?.birth_year != null && (
            <InsightCards
              rows={shownRows}
              input={shownInput}
              birthYear={profile.birth_year}
              currency={currency}
              scenarioName={active.name}
              reality={reality}
              realityMonths={baseline?.monthsCovered ?? null}
              onTryRetire={handleTryRetire}
              // Đang có nháp thì hộp này nói về NHÁP, còn độ trôi so với bản ĐÃ LƯU —
              // hai câu về hai bản chiếu khác nhau đứng cạnh nhau là đánh đố. Ẩn cho tới
              // khi Lưu hoặc Bỏ. Cùng luật màn cũ dùng.
              drift={dirty ? null : drift}
              driftHistory={verdictHistoryQ.data ?? []}
              // KHÔNG truyền `stressNote` dù prop có sẵn: trên console kết luận của cú
              // sốc đã nằm trong chính `StressPanel` ở hàng 10 (nơi bật cú sốc), khác màn
              // cũ nơi panel đó ở tít cột phải. Truyền cả hai là hai chỗ nói cùng một câu.
            />
          )}
        </div>
      }
      // ===== HÀNG 5–8: cột vẽ =====
      plot={
        <div className="flex min-w-0 flex-col gap-1.5">
          {/* --- HÀNG 5: caption. HÀNG TĨNH, không phải lớp phủ tuyệt đối — bản vẽ ghi
                  lại một bug thật từ cách kia: chữ chồng lên chip FIRE. -------------- */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <SectionTitle className="shrink-0">
              Tài sản ròng cả đời
              <EstimateMark reason="Toàn bộ khối này là số chiếu theo kịch bản bạn đặt, không phải số đã xảy ra." />
            </SectionTitle>
            <span className="min-w-0 flex-1 truncate text-2xs uppercase tracking-label text-fg-muted">
              Rê chuột trên đồ thị để đọc số theo từng năm
            </span>
            <SegmentedControl
              items={ZOOM_ITEMS}
              value={zoom === 'all' ? 'all' : String(zoom)}
              onChange={(v) => setZoom(v === 'all' ? 'all' : (Number(v) as 10 | 20))}
              label="Khoảng thời gian trên đồ thị"
              size="sm"
              stretch={false}
            />
            <FilterChip
              on={showBand}
              size="sm"
              onClick={() => setShowBand((v) => !v)}
              title="Dải lạc quan – bi quan"
            >
              Dải
            </FilterChip>
            <FilterChip
              on={showFire}
              size="sm"
              onClick={() => setShowFire((v) => !v)}
              title="Ngưỡng tự do tài chính = 25× chi mỗi năm"
            >
              FIRE
            </FilterChip>
            <FilterChip
              on={log}
              size="sm"
              onClick={() => setLog((v) => !v)}
              title="Trục tiền theo thang log — nhìn rõ giai đoạn đầu"
            >
              Log
            </FilterChip>
          </div>

          {/* --- HÀNG 6: chú giải. Cũng là HÀNG TĨNH, cùng lý do. ------------------- */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-fg-muted">
            <LegendItem color="var(--accent)" dash="6 4">
              Nhánh trung tâm
            </LegendItem>
            {showBand && (
              <>
                <LegendItem color="var(--money-in)" dash="1 4">
                  Lạc quan
                </LegendItem>
                <LegendItem color="var(--money-out)" dash="1 4">
                  Bi quan
                </LegendItem>
              </>
            )}
            {showFire && (
              <LegendItem color="var(--money-in)" dash="8 4">
                Ngưỡng tự do tài chính
              </LegendItem>
            )}
            {comparisons.map((c) => (
              <LegendItem key={c.id} color={c.color} dash="2 5">
                {c.name}
              </LegendItem>
            ))}
            {compareSkipped > 0 && (
              <span className="text-fg-warn">
                <Num tone="warn">{compareSkipped}</Num> kịch bản đang ẩn — khác đơn vị tiền với{' '}
                {currency}, chưa quy đổi được nên không vẽ để tránh sai đơn vị.
              </span>
            )}
            {missingRateCurrencies.length > 0 && (
              <span className="text-fg-warn">
                Thiếu tỷ giá {missingRateCurrencies.join(', ')} → {currency}, nên các khoản
                khai bằng đơn vị đó chưa quy đổi được. Số trên đồ thị là số THIẾU, không
                phải số quy 1:1.
              </span>
            )}
          </div>

          {/* --- HÀNG 7: vùng vẽ ----------------------------------------------------

                  Hộp `relative` bọc ngoài: bảng chọn nhanh và toast hoàn tác là lớp phủ
                  đặt theo toạ độ TRONG vùng vẽ, nhưng chúng KHÔNG nằm trong `TimelinePlot`.
                  Lý do: cả hai ghi vào bản nháp và đóng được bằng `Esc` — hai thứ sống ở
                  trang. Vùng vẽ chỉ báo ra cử chỉ kèm chỗ bấm (`onQuickAdd`), vì chỉ nó
                  biết phép chiếu năm→pixel. Và vì chúng là phần tử EM của vùng vẽ (không
                  phải con), cú bấm vào bảng không nổi bọt vào nền đồ thị để mở thêm một
                  bảng nữa. `TimelinePlot` khai `h-[35rem] w-full` nên hộp này trùng khít
                  nó, tức toạ độ báo ra dùng được thẳng ở đây. */}
          <div className="relative min-w-0">
          <TimelinePlot
            handleRef={plotRef}
            rows={shownRows}
            currency={currency}
            // Đường "trước khi đổi" là bản chiếu của dữ liệu ĐÃ LƯU, và chỉ có nghĩa khi
            // nháp đang khác nó — trùng khít thì hai đường vẽ lên nhau, chỉ làm dày nét.
            saved={draft === null ? null : rows}
            compare={comparisons}
            events={shownInput.events}
            zoom={zoom}
            showBand={showBand}
            showFire={showFire}
            log={log}
            // Icon mốc nằm TRONG vùng vẽ (xem `TimelinePlot`): số hàng icon quyết định chỗ
            // chừa phía trên đồ thị, nên nó phải được tính ở nơi biết bề ngang đã đo.
            phaseStarts={phaseStarts}
            selectedEventId={sel.type === 'event' ? sel.id : undefined}
            onSelectEvent={(id) => setSel({ type: 'event', id })}
            onToggleEvent={(id) =>
              setSel((cur) =>
                cur.type === 'event' && cur.id === id ? { type: 'none' } : { type: 'event', id },
              )
            }
            onMoveEvent={moveEventStart}
            onMoveEventEnd={moveEventEnd}
            onQuickAdd={(span, at) => setQuick({ span, at })}
          />

          {/* BẢNG CHỌN NHANH. Kẹp toạ độ NGANG bằng `clampQuickBoardLeft` (plotFrame.ts) —
              cùng idiom `Math.min(Math.max(x, lo), hi)` mà nhãn dải kéo và chip đọc số
              trong `TimelinePlot` dùng, chỉ khác nửa bề rộng nhét vào là của CẢ BẢNG
              (`QUICK_BOARD_HALF_W_PX`). KHÔNG kẹp thì ở hai mép trục, `translateX(-50%)`
              đẩy một nửa bảng ra ngoài thẻ — `ConsoleFrame` không có `overflow-hidden` nên
              nó lồi hẳn ra chứ không bị cắt (phát hiện review 2026-09-09, Finding 2: một
              bản trước của comment này từng khẳng định có kẹp trong khi code không làm
              vậy — bản này sửa CẢ HAI, code lẫn lời ghi).

              Theo trục DỌC thì bảng neo ở TRÊN, không ở chỗ bấm — lệch bản vẽ có chủ đích:
              bản vẽ khoá khung 1080px nên bảng mở ở đâu cũng còn chỗ, còn vùng vẽ ở đây cao
              35rem và bảng cao tới 18rem, nên mở ở nửa dưới là quá nửa bảng nằm ngoài. */}
          {quick !== null && (
            <div
              className="absolute z-40 -translate-x-1/2"
              style={{
                top: QUICK_TOP_PX,
                left: clampQuickBoardLeft(quick.at.x, quick.at.plotLeft, quick.at.plotRight),
              }}
            >
              <QuickAddBoard
                span={quick.span}
                birthYear={birthYear}
                currency={currency}
                buildCtx={buildPresetCtx}
                onAddPreset={addPresetFromBoard}
                onAddBlank={addBlankFromBoard}
                onClose={() => setQuick(null)}
              />
            </div>
          )}

          {/* TOAST HOÀN TÁC — ở ĐÁY đồ thị, đúng chỗ bản vẽ đặt nó. Không đi qua
              `showToast` toàn cục: toast đó không có chỗ cho một cái NÚT, mà cả điểm của
              dải này là cái nút. */}
          {undoLabel !== null && (
            <div className="pointer-events-none absolute inset-x-0 bottom-9 z-40 flex justify-center">
              <div className="pointer-events-auto flex animate-toast-in items-center gap-2 rounded-full border border-border-strong bg-surface-chrome px-3 py-1.5 shadow-sm">
                <span className="text-2xs text-fg-secondary">{undoLabel}</span>
                <ActionButton onClick={doUndo}>Hoàn tác</ActionButton>
              </div>
            </div>
          )}
          </div>

          {/* --- HÀNG 8: dải chặng đời --------------------------------------------

                  Đây LÀ đường vào của bản vẽ: bấm một khối để mở bảng sửa trong dock, kéo
                  để dời năm. Dải chip tạm trước đây (một `<FilterChip>` cho mỗi chặng) đã
                  bỏ — nó chỉ tồn tại để bảng sửa có chỗ bấm trước khi dải thật xong, và
                  giữ cả hai là hai đường vào cho cùng một việc, nằm cạnh nhau.

                  KHÔNG có `ml-[3.25rem]` như dải chip cũ: lề trái của trục là 52px THẬT
                  trong hộp đã đo, còn `3,25rem` là 65px ở Cỡ chữ 1,25× — hai hệ đo trong
                  một phép tính. `PhaseLane` tự đo hộp và tự lấy lề từ `plotFrame.ts`, đúng
                  bộ lề mà vùng vẽ dùng. */}
          <PhaseLane
            phases={working.phases}
            x0={laneX0}
            x1={laneX1}
            selectedId={sel.type === 'phase' ? sel.id : undefined}
            onSelect={(id) => setSel({ type: 'phase', id })}
            onToggle={(id) =>
              setSel((cur) =>
                cur.type === 'phase' && cur.id === id ? { type: 'none' } : { type: 'phase', id },
              )
            }
            onMoveStart={movePhaseStart}
          />

        </div>
      }
      // ===== Cột dock — LUÔN chừa sẵn, kể cả khi không chọn gì (spec §5) =====
      //
      // `sel` là state thật từ Task 9. Đường vào của bản vẽ (bấm khối chặng / icon mốc
      // trên trục) do Task 11/12 dựng; tới lúc đó chỗ này không đổi gì — chúng chỉ gọi
      // `setSel`.
      dock={
        <PlanDock
          sel={sel}
          phase={dockPhase}
          event={dockEvent}
          summary={{
            currency,
            phaseCount: shownInput.phases.length,
            eventCount: shownInput.events.length,
            fireYear: verdict?.fireYear ?? null,
            fireAge: verdict?.fireAge ?? null,
            endAge: shownInput.endAge,
            assetsAtEndMinor: atEnd?.center ?? null,
            hasMissingRate: missingRateCurrencies.length > 0,
            biggestExpense,
            realReturnBps: shownInput.realReturnBps,
            inflationBps: shownInput.inflationBps,
            nominalTerms: shownInput.nominalTerms,
          }}
        />
      }
      // ===== HÀNG 9–12: phần cuộn bên dưới =====
      below={
        <div className="flex min-w-0 flex-col gap-2.5">
          {/* --- HÀNG 9: vặn nhanh (3 thanh trượt + Lưu / Bỏ) --------------------- */}
          <QuickTuneRow
            returnBps={working.realReturnBps}
            onReturnBps={(bps) => editDraft((d) => ({ ...d, realReturnBps: bps }))}
            spreadBps={working.bandSpreadBps}
            onSpreadBps={(bps) => editDraft((d) => ({ ...d, bandSpreadBps: bps }))}
            expenseAdjPct={expenseAdjPct}
            onExpenseAdjPct={(pct) => {
              setExpenseAdjPct(pct)
              // Nhân từ bản ĐÃ LƯU, không từ giá trị đang hiện: một nhịp kéo gọi hàng
              // chục lần và nhân dồn thì kéo lên rồi kéo về 0 không trả lại số đã lưu —
              // xem `scaleExpenses` (quickTune.ts, có phép thử cho đúng ca đó).
              editDraft((d) => (savedDraft ? scaleExpenses(savedDraft, d, pct) : d))
            }}
            changeParts={changeParts(
              changes,
              currency,
              endBeforeMinor,
              shownRows.length > 0 ? shownRows[shownRows.length - 1].assetsEndMinor : null,
            )}
            saving={saving}
            onCommit={() => void handleCommit()}
            onDiscard={discardDraft}
          />

          {/* --- HÀNG 10: chip Stress test ----------------------------------------
                  Chip thu gọn bung ra hàng riêng — cùng khuôn "chip + pane" mà hàng 11
                  (Bảng theo năm) và hàng 12 (Bản đồ khoản lớn) dùng.

                  Cú sốc KHÔNG đi qua bản nháp và không có đường nào tới `commitDraft`:
                  `onChange` chỉ gọi `setStress`, và hậu quả hiện ra bằng một bản chiếu
                  RIÊNG (`stressRows`) cùng câu kết luận trong chính panel. Vì thế bật một
                  cú sốc KHÔNG làm thanh nháp hiện lên — đúng như bản vẽ dặn ("không sửa
                  kế hoạch"). */}
          <Card as="section" elevation="panel" padding="panel">
            <button
              type="button"
              onClick={() => setStressOpen((v) => !v)}
              aria-expanded={stressOpen}
              className="flex min-h-11 w-full items-center gap-1.5 text-left text-2xs uppercase tracking-label text-fg-muted transition"
            >
              Stress test
              {stressCount > 0 && (
                <span className="normal-case tracking-normal text-fg-warn">
                  <Num tone="warn">{stressCount}</Num> đang bật
                </span>
              )}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${stressOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
            {stressOpen && (
              <div className="mt-2">
                <StressPanel
                  variant="inline"
                  value={stress}
                  onChange={setStress}
                  currency={currency}
                  minYear={currentYear}
                  maxYear={lastYear}
                  baseNegativeYear={firstNegativeYear(shownRows, 'low')}
                  stressNegativeYear={stressRows ? firstNegativeYear(stressRows, 'low') : null}
                  birthYear={birthYear}
                />
              </div>
            )}
          </Card>

          {/* --- HÀNG 11 + 12: chip chuyển pane và pane đang mở. Hai khối dưới đây tự
                  mang chip tiêu đề của mình rồi bung nội dung ngay dưới — đúng cặp
                  "chip + pane" mà bản vẽ vẽ thành hai hàng. */}
          <YearTableSection rows={shownRows} currency={currency} scenarioName={active.name} />

          <BigExpenseMapSection
            events={shownInput.events}
            displayCurrency={currency}
            fxOf={pageFxOf}
            todayISO={todayISO}
            surplus={null}
          />
        </div>
      }
    />
  )
}

/** Một ô nhãn–giá trị trong dải thống kê. */
function StatCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap text-sm text-fg-muted">
      {label} {children}
    </span>
  )
}

/** Mẫu nét cho chú giải — vẽ đúng `strokeDasharray` của đường thật, không xấp xỉ. */
function LegendItem({
  color,
  dash,
  children,
}: {
  color: string
  dash?: string
  children: ReactNode
}) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <svg width="18" height="8" aria-hidden="true" className="shrink-0">
        <line x1="0" y1="4" x2="18" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dash} />
      </svg>
      {children}
    </span>
  )
}

/** Cổng 2: chưa khai năm sinh — hỏi một ô, kèm lý do vì sao cần. */
function BirthYearCard() {
  const qc = useQueryClient()
  const [value, setValue] = useState('')
  const saveMut = useMutation({
    mutationFn: (birthYear: number) => repo.updateProfile({ birth_year: birthYear }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  })

  const year = Number(value)
  const valid = Number.isInteger(year) && year >= MIN_BIRTH_YEAR && year <= MAX_BIRTH_YEAR

  return (
    <Card as="section">
      <p className="text-sm text-fg-secondary">
        Màn này chiếu tài sản ròng của bạn theo từng năm tới hết đời, nên cần năm sinh để
        đổi qua lại giữa "năm" và "tuổi" ở mỗi mốc trên đồ thị (nghỉ hưu, tự do tài
        chính…). Thiếu năm sinh thì không tính được tuổi, nên chưa chiếu được gì.
      </p>
      <label htmlFor="tuong-lai-birth-year" className="mt-3 block text-sm font-medium text-fg-muted">
        Năm sinh
      </label>
      <input
        id="tuong-lai-birth-year"
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ví dụ: 1994"
        className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg-primary"
      />
      <button
        type="button"
        disabled={!valid || saveMut.isPending}
        onClick={() => saveMut.mutate(year)}
        className={actionButtonClass('primary', 'mt-3 w-full')}
      >
        {saveMut.isPending ? 'Đang lưu…' : 'Lưu năm sinh'}
      </button>
    </Card>
  )
}
