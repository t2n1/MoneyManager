import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Plus, SlidersHorizontal, Sparkles, Star } from 'lucide-react'
import { ActionButton, Card } from '../../components/ui'
import { repo } from '../../data'
import { useNetWorthSnapshots } from '../../hooks/queries'
import { useEscClose } from '../../hooks/useEscClose'
import type { CurrencyCode } from '../../lib/currencies'
import { showToast } from '../../lib/dialog'
import { formatMoney } from '../../lib/money'
import {
  applyOverride,
  currentPhaseIndex,
  hasOverride,
  NO_OVERRIDE,
  type AssumptionOverride,
} from './assumptions'
import { AssumptionSliders } from './AssumptionSliders'
import { projectLifetime } from './project'
import { pickActive } from './buildInput'
import { InsightCards } from './InsightCards'
import { LifetimeChartCard } from './LifetimeChartCard'
import { ScenarioEditorSheet, type EditorInitialSheet } from './ScenarioEditorSheet'
import { lifetimeVerdict } from './summary'
import { TimelineStrip } from './TimelineStrip'
import { useLifetime } from './useLifetime'
import { YearTableView } from './YearTableView'

/** Ô nhập năm sinh khớp ràng buộc DB (migration 0031: `birth_year between 1900 and 2100`). */
const MIN_BIRTH_YEAR = 1900
const MAX_BIRTH_YEAR = 2100

/** Lifetime (mục Lifetime): chiếu tài sản ròng cả đời. Ba trạng thái — chưa khai năm
 * sinh, chưa có kịch bản, có dữ liệu — không có trạng thái nào để trống.
 *
 * Là tab con "Tương lai" của Tài sản (`/assets?view=future`), không còn trang riêng: trước
 * đây đường vào duy nhất là một teaser chôn ở khối thứ 4 trên trang Tài sản. Vì vậy không
 * có nút back và không tự đặt padding — vỏ AssetsPage lo cả hai.
 * Xem docs/information-architecture.md §2.3. */
