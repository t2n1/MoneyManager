// Đồ thị tài sản ròng cả đời (mục Lifetime). Bốn quy tắc bắt buộc — xem
// docs/superpowers/plans/2026-07-29-lifetime.md mục Task 8 và task-8-report.md:
// 1. Lịch sử thật (networth_snapshots) liền nét, bản chiếu nét đứt `6 4`.
// 2. Dải dao động vẽ giữa `assetsPessimisticMinor` và `assetsOptimisticMinor` — KHÔNG
//    tự sắp lại theo "nhánh thấp/cao", engine đã đảm bảo thứ tự (xem project.ts).
// 3. Vùng âm tô đỏ nhạt + đường 0 nét đứt.
// 4. Đường so sánh phân biệt bằng NÉT (`2 3`, khác hẳn `6 4`), không chỉ bằng màu.
//
// VÌ SAO KHÔNG CÒN RECHARTS. Bản vẽ redesign đòi bốn thứ mà một thư viện đồ thị không
// mở ra được: chip mốc KÉO ĐƯỢC đặt tuyệt đối theo năm, dải chặng đời dưới đáy, thang
// log chịu được số âm, và tooltip GHIM được. Ba trong bốn cần biết chính xác "năm này
// ra pixel nào" — đúng phép chiếu mà Recharts giữ bên trong. Tự vẽ thì phép chiếu đó
// thành code của mình, và nó nằm ở `chartGeom.ts`, nơi có phép thử.
//
// Phần KHÔNG đổi khi bỏ Recharts, và cố ý giữ nguyên: luật "đường nào được vẽ" vẫn là
// `chartSeriesPlan` (chartSeries.ts), câu `aria-label` vẫn sinh từ dữ liệu thật, và
// bảng theo năm vẫn là bản dự phòng đọc được bằng bàn phím.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Maximize2, Minimize2, TrendingDown, TrendingUp } from 'lucide-react'
import { EstimateMark } from '../../components/EstimateMark'
import type { CurrencyCode } from '../../lib/currencies'
import { formatCompact, formatMoney } from '../../lib/money'
import type { NetWorthSnapshotRow } from '../../types/database.types'
import {
  bandPath,
  linePath,
  logYTicks,
  makeXScale,
  makeYScale,
  niceYTicks,
  packRows,
  PLOT_MARGIN,
  symlogUnit,
  xTickStep,
  xToYear,
} from './chartGeom'
import { buildChartData, chartSeriesPlan } from './chartSeries'
import type { DraftEvent } from './draft'
import { compareAtEnd, DEFAULT_SWR_BPS, firstNegativeYear } from './insights'
import type { YearRow } from './project'
import { Card, IconButton, Money } from '../../components/ui'

/** Chặng đời tối thiểu mà dải chặng dưới đáy cần biết. */
export interface ChartPhase {
  id: string
  startYear: number
  label: string
}

interface Props {
  rows: YearRow[]
  historyRows: NetWorthSnapshotRow[]
  currency: CurrencyCode
  compare: YearRow[] | null
  /**
   * `display_currency` của kịch bản đang so sánh. `YearRow[]` của `compare` đã quy đổi
   * xong thành số, không mang theo nhãn tiền tệ gốc, nên câu rào "khác tiền tệ" cần
   * thêm đúng prop này mới đọc được.
   */
  compareCurrency?: CurrencyCode | null
  /** Tên kịch bản đang so sánh — chú giải gọi đúng tên thay vì "kịch bản so sánh". */
  compareName?: string | null
  /**
   * Đơn vị tiền THẬT của `historyRows` — LUÔN là `profiles.base_currency`
   * (`networth_snapshots.net_worth` quy đổi base khi ghi), KHÔNG phải lúc nào cũng trùng
   * `currency` (display_currency của kịch bản ĐANG XEM). Bắt buộc: thiếu nó thì không có
   * cách nào biết có nên vẽ đường lịch sử hay không.
   */
  historyCurrency: CurrencyCode
  /**
   * Bản chiếu của kịch bản ĐÃ LƯU, chỉ truyền khi đang có bản nháp. Vẽ thành một đường
   * xám "trước khi đổi" để thấy ngay cú vặn vừa rồi đẩy đường đi đâu — không có nó thì
   * kéo thanh trượt xong chỉ thấy một đường mới, không biết nó khác đường cũ chỗ nào.
   */
  baseline?: YearRow[] | null
  /** Bản chiếu có cú sốc (khối Stress test) — lớp phủ, không phải dữ liệu kịch bản. */
  stressRows?: YearRow[] | null
  /** Chặng đời của kịch bản đang xem, để vẽ dải chặng dưới đáy đồ thị. */
  phases?: ChartPhase[]
  /** Mốc cuộc đời — vẽ thành chip kéo được phía trên vùng vẽ. */
  events?: DraftEvent[]
  /** Thả chip ở năm khác. Không truyền thì chip chỉ để đọc, không kéo được. */
  onMoveEvent?: (id: string, startYear: number) => void
  /** Bấm (không kéo) vào chip. */
  onSelectEvent?: (id: string) => void
  /** Mốc đang mở form sửa — chip của nó viền đậm. */
  editingEventId?: string | null
  /**
   * Form sửa mốc, do chỗ gọi dựng. Thẻ này chỉ ĐỊNH VỊ nó cạnh đúng chip: chỉ thẻ này
   * biết năm nào ra pixel nào, còn form thì cần biết đơn vị tiền, tỷ giá và cách ghi —
   * những thứ một thẻ đồ thị không nên biết.
   */
  eventEditor?: (pos: EventEditorAnchor) => ReactNode
}

/** Chỗ đặt form sửa mốc, tính từ góc trên-trái của vùng vẽ. */
export interface EventEditorAnchor {
  /** Toạ độ x của chip đang sửa. */
  anchorX: number
  /** Bề ngang vùng vẽ — form tự kẹp để không tràn ra ngoài thẻ. */
  plotWidth: number
  /** Mép trên gợi ý: ngay dưới đồ thị và dưới dải chặng. */
  top: number
}

