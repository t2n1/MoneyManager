import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Sparkles, Star } from 'lucide-react'
import { ActionButton, Card, actionButtonClass, filterChipClass } from '../../components/ui'
import { repo } from '../../data'
import {
  useAccounts,
  useCategories,
  useLifetimeVerdictSnapshots,
  useNetWorthSnapshots,
  useRangeTransactions,
  useUpsertLifetimeVerdictSnapshot,
} from '../../hooks/queries'
import type { CurrencyCode } from '../../lib/currencies'
import { getMonthRange, monthKeyForDate, toISODate } from '../../lib/dates'
import { showToast } from '../../lib/dialog'
import { formatMoney } from '../../lib/money'
import { fetchRates } from '../../lib/rates'
import { suggestBaseline } from './baseline'
import { CompareStrip } from './CompareStrip'
import {
  applyPreset,
  draftChanges,
  draftFromRows,
  draftPhaseIndex,
  draftToInput,
  patchDraftEvent,
  removeDraftEvent,
  type ScenarioDraft,
} from './draft'
import { DraftBanner } from './DraftBanner'
import { EventEditorPopover } from './EventEditorPopover'
import { assetsAtAge, extraSavingsForFire, firstNegativeYear, fireYear } from './insights'
import { InsightCards } from './InsightCards'
import { LifetimeChartCard } from './LifetimeChartCard'
import type { PresetContext } from './presets'
import { PresetPanel } from './PresetPanel'
import { hasStress, NO_STRESS, phaseForYear, projectLifetime, type StressConfig } from './project'
import { realityCheck } from './realityCheck'
import { commitDraft, saveDraftAsNewScenario } from './saveDraft'
import { ScenarioWorkbench } from './ScenarioWorkbench'
import { defaultStress } from './StressPanel'
import { pickActive } from './buildInput'
import { currencyAt, fxOfRates, normalizeToPhaseCurrency } from './fxModel'
import { lifetimeVerdict } from './summary'
import { applyRetireTrial, buildRetireTrial, RETIRE_TRIAL_MIN_END_AGE } from './tryRetire'
import { verdictDrift, type VerdictPoint } from './verdictHistory'
import { baselineRange, makeCurrencyOf, useLifetime } from './useLifetime'
import { YearTableSection, YearTableView } from './YearTableView'

/** Ô nhập năm sinh khớp ràng buộc DB (migration 0031: `birth_year between 1900 and 2100`). */
const MIN_BIRTH_YEAR = 1900
const MAX_BIRTH_YEAR = 2100

/** Bao nhiêu năm sớm hơn thì dòng "Gợi ý" nhắm tới. */
const FIRE_EARLIER_TARGET_YEARS = 5
/** Mốc tuổi dùng khi kịch bản KHÔNG đạt tự do tài chính năm nào — "trước tuổi 65". */
const FIRE_FALLBACK_AGE = 65

/** Lifetime (mục Lifetime): chiếu tài sản ròng cả đời. Ba trạng thái — chưa khai năm
 * sinh, chưa có kịch bản, có dữ liệu — không có trạng thái nào để trống.
 *
 * Là tab con "Tương lai" của Tài sản (`/assets?view=future`), không còn trang riêng: vỏ
 * AssetsPage lo nút back và padding. Xem docs/information-architecture.md §2.3.
 *
 * BẢN NHÁP là ý chính của màn này. Trước đây "vặn thử" chỉ có ba con số (thu, chi, lợi
 * suất) và mọi thứ khác — dời một mốc, thêm một mốc, đổi tuổi nghỉ hưu — bắt buộc phải
 * đi qua trình sửa và GHI THẲNG vào dữ liệu. Nay cả sáu thứ đó vặn được ngay tại chỗ,
 * đồ thị đổi theo từng nhịp, và không có gì được ghi cho tới khi bấm Lưu ở thanh nháp.
 * Xem draft.ts. */