export function LifetimeView() {
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

  // `editorEntry` = form con mở sẵn khi trình sửa vừa hiện (xem prop `initialSheet` ở
  // ScenarioEditorSheet). Đi CÙNG `editorOpen` chứ không thay nó: mở trình sửa mà không
  // mở form con nào vẫn là ca thường gặp nhất (link "Sửa kịch bản", banner tỷ giá).
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorEntry, setEditorEntry] = useState<EditorInitialSheet | undefined>(undefined)
  const [tableOpen, setTableOpen] = useState(false)
  /** Năm mà Bảng theo năm phải cuộn tới khi mở — đặt từ hai ô kết luận có NĂM. */
  const [tableFocusYear, setTableFocusYear] = useState<number | undefined>(undefined)
  const [creating, setCreating] = useState(false)
  const { data: historyRows = [] } = useNetWorthSnapshots()

  // (Chặng đang hiệu lực từng được tính riêng ở đây để in một dòng "Giả định: thu … chi
  // … lợi suất …" phía trên đồ thị. Dòng đó đã đi: panel Giả định in đúng ba con số ấy
  // trên ba thanh trượt, và hai bản in cùng lúc là hai số khác nhau dưới cùng một nhãn —
  // dòng trên in giá trị ĐÃ LƯU còn thanh trượt in giá trị ĐANG THỬ. Chặng đang hiệu lực
  // nay lấy từ `shownPhase` bên dưới, suy từ chính input đang vẽ.)

  // --- Thanh trượt giả định (§4.4 / 13b) --------------------------------------------
  //
  // `override` là lớp đè SỐNG TRONG BỘ NHỚ: kéo thì bản chiếu đổi ngay, nhưng dữ liệu
  // chỉ bị ghi khi bấm Lưu. Nhờ vậy "thử xem nếu chi ít hơn thì sao" không còn là một
  // lần ghi đè kịch bản thật rồi phải nhớ sửa lại.
  const [override, setOverride] = useState<AssumptionOverride>(NO_OVERRIDE)
  const [dragging, setDragging] = useState(false)
  const [savingAssumptions, setSavingAssumptions] = useState(false)
  /** Sheet đáy chứa ba thanh trượt — chỉ dùng dưới lg (mock turn 24). */
  const [sheetOpen, setSheetOpen] = useState(false)
  useEscClose(() => setSheetOpen(false), sheetOpen)
  const qc = useQueryClient()

  // Đổi kịch bản thì lớp đè phải rơi: giá trị đang kéo là của chặng thuộc kịch bản CŨ,
  // giữ lại là âm thầm áp thu/chi của kịch bản này lên kịch bản kia.
  useEffect(() => setOverride(NO_OVERRIDE), [activeId])

  // Chiếu lại NGAY (cổng R6 đã mở — xem assumptions.ts). Không đè gì thì `applyOverride`
  // trả về chính `input`, nên `useMemo` giữ tham chiếu và `rows` sẵn có được dùng lại
  // nguyên vẹn: không đè = không tốn thêm một phép chiếu nào.
  const shownInput = useMemo(() => (input ? applyOverride(input, override) : null), [input, override])
  const shownRows = useMemo(
    () => (shownInput && shownInput !== input ? projectLifetime(shownInput) : rows),
    [shownInput, input, rows],
  )
  const shownPhase = useMemo(() => {
    if (!shownInput) return null
    const i = currentPhaseIndex(shownInput)
    return i >= 0 ? shownInput.phases[i] : null
  }, [shownInput])

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

  /** Mở Bảng theo năm, tuỳ chọn cuộn thẳng tới một năm. */
  function openYearTable(year?: number) {
    setTableFocusYear(year)
    setTableOpen(true)
  }

  /** Ghi ba giá trị đang kéo vào kịch bản. Chỉ ghi thứ THẬT SỰ bị đè. */
  async function handleSaveAssumptions() {
    if (!active || savingAssumptions) return
    // Chặng cần ID để ghi, mà `LifetimeInput.phases` không mang ID — đối chiếu lại sang
    // `phases` (LifePhaseRow) theo start_year, khoá duy nhất của chặng trong kịch bản.
    const row = shownPhase
      ? phases.find((p) => p.scenario_id === active.id && p.start_year === shownPhase.startYear)
      : undefined
    setSavingAssumptions(true)
    try {
      if (row && (override.annualIncomeMinor !== null || override.annualExpenseMinor !== null)) {
        await repo.updateLifePhase(row.id, {
          ...(override.annualIncomeMinor !== null && {
            annual_income_minor: override.annualIncomeMinor,
          }),
          ...(override.annualExpenseMinor !== null && {
            annual_expense_minor: override.annualExpenseMinor,
          }),
        })
      }
      if (override.realReturnBps !== null) {
        await repo.updateLifeScenario(active.id, { real_return_bps: override.realReturnBps })
      }
      showToast('Đã lưu giả định vào kịch bản.', 'success')
      setOverride(NO_OVERRIDE)
    } catch (err) {
      // KHÔNG xoá lớp đè khi lỗi: người dùng vừa mất một lượt vặn, bắt họ kéo lại ba
      // thanh trượt là phạt họ vì mạng hỏng.
      showToast(err instanceof Error ? err.message : 'Không lưu được giả định.', 'error')
    } finally {
      await qc.invalidateQueries({ queryKey: ['lifePhases'] })
      await qc.invalidateQueries({ queryKey: ['lifeScenarios'] })
      setSavingAssumptions(false)
    }
  }

  // Tóm tắt MỘT DÒNG cho từng thẻ kịch bản: năm tự do tài chính và năm cạn tiền ở nhánh
  // bi quan. Không có nó thì dải thẻ chỉ là mấy cái tên, và "Về VN 2030" khác "Hiện tại"
  // ở chỗ nào thì phải bấm vào từng cái rồi đọc lại cả màn — so sánh bằng trí nhớ.
  //
  // Chiếu LẠI từng kịch bản là hợp lệ về chi phí: `projectLifetime` đo 0,063 ms cho một
  // bản chiếu 60 năm (cổng R6, xem assumptions.ts), nên ba kịch bản tốn ~0,2 ms — dưới
  // một phần bảy mươi của một khung 16 ms. `useMemo` chặn việc chạy lại ở mỗi lần kéo
  // thanh trượt.
  //
  // Cố ý đọc bản ĐÃ LƯU, không áp `override`: thẻ nói kịch bản đó LÀ gì, còn lớp đè là
  // một câu hỏi "nếu như" chưa thuộc về kịch bản nào. Đè lên thẻ thì kéo thanh trượt sẽ
  // làm dòng tóm tắt của kịch bản đang chọn trôi khỏi ba thẻ còn lại mà không nói vì sao.
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

  // --- Chế độ so sánh (Task 8 Step 4) ---
  const otherScenarios = useMemo(
    () => scenarios.filter((s) => s.id !== activeId),
    [scenarios, activeId],
  )
  const [compareId, setCompareId] = useState<string | null>(null)
  const [comparePickerOpen, setComparePickerOpen] = useState(false)
  // Đổi chip kịch bản đang xem có thể làm compareId trùng activeId (đang so với chính
  // nó) — tự bỏ qua bằng cách suy ra thay vì nhớ thêm một effect reset state.
  //
  // Kiểm luôn compareId CÒN TỒN TẠI trong danh sách, không chỉ khác activeId: xoá kịch
  // bản đang được chọn để so sánh (nút "Xóa kịch bản" ở khối 1 của trình sửa) để lại một
  // compareId trỏ vào một dòng không còn nữa, và `projectScenario` trả `[]` cho nó. `[]`
  // KHÔNG phải `null`, nên trước đây đồ thị vẫn coi là "đang so sánh": dải dao động cùng
  // chú giải của nó biến mất, `minY` mất luôn số hạng biên dưới nên vùng đỏ co lại — tức
  // cảnh báo về nhánh bi quan tắt ngóm mà không câu nào nói ra. Và nút "So sánh" vẫn ghi
  // "Bấm để tắt" trong lúc `disabled` (chỉ còn 1 kịch bản) nên không tắt được nữa.
  // `otherScenarios` đã lọc bỏ activeId, nên một phép `some` này canh cả hai điều kiện.
  const effectiveCompareId =
    compareId !== null && otherScenarios.some((s) => s.id === compareId) ? compareId : null
  const compareRows = useMemo(
    () => (effectiveCompareId ? projectScenario(effectiveCompareId) : null),
    [effectiveCompareId, projectScenario],
  )
  const compareScenario = scenarios.find((s) => s.id === effectiveCompareId) ?? null

  // Điều kiện banner cảnh báo tỷ giá bằng 1 (BẮT BUỘC — xem task-7-brief.md): bất kỳ
  // chặng/sự kiện nào của kịch bản ĐANG CHỌN có tiền khác tiền hiển thị nhưng tỷ giá
  // vẫn còn 1 — gần như chắc chắn là ô chưa ai khai, không phải giả định thật.
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

  if (isLoading) {
    return <p className="p-6 text-center text-fg-muted">Đang tải…</p>
  }

  // --- Trạng thái 1: chưa khai năm sinh — không chiếu được gì nếu thiếu nó ---
  // Không có tiêu đề "Lifetime" riêng (cả 3 trạng thái): tab "Tương lai" ngay trên đã là
  // tên màn này, và vỏ AssetsPage đã có <h1> "Tài sản" — thêm một <h1> nữa vừa lặp vừa
  // sai cấp đề mục (hai tab kia đều chỉ dùng <h2> cho khối con).
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

          {/* Tài sản khởi điểm của kịch bản = tài sản ròng hiện tại (lỗi thứ 13 của kế
              hoạch: bắt đầu từ 0 dù đang có tiền là ấn tượng đầu tiên tệ nhất có thể).
              Hiện rõ số này ra đây để người dùng biết TRƯỚC khi bấm, không phải đoán. */}
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
                  <b className="tabular-nums">{formatMoney(netWorth, profile.base_currency)}</b>
                  .
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
              hiển thị nên nó thoát ngay — và `needsBirthYear` (`!!profileQ.data && …`) là
              FALSE khi query profile LỖI chứ không phải chưa khai, nên trang dừng đúng ở
              đây. Nói ra bằng chữ, không chỉ làm mờ nút: nút disabled không đọc được
              `title` bằng chạm trên mobile (cùng lý do đã ghi ở nút "Xóa kịch bản"). */}
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
  if (!active) {
    // scenarios.length > 0 nên `active` (find + 2 tầng fallback trong useLifetime) luôn
    // có giá trị ở nhánh này — guard này chỉ để TS thu hẹp kiểu cho phần JSX bên dưới,
    // tránh phải chêm `!`/`as never` rải rác. Không phải trạng thái thật sẽ xảy ra.
    return <p className="p-6 text-center text-fg-muted">Đang tải…</p>
  }

  return (
    <div className="space-y-3">
      {/* Header: chỉ còn một dòng chú thích canh phải. Nút bút chì đã đi — đường vào
          trình sửa nay là link "Sửa kịch bản" trong panel Giả định, nơi nó đứng cạnh
          đúng thứ nó sửa. Một nút icon trơ ở góc không nói ra nó dẫn tới đâu, và trên
          màn hẹp `title` không đọc được bằng chạm.
          Không có <h1>: tab "Tương lai" ngay trên đã là tên màn này, và vỏ AssetsPage đã
          có <h1> "Tài sản". */}
      {profile?.birth_year != null && (
        <p className="truncate text-right text-xs text-fg-muted">
          Sinh {profile.birth_year} · chiếu đến tuổi {active.end_age}
        </p>
      )}

      {/* Hàng chọn kịch bản + hai nút xem khác. Chúng đứng CÙNG HÀNG vì cùng trả lời
          "đang xem cái gì": chọn kịch bản nào, và xem nó bằng hình hay bằng bảng. */}
      <div className="flex flex-wrap items-stretch gap-2">
        {/* Dải thẻ kịch bản, cuộn ngang. Mỗi thẻ hai dòng: TÊN và KẾT QUẢ của chính kịch
            bản đó (năm tự do tài chính · năm cạn tiền ở nhánh bi quan). Trước đây chip
            chỉ có tên, nên muốn biết "Về VN 2030" khác "Hiện tại" ở chỗ nào phải bấm vào
            từng cái rồi đọc lại cả màn — tức so sánh bằng trí nhớ.
            Kịch bản CHÍNH (cái mà thông báo nhắc lệch và thẻ ở trang Tài sản đọc theo)
            mang ngôi sao. Suy từ `pickActive` (một luật với engine/bộ luật thông báo),
            không đọc thẳng cờ `is_primary` — cùng lý do đã ghi ở `isEffectivePrimary`
            trong ScenarioEditorSheet. */}
        {/* `basis-full` dưới `sm`: dải chip chiếm trọn một dòng và hai nút xem tụt
            xuống dòng dưới. Không có nó thì ở 375px hai nút ("So sánh", "Bảng theo năm")
            ăn ~211px, dải chip còn 140px — vừa đúng MỘT chip rưỡi, nên kịch bản thứ hai
            trở đi và nút "Kịch bản mới" ở cuối dải chỉ tới được bằng cách vuốt ngang một
            khung 140px mà không có gì báo là còn thứ nằm khuất. Từ `sm` trả về `basis-0`
            (giá trị mà `flex-1` vẫn dùng) nên bố cục một hàng ở màn rộng không đổi. */}
        <div className="flex min-w-0 basis-full gap-2 overflow-x-auto pb-1 sm:basis-0 sm:flex-1">
          {scenarios.map((s) => {
            const isPrimary = pickActive(scenarios)?.id === s.id
            const sum = scenarioSummaries.get(s.id)
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveId(s.id)}
                aria-pressed={s.id === activeId}
                className={`min-h-11 shrink-0 rounded-md border px-3 py-1.5 text-left transition active:scale-95 ${
                  s.id === activeId
                    ? 'border-accent bg-accent-subtle'
                    : 'border-border-strong bg-surface'
                }`}
              >
                <span className="flex items-center gap-1 text-sm font-medium text-fg-primary">
                  {isPrimary && <Star className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                  {s.name}
                  {isPrimary && <span className="sr-only">(kịch bản chính)</span>}
                </span>
                {/* Dòng tóm tắt vắng mặt khi kịch bản chưa chiếu được năm nào (chưa có
                    chặng thu chi) — viết "FIRE không đạt" lúc đó là kết luận về một bản
                    chiếu không tồn tại. */}
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
            )
          })}
        </div>

        {/* KHÔNG disabled khi mới có 1 kịch bản: lý do nằm trong `title` thì chạm trên
            mobile không đọc được (cùng quy tắc đã ghi ở nút bút chì cũ) — người dùng chỉ
            thấy một nút mờ không rõ vì sao. Để bấm được, và ô mở ra nói rõ cần gì. */}
        <div className="flex shrink-0 items-start gap-2">
          {/* Tạo thêm kịch bản — nút này TRƯỚC ĐÂY KHÔNG TỒN TẠI ở trạng thái có dữ
              liệu: "Tạo kịch bản từ chi tiêu thật" chỉ hiện lúc chưa có kịch bản nào,
              nên sau đó đường duy nhất là mở trình sửa rồi bấm "Nhân bản" trong đó. Ô
              trống của nút "So sánh" ngay bên cạnh phải viết ra cả một hướng dẫn ba
              bước cho đúng việc này — dấu hiệu rõ nhất của một nút còn thiếu.
              Đứng ở NHÓM NÚT chứ không ở cuối dải chip, dù chip mới sinh ra bên trái:
              dải chip cuộn ngang, và ở 375px hai chip kịch bản đã dài 557px — đặt nút
              vào cuối dải là chôn nó sau một cú vuốt mà không gì báo là còn thứ nằm
              khuất, tức lặp lại đúng lỗi mà cả lượt sửa này đi chữa. */}
          <ActionButton
            onClick={() => void duplicateActiveScenario()}
            disabled={duplicatingScenario}
            className="whitespace-nowrap"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {duplicatingScenario ? 'Đang tạo…' : 'Kịch bản mới'}
          </ActionButton>
          <button
            type="button"
            onClick={() => {
              if (effectiveCompareId) {
                setCompareId(null)
                setComparePickerOpen(false)
              } else {
                setComparePickerOpen((o) => !o)
              }
            }}
            className={`min-h-11 rounded-md px-3 text-sm font-medium shadow-sm transition active:scale-95 sm:px-4 ${
              effectiveCompareId ? 'bg-accent text-fg-on-accent' : 'bg-surface text-fg-secondary'
            }`}
          >
            {effectiveCompareId ? 'Đang so sánh' : 'So sánh'}
          </button>
          <button
            type="button"
            onClick={() => openYearTable()}
            className="min-h-11 rounded-md bg-surface px-3 text-sm font-medium text-fg-secondary shadow-sm transition active:scale-95 sm:px-4"
          >
            Bảng theo năm
          </button>
        </div>
      </div>

      {comparePickerOpen && !effectiveCompareId && (
        <Card padding="sm">
          {otherScenarios.length === 0 ? (
            <p className="text-xs text-fg-secondary">
              Cần ít nhất 2 kịch bản mới so sánh được. Mở "Sửa kịch bản" ở khối Giả định,
              chọn "Nhân bản" để tạo kịch bản thứ hai, chỉnh vài con số rồi quay lại đây.
            </p>
          ) : (
            <>
              <p className="mb-2 text-xs text-fg-muted">Chọn kịch bản để so sánh:</p>
              <div className="flex flex-wrap gap-2">
                {otherScenarios.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setCompareId(s.id)
                      setComparePickerOpen(false)
                    }}
                    className="min-h-11 shrink-0 whitespace-nowrap rounded-full border border-border-strong px-4 text-sm font-medium text-fg-secondary transition active:scale-95"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {/* Băng kết luận đứng TRƯỚC đồ thị và trước cả hai cột (§4.4 / 13b). Trước đây bốn
          con số này nằm dưới đáy, sau đồ thị và hai nút — tức người dùng phải cuộn qua cả
          bản chiếu 60 năm mới đọc được KẾT LUẬN của chính bản chiếu đó. "Kết luận trước,
          bằng chứng sau" (§14). Nó phủ hết bề ngang, không rơi vào cột nào: câu kết luận
          nói về cả màn, không riêng đồ thị. */}
      {shownInput && profile?.birth_year != null && (
        <InsightCards
          rows={shownRows}
          input={shownInput}
          birthYear={profile.birth_year}
          currency={active.display_currency as CurrencyCode}
          scenarioName={active.name}
          // Hai ô mang một NĂM thành nút mở Bảng theo năm ở đúng năm đó — "vì sao 2060?"
          // trả lời được ngay tại chỗ đọc thấy con số, không phải mở bảng rồi tự dò.
          onJumpToYear={openYearTable}
        />
      )}

      {/* HAI CỘT từ `xl`: đồ thị nở lấy phần còn lại, cột phụ 25rem = 400px theo §1.4
          (Ngân sách/Tài sản). Theo REM chứ px vì cột này toàn chữ và số — ở cỡ chữ "Rất
          lớn" (--app-font-scale 1,25) một bề ngang px cứng không giãn theo và ba dòng
          nhãn thanh trượt bị ép xuống hai hàng.
          `xl` chứ không `lg` (cùng lý do đã ghi ở MonthView): trong khoảng 1024–1280 cột
          phụ tụt xuống dưới 320px và khối thanh trượt phải cuộn ngang.
          Dưới `xl` mọi thứ xếp dọc như cũ, và khối thanh trượt đi vào sheet đáy — mock
          turn 24 nói thẳng "để cạnh đồ thị thì mỗi thứ còn nửa màn". Đo lại đúng vậy ở
          390px: khối thanh trượt 268px, đồ thị 208px — thứ để LÁI chiếm nhiều chỗ hơn
          thứ nó lái. */}
      <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,1fr)_25rem] xl:items-start">
        {/* Cột trái = đồ thị + dải mốc, bọc chung một khối dọc chứ không để thành ô thứ
            ba của lưới: dải mốc phải nằm NGAY DƯỚI đồ thị (nó là danh sách chữ của đúng
            những vạch đứng trên đó), và `gap-3` của khối này khớp `gap-3` của lưới nên
            dưới `xl` — nơi mọi thứ xếp dọc — hình không đổi một pixel nào. */}
        <div className="flex min-w-0 flex-col gap-3">
        <LifetimeChartCard
          rows={shownRows}
          // §12: không animate trong lúc ngón tay còn trên thanh trượt.
          suppressAnimation={dragging}
          historyRows={historyRows}
          currency={active.display_currency as CurrencyCode}
          compare={compareRows}
          compareCurrency={
            compareScenario ? (compareScenario.display_currency as CurrencyCode) : null
          }
          // networth_snapshots luôn ở base currency của profile, KHÔNG phải display_currency
          // của kịch bản — bắt buộc phải truyền để thẻ tự phát hiện lệch và ẩn đường lịch
          // sử thay vì vẽ sai đơn vị (xem JSDoc historyCurrency trong LifetimeChartCard).
          // `profile` luôn có ở nhánh này trên thực tế (needsBirthYear đã lọc trước), nhưng
          // vẫn phòng hờ bằng `?? active.display_currency` — coi như cùng đơn vị (không ẩn
          // lịch sử oan) thay vì render lỗi nếu profile rơi vào ca undefined không lường
          // trước, thà mất cảnh báo còn hơn crash cả thẻ.
          historyCurrency={profile?.base_currency ?? (active.display_currency as CurrencyCode)}
        />

        {/* Dải "Mốc cuộc đời" — đường vào NGOÀI CÙNG để thêm/sửa chặng và sự kiện. Xem
            đầu TimelineStrip.tsx để biết đường cũ dài bao nhiêu bước.
            Đọc `phases`/`events` (dòng DB đã lọc theo kịch bản đang xem), KHÔNG đọc
            `shownRows`: bản chiếu chỉ mang `YearEvent` (đã quy đổi, đã áp lạm phát, đã
            lược mất năm bắt đầu và tỷ giá), mà form sửa cần đúng dòng gốc. */}
        <TimelineStrip
          phases={phases}
          events={events}
          onEditPhase={(phase) => openEditor({ kind: 'phase-edit', phaseId: phase.id })}
          onEditEvent={(event) => openEditor({ kind: 'event-edit', eventId: event.id })}
          onAddEvent={() => openEditor({ kind: 'event-new' })}
          onAddPhase={() => openEditor({ kind: 'phase-new' })}
          onPickPreset={() => openEditor({ kind: 'event-presets' })}
        />
        </div>

        <div className="flex flex-col gap-3">
          {/* Ba thanh trượt giả định (§4.4 / 13b). Từ `xl` chúng đứng NGAY CẠNH đồ thị:
              kéo ở đây thì thứ đổi ngay bên trái là bản chiếu, và thứ đổi ngay phía trên
              là kết luận — không phải cuộn đi tìm.
              Hai bản (cột phải và sheet đáy) dùng CHUNG một `override`, nên không có
              đường nào để chúng lệch nhau; và mỗi bề rộng chỉ có đúng một bản nằm trong
              cây a11y (bản cột phải bị display:none dưới xl, còn sheet chỉ dựng khi mở và
              nút mở là xl:hidden). */}
          {shownInput && shownPhase && (
            <>
              <div className="hidden xl:block">
                <AssumptionSliders
                  input={shownInput}
                  phase={shownPhase}
                  override={override}
                  onChange={setOverride}
                  onDragChange={setDragging}
                  onSave={handleSaveAssumptions}
                  onReset={() => setOverride(NO_OVERRIDE)}
                  saving={savingAssumptions}
                  // `undefined` khi thiếu profile: trình sửa lấy năm sinh từ đó, và thiếu
                  // nó thì sheet thành một ngõ cụt — `birthYear` khởi tạo rỗng nên nút Lưu
                  // tắt VĨNH VIỄN, `block1Dirty` true vĩnh viễn nên "Nhân bản" bị chặn, và
                  // đóng sheet thì bị hỏi có bỏ thay đổi không (không có thay đổi nào). Ca
                  // này chỉ xảy ra khi query profile LỖI — `needsBirthYear` ở trên chỉ bắt
                  // ca profile ĐÃ TẢI mà chưa khai.
                  onEditScenario={profile ? () => openEditor() : undefined}
                />
              </div>

              <ActionButton onClick={() => setSheetOpen(true)} className="self-start xl:hidden">
                <SlidersHorizontal className="h-4 w-4" strokeWidth={2} />
                Thử giả định
                {hasOverride(override) && <span className="text-fg-warn"> · chưa lưu</span>}
              </ActionButton>

              {sheetOpen && (
                <div
                  className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 lg:items-center animate-overlay-in"
                  onClick={() => setSheetOpen(false)}
                >
                  <div
                    className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl animate-sheet-in lg:animate-sheet-pop"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <AssumptionSliders
                      input={shownInput}
                      phase={shownPhase}
                      override={override}
                      onChange={setOverride}
                      onDragChange={setDragging}
                      onSave={handleSaveAssumptions}
                      onReset={() => setOverride(NO_OVERRIDE)}
                      saving={savingAssumptions}
                      onEditScenario={
                        profile
                          ? () => {
                              setSheetOpen(false)
                              openEditor()
                            }
                          : undefined
                      }
                    />
                    <ActionButton onClick={() => setSheetOpen(false)} className="mt-3 w-full">
                      Đóng
                    </ActionButton>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Kịch bản chưa có chặng nào thì KHÔNG có thanh trượt (không biết vặn thu/chi
              của chặng nào), và lúc đó cột phải trống trơn bên cạnh một đồ thị rỗng —
              không câu nào nói vì sao. */}
          {shownInput && !shownPhase && profile && (
            <Card elevation="panel" padding="panel">
              <p className="text-xs text-fg-secondary">
                Kịch bản chưa có chặng thu chi nào nên chưa chiếu được gì.
              </p>
              <ActionButton onClick={() => openEditor({ kind: 'phase-new' })} className="mt-2">
                Thêm chặng
              </ActionButton>
            </Card>
          )}

          {/* Banner cảnh báo tỷ giá bằng 1 — BẮT BUỘC, không có nút tắt (xem
              task-7-brief.md). Đứng cuối cột phải, ngay dưới đúng khối chứa những con số
              mà nó đang nói là chưa đáng tin. Trên mobile chỉ hiện SỐ LƯỢNG, không liệt
              kê từng khoản — danh sách chi tiết thuộc ScenarioEditorSheet. */}
          {mismatchCount > 0 && (
            <button
              type="button"
              onClick={() => openEditor()}
              // Cùng lý do với link "Sửa kịch bản": không mở một sheet ngõ cụt. Banner vẫn
              // HIỆN (câu cảnh báo đúng dù có sửa được ngay hay không), chỉ không bấm được.
              disabled={!profile}
              className="flex min-h-11 w-full items-start gap-2 rounded-md bg-state-warn-bg text-state-warn-fg px-3 py-2 text-left text-sm transition active:scale-95 disabled:active:scale-100"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {mismatchCount} khoản đang dùng tỷ giá giả định bằng 1 — gần như chắc chắn
                sai. Bấm để sửa.
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Bảng theo năm (Task 10) — bản dự phòng a11y của đồ thị, nút mở nằm ở hàng chọn
          kịch bản phía trên, không giấu trong menu. */}
      {tableOpen && (
        <YearTableView
          rows={rows}
          currency={active.display_currency as CurrencyCode}
          scenarioName={active.name}
          focusYear={tableFocusYear}
          // Bấm một sự kiện trong bảng → đóng bảng, mở thẳng form của chính nó. Đóng
          // trước chứ không chồng hai lớp phủ: cả hai đều là sheet toàn màn ở z-40, xếp
          // lên nhau thì Esc đóng nhầm lớp và nền mờ tô hai lần.
          onEditEvent={(eventId) => {
            setTableOpen(false)
            openEditor({ kind: 'event-edit', eventId })
          }}
          onClose={() => setTableOpen(false)}
        />
      )}

      {/* Trình sửa kịch bản (Task 11) — mở từ link "Sửa kịch bản" trong panel Giả định
          hoặc từ banner cảnh báo tỷ giá. `profile` + ba giá trị tài sản ròng truyền XUỐNG
          chứ không để sheet tự gọi `useLifetime()` lần hai: bản thứ hai mang `activeId`
          riêng (có thể chỉ vào một kịch bản KHÁC cái đang sửa) và chiếu lại cả 60 năm kèm
          dải một lần nữa song song với bản chiếu của trang này. */}
      {editorOpen && active && profile && (
        <ScenarioEditorSheet
          // `key`: sheet khởi tạo MỌI ô của khối 1 bằng `useState(scenario.*)`, tức chỉ
          // đọc một lần lúc gắn. `active` có thể đổi danh tính trong lúc sheet đang mở
          // (xoá kịch bản đang sửa mà lệnh xoá lỗi sau khi đã commit, hoặc một lần làm mới
          // cache đổi kịch bản chính) — không có `key` thì React DÙNG LẠI instance cũ:
          // `scenario.id` trỏ sang kịch bản mới còn các ô vẫn giữ số của kịch bản cũ, và
          // lần lưu kế tiếp ghi số cũ lên kịch bản mới. Đổi `key` thì gắn lại từ đầu.
          key={active.id}
          scenario={active}
          // Cả danh sách, không chỉ kịch bản đang sửa: khối 1 cần biết đây có phải kịch
          // bản duy nhất (chặn xoá) và kịch bản nào khác đang là chính (đổi kịch bản chính).
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
      <label
        htmlFor="lifetime-birth-year"
        className="mt-3 block text-xs font-medium text-fg-muted"
      >
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