// Brief mẫu dùng #111827 (gần đen) cho đường lịch sử — mù trên nền dark. Lượt sửa đầu
// đổi sang sky-500 và lập luận "đủ sáng ở cả hai nền" — lập luận đó CHỈ kiểm dark mode.
// Đo lại (canvas pixel readback) thì sky-500 chỉ 2,77:1 trên NỀN TRẮNG, dưới ngưỡng 3:1
// của WCAG 1.4.11 cho đối tượng đồ hoạ. Đây là đường DỮ LIỆU THẬT, đường quan trọng nhất.
// sky-600 đạt cả hai: 4,02:1 trên trắng, 4,41:1 trên gray-900.
const COLOR_ACTUAL = 'var(--color-sky-600)'
const COLOR_PROJECTED = '#16a34a' // 3,30:1 trên trắng / 5,38:1 trên gray-900 — đạt 3:1 cả hai
const COLOR_COMPARE = '#6b7280' // 4,83:1 / 3,67:1 — đạt
const COLOR_NEGATIVE = '#ef4444' // chỉ dùng làm nền vùng âm ở opacity 0,1
// Vừa là NÉT (đường 0, vạch trục — cần 3:1) vừa là CHỮ nhãn trục 11px (cần 4,5:1).
// Không sắc xám nào đạt 4,5:1 cả hai chế độ nên phải là token: --fg-muted = gray-500
// light (4,84:1) / gray-400 dark (6,99:1). var() CÓ resolve trong presentation attribute
// của SVG và lật theo .dark — đã kiểm.
const COLOR_AXIS = 'var(--fg-muted)'
// Hai mép của dải dao động. Mock vẽ mép trên MÀU XANH DƯƠNG, ở đây cố ý KHÔNG theo:
// xanh dương trong đồ thị này đã là LỊCH SỬ THẬT, nên một đường xanh dương thứ hai đọc
// thành "đây cũng là số đã xảy ra" — điều nguy hiểm nhất có thể nói nhầm trên một bản
// chiếu. Dùng cặp token tiền đã có, và nét chấm `1 4` khác hẳn `6 4`/`2 3`.
const COLOR_OPTIMISTIC = 'var(--money-in)'
const COLOR_PESSIMISTIC = 'var(--money-out)'
// Lớp phủ stress: cùng màu cảnh báo với khối bật nó, nét `4 3` không trùng nét nào khác.
const COLOR_STRESS = 'var(--fg-warn)'
// Đường "trước khi đổi": cùng họ xám với đường so sánh nhưng LIỀN NÉT, còn so sánh thì
// `2 3` — hai đường xám cùng lúc phân biệt được bằng nét, không cần phân biệt bằng sắc.
const COLOR_BASELINE = COLOR_AXIS

/** Tham chiếu ỔN ĐỊNH cho "không có" — `[]` trong JSX tạo mảng mới mỗi lần render. */
const EMPTY_HISTORY: NetWorthSnapshotRow[] = []
const EMPTY_EVENTS: DraftEvent[] = []
const EMPTY_PHASES: ChartPhase[] = []

/** Chiều cao một hàng chip mốc, và mép trên của hàng đầu. */
const CHIP_ROW_H = 26
const CHIP_TOP = 4
/** Bề ngang ước lượng của chip theo số ký tự — chỉ để XẾP HÀNG, không để vẽ. */
const CHIP_CHAR_PX = 6.5
const CHIP_PAD_PX = 42
/** Chiều cao dải chặng đời dưới đáy. */
const LANE_H = 38

/** Tối đa bao nhiêu năm mốc được ĐỌC TÊN trong `aria-label` trước khi gộp phần còn lại. */
const ARIA_MARKER_LIMIT = 8

interface ChartOpts {
  /** Số năm kể từ năm nay, hoặc 'all' = cả bản chiếu (gồm cả lịch sử đã có). */
  range: number | 'all'
  band: boolean
  history: boolean
  fire: boolean
  events: boolean
  lane: boolean
  log: boolean
  expanded: boolean
}

const DEFAULT_OPTS: ChartOpts = {
  range: 'all',
  band: true,
  history: true,
  fire: true,
  events: true,
  lane: true,
  log: false,
  expanded: false,
}

/**
 * Năm sự kiện MỚI xuất hiện so với năm liền trước → TÊN các sự kiện mới của năm đó.
 * `YearEvent` (project.ts) không mang `startYear` (bị lược khi build YearRow), nên đây
 * là suy luận từ chênh lệch tập id giữa hai năm liền kề, không đọc thẳng được. Dùng cho
 * `aria-label` và cho tooltip khi chỗ gọi không truyền `events`.
 */
function newEventYears(rows: YearRow[]): number[] {
  const out: number[] = []
  let prevIds = new Set((rows[0]?.events ?? []).map((e) => e.id))
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].events.some((e) => !prevIds.has(e.id))) out.push(rows[i].year)
    prevIds = new Set(rows[i].events.map((e) => e.id))
  }
  return out
}

/** Câu mô tả cho `aria-label` — sinh từ dữ liệu THẬT, không phải câu trang trí cố định. */
function buildAriaLabel(args: {
  rows: YearRow[]
  historyRows: NetWorthSnapshotRow[]
  currency: CurrencyCode
  markerYears: number[]
  compareEndRow: YearRow | null
  compareCurrency: CurrencyCode | null | undefined
  showCompare: boolean
  historyHiddenNote: string | null
  compareHiddenNote: string | null
  compareEmptyNote: string | null
  stressRows: YearRow[] | null
}): string {
  const { rows, historyRows, currency, markerYears } = args
  if (rows.length === 0) return 'Chưa có dữ liệu để chiếu tài sản ròng.'

  const startYear = rows[0].year
  const endYear = rows[rows.length - 1].year
  const endValue = rows[rows.length - 1].assetsEndMinor
  let peak = rows[0]
  for (const r of rows) if (r.assetsEndMinor > peak.assetsEndMinor) peak = r
  // 'low' = biên DƯỚI của dải — đáng lo hơn nhánh trung tâm, xem JSDoc firstNegativeYear.
  const negYear = firstNegativeYear(rows, 'low')

  const sentences = [
    `Tài sản ròng từ năm ${startYear} đến năm ${endYear}.`,
    `Nhánh trung tâm đạt đỉnh ${formatMoney(peak.assetsEndMinor, currency)} quanh năm ${peak.year}, cuối kỳ còn ${formatMoney(endValue, currency)}.`,
    // "Nhánh bi quan" — cùng từ với thẻ kết luận và cột "Bi quan" của bảng theo năm.
    negYear
      ? `Nhánh bi quan (mép dưới của dải dao động) âm từ năm ${negYear}.`
      : 'Nhánh bi quan (mép dưới của dải dao động) không xuống dưới 0.',
  ]

  if (markerYears.length > 0) {
    const shown = markerYears.slice(0, ARIA_MARKER_LIMIT)
    const rest = markerYears.length - shown.length
    sentences.push(
      `Có ${markerYears.length} mốc sự kiện trên trục năm: ${shown.join(', ')}${rest > 0 ? ` và ${rest} mốc nữa` : ''}.`,
    )
  }

  if (args.historyHiddenNote) {
    sentences.push(args.historyHiddenNote)
  } else if (historyRows.length > 0) {
    sentences.push(`Có ${historyRows.length} điểm lịch sử thật ghi nhận trước năm ${startYear}.`)
  }

  if (args.compareHiddenNote) {
    sentences.push(args.compareHiddenNote)
  } else if (args.compareEmptyNote) {
    sentences.push(args.compareEmptyNote)
  } else if (args.showCompare && args.compareEndRow) {
    const cur = args.compareCurrency ?? currency
    sentences.push(
      `Có thêm đường kịch bản so sánh, cuối kỳ ${formatMoney(args.compareEndRow.assetsEndMinor, cur)}.`,
    )
  }

  if (args.stressRows && args.stressRows.length > 0) {
    const s = args.stressRows[args.stressRows.length - 1]
    sentences.push(
      `Có thêm đường stress test, cuối kỳ ${formatMoney(s.assetsEndMinor, currency)}.`,
    )
  }

  return sentences.join(' ')
}