export function LifetimeView() {
  const {
    scenarios,
    active,
    activeId,
    setActiveId,
    phases,
    events,
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

  // Mốc cần nhắm tới khi vào từ một chip mốc trên đồ thị hoặc từ Bảng theo năm: bàn sửa
  // chuyển sang tab "Mốc cuộc đời" và cuộn đúng dòng đó vào tầm mắt.
  //
  // Không còn `editorOpen`: bàn sửa nằm THẲNG trong trang nên nó luôn hiện — không có
  // trạng thái đóng/mở nào để nhớ.
  const [editorFocusEventId, setEditorFocusEventId] = useState<string | undefined>(undefined)
  const [tableOpen, setTableOpen] = useState(false)
  /** Năm mà Bảng theo năm (sheet) phải cuộn tới khi mở — đặt từ hai ô kết luận có NĂM. */
  const [tableFocusYear, setTableFocusYear] = useState<number | undefined>(undefined)
  const [creating, setCreating] = useState(false)
  const { data: historyRows = [] } = useNetWorthSnapshots()
  const qc = useQueryClient()

  // --- Bản nháp ----------------------------------------------------------------------
  //
  // `null` = đang xem đúng bản đã lưu. Khác `null` = có một bản sao đang được vặn; nó
  // KHÔNG tự biến mất khi trùng lại bản gốc (kéo đi rồi kéo về), `dirty` bên dưới mới là
  // thứ quyết định thanh nháp có hiện hay không.
  const [draft, setDraft] = useState<ScenarioDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  /** Bộ đếm sinh id cho mốc/chặng vừa thêm — xem `applyPreset`. */
  const presetSeed = useRef(0)

  // Đổi kịch bản thì nháp phải rơi: nó là bản sao của kịch bản CŨ, giữ lại là âm thầm áp
  // thu/chi/mốc của kịch bản này lên kịch bản kia.
  useEffect(() => {
    setDraft(null)
    setEditingEventId(null)
  }, [activeId])

  /** Ảnh chụp bản ĐÃ LƯU, dạng nháp — gốc quy chiếu của mọi phép so và mọi lệnh ghi. */
  const savedDraft = useMemo(
    () => (active ? draftFromRows(active, phases, events) : null),
    [active, phases, events],
  )
  const working = draft ?? savedDraft

  // --- Cách ĐỌC bản chiếu (không thuộc kịch bản, không được ghi) -----------------------
  //
  // Giá hiển thị và lạm phát là cách đọc, không phải giả định: cùng một tương lai, hoặc
  // quy về sức mua hôm nay, hoặc in ra con số sẽ nằm trong tài khoản năm đó. Vì vậy
  // chúng KHÔNG đi qua `ScenarioDraft` — vặn chúng không làm thanh nháp bật lên.
  // Khởi tạo từ giá trị đã lưu để lần mở đầu tiên khớp với thứ kịch bản đang khai.
  const [nominal, setNominal] = useState(false)
  const [inflationBps, setInflationBps] = useState(200)
  const [stress, setStress] = useState<StressConfig>(NO_STRESS)
  // Cả ba giá trị này gieo lại MỘT LẦN cho mỗi kịch bản. Cú sốc là câu hỏi về MỘT kịch
  // bản cụ thể ("nếu năm 2030 khủng hoảng thì kế hoạch về VN có chịu được không") — mang
  // nguyên bộ sốc sang kịch bản khác thì mấy con số năm trong đó có thể rơi ngoài khoảng
  // chiếu của kịch bản mới mà không ai để ý. Và mấy con số mặc định của nó (năm, số tiền
  // bệnh nặng) suy từ chính chặng đang chạy của kịch bản đó, xem `defaultStress`.
  const seededFor = useRef<string | null>(null)
  useEffect(() => {
    if (!active || !input || seededFor.current === active.id) return
    seededFor.current = active.id
    setNominal(active.nominal_terms)
    setInflationBps(input.inflationBps)
    const rows0 = projectLifetime(input)
    setStress(defaultStress(input.currentYear, rows0[0]?.expenseMinor ?? 0))
  }, [active, input])

  // --- Ba bản chiếu -------------------------------------------------------------------
  const priceOpts = useCallback(
    <T extends { nominalTerms: boolean; inflationBps: number }>(i: T): T => ({
      ...i,
      nominalTerms: nominal,
      inflationBps,
    }),
    [nominal, inflationBps],
  )

  // Tỷ giá "hôm nay" — nền là tiền hiển thị của kịch bản. Dùng cho CẢ bản chiếu (chuẩn
  // hoá tiền theo chặng) lẫn thư viện mẫu. Cùng `queryKey` với `useLifetime` nên React
  // Query trả thẳng từ cache, không có lượt tải thứ hai.
  const ratesQ = useQuery({
    queryKey: ['lifetime-rates-for', active?.display_currency],
    queryFn: () => fetchRates(active?.display_currency as CurrencyCode),
    enabled: !!active,
    staleTime: 12 * 3600_000,
    gcTime: 24 * 3600_000,
    retry: 1,
  })

  /**
   * `FxOf` của trang — tỷ giá HÔM NAY, nền là tiền hiển thị của kịch bản.
   *
   * Dùng CHUNG một `queryKey` với `useLifetime` nên hai chỗ đọc đúng một bảng; React
   * Query trả thẳng từ cache, không có lượt tải thứ hai.
   */
  const pageFxOf = useMemo(
    () => fxOfRates((active?.display_currency as CurrencyCode) ?? 'JPY', ratesQ.data ?? {}),
    [active?.display_currency, ratesQ.data],
  )

  /**
   * Bản chiếu ĐANG XEM. `draftToInput` đè phases/events của bản nháp lên input đã ráp,
   * mà nháp mang `fxToDisplay` ĐÃ LƯU — con số người dùng từng gõ tay, không phải tỷ giá
   * hôm nay. Nên phải chuẩn hoá LẠI sau đó, đúng như `buildInputFor` làm cho bản đã lưu:
   * thiếu bước này thì đổi tiền của một chặng xong, bản chiếu vẫn nhân theo tỷ giá cũ và
   * dòng "≈ … theo JPY" nói một con số sai (bắt được khi chạy app thật, 2026-08-24).
   */
  const shownInput = useMemo(() => {
    if (!input || !working) return null
    const base = draftToInput(input, working)
    const norm = normalizeToPhaseCurrency(base.phases, base.events, base.displayCurrency, pageFxOf)
    return priceOpts({ ...base, phases: norm.phases, events: norm.events })
  }, [input, working, priceOpts, pageFxOf])
  const shownRows = useMemo(() => (shownInput ? projectLifetime(shownInput) : []), [shownInput])

  const currentYear = input?.currentYear ?? new Date().getFullYear()
  const changes = useMemo(
    () => (savedDraft && draft ? draftChanges(savedDraft, draft) : []),
    [savedDraft, draft],
  )
  const dirty = changes.length > 0

  /** Bản chiếu của dữ liệu ĐÃ LƯU — đường xám "trước khi đổi". Chỉ tính khi có gì để so. */
  const baselineRows = useMemo(() => {
    if (!dirty || !input || !savedDraft) return null
    return projectLifetime(priceOpts(draftToInput(input, savedDraft)))
  }, [dirty, input, savedDraft, priceOpts])

  const stressRows = useMemo(() => {
    if (!shownInput || !hasStress(stress)) return null
    return projectLifetime({ ...shownInput, stress })
  }, [shownInput, stress])

  const editingEvent = useMemo(
    () => working?.events.find((e) => e.id === editingEventId) ?? null,
    [working, editingEventId],
  )

  /**
   * Chặng phủ năm bắt đầu của mốc đang sửa — nguồn NƯỚC và TIỀN cho nút "Tra hộ".
   *
   * Phải là `useMemo`: trước đây đây là một IIFE nằm trong JSX, nên mỗi lần render nó sắp
   * lại cả `working.phases` và trao một OBJECT MỚI cho popover — popover thấy prop đổi ở
   * mọi render dù chặng không hề đổi.
   */
  const changCuaMoc = useMemo(() => {
    if (working === null || editingEvent === null) return null
    const sorted = [...working.phases].sort((a, b) => a.startYear - b.startYear)
    const p = phaseForYear(sorted, editingEvent.startYear)
    return p === undefined
      ? null
      : {
          nuoc: p.country,
          tien: currencyAt(sorted, editingEvent.startYear, working.displayCurrency),
        }
  }, [working, editingEvent])

  const shownPhaseIndex = working ? draftPhaseIndex(working, currentYear) : -1
  const shownPhase =
    shownInput && shownPhaseIndex >= 0 ? shownInput.phases[shownPhaseIndex] : null

  // --- Số thật 12 tháng từ sổ ----------------------------------------------------------
  //
  // Tính ở ĐÂY, không trong bàn sửa, vì hai chỗ đọc nó: thẻ chặng đang chạy ("Số thật…
  // Dùng số này") và dòng "đời thật" trong hộp kết luận. Theo TIỀN của chặng đang chạy —
  // `suggestBaseline` tự lọc giao dịch cùng tiền, không quy đổi (xem baseline.ts).
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const todayISO = toISODate(new Date())
  const txsRange = useMemo(() => baselineRange(todayISO), [todayISO])
  const txsQ = useRangeTransactions(txsRange)
  const baselineBase = (profile?.base_currency as CurrencyCode | undefined) ?? 'JPY'
  const baseline = useMemo(
    () =>
      shownPhase
        ? suggestBaseline(
            txsQ.data ?? [],
            categories,
            makeCurrencyOf(accounts, baselineBase),
            shownPhase.currency,
            todayISO,
          )
        : null,
    [shownPhase, txsQ.data, categories, accounts, baselineBase, todayISO],
  )
  /** Kế hoạch vs sổ thật — hộp kết luận hiện khi lệch đủ lớn (realityCheck.ts). */
  const reality = useMemo(
    () => (shownInput && baseline ? realityCheck(shownInput, baseline) : null),
    [shownInput, baseline],
  )

  // --- Lịch sử kết luận (migration 0055) -----------------------------------------------
  //
  // Ghi từ `input` (bản ĐÃ LƯU, chưa qua nháp, chưa qua cách đọc giá/lạm phát, chưa qua
  // cú sốc): lịch sử phải là kế hoạch thật, không phải những lần vặn thử. Một dòng mỗi
  // tháng tài chính mỗi kịch bản; mở lại trong tháng thì ghi đè.
  const monthStartDay = profile?.month_start_day ?? 1
  const thisMonthOn = useMemo(
    () => getMonthRange(monthKeyForDate(todayISO, monthStartDay), monthStartDay).start,
    [todayISO, monthStartDay],
  )
  const savedRows = useMemo(() => (input ? projectLifetime(input) : []), [input])
  const verdictNow = useMemo((): VerdictPoint | null => {
    if (!input || savedRows.length === 0) return null
    const v = lifetimeVerdict(savedRows, input.birthYear)
    const end = assetsAtAge(savedRows, input.endAge)
    if (!end) return null
    return {
      month_on: thisMonthOn,
      fire_year: v.fireYear,
      negative_year: v.negativeYear,
      end_age: input.endAge,
      assets_end_minor: end.center,
      display_currency: input.displayCurrency,
    }
  }, [input, savedRows, thisMonthOn])
  const verdictHistoryQ = useLifetimeVerdictSnapshots(active?.id)
  const upsertVerdict = useUpsertLifetimeVerdictSnapshot()
  // Ghi một lần cho mỗi (kịch bản, tháng, kết luận) trong phiên — Lưu nháp làm kết luận
  // đổi thì ghi lại, còn render lại thì không.
  const recordedVerdict = useRef<string | null>(null)
  useEffect(() => {
    if (!active || !verdictNow) return
    const key = `${active.id}|${JSON.stringify(verdictNow)}`
    if (recordedVerdict.current === key) return
    recordedVerdict.current = key
    upsertVerdict.mutate({ scenario_id: active.id, ...verdictNow })
  }, [active, verdictNow, upsertVerdict])
  const drift = useMemo(
    () => (verdictNow ? verdictDrift(verdictHistoryQ.data ?? [], thisMonthOn, verdictNow) : null),
    [verdictNow, verdictHistoryQ.data, thisMonthOn],
  )

  /**
   * Mở trình sửa kịch bản, tuỳ chọn nhắm sẵn vào một mốc.
   *
   * Mọi đường vào trình sửa đi qua đây thay vì gọi `setEditorOpen(true)` rải rác: bốn
   * chỗ gọi mà chỉ một chỗ nhớ dọn `editorFocusEventId` là lần mở SAU đó cuộn tới một
   * mốc người dùng không hề bấm — mốc của lần mở TRƯỚC còn sót lại trong state.
   */
  function openEditor(focusEventId?: string) {
    setEditorFocusEventId(focusEventId)
  }

  /** Mở Bảng theo năm dạng sheet, cuộn thẳng tới một năm. */
  function openYearTable(year?: number) {
    setTableFocusYear(year)
    setTableOpen(true)
  }

  /** Sửa bản nháp. Chưa có nháp thì tạo từ bản đã lưu — người dùng không phải "bắt đầu
   *  một bản nháp", họ chỉ kéo một thanh trượt. */
  const editDraft = useCallback(
    (mut: (d: ScenarioDraft) => ScenarioDraft) => {
      setDraft((cur) => {
        const base = cur ?? savedDraft
        return base ? mut(base) : cur
      })
    },
    [savedDraft],
  )

  async function refreshTree() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['lifeScenarios'] }),
      qc.invalidateQueries({ queryKey: ['lifePhases'] }),
      qc.invalidateQueries({ queryKey: ['lifeEvents'] }),
    ])
  }

  /**
   * Ghi nháp vào kịch bản. Trả về `true` khi ĐÃ ghi xong.
   *
   * Trả về boolean chứ không `void`: trình sửa kịch bản đóng drawer sau khi lưu, mà chỉ
   * khi lưu THÀNH CÔNG — lỗi mạng thì phải để drawer mở với nguyên bản nháp, chứ không
   * đóng lại và bỏ người dùng trước một trang trông như đã lưu. Thanh nháp đầu trang bỏ
   * qua giá trị này (nó không đóng gì cả).
   */
  async function handleCommit(): Promise<boolean> {
    if (!savedDraft || !draft || saving) return false
    setSaving(true)
    try {
      await commitDraft({ saved: savedDraft, draft, afterWrite: refreshTree })
      // Dọn nháp SAU khi ghi xong: dọn trước thì một lệnh lỗi để người dùng nhìn lại
      // bản cũ mà không biết mình vừa mất những gì.
      setDraft(null)
      setEditingEventId(null)
      showToast('Đã lưu vào kịch bản.', 'success')
      return true
    } catch (err) {
      // KHÔNG dọn nháp khi lỗi: người dùng vừa mất một lượt vặn, bắt họ làm lại từ đầu
      // là phạt họ vì mạng hỏng.
      showToast(err instanceof Error ? err.message : 'Không lưu được.', 'error')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveAsNew() {
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
      setEditingEventId(null)
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
  }

  // Tóm tắt MỘT DÒNG cho từng thẻ kịch bản: năm tự do tài chính và năm cạn tiền ở nhánh
  // bi quan. Không có nó thì dải thẻ chỉ là mấy cái tên, và "Về VN 2030" khác "Hiện tại"
  // ở chỗ nào thì phải bấm vào từng cái rồi đọc lại cả màn — so sánh bằng trí nhớ.
  //
  // Chiếu LẠI từng kịch bản là hợp lệ về chi phí: `projectLifetime` đo 0,063 ms cho một
  // bản chiếu 60 năm (cổng R6), nên ba kịch bản tốn ~0,2 ms.
  //
  // Cố ý đọc bản ĐÃ LƯU, không áp nháp: thẻ nói kịch bản đó LÀ gì, còn bản nháp là một
  // câu hỏi "nếu như" chưa thuộc về kịch bản nào.
  const scenarioSummaries = useMemo(() => {
    const birthYear = profile?.birth_year ?? 0
    const map = new Map<string, { fireYear: number | null; negativeYear: number | null }>()
    for (const s of scenarios) {
      const r = projectScenario(s.id)
      // Kịch bản chưa có chặng nào chiếu ra mảng rỗng — bỏ qua hẳn thay vì in
      // "FIRE không đạt · không năm nào âm", một kết luận về bản chiếu không tồn tại.
      if (r.length === 0) continue
      const v = lifetimeVerdict(r, birthYear)
      map.set(s.id, { fireYear: v.fireYear, negativeYear: v.negativeYear })
    }
    return map
  }, [scenarios, projectScenario, profile?.birth_year])

  // --- So sánh ------------------------------------------------------------------------
  const otherScenarios = useMemo(
    () => scenarios.filter((s) => s.id !== activeId),
    [scenarios, activeId],
  )
  const [compareId, setCompareId] = useState<string | null>(null)
  // Đổi chip kịch bản đang xem có thể làm compareId trùng activeId (đang so với chính
  // nó) — tự bỏ qua bằng cách SUY RA thay vì nhớ thêm một effect reset state.
  //
  // Kiểm luôn compareId CÒN TỒN TẠI, không chỉ khác activeId: xoá kịch bản đang được
  // chọn để so sánh để lại một compareId trỏ vào một dòng không còn nữa, và
  // `projectScenario` trả `[]` cho nó. `[]` KHÔNG phải `null`, nên đồ thị vẫn coi là
  // "đang so sánh": dải dao động cùng chú giải của nó biến mất và vùng đỏ co lại — tức
  // cảnh báo về nhánh bi quan tắt ngóm mà không câu nào nói ra.
  const effectiveCompareId =
    compareId !== null && otherScenarios.some((s) => s.id === compareId) ? compareId : null
  const compareRows = useMemo(
    () => (effectiveCompareId ? projectScenario(effectiveCompareId) : null),
    [effectiveCompareId, projectScenario],
  )
  const compareScenario = scenarios.find((s) => s.id === effectiveCompareId) ?? null

  if (isLoading) {
    return <p className="p-6 text-center text-fg-muted">Đang tải…</p>
  }

  // --- Trạng thái 1: chưa khai năm sinh — không chiếu được gì nếu thiếu nó ---
  if (needsBirthYear) {
    return <BirthYearCard />
  }

  // --- Trạng thái 2: chưa có kịch bản nào — nút thay wizard ---
  if (scenarios.length === 0) {
    return (
      <Card>
        <p className="text-sm text-fg-secondary">
          Tab này chiếu tài sản ròng của bạn tới hết đời, dựa trên thu chi nền và các mốc
          (cưới, sinh con, nghỉ hưu…). Tạo kịch bản đầu tiên từ đúng chi tiêu thật của bạn —
          không cần khai tay từng con số.
        </p>

        {/* Tài sản khởi điểm của kịch bản = tài sản ròng hiện tại: bắt đầu từ 0 dù đang có
            tiền là ấn tượng đầu tiên tệ nhất có thể. Hiện rõ số này ra đây để người dùng
            biết TRƯỚC khi bấm, không phải đoán. */}
        {!netWorthLoading && profile && (
          <p
            className={`mt-2 rounded-lg p-2.5 text-sm ${
              netWorthReliable
                ? 'bg-surface-sunken text-fg-secondary'
                : 'bg-state-warn-bg text-state-warn-fg'
            }`}
          >
            {netWorthReliable ? (
              <>
                Tài sản khởi điểm sẽ lấy từ tài sản ròng hiện tại:{' '}
                <b className="tabular-nums">{formatMoney(netWorth, profile.base_currency)}</b>.
              </>
            ) : (
              <>
                Một phần tài khoản/công nợ chưa quy đổi được tỷ giá nên chưa tính được tài sản
                ròng đáng tin. Tài sản khởi điểm sẽ để 0 — mở "Sửa kịch bản" sau khi tạo để tự
                nhập lại cho đúng.
              </>
            )}
          </p>
        )}

        {/* Thiếu `profile` thì `ensureFirstScenario` không có `base_currency` để đặt tiền
            hiển thị nên nó thoát ngay — và `needsBirthYear` là FALSE khi query profile LỖI
            chứ không phải chưa khai, nên trang dừng đúng ở đây. Nói ra bằng chữ, không chỉ
            làm mờ nút: nút disabled không đọc được `title` bằng chạm trên mobile. */}
        {!profile && (
          <p className="mt-2 rounded-lg bg-state-warn-bg text-state-warn-fg p-2.5 text-sm">
            Chưa tải được thông tin người dùng (năm sinh, tiền gốc) nên chưa tạo được kịch
            bản — kiểm tra mạng rồi mở lại màn này.
          </p>
        )}

        <button
          type="button"
          disabled={creating || netWorthLoading || !profile}
          title={
            profile ? undefined : 'Chưa tải được thông tin người dùng — thử lại sau khi có mạng'
          }
          onClick={async () => {
            setCreating(true)
            try {
              await ensureFirstScenario()
            } finally {
              setCreating(false)
            }
          }}
          className={actionButtonClass('primary', 'mt-3 w-full')}
        >
          <Sparkles className="h-4 w-4" />
          {creating || isCreatingFirstScenario
            ? 'Đang tạo…'
            : netWorthLoading
              ? 'Đang tính tài sản ròng…'
              : 'Tạo kịch bản từ chi tiêu thật của tôi'}
        </button>
      </Card>
    )
  }

  // --- Trạng thái 3: có dữ liệu — màn đầy đủ ---
  if (!active || !working || !shownInput) {
    // scenarios.length > 0 nên `active` luôn có giá trị ở nhánh này — guard này chỉ để
    // TS thu hẹp kiểu cho phần JSX bên dưới. Không phải trạng thái thật sẽ xảy ra.
    return <p className="p-6 text-center text-fg-muted">Đang tải…</p>
  }

  const currency = active.display_currency as CurrencyCode
  const birthYear = profile?.birth_year ?? shownInput.birthYear
  const maxYear = birthYear + shownInput.endAge

  // --- Hai câu phụ của băng kết luận --------------------------------------------------
  const negYear = firstNegativeYear(shownRows, 'low')
  const stressNegYear = stressRows ? firstNegativeYear(stressRows, 'low') : null
  const fire = fireYear(shownRows)

  // Dòng "Gợi ý" — con số DUY NHẤT trên màn mà người dùng hành động được ngay. Mọi thứ
  // khác nói "chuyện gì sẽ xảy ra", cái này nói "làm gì thì khác đi". Chỉ tính khi mốc
  // nhắm tới còn ở tương lai: gợi ý về một năm đã qua là một câu vô nghĩa.
  const suggestTarget =
    fire !== null
      ? fire - FIRE_EARLIER_TARGET_YEARS
      : birthYear + FIRE_FALLBACK_AGE
  const extraSavings =
    suggestTarget > currentYear ? extraSavingsForFire(shownInput, suggestTarget) : null
  const actionLine =
    extraSavings !== null && extraSavings > 0
      ? fire !== null
        ? `Gợi ý: muốn tự do tài chính sớm ${FIRE_EARLIER_TARGET_YEARS} năm (${suggestTarget}) — để dành thêm ${formatMoney(Math.round(extraSavings / 12), currency)}/tháng là tới.`
        : `Gợi ý: để tự do tài chính trước tuổi ${FIRE_FALLBACK_AGE} cần để dành thêm ${formatMoney(Math.round(extraSavings / 12), currency)}/tháng.`
      : null

  /**
   * "Thử nghỉ việc từ <năm FIRE>": cắm mẫu Nghỉ hưu vào năm đó và kéo tuổi chiếu lên 90,
   * trong BẢN NHÁP — thanh nháp bật lên như mọi lần sửa, Bỏ là về như cũ.
   */
  const handleTryRetire = (year: number) => {
    const result = buildRetireTrial(shownInput, active.id, year, pageFxOf)
    if (!result) {
      showToast('Chưa có chặng nào để dựa vào — thêm chặng trước rồi thử lại.', 'error')
      return
    }
    const seed = ++presetSeed.current
    editDraft((d) => applyRetireTrial(d, result, seed))
    const stretched = working.endAge < RETIRE_TRIAL_MIN_END_AGE
    showToast(
      `Đã thêm chặng Nghỉ hưu từ ${year}${stretched ? ` và kéo tuổi chiếu tới ${RETIRE_TRIAL_MIN_END_AGE}` : ''}. Đọc lại kết luận ở trên; không muốn giữ thì bấm Bỏ ở thanh nháp.`,
      'success',
      8000,
    )
  }

  const buildPresetCtx = (year: number): PresetContext => ({
    scenarioId: active.id,
    year,
    birthYear,
    currency: shownPhase?.currency ?? currency,
    country: shownPhase?.country ?? null,
    currentIncomeMinor: shownPhase?.annualIncomeMinor ?? 0,
    currentExpenseMinor: shownPhase?.annualExpenseMinor ?? 0,
    fxToDisplay: shownPhase?.fxToDisplay ?? 1,
    displayCurrency: currency,
    fxOf: (c) => {
      if (c === currency) return 1
      const r = ratesQ.data?.[c]
      return r ? 1 / r : null
    },
  })

  return (
    <div className="space-y-3">
      {/* Header: một dòng chú thích canh phải. Không có <h1>: tab "Tương lai" ngay trên
          đã là tên màn này, và vỏ AssetsPage đã có <h1> "Tài sản". */}
      {profile?.birth_year != null && (
        <p className="truncate text-right text-sm text-fg-muted">
          Sinh {profile.birth_year} · chiếu đến tuổi {shownInput.endAge} ·{' '}
          <span className="font-mono">{currency}</span>
        </p>
      )}

      {/* Dải thẻ kịch bản, XUỐNG DÒNG (bản vẽ v5) thay vì cuộn ngang. Cuộn ngang giấu
          kịch bản thứ hai trở đi sau một cú vuốt mà không có gì báo là còn thứ nằm
          khuất; ở đây một dòng thừa còn hơn một danh sách vô hình.
          Kịch bản CHÍNH (cái mà thông báo và thẻ ở trang Tài sản đọc theo) mang ngôi
          sao; suy từ `pickActive` — một luật với engine/bộ luật thông báo. */}
      <div className="flex flex-wrap items-stretch gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          {scenarios.map((s) => {
            const isPrimary = pickActive(scenarios)?.id === s.id
            const sum = scenarioSummaries.get(s.id)
            const isActive = s.id === activeId
            const comparing = effectiveCompareId === s.id
            return (
              // Thẻ là <div> chứa HAI nút, không phải một nút lồng trong nút: HTML không
              // cho lồng <button>, và trình duyệt sẽ tự tách chúng ra thành hai phần tử
              // anh em ở chỗ không ai lường trước.
              <div
                key={s.id}
                // `max-w-full` + `min-w-0`, KHÔNG `shrink-0`: dải chip nay XUỐNG DÒNG
                // thay vì cuộn ngang, nên một cái tên dài ("Kịch bản của tôi (bản sao)
                // (thử)" = 267px) không co lại được sẽ thò ra khỏi khung 224px ở 375px.
                // Cuộn ngang thì đó không phải vấn đề — xuống dòng thì phải cắt.
                className={`flex min-w-0 max-w-full items-center gap-2 rounded-md border px-3 py-1.5 transition ${
                  isActive
                    ? 'border-accent bg-state-good-bg'
                    : 'border-border-strong bg-surface'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveId(s.id)}
                  aria-pressed={isActive}
                  // Kết quả của kịch bản chuyển vào `title`: bản vẽ v5 rút chip xuống
                  // một dòng. Dải chip nay xuống dòng chứ không cuộn, nên chip hai dòng
                  // ×4 kịch bản đẩy đồ thị xuống gần một màn hình — mà cùng hai con số
                  // đó đã nằm ngay trong băng kết luận ngay dưới, cho kịch bản ĐANG xem.
                  title={
                    sum
                      ? `${sum.fireYear !== null ? `FIRE ${sum.fireYear}` : 'FIRE không đạt'} · ${
                          sum.negativeYear !== null
                            ? `âm từ ${sum.negativeYear}`
                            : 'không năm nào âm'
                        }`
                      : undefined
                  }
                  className="min-w-0 min-h-11 text-left"
                >
                  <span className="flex min-w-0 items-center gap-1 text-sm font-medium text-fg-primary">
                    {isPrimary && <Star className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                    <span className="truncate">{s.name}</span>
                    {isPrimary && <span className="sr-only">(kịch bản chính)</span>}
                    {isActive && dirty && (
                      <span className="rounded-full border border-state-warn-border bg-state-warn-bg px-1.5 text-2xs font-semibold text-state-warn-fg">
                        nháp
                      </span>
                    )}
                  </span>
                </button>
                {/* Nút "So" nằm TRÊN CHÍNH thẻ kịch bản muốn so, không phải một nút "So
                    sánh" chung rồi mở một hộp chọn: hộp chọn đó lặp lại đúng danh sách
                    đang hiện ngay trước mắt, và thêm hai cú bấm cho một việc mà chỗ bấm
                    tự nhiên đã nằm sẵn dưới ngón tay. */}
                {!isActive && (
                  <button
                    type="button"
                    onClick={() => setCompareId(comparing ? null : s.id)}
                    aria-pressed={comparing}
                    aria-label={comparing ? `Thôi so với ${s.name}` : `So với ${s.name}`}
                    className={filterChipClass(comparing)}
                  >
                    {comparing ? 'Đang so' : 'So'}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex shrink-0 items-start gap-2">
          <ActionButton
            onClick={() => void duplicateActiveScenario()}
            disabled={duplicatingScenario}
            className="whitespace-nowrap"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {duplicatingScenario ? 'Đang tạo…' : 'Kịch bản mới'}
          </ActionButton>
        </div>
      </div>

      {/* Băng kết luận đứng TRƯỚC đồ thị và trước cả hai cột: người dùng không phải cuộn
          qua cả bản chiếu 60 năm mới đọc được KẾT LUẬN của chính bản chiếu đó ("kết luận
          trước, bằng chứng sau", §14). Nó phủ hết bề ngang, không rơi vào cột nào. */}
      {profile?.birth_year != null && (
        <InsightCards
          rows={shownRows}
          input={shownInput}
          birthYear={profile.birth_year}
          currency={currency}
          scenarioName={active.name}
          actionLine={actionLine}
          reality={reality}
          realityMonths={baseline?.monthsCovered ?? null}
          onTryRetire={handleTryRetire}
          // Đang có nháp thì hộp trên nói về NHÁP, còn độ trôi so bản ĐÃ LƯU — hai câu về
          // hai bản chiếu khác nhau đứng cạnh nhau là đánh đố. Ẩn cho tới khi Lưu hoặc Bỏ.
          drift={dirty ? null : drift}
          driftHistory={verdictHistoryQ.data ?? []}
          stressNote={
            stressRows
              ? stressNegYear !== null
                ? `Với cú sốc đang bật: nhánh bi quan âm từ ${stressNegYear}.`
                : 'Với cú sốc đang bật: vẫn không năm nào âm.'
              : null
          }
          // Hai ô mang một NĂM thành nút mở Bảng theo năm ở đúng năm đó — "vì sao 2060?"
          // trả lời được ngay tại chỗ đọc thấy con số.
          onJumpToYear={openYearTable}
        />
      )}

      {/* MỘT CỘT (bản vẽ v5). Trước đây là lưới hai cột: đồ thị bên trái, ba panel vặn
          bên phải — và dưới `xl` ba panel đó phải chui vào một sheet đáy, tức cùng một
          bộ điều khiển tồn tại ở hai chỗ với hai bố cục. Nay mọi ô sửa nằm trong BÀN SỬA
          ngay dưới đồ thị, cùng một mặt phẳng, một bản duy nhất ở mọi bề ngang. */}
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-col">
          {/* Thanh nháp DÁN vào đầu thẻ đồ thị (bo góc trên, không viền dưới) thay vì
              đứng rời ở đầu trang: nó nói về chính bản chiếu ngay dưới nó, và đặt rời
              thì ở màn hẹp nó trôi khỏi tầm mắt đúng lúc người dùng đang vặn. */}
          {dirty && savedDraft && (
            <DraftBanner
              scenarioName={active.name}
              changes={changes}
              endBeforeMinor={
                baselineRows && baselineRows.length > 0
                  ? baselineRows[baselineRows.length - 1].assetsEndMinor
                  : null
              }
              endAfterMinor={
                shownRows.length > 0 ? shownRows[shownRows.length - 1].assetsEndMinor : null
              }
              currency={currency}
              onCommit={handleCommit}
              onSaveAsNew={() => void handleSaveAsNew()}
              onDiscard={() => {
                setDraft(null)
                setEditingEventId(null)
              }}
              saving={saving}
              attached
            />
          )}
          <LifetimeChartCard
            rows={shownRows}
            historyRows={historyRows}
            currency={currency}
            compare={compareRows}
            compareCurrency={
              compareScenario ? (compareScenario.display_currency as CurrencyCode) : null
            }
            compareName={compareScenario?.name ?? null}
            // networth_snapshots luôn ở base currency của profile, KHÔNG phải
            // display_currency của kịch bản — bắt buộc truyền để thẻ tự phát hiện lệch và
            // ẩn đường lịch sử thay vì vẽ sai đơn vị.
            historyCurrency={profile?.base_currency ?? currency}
            baseline={baselineRows}
            stressRows={stressRows}
            phases={working.phases.map((p) => ({
              id: p.id,
              startYear: p.startYear,
              label: p.label,
            }))}
            events={working.events}
            onMoveEvent={(id, startYear) =>
              editDraft((d) => {
                const ev = d.events.find((e) => e.id === id)
                if (!ev) return d
                // Kéo năm bắt đầu thì năm kết thúc đi theo, giữ nguyên ĐỘ DÀI: "nuôi con
                // 22 năm" dời sang 2033 vẫn phải là 22 năm.
                const span = ev.endYear !== null ? ev.endYear - ev.startYear : null
                return patchDraftEvent(d, id, {
                  startYear,
                  ...(span !== null && { endYear: startYear + span }),
                })
              })
            }
            onSelectEvent={setEditingEventId}
            editingEventId={editingEventId}
            eventEditor={
              editingEvent === null
                ? undefined
                : (pos) => (
                <EventEditorPopover
                  event={editingEvent}
                  // Toạ độ do thẻ đồ thị tính — nó là chỗ duy nhất biết năm nào ra pixel nào.
                  anchorX={pos.anchorX}
                  plotWidth={pos.plotWidth}
                  top={pos.top}
                  minYear={currentYear}
                  maxYear={maxYear}
                  chang={changCuaMoc}
                  onPatch={(patch) =>
                    editDraft((d) => patchDraftEvent(d, editingEvent.id, patch))
                  }
                  onDelete={() => {
                    editDraft((d) => removeDraftEvent(d, editingEvent.id))
                    setEditingEventId(null)
                    showToast(`Đã bỏ mốc "${editingEvent.label}" khỏi bản nháp.`, 'success')
                  }}
                  onClose={() => setEditingEventId(null)}
                />
              )
            }
          />
        </div>

        {compareScenario && compareRows && compareRows.length > 0 && (
          <CompareStrip
            left={{
              name: `${active.name}${dirty ? ' (nháp)' : ''}`,
              rows: shownRows,
              currency,
              active: true,
            }}
            right={{
              name: compareScenario.name,
              rows: compareRows,
              currency: compareScenario.display_currency as CurrencyCode,
              active: false,
            }}
            endAge={shownInput.endAge}
            currencyMismatch={compareScenario.display_currency !== active.display_currency}
          />
        )}

        {/* BÀN SỬA KỊCH BẢN — ngay dưới đồ thị, cùng một mặt phẳng. Sửa tới đâu nhìn lên
            thấy tới đó; không còn lớp phủ nào che mất thứ đang được lái. */}
        {profile && savedDraft && working && (
          <ScenarioWorkbench
            // `key`: bàn sửa giữ vài state khởi tạo MỘT LẦN lúc gắn (tab đang mở, năm
            // sinh đang gõ). `active` đổi danh tính thì phải dựng lại, không thì ô năm
            // sinh còn giữ chuỗi của kịch bản trước.
            key={active.id}
            scenario={active}
            scenarios={scenarios}
            phaseRows={phases}
            eventRows={events}
            profile={profile}
            baseline={baseline}
            netWorth={netWorth}
            netWorthReliable={netWorthReliable}
            netWorthLoading={netWorthLoading}
            working={working}
            changes={changes}
            input={shownInput}
            currentYear={currentYear}
            onEdit={editDraft}
            onSelectScenario={setActiveId}
            refreshTree={refreshTree}
            stress={stress}
            onStress={setStress}
            stressNegativeYear={stressNegYear}
            baseNegativeYear={negYear}
            nominal={nominal}
            onNominal={setNominal}
            inflationBps={inflationBps}
            onInflation={setInflationBps}
            fxOf={pageFxOf}
            focusEventId={editorFocusEventId}
            presetChips={
              <PresetPanel
                variant="inline"
                buildCtx={buildPresetCtx}
                // Mặc định 2 năm nữa, không phải năm nay: mốc cuộc đời gần như luôn ở
                // tương lai, và một mốc rơi đúng năm hiện tại thì chip của nó dán vào
                // mép trái đồ thị, chỗ khó kéo nhất.
                defaultYear={currentYear + 2}
                currency={currency}
                onAdd={(preset, result) => {
                  const seed = ++presetSeed.current
                  editDraft((d) => applyPreset(d, result, seed))
                  showToast(
                    `Đã thêm "${preset.label}" vào năm ${currentYear + 2} — kéo chip trên đồ thị tới đúng năm.`,
                    'success',
                  )
                }}
              />
            }
          />
        )}

        <YearTableSection
          rows={shownRows}
          currency={currency}
          scenarioName={active.name}
          onEditEvent={(eventId) => openEditor(eventId)}
        />

      </div>

      {/* Bảng theo năm dạng sheet — đường vào từ hai ô kết luận có NĂM. Bản gấp mở trong
          cột trái lo việc đối chiếu với đồ thị; sheet này lo việc soi MỘT năm. */}
      {tableOpen && (
        <YearTableView
          rows={shownRows}
          currency={currency}
          scenarioName={active.name}
          focusYear={tableFocusYear}
          // Bấm một sự kiện trong bảng → đóng bảng, mở thẳng form của chính nó. Đóng
          // trước chứ không chồng hai lớp phủ: cả hai đều ở z-40, xếp lên nhau thì Esc
          // đóng nhầm lớp và nền mờ tô hai lần.
          onEditEvent={(eventId) => {
            setTableOpen(false)
            openEditor(eventId)
          }}
          onClose={() => setTableOpen(false)}
        />
      )}


    </div>
  )
}

/** Trạng thái 1: chưa khai năm sinh — hỏi một ô, kèm lý do vì sao cần. */
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
    <Card>
      <p className="text-sm text-fg-secondary">
        Tab này chiếu tài sản ròng của bạn theo từng năm tới hết đời, nên cần năm sinh để đổi
        qua lại giữa "năm" và "tuổi" ở mỗi mốc trên đồ thị (nghỉ hưu, tự do tài chính…). Thiếu
        năm sinh thì không tính được tuổi, nên chưa chiếu được gì.
      </p>
      <label htmlFor="lifetime-birth-year" className="mt-3 block text-sm font-medium text-fg-muted">
        Năm sinh
      </label>
      <input
        id="lifetime-birth-year"
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
