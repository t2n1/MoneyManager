import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, Pencil, Sparkles } from 'lucide-react'
import { repo } from '../../data'
import { useNetWorthSnapshots } from '../../hooks/queries'
import type { CurrencyCode } from '../../lib/currencies'
import { formatMoney } from '../../lib/money'
import { InsightCards } from './InsightCards'
import { LifetimeChartCard } from './LifetimeChartCard'
import { ScenarioEditorSheet } from './ScenarioEditorSheet'
import { useLifetime } from './useLifetime'
import { YearTableView } from './YearTableView'

/** Ô nhập năm sinh khớp ràng buộc DB (migration 0031: `birth_year between 1900 and 2100`). */
const MIN_BIRTH_YEAR = 1900
const MAX_BIRTH_YEAR = 2100

/** Nút back dùng chung cho cả 3 trạng thái — điều hướng bằng `useNavigate(-1)` (brief). */
function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Quay lại"
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 shadow-sm active:scale-95"
    >
      <ChevronLeft className="h-5 w-5 text-gray-700 dark:text-gray-200" />
    </button>
  )
}

/** Vỏ màn Lifetime (mục Lifetime): chiếu tài sản ròng cả đời. Ba trạng thái — chưa
 * khai năm sinh, chưa có kịch bản, có dữ liệu — không có trạng thái nào để trống. */