/** Mẫu nét nhỏ cho chú giải — vẽ đúng strokeDasharray của đường thật, không xấp xỉ. */
function LegendSwatch({ color, dash }: { color: string; dash?: string }) {
  return (
    <svg width="18" height="8" aria-hidden="true" className="shrink-0">
      <line x1="0" y1="4" x2="18" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dash} />
    </svg>
  )
}

/** Nút bật/tắt dạng viên thuốc trong thanh công cụ đồ thị. */
function PillButton({
  active,
  onClick,
  title,
  children,
  role,
}: {
  active: boolean
  onClick: () => void
  title?: string
  children: ReactNode
  role?: 'tab'
}) {
  return (
    <button
      type="button"
      role={role}
      // `aria-selected` cho tab, `aria-pressed` cho nút bật/tắt — hai vai khác nhau, và
      // một nút mang cả hai thì screen reader đọc mâu thuẫn.
      {...(role === 'tab' ? { 'aria-selected': active } : { 'aria-pressed': active })}
      onClick={onClick}
      title={title}
      className={`min-h-8 whitespace-nowrap rounded-full border px-2.5 py-1 text-2xs font-semibold transition active:scale-95 ${
        active
          ? 'border-border-strong bg-surface-sunken text-fg-primary'
          : 'border-transparent text-fg-muted hover:bg-surface-sunken'
      }`}
    >
      {children}
    </button>
  )
}

