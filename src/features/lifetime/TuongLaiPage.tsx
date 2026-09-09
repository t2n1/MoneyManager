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
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Star } from 'lucide-react'
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
import { Guide } from '../../components/Guide'
import { repo } from '../../data'
import type { CurrencyCode } from '../../lib/currencies'
import { toISODate } from '../../lib/dates'
import { fetchRates } from '../../lib/rates'
import { BigExpenseMapSection } from './BigExpenseMapSection'
import { ConsoleFrame } from './ConsoleFrame'
import { fxOfRates } from './fxModel'
import { assetsAtAge } from './insights'
import { InsightCards } from './InsightCards'
import { lifetimeVerdict } from './summary'
import { TimelinePlot, type ComparisonLine, type PlotZoom } from './TimelinePlot'
import { useLifetime } from './useLifetime'
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
   * Có dòng nào thiếu tỷ giá không. Quy ước toàn repo: thiếu rate thì LOẠI khoản đó ra
   * và bật cờ, KHÔNG bao giờ quy 1:1 — thà thiếu còn hơn bịa. Ở đây cờ đó thành dấu `≈`
   * trên tiêu đề và một câu nói rõ đơn vị nào chưa tra được.
   */
  const missingRateCurrencies = useMemo(() => {
    if (!input) return []
    const coTien = new Set<CurrencyCode>()
    for (const p of input.phases) coTien.add(p.currency)
    for (const e of input.events) coTien.add(e.currency)
    return [...coTien].filter((c) => pageFxOf(c, input.displayCurrency) === null)
  }, [input, pageFxOf])

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
    () => (input && rows.length > 0 ? lifetimeVerdict(rows, input.birthYear) : null),
    [input, rows],
  )
  const atEnd = useMemo(
    () => (input && rows.length > 0 ? assetsAtAge(rows, input.endAge) : null),
    [input, rows],
  )

  const todayISO = toISODate(new Date())

  const handleCreateFirst = useCallback(async () => {
    setCreating(true)
    try {
      await ensureFirstScenario()
    } finally {
      setCreating(false)
    }
  }, [ensureFirstScenario])

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
  if (!active || !input) return <EmptyState>Đang tải…</EmptyState>

  const currency = active.display_currency as CurrencyCode
  const birthYear = input.birthYear

  return (
    <ConsoleFrame
      // ===== HÀNG 2–4 của bản vẽ: phủ hết bề ngang, nằm trên hai cột =====
      top={
        <div className="flex min-w-0 flex-col gap-2.5">
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
              <Num tone="muted">{input.endAge}</Num> · <Num tone="muted">{currency}</Num>
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
                  <Num tone="muted">chưa đạt</Num>
                ) : (
                  <Num tone="in">
                    {verdict.fireYear} · {verdict.fireAge}t
                  </Num>
                )}
              </StatCell>

              <StatCell label={`Lúc ${input.endAge} tuổi`}>
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
                <FilterChip
                  on={hintsOpen}
                  size="sm"
                  onClick={() => setHintsOpen((v) => !v)}
                  aria-expanded={hintsOpen}
                >
                  Gợi ý &amp; cách đọc
                </FilterChip>
              </div>
            </div>
          </Card>

          {/* --- HÀNG 4: panel Gợi ý (ẩn/hiện) -------------------------------------- */}
          {hintsOpen && profile?.birth_year != null && (
            <InsightCards
              rows={rows}
              input={input}
              birthYear={profile.birth_year}
              currency={currency}
              scenarioName={active.name}
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
                {compareSkipped} kịch bản đang ẩn — khác đơn vị tiền với {currency}, chưa quy
                đổi được nên không vẽ để tránh sai đơn vị.
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

          {/* --- HÀNG 7: vùng vẽ ---------------------------------------------------- */}
          <TimelinePlot
            rows={rows}
            currency={currency}
            // `null` cho tới khi có bản nháp để so: dock (task kế) là chỗ sinh ra nháp,
            // trước đó hai đường sẽ trùng khít nhau.
            saved={null}
            compare={comparisons}
            events={input.events}
            zoom={zoom}
            showBand={showBand}
            showFire={showFire}
            log={log}
          />

          {/* --- HÀNG 8: dải chặng đời (Task 11 — PhaseLane) ------------------------ */}
          <PlaceholderRow
            label="Chặng đời"
            note="Khối chặng kéo được sẽ nằm ở đây."
            // Thẳng hàng với lề trái vùng vẽ (3,25rem = 52px của bản vẽ) để khối chặng
            // khớp trục năm ngay khi Task 11 cắm vào.
            className="ml-[3.25rem] h-[2.875rem]"
          />
        </div>
      }
      // ===== Cột dock — LUÔN chừa sẵn, kể cả khi không chọn gì (spec §5) =====
      dock={
        <Card as="section" padding="panel" elevation="panel">
          <SectionTitle role="micro">Tóm tắt kế hoạch</SectionTitle>
          <p className="mt-2 truncate text-2xs text-fg-muted">Chưa chọn chặng hay mốc nào.</p>
          <Guide className="mt-1 text-2xs leading-relaxed text-fg-muted">
            Thẻ tóm tắt kế hoạch và bảng sửa chặng / mốc sẽ nằm ở đây. Cột này giữ bề rộng
            cố định kể cả khi chưa chọn gì — đó là cách vùng vẽ không co giãn mỗi lần bấm
            vào một mốc.
          </Guide>
        </Card>
      }
      // ===== HÀNG 9–12: phần cuộn bên dưới =====
      below={
        <div className="flex min-w-0 flex-col gap-2.5">
          {/* --- HÀNG 9: vặn nhanh (3 thanh trượt + Lưu / Bỏ) --------------------- */}
          <PlaceholderRow
            label="Vặn nhanh"
            note="Ba thanh trượt (lợi suất thực · chi mỗi năm · lạm phát chi tiêu), dòng chênh lệch so với bản đã lưu, và hai nút Lưu / Bỏ."
          />

          {/* --- HÀNG 10: chip Stress test ---------------------------------------- */}
          <PlaceholderRow
            label="Stress test"
            note="Ba công tắc: khủng hoảng một năm · suy thoái lợi suất 0% · chi cuối đời tăng. Bật lên chỉ để xem hậu quả, không sửa kế hoạch."
          />

          {/* --- HÀNG 11 + 12: chip chuyển pane và pane đang mở. Hai khối dưới đây tự
                  mang chip tiêu đề của mình rồi bung nội dung ngay dưới — đúng cặp
                  "chip + pane" mà bản vẽ vẽ thành hai hàng. */}
          <YearTableSection rows={rows} currency={currency} scenarioName={active.name} />

          <BigExpenseMapSection
            events={input.events}
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

/**
 * Một hàng CHỪA CHỖ. Nó tồn tại để thứ tự mười hai hàng của bản vẽ đúng từ hôm nay —
 * task kế tiếp thay ruột chứ không phải chèn thêm một hàng vào giữa, nên không có lượt
 * "sắp lại bố cục" nào ở cuối đợt.
 *
 * Nói rõ bằng chữ cái gì sẽ nằm ở đây, không để một khối xám trống: người dùng thật có
 * thể mở màn này giữa đợt, và một ô trống không nhãn đọc như một chỗ hỏng.
 */
function PlaceholderRow({
  label,
  note,
  className = '',
}: {
  label: string
  note: string
  className?: string
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-2 rounded-md border border-dashed border-border-strong px-3 py-2 ${className}`.trim()}
    >
      <SectionTitle role="micro" className="shrink-0">
        {label}
      </SectionTitle>
      <span className="min-w-0 truncate text-2xs text-fg-muted">{note}</span>
    </div>
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
