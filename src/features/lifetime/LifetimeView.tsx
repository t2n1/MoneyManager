import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Plus, Sparkles, SlidersHorizontal, Star } from 'lucide-react'
import { ActionButton, Card } from '../../components/ui'
import { repo } from '../../data'
import { useNetWorthSnapshots } from '../../hooks/queries'
import { useEscClose } from '../../hooks/useEscClose'
import type { CurrencyCode } from '../../lib/currencies'
import { showToast } from '../../lib/dialog'
import { formatMoney } from '../../lib/money'
import { fetchRates } from '../../lib/rates'
import { AssumptionSliders } from './AssumptionSliders'
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
import { extraSavingsForFire, firstNegativeYear, fireYear } from './insights'
import { InsightCards } from './InsightCards'
import { LifetimeChartCard } from './LifetimeChartCard'
import type { PresetContext } from './presets'
import { PresetPanel } from './PresetPanel'
import { hasStress, NO_STRESS, projectLifetime, type StressConfig } from './project'
import { commitDraft, saveDraftAsNewScenario } from './saveDraft'
import { ScenarioEditorSheet, type EditorInitialSheet } from './ScenarioEditorSheet'
import { defaultStress, StressPanel } from './StressPanel'
import { pickActive } from './buildInput'
import { lifetimeVerdict } from './summary'
import { useLifetime } from './useLifetime'
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

  // `editorEntry` = form con mở sẵn khi trình sửa vừa hiện (xem prop `initialSheet` ở
  // ScenarioEditorSheet). Đi CÙNG `editorOpen` chứ không thay nó: mở trình sửa mà không
  // mở form con nào vẫn là ca thường gặp nhất.
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorEntry, setEditorEntry] = useState<EditorInitialSheet | undefined>(undefined)
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

  const shownInput = useMemo(
    () => (input && working ? priceOpts(draftToInput(input, working)) : null),
    [input, working, priceOpts],
  )
  const shownRows = useMemo(() => (shownInput ? projectLifetime(shownInput) : []), [shownInput])

  const currentYear = input?.currentYear ?? new Date().getFullYear()
  const changes = useMemo(
    () => (savedDraft && draft ? draftChanges(savedDraft, draft, currentYear) : []),
    [savedDraft, draft, currentYear],
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

  const shownPhaseIndex = working ? draftPhaseIndex(working, currentYear) : -1
  const shownPhase =
    shownInput && shownPhaseIndex >= 0 ? shownInput.phases[shownPhaseIndex] : null

  /**
   * Mở trình sửa kịch bản, tuỳ chọn mở SẴN một form con.
   *
   * Mọi đường vào trình sửa đi qua đây thay vì gọi `setEditorOpen(true)` rải rác: bốn
   * chỗ gọi mà chỉ một chỗ nhớ dọn `editorEntry` là lần mở SAU đó bật lên một form con
   * người dùng không hề bấm — form của lần mở TRƯỚC còn sót lại trong state.
   */
  function openEditor(entry?: EditorInitialSheet) {
    setEditorEntry(entry)
    setEditorOpen(true)
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

  /** Đè một trường của chặng đang chạy. */
  const editCurrentPhase = useCallback(
    (patch: { annualIncomeMinor?: number; annualExpenseMinor?: number }) => {
      editDraft((d) => {
        const i = draftPhaseIndex(d, currentYear)
        if (i < 0) return d
        return { ...d, phases: d.phases.map((p, j) => (j === i ? { ...p, ...patch } : p)) }
      })
    },
    [editDraft, currentYear],
  )

  async function refreshTree() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['lifeScenarios'] }),
      qc.invalidateQueries({ queryKey: ['lifePhases'] }),
      qc.invalidateQueries({ queryKey: ['lifeEvents'] }),
    ])
  }

  async function handleCommit() {
    if (!savedDraft || !draft || saving) return
    setSaving(true)
    try {
      await commitDraft({ saved: savedDraft, draft, afterWrite: refreshTree })
      // Dọn nháp SAU khi ghi xong: dọn trước thì một lệnh lỗi để người dùng nhìn lại
      // bản cũ mà không biết mình vừa mất những gì.
      setDraft(null)
      setEditingEventId(null)
      showToast('Đã lưu vào kịch bản.', 'success')
    } catch (err) {
      // KHÔNG dọn nháp khi lỗi: người dùng vừa mất một lượt vặn, bắt họ làm lại từ đầu
      // là phạt họ vì mạng hỏng.
      showToast(err instanceof Error ? err.message : 'Không lưu được.', 'error')
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
  // Điều kiện banner cảnh báo tỷ giá bằng 1: bất kỳ chặng/sự kiện nào của kịch bản ĐANG
  // CHỌN có tiền khác tiền hiển thị nhưng tỷ giá vẫn còn 1 — gần như chắc chắn là ô chưa
  // ai khai, không phải giả định thật.
  const mismatchCount = useMemo(() => {
    if (!active) return 0
    const inPhases = phases.filter(
      (p) => p.currency !== active.display_currency && p.fx_to_display === 1,
    ).length
    const inEvents = events.filter(
      (e) => e.currency !== active.display_currency && e.fx_to_display === 1,
    ).length
    return inPhases + inEvents
  }, [active, phases, events])

  // Tỷ giá "hôm nay" cho thư viện mẫu — cùng nguồn và cùng luật với ScenarioEditorSheet:
  // tra được thì dùng, không tra được thì để 1 và banner ở trên bắt ngay. Sai một cách
  // nhìn thấy được, không sai âm thầm (xem `fxForEvent` trong presets.ts).
  const ratesQ = useQuery({
    queryKey: ['lifetime-rates-for', active?.display_currency],
    queryFn: () => fetchRates(active?.display_currency as CurrencyCode),
    enabled: !!active,
    staleTime: 12 * 3600_000,
    gcTime: 24 * 3600_000,
    retry: 1,
  })

  /** Sheet đáy chứa cả ba panel vặn — chỉ dùng dưới `xl`. */
  const [sheetOpen, setSheetOpen] = useState(false)
  useEscClose(() => setSheetOpen(false), sheetOpen)

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
            className={`mt-2 rounded-lg p-2.5 text-xs ${
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
          <p className="mt-2 rounded-lg bg-state-warn-bg text-state-warn-fg p-2.5 text-xs">
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
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-accent text-fg-on-accent px-3 text-sm font-semibold transition active:scale-95 disabled:opacity-50"
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
  const editingEvent = working.events.find((e) => e.id === editingEventId) ?? null

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

  const buildPresetCtx = (year: number): PresetContext => ({
    scenarioId: active.id,
    year,
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

  const panels = shownPhase ? (
    <>
      <AssumptionSliders
        input={shownInput}
        phase={shownPhase}
        birthYear={birthYear}
        lastPhase={
          working.phases.length > 0
            ? {
                label: working.phases[working.phases.length - 1].label,
                startYear: working.phases[working.phases.length - 1].startYear,
              }
            : null
        }
        prevPhaseStartYear={
          working.phases.length > 1
            ? working.phases[working.phases.length - 2].startYear
            : null
        }
        onIncome={(v) => editCurrentPhase({ annualIncomeMinor: v })}
        onExpense={(v) => editCurrentPhase({ annualExpenseMinor: v })}
        onReturn={(bps) => editDraft((d) => ({ ...d, realReturnBps: bps }))}
        onRetireYear={(year) =>
          editDraft((d) => ({
            ...d,
            phases: d.phases.map((p, i) =>
              i === d.phases.length - 1 ? { ...p, startYear: year } : p,
            ),
          }))
        }
        onEndAge={(age) => editDraft((d) => ({ ...d, endAge: age }))}
        nominal={nominal}
        onNominal={setNominal}
        inflationBps={inflationBps}
        onInflation={setInflationBps}
        // `undefined` khi thiếu profile: trình sửa lấy năm sinh từ đó, và thiếu nó thì
        // sheet thành một ngõ cụt (nút Lưu tắt vĩnh viễn). Ca này chỉ xảy ra khi query
        // profile LỖI — `needsBirthYear` ở trên chỉ bắt ca đã tải mà chưa khai.
        onEditScenario={profile ? () => openEditor() : undefined}
      />

      <StressPanel
        value={stress}
        onChange={setStress}
        currency={currency}
        minYear={currentYear}
        maxYear={maxYear}
        baseNegativeYear={negYear}
        stressNegativeYear={stressNegYear}
        birthYear={birthYear}
      />

      <PresetPanel
        buildCtx={buildPresetCtx}
        // Mặc định 2 năm nữa, không phải năm nay: mốc cuộc đời gần như luôn ở tương lai,
        // và một mốc rơi đúng năm hiện tại thì chip của nó dán vào mép trái đồ thị, chỗ
        // khó kéo nhất.
        defaultYear={currentYear + 2}
        currency={currency}
        onAdd={(preset, result) => {
          const seed = ++presetSeed.current
          editDraft((d) => applyPreset(d, result, seed))
          setSheetOpen(false)
          showToast(
            `Đã thêm "${preset.label}" vào bản nháp ở năm ${currentYear + 2} — kéo chip trên đồ thị tới đúng năm.`,
            'success',
          )
        }}
      />
    </>
  ) : (
    /* Kịch bản chưa có chặng nào thì KHÔNG có thanh trượt (không biết vặn thu/chi của
       chặng nào), và lúc đó cột phải trống trơn bên cạnh một đồ thị rỗng. */
    profile && (
      <Card elevation="panel" padding="panel">
        <p className="text-xs text-fg-secondary">
          Kịch bản chưa có chặng thu chi nào nên chưa chiếu được gì.
        </p>
        <ActionButton onClick={() => openEditor({ kind: 'phase-new' })} className="mt-2">
          Thêm chặng
        </ActionButton>
      </Card>
    )
  )

  return (
    <div className="space-y-3">
      {/* Header: một dòng chú thích canh phải. Không có <h1>: tab "Tương lai" ngay trên
          đã là tên màn này, và vỏ AssetsPage đã có <h1> "Tài sản". */}
      {profile?.birth_year != null && (
        <p className="truncate text-right text-xs text-fg-muted">
          Sinh {profile.birth_year} · chiếu đến tuổi {shownInput.endAge} ·{' '}
          <span className="font-mono">{currency}</span>
        </p>
      )}

      {/* Dải thẻ kịch bản, cuộn ngang. Mỗi thẻ hai dòng: TÊN và KẾT QUẢ của chính kịch
          bản đó. Kịch bản CHÍNH (cái mà thông báo và thẻ ở trang Tài sản đọc theo) mang
          ngôi sao; suy từ `pickActive` — một luật với engine/bộ luật thông báo.
          `basis-full` dưới `sm`: ở 375px hai nút bên phải ăn ~211px và dải chip còn
          140px, tức đúng MỘT chip rưỡi — kịch bản thứ hai trở đi chỉ tới được bằng một
          cú vuốt mà không có gì báo là còn thứ nằm khuất. */}
      <div className="flex flex-wrap items-stretch gap-2">
        <div className="flex min-w-0 basis-full gap-2 overflow-x-auto pb-1 sm:basis-0 sm:flex-1">
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
                className={`flex shrink-0 items-center gap-2 rounded-md border px-3 py-1.5 transition ${
                  isActive
                    ? 'border-accent bg-state-good-bg'
                    : 'border-border-strong bg-surface'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveId(s.id)}
                  aria-pressed={isActive}
                  className="min-h-11 text-left"
                >
                  <span className="flex items-center gap-1 text-sm font-medium text-fg-primary">
                    {isPrimary && <Star className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                    {s.name}
                    {isPrimary && <span className="sr-only">(kịch bản chính)</span>}
                    {isActive && dirty && (
                      <span className="rounded-full border border-state-warn-border bg-state-warn-bg px-1.5 text-3xs font-semibold text-state-warn-fg">
                        nháp
                      </span>
                    )}
                  </span>
                  {/* Dòng tóm tắt vắng mặt khi kịch bản chưa chiếu được năm nào — viết
                      "FIRE không đạt" lúc đó là kết luận về một bản chiếu không tồn tại. */}
                  {sum && (
                    <span className="mt-0.5 block whitespace-nowrap font-mono text-2xs text-fg-muted">
                      {sum.fireYear !== null ? `FIRE ${sum.fireYear}` : 'FIRE không đạt'}
                      {' · '}
                      <span className={sum.negativeYear !== null ? 'text-money-out' : ''}>
                        {sum.negativeYear !== null
                          ? `âm từ ${sum.negativeYear}`
                          : 'không năm nào âm'}
                      </span>
                    </span>
                  )}
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
                    className={`min-h-11 shrink-0 rounded-full border px-2.5 text-2xs font-semibold transition active:scale-95 ${
                      comparing
                        ? 'border-accent bg-accent text-fg-on-accent'
                        : 'border-border-strong text-fg-muted'
                    }`}
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
          onCommit={() => void handleCommit()}
          onSaveAsNew={() => void handleSaveAsNew()}
          onDiscard={() => {
            setDraft(null)
            setEditingEventId(null)
          }}
          saving={saving}
        />
      )}

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

      {/* HAI CỘT từ `xl`: đồ thị nở lấy phần còn lại, cột phụ 25rem = 400px theo §1.4.
          Theo REM chứ px vì cột này toàn chữ và số — ở cỡ chữ "Rất lớn" một bề ngang px
          cứng không giãn theo và ba dòng nhãn thanh trượt bị ép xuống hai hàng.
          `xl` chứ không `lg`: trong khoảng 1024–1280 cột phụ tụt xuống dưới 320px và
          khối thanh trượt phải cuộn ngang. */}
      <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,1fr)_25rem] xl:items-start">
        <div className="flex min-w-0 flex-col gap-3">
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

          <YearTableSection
            rows={shownRows}
            currency={currency}
            scenarioName={active.name}
            onEditEvent={(eventId) => openEditor({ kind: 'event-edit', eventId })}
          />
        </div>

        <div className="flex flex-col gap-3">
          {/* Từ `xl` ba panel đứng NGAY CẠNH đồ thị: vặn ở đây thì thứ đổi ngay bên trái
              là bản chiếu, và thứ đổi ngay phía trên là kết luận.
              Dưới `xl` chúng đi vào sheet đáy. Lý do cũ vẫn đúng và nay còn mạnh hơn: ở
              390px riêng khối thanh trượt đã 268px trong khi đồ thị 208px — thứ để LÁI
              chiếm nhiều chỗ hơn thứ nó lái — và giờ có thêm hai panel nữa. Hai bản dùng
              CHUNG một `draft`/`stress` nên không có đường nào để chúng lệch nhau, và mỗi
              bề ngang chỉ có đúng một bản nằm trong cây a11y. */}
          <div className="hidden xl:contents">{panels}</div>

          <ActionButton onClick={() => setSheetOpen(true)} className="self-start xl:hidden">
            <SlidersHorizontal className="h-4 w-4" strokeWidth={2} />
            Vặn thử
            {dirty && <span className="text-fg-warn"> · chưa lưu</span>}
          </ActionButton>

          {sheetOpen && (
            <div
              className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
              onClick={() => setSheetOpen(false)}
            >
              <div
                className="flex max-h-[92vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-2xl bg-surface-page p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
                onClick={(e) => e.stopPropagation()}
              >
                {panels}
                <ActionButton onClick={() => setSheetOpen(false)} className="w-full">
                  Đóng
                </ActionButton>
              </div>
            </div>
          )}

          {/* Banner cảnh báo tỷ giá bằng 1 — BẮT BUỘC, không có nút tắt. Trên mobile chỉ
              hiện SỐ LƯỢNG, không liệt kê từng khoản. */}
          {mismatchCount > 0 && (
            <button
              type="button"
              onClick={() => openEditor()}
              disabled={!profile}
              className="flex min-h-11 w-full items-start gap-2 rounded-md bg-state-warn-bg text-state-warn-fg px-3 py-2 text-left text-sm transition active:scale-95 disabled:active:scale-100"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {mismatchCount} khoản đang dùng tỷ giá giả định bằng 1 — gần như chắc chắn sai.
                Bấm để sửa.
              </span>
            </button>
          )}
        </div>
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
            openEditor({ kind: 'event-edit', eventId })
          }}
          onClose={() => setTableOpen(false)}
        />
      )}

      {/* Trình sửa kịch bản — mở từ link "Sửa kịch bản" trong panel Giả định hoặc từ
          banner cảnh báo tỷ giá. `profile` + ba giá trị tài sản ròng truyền XUỐNG chứ
          không để sheet tự gọi `useLifetime()` lần hai. */}
      {editorOpen && active && profile && (
        <ScenarioEditorSheet
          // `key`: sheet khởi tạo MỌI ô của khối 1 bằng `useState(scenario.*)`, tức chỉ
          // đọc một lần lúc gắn. `active` có thể đổi danh tính trong lúc sheet đang mở —
          // không có `key` thì React DÙNG LẠI instance cũ và lần lưu kế tiếp ghi số cũ
          // lên kịch bản mới.
          key={active.id}
          scenario={active}
          scenarios={scenarios}
          phases={phases}
          events={events}
          profile={profile}
          netWorth={netWorth}
          netWorthReliable={netWorthReliable}
          netWorthLoading={netWorthLoading}
          initialSheet={editorEntry}
          onClose={() => setEditorOpen(false)}
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
      <label htmlFor="lifetime-birth-year" className="mt-3 block text-xs font-medium text-fg-muted">
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
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-accent text-fg-on-accent px-3 text-sm font-semibold transition active:scale-95 disabled:opacity-40"
      >
        {saveMut.isPending ? 'Đang lưu…' : 'Lưu năm sinh'}
      </button>
    </Card>
  )
}