export function LifetimeChartCard({
  rows,
  historyRows,
  currency,
  compare,
  compareCurrency,
  compareName,
  historyCurrency,
  baseline = null,
  stressRows = null,
  phases = EMPTY_PHASES,
  events = EMPTY_EVENTS,
  onMoveEvent,
  onSelectEvent,
  editingEventId = null,
  eventEditor,
}: Props) {
  const [opts, setOpts] = useState<ChartOpts>(DEFAULT_OPTS)
  const [hoverYear, setHoverYear] = useState<number | null>(null)
  const [pinnedYear, setPinnedYear] = useState<number | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [plotW, setPlotW] = useState(760)
  const [viewportH, setViewportH] = useState(800)
  const plotRef = useRef<HTMLDivElement>(null)
  /** Đã nhích chuột trong lượt kéo này chưa — phân biệt "kéo" với "bấm". */
  const dragMoved = useRef(false)
  /**
   * Mốc đang được kéo, bản REF. `dragId` (state) chỉ để vẽ; mọi phép SO SÁNH trong tay
   * xử lý con trỏ phải đọc ref này.
   *
   * Lý do: `setDragId` trong `pointerdown` chưa kịp vào closure của `pointerup` nếu hai
   * sự kiện rơi cùng một lượt xử lý — và lúc đó `pointerup` thoát sớm, tức BẤM vào chip
   * không mở được form sửa. Đã dựng lại được bằng cách phát hai sự kiện liền nhau.
   */
  const dragIdRef = useRef<string | null>(null)
  const titleId = useId()

  /**
   * Đo bề ngang vùng vẽ. Mọi toạ độ đều suy từ con số này nên nó phải là bề ngang THẬT
   * sau khi bố cục ổn định, không phải một giá trị đoán trước: thẻ đứng trong lưới hai
   * cột co giãn, và ở cỡ chữ "Rất lớn" cột trái hẹp đi vài chục pixel.
   *
   * Gắn bằng REF CALLBACK, không phải `useEffect(…, [])`. Bản đầu dùng effect và đã sai
   * thật: lần render ĐẦU tiên `rows` còn rỗng nên thẻ này return sớm ở nhánh "chưa chiếu
   * được", tức cái div này chưa tồn tại — effect chạy, thấy ref null, thoát, và với mảng
   * deps rỗng thì nó KHÔNG BAO GIỜ chạy lại. Bề ngang kẹt ở giá trị khởi tạo 760, nên
   * trên điện thoại 375px đồ thị vẫn vẽ rộng 760px và tràn hẳn ra ngoài thẻ.
   * Ref callback thì chạy đúng lúc node xuất hiện, và chạy lại nếu node bị thay.
   */
  const roRef = useRef<ResizeObserver | null>(null)
  const attachPlot = useCallback((el: HTMLDivElement | null) => {
    plotRef.current = el
    roRef.current?.disconnect()
    roRef.current = null
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      if (w > 0) setPlotW((cu) => (Math.abs(cu - w) > 1 ? w : cu))
    })
    ro.observe(el)
    roRef.current = ro
    if (el.clientWidth > 0) setPlotW(el.clientWidth)
  }, [])
  // KHÔNG thêm `useEffect(() => () => ro.disconnect(), [])` ở đây. Đã thử và nó GIẾT
  // observer: <StrictMode> chạy cleanup rồi gắn lại một lượt nữa, và cái cleanup của
  // effect chạy SAU lần gắn thứ hai — nó ngắt đúng observer vừa mới tạo, im lặng. Hệ quả
  // là đồ thị vẽ mãi theo bề ngang của lần đo đầu tiên: đổi cỡ cửa sổ, mở/đóng cột phụ,
  // hay xoay điện thoại đều không vẽ lại. React luôn gọi ref callback với `null` khi gỡ,
  // nên nhánh `if (!el) return` ở trên đã là chỗ dọn duy nhất cần có.

  useEffect(() => {
    const doc = () => setViewportH(window.innerHeight)
    doc()
    window.addEventListener('resize', doc)
    return () => window.removeEventListener('resize', doc)
  }, [])

  // Esc thoát chế độ phóng to — cùng quy ước với mọi lớp phủ khác trong app. Không có
  // nó thì người dùng bàn phím bị kẹt trong một lớp phủ chiếm trọn màn hình.
  useEffect(() => {
    if (!opts.expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpts((o) => ({ ...o, expanded: false }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [opts.expanded])

  const setOpt = useCallback(<K extends keyof ChartOpts>(k: K, v: ChartOpts[K]) => {
    setOpts((o) => ({ ...o, [k]: v }))
  }, [])

  // Luật "đường nào ĐƯỢC VẼ" — theo ĐƠN VỊ TIỀN, không theo "có dữ liệu hay không".
  // Truyền NGUYÊN mảng `compare`, không tự tính `compare !== null` rồi truyền boolean:
  // một bản chiếu RỖNG (`[]`) khác `null` nên nó từng đi qua thành "đang so sánh", và
  // hệ quả là dải dao động cùng vùng âm đỏ biến mất, đổi lấy một đường không tồn tại.
  const plan = chartSeriesPlan({ currency, historyCurrency, compareCurrency, compareRows: compare })
  const showHistoryCurrency = plan.showHistory
  const showCompare = plan.showCompare
  const effectiveHistoryRows = showHistoryCurrency ? historyRows : EMPTY_HISTORY

  const data = useMemo(
    () => buildChartData(rows, effectiveHistoryRows, compare),
    [rows, effectiveHistoryRows, compare],
  )
  const markerYears = useMemo(() => newEventYears(rows), [rows])
  const compareEndRow = compare && compare.length > 0 ? compare[compare.length - 1] : null
  const endRow = rows.length > 0 ? rows[rows.length - 1] : null
  const ariaLabel = useMemo(
    () =>
      buildAriaLabel({
        rows,
        historyRows: effectiveHistoryRows,
        currency,
        markerYears,
        compareEndRow,
        compareCurrency,
        showCompare,
        historyHiddenNote: plan.historyHiddenNote,
        compareHiddenNote: plan.compareHiddenNote,
        compareEmptyNote: plan.compareEmptyNote,
        stressRows,
      }),
    [
      rows,
      effectiveHistoryRows,
      currency,
      markerYears,
      compareEndRow,
      compareCurrency,
      showCompare,
      plan.historyHiddenNote,
      plan.compareHiddenNote,
      plan.compareEmptyNote,
      stressRows,
    ],
  )

  // --- Hình học -----------------------------------------------------------------
  //
  // Cả khối này chạy CẢ KHI `rows` rỗng (nhánh đó return ở dưới, sau mọi hook). Mọi
  // hàm dưới đây tự chịu được mảng rỗng, và `chartGeom` đã canh ca min === max.
  const currentYear = rows.length > 0 ? rows[0].year : new Date().getFullYear()
  const birthYear = rows.length > 0 ? rows[0].year - rows[0].age : null
  const lastYear = endRow?.year ?? currentYear
  const stressEnd = stressRows && stressRows.length > 0 ? stressRows[stressRows.length - 1].year : lastYear
  const fullEnd = Math.max(lastYear, stressEnd)
  const rangeAll = opts.range === 'all'
  // Ở "Cả đời" trục bắt đầu từ điểm lịch sử SỚM NHẤT (nếu có) — không thì đường lịch sử
  // bị cắt cụt ngay ở mép trái và người dùng tưởng app quên mất mấy năm đã ghi.
  const firstDataYear = data.length > 0 ? data[0].year : currentYear
  const x0 = rangeAll ? Math.min(firstDataYear, currentYear) : currentYear
  const x1 = rangeAll ? fullEnd : Math.min(fullEnd, currentYear + (opts.range as number))

  const chartH = opts.expanded
    ? Math.max(360, viewportH - 300)
    : plotW >= 700
      ? 340
      : 240
  const plotTop = PLOT_MARGIN.top
  const plotBottom = chartH - PLOT_MARGIN.bottom
  const plotLeft = PLOT_MARGIN.left
  const plotRight = Math.max(plotLeft + 10, plotW - PLOT_MARGIN.right)
  const xs = makeXScale(x0, x1, plotLeft, plotRight)

  const inX = useCallback((y: number) => y >= x0 && y <= x1, [x0, x1])
  const dRows = useMemo(() => rows.filter((r) => inX(r.year)), [rows, inX])
  const dStress = useMemo(
    () => (stressRows ? stressRows.filter((r) => inX(r.year)) : null),
    [stressRows, inX],
  )
  const dCompare = useMemo(
    () => (showCompare && compare ? compare.filter((r) => inX(r.year)) : null),
    [showCompare, compare, inX],
  )
  const dBaseline = useMemo(
    () => (baseline ? baseline.filter((r) => inX(r.year)) : null),
    [baseline, inX],
  )
  // Lịch sử chỉ hiện ở "Cả đời": các khoảng ngắn bắt đầu từ NĂM NAY nên không có điểm
  // lịch sử nào lọt vào, và bật nút "Lịch sử" ở đó sẽ là một nút không làm gì.
  const showHistory = showHistoryCurrency && opts.history && rangeAll
  const dHistory = useMemo(
    () =>
      showHistory
        ? data.filter((d) => d.actual != null && inX(d.year)).map((d) => ({ year: d.year, v: d.actual as number }))
        : [],
    [showHistory, data, inX],
  )

  const showBand = plan.showBand && opts.band

  const { yMin, yMax } = useMemo(() => {
    let lo = 0
    let hi = 0
    for (const r of dRows) {
      lo = Math.min(lo, showBand ? r.assetsPessimisticMinor : r.assetsEndMinor)
      hi = Math.max(hi, showBand ? r.assetsOptimisticMinor : r.assetsEndMinor)
      // Ngưỡng FIRE là một ĐƯỜNG được vẽ, nên nó phải nằm trong miền — không thì nó
      // dán vào mép trên và câu "còn thiếu bao nhiêu" mất chỗ dựa bằng mắt.
      if (opts.fire) hi = Math.max(hi, r.expenseMinor * (10_000 / DEFAULT_SWR_BPS))
    }
    // Chỉ tính số hạng của chuỗi ĐANG ĐƯỢC VẼ: một chuỗi số USD trên trục ¥ sẽ kéo cả
    // miền — và do đó cả vùng âm đỏ — theo một đơn vị tiền khác hẳn đơn vị của trục.
    for (const r of dStress ?? []) {
      lo = Math.min(lo, r.assetsEndMinor)
      hi = Math.max(hi, r.assetsEndMinor)
    }
    for (const r of dCompare ?? []) {
      lo = Math.min(lo, r.assetsEndMinor)
      hi = Math.max(hi, r.assetsEndMinor)
    }
    for (const r of dBaseline ?? []) {
      lo = Math.min(lo, r.assetsEndMinor)
      hi = Math.max(hi, r.assetsEndMinor)
    }
    for (const h of dHistory) hi = Math.max(hi, h.v)
    return { yMin: lo, yMax: hi * 1.04 || 1 }
  }, [dRows, dStress, dCompare, dBaseline, dHistory, showBand, opts.fire])

  const unit = symlogUnit(yMin, yMax)
  const ys = makeYScale({ min: yMin, max: yMax, log: opts.log, unit, plotTop, plotBottom })

  const pt = useCallback(
    (r: YearRow, pick: (r: YearRow) => number): [number, number] => [xs(r.year), ys(pick(r))],
    [xs, ys],
  )

  const centerPath = linePath(dRows.map((r) => pt(r, (x) => x.assetsEndMinor)))
  const highPts = dRows.map((r) => pt(r, (x) => x.assetsOptimisticMinor))
  const lowPts = dRows.map((r) => pt(r, (x) => x.assetsPessimisticMinor))
  const stressPath = dStress ? linePath(dStress.map((r) => pt(r, (x) => x.assetsEndMinor))) : null
  const comparePath = dCompare ? linePath(dCompare.map((r) => pt(r, (x) => x.assetsEndMinor))) : null
  const baselinePath = dBaseline
    ? linePath(dBaseline.map((r) => pt(r, (x) => x.assetsEndMinor)))
    : null
  const historyPath = linePath(dHistory.map((h) => [xs(h.year), ys(h.v)]))
  // Ngưỡng FIRE = tài sản đủ để rút DEFAULT_SWR_BPS mỗi năm mà vẫn tiêu được — nó ĐỔI
  // theo từng năm vì chi nền đổi theo chặng, nên là một đường chứ không phải một mức.
  const fireMul = 10_000 / DEFAULT_SWR_BPS
  const firePath = opts.fire
    ? linePath(dRows.map((r) => [xs(r.year), ys(r.expenseMinor * fireMul)]))
    : null

  const yTicks = useMemo(
    () => (opts.log ? logYTicks(yMin, yMax, unit) : niceYTicks(yMin, yMax, chartH > 300 ? 5 : 4)),
    [opts.log, yMin, yMax, unit, chartH],
  )
  const xTicks = useMemo(() => {
    const step = xTickStep(x1 - x0, plotRight - plotLeft)
    const out: number[] = []
    for (let y = Math.ceil(x0 / step) * step; y <= x1; y += step) out.push(y)
    return out
  }, [x0, x1, plotLeft, plotRight])

  // --- Chip mốc ------------------------------------------------------------------
  const visibleEvents = useMemo(
    () =>
      opts.events
        ? [...events].sort((a, b) => a.startYear - b.startYear).filter((e) => inX(e.startYear))
        : [],
    [opts.events, events, inX],
  )
  const chipRows = useMemo(() => {
    return packRows(
      visibleEvents.map((e) => {
        const label = `${e.startYear} · ${e.label}`
        const w = label.length * CHIP_CHAR_PX + CHIP_PAD_PX
        // Chip ở sát hai mép bị đẩy vào trong để không tràn ra ngoài thẻ — nên phép
        // xếp hàng phải dùng vị trí ĐÃ ĐẨY, không phải vị trí lý thuyết.
        const c = Math.min(Math.max(xs(e.startYear), plotLeft + 30), plotRight - 30)
        return { left: c - w / 2, width: w }
      }),
    )
  }, [visibleEvents, xs, plotLeft, plotRight])
  const chipRowCount = chipRows.length > 0 ? Math.max(...chipRows) + 1 : 0

  // --- Rê chuột / ghim / kéo -------------------------------------------------------
  const yearAt = useCallback(
    (clientX: number): number | null => {
      const el = plotRef.current
      if (!el) return null
      return xToYear(clientX - el.getBoundingClientRect().left, x0, x1, plotLeft, plotRight)
    },
    [x0, x1, plotLeft, plotRight],
  )

  const shownYear = pinnedYear ?? hoverYear
  const hoverRow = shownYear !== null ? dRows.find((r) => r.year === shownYear) : undefined
  const stressHoverRow =
    hoverRow && stressRows ? stressRows.find((r) => r.year === hoverRow.year) : undefined

  const negYear = useMemo(() => firstNegativeYear(rows, 'low'), [rows])

  if (rows.length === 0) {
    return (
      <Card as="section">
        <p className="text-center text-sm text-fg-muted">
          Chưa chiếu được — kiểm tra lại tuổi kết thúc của kịch bản.
        </p>
      </Card>
    )
  }

  // compareAtEnd KHÔNG quy đổi tỷ giá (chỉ trừ thẳng hai assetsEndMinor) — nếu hai kịch
  // bản khác display_currency thì hiệu đó là hai đơn vị KHÁC NHAU trừ vào nhau, một con
  // số RÁC. Một con số rác có nhãn giải thích vẫn bị đọc thành kết luận, nên khi lệch
  // tiền tệ thì KHÔNG tính; hiện hai giá trị cuối đời riêng, mỗi cái đúng đơn vị của nó.
  const compareMismatch = plan.compareHiddenNote !== null
  const compareDiff =
    compare && compareEndRow && !compareMismatch ? compareAtEnd(rows, compare) : null

  const zeroY = ys(0)
  const negRectH = yMin < 0 ? ys(yMin) - zeroY : 0
  const ruinX = negYear !== null && inX(negYear) ? xs(negYear) : null
  const laneTop = chartH + 2

  const cardClass = opts.expanded
    // z-40 như nền mờ, và đứng SAU nó trong DOM nên thắng — cùng luật với mọi sheet
    // khác trong app (tests/overlayLayers.ts canh cả dải này).
    ? 'fixed inset-2 z-40 overflow-auto sm:inset-4'
    : ''

  return (
    <>
      {opts.expanded && (
        <div
          className="fixed inset-0 z-40 bg-black/40 animate-overlay-in"
          onClick={() => setOpt('expanded', false)}
        />
      )}
      <Card as="section" aria-labelledby={titleId} className={cardClass}>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {/* Dấu ≈ đặt ở TIÊU ĐỀ, không rải vào từng con số: cả khối này là số chiếu
              theo kịch bản, gắn dấu vào mỗi chỗ thì thành nhiễu mà không thêm nghĩa. */}
          <h2 id={titleId} className="mr-auto shrink-0 text-sm font-semibold text-fg-muted">
            Tài sản ròng cả đời
            <EstimateMark reason="Toàn bộ khối này là số chiếu theo kịch bản bạn đặt, không phải số đã xảy ra." />
          </h2>

          <div
            role="tablist"
            aria-label="Khoảng thời gian"
            className="flex rounded-lg border border-border-panel p-0.5"
          >
            {([[5, '5 năm'], [10, '10 năm'], [20, '20 năm'], ['all', 'Cả đời']] as const).map(
              ([k, l]) => (
                <PillButton
                  key={String(k)}
                  role="tab"
                  active={opts.range === k}
                  onClick={() => setOpt('range', k as ChartOpts['range'])}
                >
                  {l}
                </PillButton>
              ),
            )}
          </div>

          <div className="flex flex-wrap gap-0.5">
            {(
              [
                ['band', 'Dải', 'Dải dao động lạc quan–bi quan'],
                ['history', 'Lịch sử', 'Đường lịch sử thật (chỉ ở Cả đời)'],
                ['fire', 'FIRE', `Ngưỡng tự do tài chính = ${Math.round(fireMul)}× chi`],
                ['events', 'Mốc', 'Nhãn mốc cuộc đời trên đồ thị'],
                ['lane', 'Chặng', 'Dải chặng đời dưới đồ thị'],
                ['log', 'Log', 'Thang logarit — nhìn rõ giai đoạn đầu'],
              ] as const
            ).map(([k, l, tip]) => (
              <PillButton
                key={k}
                active={opts[k]}
                title={tip}
                onClick={() => setOpt(k, !opts[k])}
              >
                {l}
              </PillButton>
            ))}
          </div>

          <IconButton
            variant="ghost"
            onClick={() => setOpt('expanded', !opts.expanded)}
            aria-label={opts.expanded ? 'Thu nhỏ đồ thị' : 'Phóng to đồ thị'}
            className="shrink-0 px-2"
          >
            {opts.expanded ? (
              <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </IconButton>
        </div>

        <div
          ref={attachPlot}
          className="relative w-full"
          style={{
            cursor: 'crosshair',
            // Chừa chỗ cho dải chặng và cho form sửa mốc — cả hai nằm NGOÀI <svg>, nên
            // nếu không cộng vào đây chúng sẽ đè lên chú giải bên dưới.
            paddingBottom: opts.lane && phases.length > 0 ? LANE_H : 0,
          }}
          onPointerMove={(e) => {
            if (dragId !== null) return
            const y = yearAt(e.clientX)
            if (y !== null && y !== hoverYear) setHoverYear(y)
          }}
          onPointerLeave={() => setHoverYear(null)}
          onClick={(e) => {
            // Vừa kéo xong thì cú click tổng hợp sau đó không được hiểu là "ghim năm".
            if (dragMoved.current) {
              dragMoved.current = false
              return
            }
            if (pinnedYear !== null) {
              setPinnedYear(null)
              return
            }
            const y = yearAt(e.clientX)
            if (y !== null) setPinnedYear(y)
          }}
        >
          <svg
            width="100%"
            height={chartH}
            role="img"
            aria-label={ariaLabel}
            className="block select-none"
          >
            {negRectH > 0 && (
              <rect
                x={plotLeft}
                y={zeroY}
                width={plotRight - plotLeft}
                height={negRectH}
                fill={COLOR_NEGATIVE}
                opacity={0.1}
              />
            )}

            {yTicks.map((v) => (
              <g key={`y${v}`}>
                <line
                  x1={plotLeft}
                  y1={ys(v)}
                  x2={plotRight}
                  y2={ys(v)}
                  stroke="var(--border-subtle)"
                  strokeWidth={1}
                />
                <text
                  x={plotLeft - 4}
                  y={ys(v) + 4}
                  fontSize={11}
                  fill={COLOR_AXIS}
                  textAnchor="end"
                  className="font-mono"
                >
                  {formatCompact(v, currency)}
                </text>
              </g>
            ))}

            <line
              x1={plotLeft}
              y1={zeroY}
              x2={plotRight}
              y2={zeroY}
              stroke={COLOR_AXIS}
              strokeDasharray="4 3"
              strokeWidth={1}
            />

            {firePath && (
              <>
                <path
                  d={firePath}
                  fill="none"
                  stroke={COLOR_OPTIMISTIC}
                  strokeWidth={1}
                  strokeDasharray="8 4"
                  opacity={0.7}
                />
                <text
                  x={plotRight - 4}
                  y={ys(dRows[dRows.length - 1]?.expenseMinor * fireMul) - 5}
                  fontSize={10}
                  fill={COLOR_OPTIMISTIC}
                  textAnchor="end"
                >
                  Ngưỡng tự do tài chính
                </text>
              </>
            )}

            {/* Vạch đứng của từng mốc, nối chip xuống đáy vùng vẽ — không có nó thì chip
                nổi lơ lửng và không chỉ vào năm nào cả. */}
            {visibleEvents.map((e, i) => (
              <line
                key={`m${e.id}`}
                x1={xs(e.startYear)}
                y1={CHIP_TOP + chipRows[i] * CHIP_ROW_H + 22}
                x2={xs(e.startYear)}
                y2={plotBottom}
                stroke={e.kind === 'income' ? COLOR_OPTIMISTIC : COLOR_PESSIMISTIC}
                strokeDasharray="3 3"
                strokeWidth={1}
                opacity={0.55}
              />
            ))}

            {showBand && (
              <>
                <path d={bandPath(highPts, lowPts)} fill={COLOR_PROJECTED} opacity={0.13} />
                {/* Viền của dải. Không có nó thì "lạc quan tới đâu, bi quan tới đâu"
                    phải đoán bằng mắt ở chỗ vùng mờ nhạt dần — mà đó chính là hai con số
                    chú giải bên dưới đang nêu tên. */}
                <path
                  d={linePath(highPts)}
                  fill="none"
                  stroke={COLOR_OPTIMISTIC}
                  strokeWidth={1.5}
                  strokeDasharray="1 4"
                />
                <path
                  d={linePath(lowPts)}
                  fill="none"
                  stroke={COLOR_PESSIMISTIC}
                  strokeWidth={1.5}
                  strokeDasharray="1 4"
                />
              </>
            )}

            {baselinePath && (
              <path d={baselinePath} fill="none" stroke={COLOR_BASELINE} strokeWidth={1.5} />
            )}
            {comparePath && (
              <path
                d={comparePath}
                fill="none"
                stroke={COLOR_COMPARE}
                strokeWidth={1.5}
                strokeDasharray="2 3"
              />
            )}
            {stressPath && (
              <path
                d={stressPath}
                fill="none"
                stroke={COLOR_STRESS}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )}

            <path
              d={centerPath}
              fill="none"
              stroke={COLOR_PROJECTED}
              strokeWidth={2}
              strokeDasharray="6 4"
            />

            {/* Lịch sử thật: liền nét. Chấm nhỏ vì lịch sử thưa (vài mốc) — không chấm
                thì với người mới bật Lifetime (mới có 1 snapshot) nó vô hình hoàn toàn. */}
            {dHistory.length > 0 && (
              <>
                <path d={historyPath} fill="none" stroke={COLOR_ACTUAL} strokeWidth={2} />
                {dHistory.map((h) => (
                  <circle key={`h${h.year}`} cx={xs(h.year)} cy={ys(h.v)} r={3} fill={COLOR_ACTUAL} />
                ))}
              </>
            )}

            {ruinX !== null && (
              <>
                <line
                  x1={ruinX}
                  y1={plotTop}
                  x2={ruinX}
                  y2={plotBottom}
                  stroke={COLOR_PESSIMISTIC}
                  strokeWidth={1.5}
                />
                <text
                  x={ruinX > plotRight - 130 ? ruinX - 5 : ruinX + 5}
                  y={plotTop + 12}
                  fontSize={10}
                  fontWeight={600}
                  fill={COLOR_PESSIMISTIC}
                  textAnchor={ruinX > plotRight - 130 ? 'end' : 'start'}
                >
                  ⚑ cạn tiền {negYear}
                </text>
              </>
            )}

            {xTicks.map((y) => (
              <g key={`x${y}`}>
                <line
                  x1={xs(y)}
                  y1={plotBottom}
                  x2={xs(y)}
                  y2={plotBottom + 4}
                  stroke={COLOR_AXIS}
                  strokeWidth={1}
                  opacity={0.5}
                />
                {/* Năm KÈM TUỔI. Cả màn này nói bằng hai đơn vị — thẻ kết luận ghi
                    "tuổi 47", mốc trên đồ thị ghi năm — nên tách hai thứ ra là bắt người
                    đọc trừ nhẩm ở mỗi lần liếc. */}
                <text
                  x={xs(y)}
                  y={plotBottom + 14}
                  fontSize={10}
                  fill={COLOR_AXIS}
                  textAnchor="middle"
                  className="font-mono"
                >
                  {birthYear === null ? y : `${y} · ${y - birthYear}t`}
                </text>
              </g>
            ))}

            {hoverRow && (
              <>
                <line
                  x1={xs(hoverRow.year)}
                  y1={plotTop}
                  x2={xs(hoverRow.year)}
                  y2={plotBottom}
                  stroke={COLOR_AXIS}
                  strokeWidth={1}
                  opacity={0.5}
                />
                <circle
                  cx={xs(hoverRow.year)}
                  cy={ys(hoverRow.assetsEndMinor)}
                  r={3.5}
                  fill={COLOR_PROJECTED}
                />
              </>
            )}
          </svg>

          {/* Chip mốc — nằm NGOÀI <svg> vì chúng là <button> thật: kéo được bằng ngón
              tay, bấm được bằng bàn phím, và có `title` đọc được. Một <text> trong SVG
              thì không có thứ nào trong ba thứ đó. */}
          {visibleEvents.map((e, i) => {
            const isIncome = e.kind === 'income'
            const cx = Math.min(Math.max(xs(e.startYear), plotLeft + 30), plotRight - 30)
            const editing = editingEventId === e.id
            return (
              <button
                key={e.id}
                type="button"
                title={`${e.startYear}${e.endYear !== null && e.endYear !== e.startYear ? `–${e.endYear}` : ''} · ${e.label}${onMoveEvent ? ' — kéo để dời năm, bấm để sửa' : ''}`}
                style={{
                  position: 'absolute',
                  top: CHIP_TOP + chipRows[i] * CHIP_ROW_H,
                  left: cx,
                  transform: 'translateX(-50%)',
                  // Bắt buộc để kéo được bằng ngón tay: không có nó thì cử chỉ kéo dọc
                  // bị trình duyệt nuốt thành cuộn trang trước khi pointermove kịp chạy.
                  touchAction: 'none',
                  cursor: onMoveEvent ? 'grab' : 'pointer',
                }}
                className={`z-10 inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold shadow-sm transition ${
                  isIncome
                    ? 'bg-state-good-bg text-state-good-fg'
                    : 'bg-state-bad-bg text-state-bad-fg'
                } ${editing ? 'ring-2 ring-accent' : 'border border-border-strong'}`}
                onClick={(ev) => ev.stopPropagation()}
                onPointerDown={(ev) => {
                  if (!onMoveEvent) return
                  ev.stopPropagation()
                  ev.currentTarget.setPointerCapture(ev.pointerId)
                  dragMoved.current = false
                  dragIdRef.current = e.id
                  setDragId(e.id)
                  setHoverYear(null)
                }}
                onPointerMove={(ev) => {
                  if (dragIdRef.current !== e.id || !onMoveEvent) return
                  const y = yearAt(ev.clientX)
                  if (y === null || y === e.startYear) return
                  dragMoved.current = true
                  // Kẹp từ NĂM NAY: kéo một mốc về quá khứ là dựng một kế hoạch cho một
                  // năm đã qua, mà bản chiếu bắt đầu từ năm nay nên nó sẽ biến mất khỏi
                  // đồ thị ngay khi thả tay.
                  onMoveEvent(e.id, Math.max(currentYear, y))
                }}
                onPointerUp={(ev) => {
                  if (dragIdRef.current !== e.id) return
                  ev.stopPropagation()
                  dragIdRef.current = null
                  setDragId(null)
                  if (!dragMoved.current) onSelectEvent?.(e.id)
                }}
                onKeyDown={(ev) => {
                  // Bàn phím phải làm được đúng việc mà chuột làm bằng cách kéo. Không
                  // có nhánh này thì "dời mốc sang năm khác" là thao tác duy nhất trên
                  // màn chỉ dùng được bằng chuột hoặc ngón tay.
                  if (!onMoveEvent) return
                  if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
                    ev.preventDefault()
                    const b = ev.key === 'ArrowLeft' ? -1 : 1
                    onMoveEvent(e.id, Math.max(currentYear, Math.min(x1, e.startYear + b)))
                  }
                }}
              >
                {isIncome ? (
                  <TrendingUp className="h-3 w-3 shrink-0" aria-hidden="true" />
                ) : (
                  <TrendingDown className="h-3 w-3 shrink-0" aria-hidden="true" />
                )}
                {e.startYear} · {e.label}
              </button>
            )
          })}

          {/* Dải chặng đời: mỗi chặng một ô, tên in bên trong. Trước đây nó là một khối
              chữ riêng dưới đồ thị — một danh sách "Mốc cuộc đời" — tức phải đối chiếu bằng mắt xem
              chặng nào ứng với đoạn nào của đường. */}
          {opts.lane && phases.length > 0 && (
            <div className="absolute inset-x-0" style={{ top: laneTop, height: LANE_H }}>
              {[...phases]
                .sort((a, b) => a.startYear - b.startYear)
                .map((p, i, arr) => {
                  const from = Math.max(p.startYear, x0, currentYear)
                  const to = i + 1 < arr.length ? Math.min(arr[i + 1].startYear, x1) : x1
                  const l = xs(from)
                  const w = Math.max(0, xs(to) - l)
                  if (w <= 0) return null
                  return (
                    <div
                      key={p.id}
                      title={`${p.label} · từ ${p.startYear}`}
                      style={{ left: l, width: w }}
                      className={`absolute inset-y-1.5 flex items-center overflow-hidden border-l border-border-strong ${
                        i % 2 === 0 ? 'bg-surface-sunken' : 'bg-state-good-bg'
                      } ${i === arr.length - 1 ? 'rounded-r-md' : ''}`}
                    >
                      <span className="truncate px-1.5 text-2xs text-fg-muted">{p.label}</span>
                    </div>
                  )
                })}
            </div>
          )}

          {hoverRow && (
            <div
              className="pointer-events-none absolute z-20 w-60 rounded-lg border border-border-strong bg-surface px-3 py-2 shadow-lg"
              style={{
                top: CHIP_TOP + chipRowCount * CHIP_ROW_H + 4,
                left:
                  xs(hoverRow.year) > (plotLeft + plotRight) / 2
                    ? Math.max(0, xs(hoverRow.year) - 252)
                    : Math.min(plotW - 244, xs(hoverRow.year) + 12),
              }}
            >
              <div className="flex items-baseline justify-between gap-2 border-b border-border-subtle pb-1.5">
                <p className="text-[0.8125rem] font-bold text-fg-primary">Năm {hoverRow.year}</p>
                <p className="truncate text-2xs text-fg-muted">
                  {hoverRow.age} tuổi · {hoverRow.phaseLabel}
                </p>
              </div>
              <div className="flex flex-col gap-0.5 py-1.5">
                <TipRow label="Thu" value={formatMoney(hoverRow.incomeMinor, currency)} tone="in" />
                <TipRow label="Chi" value={formatMoney(hoverRow.expenseMinor, currency)} tone="out" />
                {hoverRow.events.map((ev) => (
                  <TipRow
                    key={ev.id}
                    label={`${ev.kind === 'income' ? '↑' : '↓'} ${ev.label}`}
                    value={`${ev.kind === 'income' ? '+' : '−'}${formatMoney(ev.amountDisplayMinor, currency)}`}
                    tone={ev.kind === 'income' ? 'in' : 'out'}
                  />
                ))}
              </div>
              <div className="flex flex-col gap-0.5 border-t border-border-subtle pt-1.5">
                <TipRow
                  label="Trung tâm"
                  value={formatMoney(hoverRow.assetsEndMinor, currency)}
                  strong
                />
                <TipRow
                  label="Bi quan → lạc quan"
                  value={`${formatCompact(hoverRow.assetsPessimisticMinor, currency)} → ${formatCompact(hoverRow.assetsOptimisticMinor, currency)}`}
                />
                {stressHoverRow && (
                  <TipRow
                    label="Stress test"
                    value={formatMoney(stressHoverRow.assetsEndMinor, currency)}
                    tone="warn"
                  />
                )}
              </div>
              <p
                className={`border-t border-border-subtle pt-1.5 text-2xs ${
                  hoverRow.assetsEndMinor >= hoverRow.expenseMinor * fireMul
                    ? 'text-money-in'
                    : 'text-fg-warn'
                }`}
              >
                {hoverRow.assetsEndMinor >= hoverRow.expenseMinor * fireMul
                  ? 'Đã vượt ngưỡng tự do tài chính của năm này'
                  : `Còn thiếu ${formatCompact(hoverRow.expenseMinor * fireMul - hoverRow.assetsEndMinor, currency)} để tự do tài chính`}
              </p>
              <p className="mt-1 text-2xs text-fg-disabled">
                {pinnedYear !== null ? 'Đã ghim — bấm đồ thị để bỏ ghim' : 'Bấm để ghim năm này'}
              </p>
            </div>
          )}

          {/* Form sửa mốc do chỗ gọi dựng, nhưng CHỖ ĐẶT thì thẻ này tính: chỉ ở đây mới
              biết chip của mốc đang ở pixel nào và đồ thị cao bao nhiêu. */}
          {eventEditor &&
            editingEventId !== null &&
            (() => {
              const ev = visibleEvents.find((e) => e.id === editingEventId)
              return eventEditor({
                anchorX: ev ? xs(ev.startYear) : plotW / 2,
                plotWidth: plotW,
                top: chartH + (opts.lane && phases.length > 0 ? LANE_H : 0) + 4,
              })
            })()}
        </div>

        {/* Chú giải là CHỮ, không bấm được — đánh đổi có ý thức (xem task-8-report.md):
            chú giải bấm được cần cao 44px, ba dòng ăn một phần ba chiều cao đồ thị trên
            điện thoại. Việc bật/tắt lớp nay đã có hàng nút viên thuốc ở trên.
            text-2xs, không phải một giá trị px tuỳ ý: cỡ chữ viết bằng px ĐỨNG YÊN khi
            người dùng phóng chữ ở Cài đặt → Cỡ chữ (§13). */}
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-2xs text-fg-muted">
          {!showHistoryCurrency ? (
            <span className="text-fg-warn">
              Lịch sử ẩn — khác đơn vị tiền ({historyCurrency} ≠ {currency})
            </span>
          ) : (
            dHistory.length > 0 && (
              <span className="flex items-center gap-1">
                <LegendSwatch color={COLOR_ACTUAL} /> Lịch sử thật
              </span>
            )
          )}
          {/* Chú giải mang luôn CON SỐ CUỐI ĐỜI của từng nhánh. Trước đây nó chỉ đặt tên
              cho ba nét, mà "nét xanh là nhánh trung tâm" thì nhìn đồ thị cũng đoán ra —
              thứ không đoán được là ba nhánh đó kết thúc ở đâu, và đó đúng là câu người
              ta hỏi khi nhìn một bản chiếu cả đời. */}
          <span className="flex items-center gap-1">
            <LegendSwatch color={COLOR_PROJECTED} dash="6 4" /> Trung tâm{' '}
            {endRow && (
              <>
                <Money
                  amount={endRow.assetsEndMinor}
                  currency={currency}
                  compact
                  className="text-2xs font-medium"
                />
                {birthYear !== null && ` lúc ${endRow.age}t`}
              </>
            )}
          </span>
          {showBand && endRow && (
            <>
              <span className="flex items-center gap-1">
                <LegendSwatch color={COLOR_OPTIMISTIC} dash="1 4" /> Lạc quan{' '}
                <Money
                  amount={endRow.assetsOptimisticMinor}
                  currency={currency}
                  compact
                  className="text-2xs font-medium"
                />
              </span>
              <span className="flex items-center gap-1">
                <LegendSwatch color={COLOR_PESSIMISTIC} dash="1 4" /> Bi quan{' '}
                <Money
                  amount={endRow.assetsPessimisticMinor}
                  currency={currency}
                  compact
                  className="text-2xs font-medium"
                />
              </span>
            </>
          )}
          {opts.fire && (
            <span className="flex items-center gap-1">
              <LegendSwatch color={COLOR_OPTIMISTIC} dash="8 4" /> Ngưỡng tự do tài chính
            </span>
          )}
          {baselinePath && (
            <span className="flex items-center gap-1">
              <LegendSwatch color={COLOR_BASELINE} /> Trước khi đổi (đã lưu)
            </span>
          )}
          {showCompare && (
            <span className="flex items-center gap-1">
              <LegendSwatch color={COLOR_COMPARE} dash="2 3" /> {compareName ?? 'Kịch bản so sánh'}
            </span>
          )}
          {stressPath && (
            <span className="flex items-center gap-1">
              <LegendSwatch color={COLOR_STRESS} dash="4 3" /> Stress test
            </span>
          )}
          {/* Đường bị ẩn vì lệch đơn vị — không có câu này thì bật "So sánh" xong không
              thấy đường nào và cũng không biết vì sao. */}
          {compareMismatch && (
            <span className="text-fg-warn">
              Đường so sánh ẩn — khác đơn vị tiền ({compareCurrency} ≠ {currency})
            </span>
          )}
          {plan.compareEmptyNote && (
            <span className="text-fg-warn">
              Kịch bản so sánh chưa chiếu được năm nào — kiểm chặng đời và tuổi kết thúc của nó
            </span>
          )}
        </div>

        {compare && compareEndRow && (
          <p className="mt-2 text-center text-xs text-fg-muted">
            {compareMismatch ? (
              <>
                Cuối đời — kịch bản này:{' '}
                <span className="font-semibold text-fg-primary">
                  {formatMoney(rows[rows.length - 1].assetsEndMinor, currency)}
                </span>
                {' · '}kịch bản so sánh:{' '}
                <span className="font-semibold text-fg-primary">
                  {formatMoney(compareEndRow.assetsEndMinor, compareCurrency as CurrencyCode)}
                </span>
                . Hai kịch bản dùng đơn vị tiền khác nhau ({currency} và {compareCurrency}) nên
                không trừ trực tiếp được, và cũng không vẽ chung một trục được — đồ thị trên chỉ
                có kịch bản này, tự so hai số này.
              </>
            ) : (
              compareDiff !== null && (
                <>
                  So kịch bản này với kịch bản đã chọn: cuối đời{' '}
                  <span
                    className={
                      compareDiff >= 0
                        ? 'font-semibold text-money-in'
                        : 'font-semibold text-money-out'
                    }
                  >
                    {compareDiff >= 0 ? '+' : ''}
                    {formatMoney(compareDiff, currency)}
                  </span>
                </>
              )
            )}
          </p>
        )}
      </Card>
    </>
  )
}

/** Một dòng nhãn–giá trị trong tooltip. */
function TipRow({
  label,
  value,
  tone,
  strong,
}: {
  label: string
  value: string
  tone?: 'in' | 'out' | 'warn'
  strong?: boolean
}) {
  const color =
    tone === 'in'
      ? 'text-money-in'
      : tone === 'out'
        ? 'text-money-out'
        : tone === 'warn'
          ? 'text-fg-warn'
          : 'text-fg-primary'
  return (
    <div className="flex justify-between gap-3">
      <span className="truncate text-2xs text-fg-muted">{label}</span>
      <span className={`shrink-0 font-mono text-xs tabular-nums ${color} ${strong ? 'font-semibold' : ''}`}>
        {value}
      </span>
    </div>
  )
}