export function LifetimePage() {
  const navigate = useNavigate()
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

  // --- Chế độ so sánh (Task 8 Step 4) ---
  const otherScenarios = useMemo(
    () => scenarios.filter((s) => s.id !== activeId),
    [scenarios, activeId],
  )
  const [compareId, setCompareId] = useState<string | null>(null)
  const [comparePickerOpen, setComparePickerOpen] = useState(false)
  // Đổi chip kịch bản đang xem có thể làm compareId trùng activeId (đang so với chính
  // nó) — tự bỏ qua bằng cách suy ra thay vì nhớ thêm một effect reset state.
  const effectiveCompareId = compareId && compareId !== activeId ? compareId : null
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
    return <p className="p-6 text-center text-gray-500 dark:text-gray-400">Đang tải…</p>
  }

  // --- Trạng thái 1: chưa khai năm sinh — không chiếu được gì nếu thiếu nó ---
  if (needsBirthYear) {
    return (
      <div className="space-y-3 p-3">
        <div className="flex items-center gap-2">
          <BackButton onClick={() => navigate(-1)} />
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">Lifetime</h1>
        </div>
        <BirthYearCard />
      </div>
    )
  }

  // --- Trạng thái 2: chưa có kịch bản nào — nút thay wizard ---
  if (scenarios.length === 0) {
    return (
      <div className="space-y-3 p-3">
        <div className="flex items-center gap-2">
          <BackButton onClick={() => navigate(-1)} />
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">Lifetime</h1>
        </div>
        <div className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Lifetime chiếu tài sản ròng của bạn tới hết đời, dựa trên thu chi nền và các mốc
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
                  ? 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                  : 'bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
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

          <button
            type="button"
            disabled={creating || netWorthLoading}
            onClick={async () => {
              setCreating(true)
              try {
                await ensureFirstScenario()
              } finally {
                setCreating(false)
              }
            }}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {creating || isCreatingFirstScenario
              ? 'Đang tạo…'
              : netWorthLoading
                ? 'Đang tính tài sản ròng…'
                : 'Tạo kịch bản từ chi tiêu thật của tôi'}
          </button>
        </div>
      </div>
    )
  }

  // --- Trạng thái 3: có dữ liệu — màn đầy đủ ---
  if (!active) {
    // scenarios.length > 0 nên `active` (find + 2 tầng fallback trong useLifetime) luôn
    // có giá trị ở nhánh này — guard này chỉ để TS thu hẹp kiểu cho phần JSX bên dưới,
    // tránh phải chêm `!`/`as never` rải rác. Không phải trạng thái thật sẽ xảy ra.
    return <p className="p-6 text-center text-gray-500 dark:text-gray-400">Đang tải…</p>
  }

  return (
    <div className="space-y-3 p-3">
      {/* Header: không có bánh răng — mọi thiết lập thuộc trình sửa kịch bản hoặc Cài đặt */}
      <div className="flex items-center gap-2">
        <BackButton onClick={() => navigate(-1)} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-gray-800 dark:text-gray-100">Lifetime</h1>
          {profile?.birth_year != null && (
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              sinh {profile.birth_year} · chiếu đến tuổi {active.end_age}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          aria-label="Sửa kịch bản"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-gray-900 px-3 py-1.5 shadow-sm active:scale-95"
        >
          <Pencil className="h-4 w-4 text-gray-600 dark:text-gray-300" />
        </button>
      </div>

      {/* Dải chip kịch bản, cuộn ngang */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveId(s.id)}
            className={`min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-medium active:scale-95 ${
              s.id === activeId
                ? 'bg-green-600 text-white'
                : 'border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300'
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Banner cảnh báo tỷ giá bằng 1 — BẮT BUỘC, không có nút tắt (xem task-7-brief.md).
          Đặt NGAY TRÊN đồ thị: phải đọc được trước khi đọc số. Trên mobile chỉ hiện SỐ
          LƯỢNG, không liệt kê từng khoản — danh sách chi tiết thuộc ScenarioEditorSheet. */}
      {mismatchCount > 0 && (
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          className="flex min-h-11 w-full items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/40 px-3 py-2 text-left text-sm text-amber-700 dark:text-amber-300 active:scale-95"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {mismatchCount} khoản đang dùng tỷ giá giả định bằng 1 — gần như chắc chắn sai. Bấm để
            sửa.
          </span>
        </button>
      )}

      <LifetimeChartCard
        rows={rows}
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
          className="min-h-11 flex-1 rounded-xl bg-white dark:bg-gray-900 px-3 text-sm font-medium text-gray-600 dark:text-gray-300 shadow-sm active:scale-95"
        >
          Bảng theo năm
        </button>
        <button
          type="button"
          disabled={otherScenarios.length === 0}
          title={
            otherScenarios.length === 0 ? 'Cần ít nhất 2 kịch bản mới so sánh được' : undefined
          }
          onClick={() => {
            if (effectiveCompareId) {
              setCompareId(null)
              setComparePickerOpen(false)
            } else {
              setComparePickerOpen((o) => !o)
            }
          }}
          className={`min-h-11 flex-1 rounded-xl px-3 text-sm font-medium shadow-sm active:scale-95 disabled:opacity-60 ${
            effectiveCompareId
              ? 'bg-green-600 text-white'
              : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 disabled:text-gray-400 dark:disabled:text-gray-600'
          }`}
        >
          {effectiveCompareId ? 'Đang so sánh · Bấm để tắt' : 'So sánh'}
        </button>
      </div>

      {comparePickerOpen && !effectiveCompareId && (
        <div className="rounded-xl bg-white dark:bg-gray-900 p-2.5 shadow-sm">
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">Chọn kịch bản để so sánh:</p>
          <div className="flex flex-wrap gap-2">
            {otherScenarios.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setCompareId(s.id)
                  setComparePickerOpen(false)
                }}
                className="min-h-11 shrink-0 whitespace-nowrap rounded-full border border-gray-300 dark:border-gray-700 px-4 text-sm font-medium text-gray-600 dark:text-gray-300 active:scale-95"
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bốn thẻ kết luận (Task 9) — xem InsightCards.tsx */}
      {input && profile?.birth_year != null && (
        <InsightCards
          rows={rows}
          input={input}
          birthYear={profile.birth_year}
          currency={active.display_currency as CurrencyCode}
        />
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
      {editorOpen && active && (
        <ScenarioEditorSheet
          scenario={active}
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
    <div className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Lifetime chiếu tài sản ròng của bạn theo từng năm tới hết đời, nên cần năm sinh để đổi
        qua lại giữa "năm" và "tuổi" ở mỗi mốc trên đồ thị (nghỉ hưu, tự do tài chính…). Thiếu
        năm sinh thì không tính được tuổi, nên chưa chiếu được gì.
      </p>
      <label
        htmlFor="lifetime-birth-year"
        className="mt-3 block text-xs font-medium text-gray-500 dark:text-gray-400"
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
        className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 outline-green-500"
      />
      <button
        type="button"
        disabled={!valid || saveMut.isPending}
        onClick={() => saveMut.mutate(year)}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-green-600 px-3 text-sm font-semibold text-white active:scale-95 disabled:opacity-40"
      >
        {saveMut.isPending ? 'Đang lưu…' : 'Lưu năm sinh'}
      </button>
    </div>
  )
}
