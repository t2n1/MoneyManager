import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Pencil, SlidersHorizontal, Sparkles, Star } from 'lucide-react'
import { ActionButton, Card, Money } from '../../components/ui'
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
import { ScenarioEditorSheet } from './ScenarioEditorSheet'
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
  } = useLifetime()

  const [editorOpen, setEditorOpen] = useState(false)
  const [tableOpen, setTableOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const { data: historyRows = [] } = useNetWorthSnapshots()

  // Chặng ĐANG hiệu lực (chặng bắt đầu gần nhất tính đến năm nay) — nguồn của dòng
  // giả định ngay dưới dải chip. Bản chiếu 60 năm mà không nói nó dựa trên thu/chi
  // bao nhiêu là một hộp đen: muốn kiểm chứng phải mở trình sửa mới biết.
  const currentPhase = useMemo(() => {
    if (!input) return null
    const sorted = [...input.phases].sort((a, b) => a.startYear - b.startYear)
    let cur = sorted[0] ?? null
    for (const p of sorted) if (p.startYear <= input.currentYear) cur = p
    return cur
  }, [input])

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
      <div className="rounded-xl bg-surface p-3 shadow-sm">
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
                  ròng đáng tin. Tài sản khởi điểm sẽ để 0 — vào nút bút chì sau khi tạo để tự
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
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-fg-on-accent px-3 text-sm font-semibold active:scale-95 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {creating || isCreatingFirstScenario
              ? 'Đang tạo…'
              : netWorthLoading
                ? 'Đang tính tài sản ròng…'
                : 'Tạo kịch bản từ chi tiêu thật của tôi'}
          </button>
      </div>
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
      {/* Header: chỉ còn dòng tóm tắt + nút bút chì — tab "Tương lai" ngay trên đã là
          tiêu đề (xem ghi chú ở trạng thái 1), và không có bánh răng: mọi thiết lập
          thuộc trình sửa kịch bản hoặc Cài đặt. */}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          {profile?.birth_year != null && (
            <p className="truncate text-xs text-fg-muted">
              Sinh {profile.birth_year} · chiếu đến tuổi {active.end_age}
            </p>
          )}
        </div>
        {/* `disabled` khi chưa có `profile`: trình sửa lấy năm sinh từ đó, và thiếu nó
            thì sheet thành một ngõ cụt — `birthYear` khởi tạo rỗng nên `birthYearValid`
            false và nút Lưu tắt VĨNH VIỄN, `block1Dirty` true vĩnh viễn nên "Nhân bản"
            bị chặn bằng toast bảo lưu trước (không lưu được), và đóng sheet thì bị hỏi
            có bỏ thay đổi không (không có thay đổi nào). Ca này chỉ xảy ra khi query
            profile LỖI — `needsBirthYear` ở trên chỉ bắt ca profile ĐÃ TẢI mà chưa khai. */}
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          disabled={!profile}
          aria-label="Sửa kịch bản"
          title={
            profile ? undefined : 'Chưa tải được thông tin người dùng — thử lại sau khi có mạng'
          }
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg bg-surface px-3 py-1.5 shadow-sm active:scale-95 disabled:opacity-50"
        >
          <Pencil className="h-4 w-4 text-fg-secondary" />
        </button>
      </div>

      {/* Dải chip kịch bản, cuộn ngang. Kịch bản CHÍNH (cái mà thông báo nhắc lệch và
          thẻ ở trang Tài sản đọc theo) mang ngôi sao ngay trên chip — trước đây muốn
          biết cái nào là chính phải mở trình sửa từng cái. Suy từ `pickActive` (một
          luật với engine/bộ luật thông báo), không đọc thẳng cờ `is_primary` — cùng
          lý do đã ghi ở `isEffectivePrimary` trong ScenarioEditorSheet. */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {scenarios.map((s) => {
          const isPrimary = pickActive(scenarios)?.id === s.id
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveId(s.id)}
              className={`inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-4 text-sm font-medium active:scale-95 ${
                s.id === activeId
                  ? 'bg-accent text-fg-on-accent'
                  : 'border border-border-strong text-fg-secondary'
              }`}
            >
              {isPrimary && <Star className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              {s.name}
              {isPrimary && <span className="sr-only">(kịch bản chính)</span>}
            </button>
          )
        })}
      </div>

      {/* Dòng giả định — nói rõ bản chiếu dựa trên số nào ngay trên màn, không bắt
          người xem mở trình sửa mới biết. Chỉ tóm CHẶNG HIỆN TẠI (xem `currentPhase`);
          chi tiết từng chặng/sự kiện vẫn thuộc trình sửa. Tiền hiện theo ĐƠN VỊ CỦA
          CHẶNG (phase.currency), không phải display_currency — đó là số người dùng đã
          khai, chưa nhân tỷ giá. `disabled` khi thiếu profile cùng lý do nút bút chì.
          Nút nằm TRONG <Card> (không tự ghép rounded-xl bg-surface — designSystem.test
          canh idiom đó), nên nút tự lo padding/bo góc của chính nó. */}
      <Card padding="none">
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          disabled={!profile}
          className="flex min-h-11 w-full items-center rounded-xl px-3 py-2 text-left text-xs text-fg-muted active:scale-95 disabled:active:scale-100"
        >
          <span>
            {/* CÓ thanh trượt thì dòng này THÔI đọc lại ba con số đó. Chúng đứng cách
                nhau 40px, và trong lúc vặn thì dòng này in giá trị ĐÃ LƯU còn thanh
                trượt in giá trị ĐANG THỬ — hai số khác nhau, cùng một nhãn "chi", trên
                cùng một màn. Đo thật khi dựng xong: dòng trên ¥1,319,784, thanh trượt
                ¥2,700,000. Nhường phần số cho thanh trượt, giữ lại đúng vai còn lại của
                nút này: đường vào trình sửa đầy đủ (chặng khác, sự kiện, tỷ giá). */}
            {shownPhase ? (
              <>Sửa chi tiết: chặng khác · sự kiện · tỷ giá — bấm để mở</>
            ) : currentPhase ? (
              <>
                Giả định: thu{' '}
                <Money
                  amount={currentPhase.annualIncomeMinor}
                  currency={currentPhase.currency}
                  className="text-xs font-medium"
                />{' '}
                {/* Thu 0 kèm chi > 0 thường là "sổ chưa ghi lương" chứ không phải kế
                    hoạch thật (đã gặp ngoài đời: cả bản chiếu âm oan) — nhắc ngay trên
                    màn, nhưng bằng câu hỏi vì nghỉ hưu/nghỉ việc thì thu 0 là thật. */}
                {currentPhase.annualIncomeMinor === 0 && currentPhase.annualExpenseMinor > 0 && (
                  <span className="font-medium text-fg-warn">(sổ chưa ghi khoản thu nào?) </span>
                )}
                · chi{' '}
                <Money
                  amount={currentPhase.annualExpenseMinor}
                  currency={currentPhase.currency}
                  className="text-xs font-medium"
                />{' '}
                mỗi năm · lợi suất {active.real_return_bps / 100}%/năm — bấm để chỉnh
              </>
            ) : (
              <>Kịch bản chưa có chặng thu chi nào nên chưa chiếu được — bấm để thêm</>
            )}
          </span>
        </button>
      </Card>
      {/* Bốn thẻ kết luận đứng TRƯỚC đồ thị (§4.4 / 13b). Trước đây chúng nằm dưới đáy,
          sau đồ thị và hai nút — tức người dùng phải cuộn qua cả bản chiếu 60 năm mới đọc
          được KẾT LUẬN của chính bản chiếu đó. "Kết luận trước, bằng chứng sau" (§14). */}
      {/* Ba thanh trượt giả định (§4.4 / 13b), đứng NGAY DƯỚI dòng tóm tắt giả định và
          TRÊN bốn thẻ kết luận: kéo ở đây thì thứ đổi ngay bên dưới là kết luận, không
          phải một đường cong người ta phải tự đọc. */}
      {/* TỪ lg: khối nằm ngay trên đồ thị.
          DƯỚI lg: chỉ một nút, khối đi vào sheet đáy — mock turn 24 nói thẳng "thanh
          trượt giả định chuyển xuống sheet đáy vì để cạnh đồ thị thì mỗi thứ còn nửa
          màn". Đo lại đúng vậy ở 390px: khối thanh trượt 268px, đồ thị 208px — thứ để
          LÁI đang chiếm nhiều chỗ hơn thứ nó lái.
          Hai bản dùng CHUNG một `override`, nên không có đường nào để chúng lệch nhau;
          và mỗi bề rộng chỉ có đúng một bản nằm trong cây a11y (bản inline bị
          display:none ở mobile, còn sheet chỉ dựng khi mở và nút mở là lg:hidden). */}
      {shownInput && shownPhase && (
        <>
          <div className="hidden lg:block">
            <AssumptionSliders
              input={shownInput}
              phase={shownPhase}
              override={override}
              onChange={setOverride}
              onDragChange={setDragging}
              onSave={handleSaveAssumptions}
              onReset={() => setOverride(NO_OVERRIDE)}
              saving={savingAssumptions}
            />
          </div>

          <ActionButton onClick={() => setSheetOpen(true)} className="self-start lg:hidden">
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
                />
                <ActionButton onClick={() => setSheetOpen(false)} className="mt-3 w-full">
                  Đóng
                </ActionButton>
              </div>
            </div>
          )}
        </>
      )}

      {shownInput && profile?.birth_year != null && (
        <InsightCards
          rows={shownRows}
          input={shownInput}
          birthYear={profile.birth_year}
          currency={active.display_currency as CurrencyCode}
        />
      )}


      {/* Banner cảnh báo tỷ giá bằng 1 — BẮT BUỘC, không có nút tắt (xem task-7-brief.md).
          Đặt NGAY TRÊN đồ thị: phải đọc được trước khi đọc số. Trên mobile chỉ hiện SỐ
          LƯỢNG, không liệt kê từng khoản — danh sách chi tiết thuộc ScenarioEditorSheet. */}
      {mismatchCount > 0 && (
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          // Cùng lý do với nút bút chì ở header: không mở một sheet ngõ cụt. Banner vẫn
          // HIỆN (câu cảnh báo đúng dù có sửa được ngay hay không), chỉ không bấm được.
          disabled={!profile}
          className="flex min-h-11 w-full items-start gap-2 rounded-xl bg-state-warn-bg text-state-warn-fg px-3 py-2 text-left text-sm active:scale-95 disabled:active:scale-100"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {mismatchCount} khoản đang dùng tỷ giá giả định bằng 1 — gần như chắc chắn sai. Bấm để
            sửa.
          </span>
        </button>
      )}

      <LifetimeChartCard
        rows={shownRows}
        // §12: không animate trong lúc ngón tay còn trên thanh trượt.
        suppressAnimation={dragging}
        historyRows={historyRows}
        currency={active.display_currency as CurrencyCode}
        compare={compareRows}
        compareCurrency={compareScenario ? (compareScenario.display_currency as CurrencyCode) : null}
        // networth_snapshots luôn ở base currency của profile, KHÔNG phải display_currency
        // của kịch bản — bắt buộc phải truyền để thẻ tự phát hiện lệch và ẩn đường lịch
        // sử thay vì vẽ sai đơn vị (xem JSDoc historyCurrency trong LifetimeChartCard).
        // `profile` luôn có ở nhánh này trên thực tế (needsBirthYear đã lọc trước), nhưng
        // vẫn phòng hờ bằng `?? active.display_currency` — coi như cùng đơn vị (không ẩn
        // lịch sử oan) thay vì render lỗi nếu profile rơi vào ca undefined không lường
        // trước, thà mất cảnh báo còn hơn crash cả thẻ.
        historyCurrency={profile?.base_currency ?? (active.display_currency as CurrencyCode)}
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTableOpen(true)}
          className="min-h-11 flex-1 rounded-xl bg-surface px-3 text-sm font-medium text-fg-secondary shadow-sm active:scale-95"
        >
          Bảng theo năm
        </button>
        {/* KHÔNG disabled khi mới có 1 kịch bản: lý do nằm trong `title` thì chạm trên
            mobile không đọc được (cùng quy tắc đã ghi ở nút bút chì) — người dùng chỉ
            thấy một nút mờ không rõ vì sao. Để bấm được, và ô mở ra nói rõ cần gì. */}
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
          className={`min-h-11 flex-1 rounded-xl px-3 text-sm font-medium shadow-sm active:scale-95 ${
            effectiveCompareId ? 'bg-accent text-fg-on-accent' : 'bg-surface text-fg-secondary'
          }`}
        >
          {effectiveCompareId ? 'Đang so sánh · Bấm để tắt' : 'So sánh'}
        </button>
      </div>

      {comparePickerOpen && !effectiveCompareId && (
        <div className="rounded-xl bg-surface p-2.5 shadow-sm">
          {otherScenarios.length === 0 ? (
            <p className="text-xs text-fg-secondary">
              Cần ít nhất 2 kịch bản mới so sánh được. Bấm nút bút chì phía trên, chọn "Nhân
              bản" để tạo kịch bản thứ hai, chỉnh vài con số rồi quay lại đây.
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
                    className="min-h-11 shrink-0 whitespace-nowrap rounded-full border border-border-strong px-4 text-sm font-medium text-fg-secondary active:scale-95"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}


      {/* Bảng theo năm (Task 10) — bản dự phòng a11y của đồ thị, nút mở NGAY DƯỚI đồ thị
          (xem LifetimeChartCard ở trên), không giấu trong menu. */}
      {tableOpen && (
        <YearTableView
          rows={rows}
          currency={active.display_currency as CurrencyCode}
          scenarioName={active.name}
          onClose={() => setTableOpen(false)}
        />
      )}

      {/* Trình sửa kịch bản (Task 11) — mở từ nút bút chì ở header hoặc từ banner cảnh
          báo tỷ giá. `profile` + ba giá trị tài sản ròng truyền XUỐNG chứ không để sheet
          tự gọi `useLifetime()` lần hai: bản thứ hai mang `activeId` riêng (có thể chỉ
          vào một kịch bản KHÁC cái đang sửa) và chiếu lại cả 60 năm kèm dải một lần nữa
          song song với bản chiếu của trang này. */}
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
    <div className="rounded-xl bg-surface p-3 shadow-sm">
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
        className="mt-1 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg-primary"
      />
      <button
        type="button"
        disabled={!valid || saveMut.isPending}
        onClick={() => saveMut.mutate(year)}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-accent text-fg-on-accent px-3 text-sm font-semibold active:scale-95 disabled:opacity-40"
      >
        {saveMut.isPending ? 'Đang lưu…' : 'Lưu năm sinh'}
      </button>
    </div>
  )
}
