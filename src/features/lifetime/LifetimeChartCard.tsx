// Đồ thị tài sản ròng cả đời (mục Lifetime, Task 8). Bốn quy tắc bắt buộc — xem
// docs/superpowers/plans/2026-07-29-lifetime.md mục Task 8 và task-8-report.md:
// 1. Lịch sử thật (networth_snapshots) liền nét, bản chiếu nét đứt `6 4`.
// 2. Dải dao động = <Area> dataKey trả cặp [assetsPessimisticMinor, assetsOptimisticMinor],
//    không stroke — KHÔNG tự sắp lại theo "nhánh thấp/cao", engine đã đảm bảo thứ tự
//    (xem JSDoc assetsPessimisticMinor trong project.ts).
// 3. Vùng âm tô đỏ nhạt bằng ReferenceArea + ReferenceLine y=0 nét đứt.
// 4. Đường so sánh phân biệt bằng NÉT (`2 3`, khác hẳn `6 4`), không chỉ bằng màu.
import { useMemo } from 'react'
import {
  Area,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EstimateMark } from '../../components/EstimateMark'
import type { CurrencyCode } from '../../lib/currencies'
import { MOTION_ASSUME_MS } from '../../lib/motion'
import { formatCompact, formatMoney } from '../../lib/money'
import type { NetWorthSnapshotRow } from '../../types/database.types'
import { buildChartData, capTicks, chartSeriesPlan, yearAxisTicks } from './chartSeries'
import { compareAtEnd, firstNegativeYear } from './insights'
import type { YearRow } from './project'
import { Card, Money } from '../../components/ui'

interface Props {
  rows: YearRow[]
  /** Tắt hoạt ảnh tạm thời — đang kéo thanh trượt giả định (§12). */
  suppressAnimation?: boolean
  historyRows: NetWorthSnapshotRow[]
  currency: CurrencyCode
  compare: YearRow[] | null
  /**
   * `display_currency` của kịch bản đang so sánh. Task 8 brief chỉ mô tả 4 prop
   * (rows/historyRows/currency/compare) — `YearRow[]` của `compare` đã quy đổi xong
   * thành số, không mang theo nhãn tiền tệ gốc, nên câu rào "khác tiền tệ" (Step 4) cần
   * thêm đúng một prop này mới đọc được. Cộng thêm, không đổi 4 prop đã có.
   */
  compareCurrency?: CurrencyCode | null
  /**
   * Đơn vị tiền THẬT của `historyRows` — LUÔN là `profiles.base_currency`
   * (`networth_snapshots.net_worth` quy đổi base khi ghi, xem `NetWorthHistorySection.tsx`),
   * KHÔNG phải lúc nào cũng trùng `currency` (display_currency của kịch bản ĐANG XEM).
   * Hôm nay hai giá trị này luôn bằng nhau (chưa có UI đổi display_currency), nhưng Task 11
   * sẽ mở khoá việc đó — thêm prop này để phát hiện lệch và ẩn đường lịch sử thay vì vẽ
   * sai đơn vị một cách im lặng. Bắt buộc (không optional): thiếu nó thì không có cách nào
   * biết có nên vẽ lịch sử hay không.
   */
  historyCurrency: CurrencyCode
}

// Brief mẫu dùng #111827 (gần đen) cho đường lịch sử — mù trên nền dark:bg-gray-900 của
// thẻ. Lượt sửa đầu đổi sang sky-500 và lập luận "đủ sáng ở cả hai nền như các thẻ
// report khác đang dùng" — lập luận đó CHỈ kiểm dark mode. Đo lại 2026-07-30 (canvas
// pixel readback) thì sky-500 chỉ 2,77:1 trên NỀN TRẮNG, dưới ngưỡng 3:1 của
// WCAG 1.4.11 cho đối tượng đồ hoạ. Đây là đường DỮ LIỆU THẬT, đường quan trọng nhất.
//
// sky-600 đạt cả hai: 4,02:1 trên trắng, 4,41:1 trên gray-900. Nên chỗ này KHÔNG cần
// token (khác --fg-warn của amber, nơi không sắc độ nào đạt cả hai) — một giá trị là đủ.
const COLOR_ACTUAL = 'var(--color-sky-600)'
const COLOR_PROJECTED = '#16a34a' // 3,30:1 trên trắng / 5,38:1 trên gray-900 — đạt 3:1 cả hai
const COLOR_COMPARE = '#6b7280' // 4,83:1 / 3,67:1 — đạt
const COLOR_NEGATIVE = '#ef4444' // chỉ dùng làm nền ReferenceArea ở fillOpacity 0,1

// Vừa là NÉT (đường 0 và các mốc, cần 3:1) vừa là CHỮ nhãn trục 11px (cần 4,5:1).
// Trước đây là #9ca3af = gray-400: 2,54:1 trên trắng — chính idiom mà guardrail
// designSystem đã ban cho `text-gray-400`, nhưng ban theo CLASS nên không thấy hex
// trong prop Recharts. Không sắc xám nào đạt 4,5:1 cả hai chế độ, nên phải là token:
// --fg-muted = gray-500 light (4,84:1) / gray-400 dark (6,99:1).
// var() CÓ resolve trong presentation attribute của SVG và lật theo .dark — đã kiểm.
const COLOR_AXIS = 'var(--fg-muted)'
// Hai mép của dải dao động. Mock turn 31 vẽ mép trên MÀU XANH DƯƠNG, ở đây cố ý KHÔNG
// theo: xanh dương trong đồ thị này đã là LỊCH SỬ THẬT (COLOR_ACTUAL, sky-600), nên một
// đường xanh dương thứ hai đọc thành "đây cũng là số đã xảy ra" — đúng điều nguy hiểm
// nhất có thể nói nhầm trên một bản chiếu. Dùng cặp token tiền đã có: mép trên là nhánh
// TỐT, mép dưới là nhánh XẤU, và cả hai đều đã qua ngưỡng tương phản ở cả hai chế độ
// (money-in 10,0:1 / money-out 6,2:1 ở ca xấu nhất). Nét chấm `1 4` khác hẳn `6 4` của
// nhánh trung tâm và `2 3` của đường so sánh, nên chúng không chỉ khác nhau bằng màu.
const COLOR_OPTIMISTIC = 'var(--money-in)'
const COLOR_PESSIMISTIC = 'var(--money-out)'

// Tham chiếu ỔN ĐỊNH cho "không có lịch sử" — `[]` viết trực tiếp trong JSX/useMemo sẽ
// tạo mảng MỚI mỗi lần render (oxlint react-hooks/exhaustive-deps bắt đúng ca này), làm
// các useMemo phụ thuộc nó chạy lại vô ích dù nội dung không đổi.
const EMPTY_HISTORY: NetWorthSnapshotRow[] = []

/**
 * Năm sự kiện MỚI xuất hiện so với năm liền trước → TÊN các sự kiện mới của năm đó.
 * Khoá của map chính là các năm cần vẽ mốc trên trục hoành; giá trị là tên để tooltip
 * đọc ra — không có nó thì mốc chỉ là một vạch đứt vô danh, muốn biết vạch 2046 là gì
 * phải mở Bảng theo năm.
 * `YearEvent` (project.ts) không mang `startYear` (bị lược khi build YearRow), nên đây
 * là suy luận từ chênh lệch tập id sự kiện giữa hai năm liền kề, không đọc thẳng được.
 * Năm đầu tiên (rows[0]) không bao giờ sinh mốc — không có "năm trước" để so, và đó là
 * điểm bắt đầu bản chiếu chứ không phải một sự kiện giữa đời.
 */
function newEventLabelsByYear(rows: YearRow[]): Map<number, { label: string; kind: string }[]> {
  const map = new Map<number, { label: string; kind: string }[]>()
  let prevIds = new Set((rows[0]?.events ?? []).map((e) => e.id))
  for (let i = 1; i < rows.length; i++) {
    const fresh = rows[i].events.filter((e) => !prevIds.has(e.id))
    if (fresh.length > 0) {
      map.set(
        rows[i].year,
        fresh.map((e) => ({ label: e.label, kind: e.kind })),
      )
    }
    prevIds = new Set(rows[i].events.map((e) => e.id))
  }
  return map
}

/** Tối đa bao nhiêu mốc được ĐỀ TÊN ngay trên đồ thị. Nhãn mốc là chữ nổi cạnh một vạch
 *  đứng, nên chúng chồng lên nhau rất sớm — một kịch bản có 9 sự kiện rải đều thì 9 nhãn
 *  biến mép trên đồ thị thành một dải chữ không đọc được, và đó là mép mà đường lạc quan
 *  đang chạy. Mốc không có nhãn VẪN còn vạch, vẫn đọc được tên qua tooltip và vẫn nằm
 *  trong `aria-label` (giới hạn riêng, rộng hơn: ARIA_MARKER_LIMIT) — không mất tin, chỉ
 *  mất chữ nổi. Chọn 4 mốc ĐẦU TIÊN theo năm: mốc gần hiện tại là mốc người dùng sắp
 *  sống tới, và cũng là mốc họ vừa nhập nên đang cần soi lại. */
const LABELED_MARKER_LIMIT = 4

/** Tối đa bao nhiêu nhãn trên trục năm. Nhãn nay là "2026 · 32t" (~58px ở cỡ chữ mặc
 *  định) và đồ thị đứng ở cột trái của bố cục hai cột, nên quá 5 nhãn là chúng dính
 *  nhau. Xem `capTicks` trong chartSeries.ts. */
const MAX_YEAR_TICKS = 5

/** Tối đa bao nhiêu năm mốc sự kiện được ĐỌC TÊN trong `aria-label` trước khi gộp phần
 *  còn lại thành "và N mốc nữa". Một bản chiếu 60 năm có thể có hàng chục mốc; đọc hết
 *  là biến câu mô tả thành một chuỗi số dài hơn cả phần nói về tiền. */
const ARIA_MARKER_LIMIT = 8

/** Câu mô tả cho `aria-label` — sinh từ dữ liệu THẬT, không phải câu trang trí cố định
 * (đồ thị Recharts một mình không đọc được bằng screen reader).
 *
 * `historyHiddenNote` / `compareHiddenNote`: khác `null` khi chuỗi tương ứng bị ẨN vì
 * lệch đơn vị tiền (xem `chartSeries.ts`) — lúc đó câu này thay hẳn cho câu mô tả chuỗi
 * đó, vì không có gì được VẼ ra dù dữ liệu vẫn có. Người dùng screen reader cũng cần
 * biết TẠI SAO thiếu, không chỉ là thiếu.
 *
 * `markerYears` và `compare*`: đồ thị có `ReferenceLine` cho từng năm sự kiện và (có thể)
 * một đường kịch bản thứ hai. Bản trước không nhắc gì cả hai, nên người dùng screen
 * reader nghe xong vẫn không biết trên đồ thị có mốc nào hay đang so với kịch bản nào —
 * hai thứ mà người nhìn thấy ngay. */
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
    // "Nhánh bi quan" — cùng từ với thẻ kết luận ("Nếu bi quan, âm từ") và cột "Bi quan"
    // của bảng theo năm, kèm định vị "mép dưới dải dao động" cho người nghe hình dung.
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
    // Bản chiếu so sánh rỗng: `compareEndRow` là null nên nhánh dưới im, và người dùng
    // screen reader nghe xong không biết mình vừa bật so sánh với một kịch bản không chiếu
    // ra gì. Cùng lý do với `historyHiddenNote` — cần biết TẠI SAO thiếu, không chỉ thiếu.
    sentences.push(args.compareEmptyNote)
  } else if (args.showCompare && args.compareEndRow) {
    // Đơn vị của bản so sánh: chỉ tới nhánh này khi hai kịch bản CÙNG đơn vị (lệch thì
    // đã rơi vào compareHiddenNote ở trên), nên `?? currency` không đổi kết quả — để đó
    // cho ca `compareCurrency` không truyền được.
    const cur = args.compareCurrency ?? currency
    sentences.push(
      `Có thêm đường kịch bản so sánh, cuối kỳ ${formatMoney(args.compareEndRow.assetsEndMinor, cur)}.`,
    )
  }

  return sentences.join(' ')
}

/** Mẫu nét nhỏ cho legend chữ — vẽ đúng strokeDasharray của đường thật trên đồ thị,
 * không phải hình chữ nhật/gạch xấp xỉ, để legend không nói dối về kiểu nét. */
function LegendSwatch({ color, dash }: { color: string; dash?: string }) {
  return (
    <svg width="18" height="8" aria-hidden="true" className="shrink-0">
      <line x1="0" y1="4" x2="18" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dash} />
    </svg>
  )
}

/**
 * Thẻ đồ thị tài sản ròng cả đời. Lịch sử liền nét, bản chiếu nét đứt `6 4`, dải dao
 * động mờ bao quanh nhánh trung tâm, vùng âm tô đỏ nhạt. Bật `compare` thì ẩn dải (hai
 * dải chồng nhau không đọc được gì) và vẽ thêm một đường nét đứt `2 3` — khác hẳn `6 4`
 * của đường chính nên phân biệt được mà không cần màu (a11y mù màu).
 *
 * Đường nào ĐƯỢC VẼ do `chartSeriesPlan` (chartSeries.ts) quyết — hàm thuần có phép
 * thử. Trục tung chỉ mang MỘT đơn vị tiền, nên chuỗi nào tính theo đơn vị khác thì bị
 * ẩn kèm câu nói ra lý do, chứ không vẽ đè lên trục sai.
 */
export function LifetimeChartCard({
  rows,
  historyRows,
  currency,
  compare,
  compareCurrency,
  historyCurrency,
  suppressAnimation = false,
}: Props) {
  // CSS `prefers-reduced-motion` toàn cục (index.css) không chặn được animation của
  // Recharts vì nó vẽ bằng JS, không bằng CSS transition — phải tự đọc matchMedia.
  // `features/reports/SpendClassificationCard.tsx` đã có đúng pattern này; các thẻ
  // report khác (NetCashflowCard, SavingsRateTrendCard, MonthlyBarsCard, SpendVsBudgetCard)
  // thì CHƯA — xem task-8-report.md, không tự sửa các thẻ đó ở đây (ngoài phạm vi Task 8).
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  // Cổng THỨ HAI, độc lập với prefers-reduced-motion: bật lên trong lúc ngón tay còn
  // trên thanh trượt giả định (§12 — "đồ thị vẽ lại KHÔNG animate trong lúc kéo; thả
  // tay mới nội suy"). Hoạt ảnh 60 khung cho mỗi lần nhích một pixel là 60fps giả, và
  // đường vẽ thì luôn chạy sau ngón tay.
  //
  // Còn KHI THẢ TAY thì bảng §12 cho 220ms, và đó là lý do mọi chuỗi dưới đây phải khai
  // `animationDuration`: mặc định của recharts là 1500ms — gần bảy lần con số đã chốt, và
  // đủ dài để người dùng kéo tiếp trước khi đường cũ vẽ xong.
  const animate = !reducedMotion && !suppressAnimation

  // Lịch sử (`networth_snapshots`) luôn ở `historyCurrency` (base currency của profile),
  // và kịch bản so sánh mang `compareCurrency` của riêng nó — cả hai ĐỘC LẬP với
  // `currency` (display_currency của kịch bản đang xem, tức đơn vị của trục tung). Luật
  // "chuỗi nào được vẽ" nằm ở `chartSeriesPlan`, xem JSDoc ở đó.
  // Truyền NGUYÊN mảng `compare`, không tự tính `compare !== null` rồi truyền boolean: một
  // bản chiếu RỖNG (`[]`) khác `null` nên nó từng đi qua thành "đang so sánh", và hệ quả là
  // `showBand` tắt — dải dao động, chú giải của nó và số hạng biên dưới trong `minY` (tức
  // vùng âm đỏ) biến mất, đổi lấy một đường so sánh không tồn tại. Phép tính đó nay nằm
  // trong `chartSeriesPlan`, nơi có phép thử canh.
  const plan = chartSeriesPlan({ currency, historyCurrency, compareCurrency, compareRows: compare })
  const { showHistory, showCompare, showBand } = plan
  const effectiveHistoryRows = showHistory ? historyRows : EMPTY_HISTORY

  // Mọi useMemo phải gọi KHÔNG điều kiện (rules of hooks) — nhánh rows rỗng return ở
  // dưới, sau khi các hook này đã chạy; cả ba hàm build đều tự chịu được rows = [].
  //
  // `data` vẫn dựng cột `compare` kể cả khi `showCompare` là false: không có <Line> nào
  // đọc cột đó nên Recharts không vẽ gì, và `minY` bên dưới đã bỏ hẳn số hạng compare.
  const data = useMemo(
    () => buildChartData(rows, effectiveHistoryRows, compare),
    [rows, effectiveHistoryRows, compare],
  )
  // Nhãn trục năm — mỗi 5 năm thay vì cả 39. Phép chọn mốc ở chartSeries.ts (thuần, có
  // test): nhãn trục là <text> Recharts dựng sau khi đo khung nên không kiểm được bằng
  // máy ở đây.
  // Hai tầng: `yearAxisTicks` chọn mốc theo NĂM CHẴN, `capTicks` cắt bớt cho vừa BỀ
  // NGANG. Cần tầng thứ hai vì nhãn nay in cả tuổi ("2026 · 32t") nên dài gần gấp đôi,
  // trong khi đồ thị chuyển sang cột trái của bố cục hai cột nên hẹp lại.
  const yearTicks = useMemo(
    () => capTicks(yearAxisTicks(data.map((d) => d.year)), MAX_YEAR_TICKS),
    [data],
  )
  // Năm sinh suy từ chính dòng đầu bản chiếu (`YearRow` mang sẵn `age`) chứ không nhận
  // thêm một prop: một prop `birthYear` truyền tay có thể lệch với `rows` đang vẽ, và
  // lúc đó trục hoành in sai tuổi ở mọi nhãn mà không có gì báo. Suy từ rows thì không
  // có đường nào để lệch. null khi rows rỗng — nhánh đó return sớm ở dưới.
  const birthYear = rows.length > 0 ? rows[0].year - rows[0].age : null
  const eventLabels = useMemo(() => newEventLabelsByYear(rows), [rows])
  const markerYears = useMemo(() => [...eventLabels.keys()], [eventLabels])
  const compareEndRow = compare && compare.length > 0 ? compare[compare.length - 1] : null
  /** Dòng CUỐI của bản chiếu — ba con số trong chú giải đọc từ đây. */
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
    ],
  )
  const minY = useMemo(() => {
    let min = 0
    for (const d of data) {
      if (d.actual != null) min = Math.min(min, d.actual)
      if (d.projected != null) min = Math.min(min, d.projected)
      // CHỈ tính số hạng của chuỗi ĐANG ĐƯỢC VẼ. Trước đây `d.compare` luôn được tính:
      // một chuỗi số USD (~110.000) trên trục ¥ kéo `minY` — và do đó cả vùng đỏ
      // `ReferenceArea` — theo một đơn vị tiền khác hẳn đơn vị của trục.
      if (showCompare && d.compare != null) min = Math.min(min, d.compare)
      // Dải bị ẨN khi đang vẽ đường so sánh (hai dải chồng nhau không đọc được gì) nên
      // không tính vào miền âm lúc đó — không thì vùng đỏ trải rộng hơn cả những gì
      // đang thật sự hiển thị.
      if (showBand && d.band) min = Math.min(min, d.band[0])
    }
    return min
  }, [data, showBand, showCompare])

  if (rows.length === 0) {
    return (
      <Card as="section">
        <p className="text-center text-sm text-fg-muted">
          Chưa chiếu được — kiểm tra lại tuổi kết thúc của kịch bản.
        </p>
      </Card>
    )
  }

  // compareAtEnd KHÔNG hề quy đổi tỷ giá (chỉ trừ thẳng hai assetsEndMinor) — nếu hai
  // kịch bản khác display_currency thì hiệu đó là hai đơn vị KHÁC NHAU trừ thẳng vào
  // nhau (kiểu lấy số yên trừ số cent đô), một con số RÁC chứ không phải "chưa quy đổi
  // nhưng còn đọc được". Một con số rác có nhãn giải thích vẫn bị đọc thành kết luận —
  // nên khi lệch tiền tệ, KHÔNG tính/hiện hiệu số này; hiện hai giá trị cuối đời riêng,
  // mỗi cái đúng đơn vị của nó, để người dùng tự so bằng mắt.
  //
  // `plan.compareHiddenNote !== null` chính là điều kiện "đang so sánh NHƯNG lệch đơn
  // vị" — dùng lại nó thay vì tính `currencyMismatch` lần thứ hai ở đây. Bản trước có
  // một biến `currencyMismatch` riêng, và nó chỉ rào được đúng hai chỗ (hiệu số + câu
  // giải thích) trong khi ĐƯỜNG VẼ, `minY` và tooltip vẫn dùng số của đơn vị kia: câu
  // chú thích nói "không trừ trực tiếp được" trong lúc đồ thị đã trừ chúng bằng mắt.
  const compareMismatch = plan.compareHiddenNote !== null
  const compareDiff = compare && compareEndRow && !compareMismatch ? compareAtEnd(rows, compare) : null

  return (
    <Card as="section">
      {/* Dấu ≈ đặt ở TIÊU ĐỀ, không rải vào từng con số: cả khối này là số chiếu theo
          kịch bản, gắn dấu vào mỗi chỗ thì thành nhiễu mà không thêm nghĩa. */}
      <h2 className="mb-2 text-sm font-semibold text-fg-muted">
        Tài sản ròng cả đời
        <EstimateMark reason="Toàn bộ khối này là số chiếu theo kịch bản bạn đặt, không phải số đã xảy ra." />
      </h2>

      {/* Cao hơn từ `xl`: ở đó đồ thị đứng cạnh cột 400px nên nó rộng ~910px, mà 208px
          chiều cao trên bề ngang đó là tỷ lệ 4,4:1 — một dải dẹt, và đúng cái dải dẹt
          đó phải chứa thêm nhãn mốc nổi trên đỉnh. Dưới `xl` giữ 208px: ở đó đồ thị
          chiếm trọn bề ngang màn hẹp và cao hơn nữa là đẩy hết phần còn lại xuống dưới
          nếp gấp. */}
      <div role="img" aria-label={ariaLabel} className="h-52 w-full xl:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 32, right: 8, bottom: 0, left: 0 }}>
            {minY < 0 && <ReferenceArea y1={minY} y2={0} fill={COLOR_NEGATIVE} fillOpacity={0.1} />}
            <ReferenceLine y={0} stroke={COLOR_AXIS} strokeDasharray="4 3" />
            {/* Mốc sự kiện: vạch đứng + tên nổi trên đỉnh. Trước đây chỉ có vạch, nên
                muốn biết vạch 2046 là gì phải rê chuột vào đúng nó (và trên điện thoại
                thì không rê được) hoặc mở Bảng theo năm.
                Mũi tên ↑/↓ đứng trước tên là kênh phân biệt thu/chi KHÔNG dựa vào màu —
                `LifetimeEvent.kind` chỉ có hai giá trị này, đây là toàn bộ phân loại sự
                kiện mà dữ liệu có (không có "cưới"/"sinh con"/"hưu" ở tầng kiểu). */}
            {markerYears.map((y, i) => {
              const events = eventLabels.get(y) ?? []
              const income = events.every((e) => e.kind === 'income')
              return (
                <ReferenceLine
                  key={y}
                  x={y}
                  stroke={COLOR_AXIS}
                  strokeDasharray="3 3"
                  label={
                    i < LABELED_MARKER_LIMIT
                      ? {
                          value: `${income ? '↑' : '↓'} ${y} · ${events.map((e) => e.label).join(', ')}`,
                          position: 'top',
                          // So le hai hàng. Hai mốc cách nhau 4 năm trên một bản chiếu
                          // 58 năm chỉ cách nhau ~60px, trong khi một nhãn như
                          // "↓ 2034 · sinh con" rộng 80px — đo thật thì chúng đè nhau
                          // 13px. Không thể chặn bằng một khoảng cách năm tối thiểu:
                          // cùng 80px nhãn ấy đáng 5 năm ở bề ngang desktop nhưng 14 năm
                          // ở mobile, nên bất kỳ ngưỡng theo NĂM nào cũng sai ở một
                          // trong hai đầu. So le thì hai nhãn LIỀN NHAU không bao giờ
                          // cùng hàng, và điều đó đúng ở mọi bề ngang.
                          offset: i % 2 === 0 ? 4 : 16,
                          fill: COLOR_AXIS,
                          fontSize: 10,
                        }
                      : undefined
                  }
                />
              )
            })}

            {/* Dải dao động — ẨN khi đang VẼ đường so sánh, hai dải chồng nhau không
                đọc được gì. Đường so sánh bị ẩn vì lệch đơn vị thì dải hiện lại (xem
                `showBand` trong chartSeries.ts). */}
            {showBand && (
              <Area
                dataKey="band"
                stroke="none"
                fill={COLOR_PROJECTED}
                fillOpacity={0.13}
                isAnimationActive={animate}
                animationDuration={MOTION_ASSUME_MS}
              />
            )}

            {/* Viền của dải. Trước đây dải chỉ là một vùng mờ không mép, nên "lạc quan
                tới đâu, bi quan tới đâu" phải đoán bằng mắt ở chỗ vùng mờ nhạt dần —
                mà đó chính là hai con số chú giải bên dưới đang nêu tên. */}
            {showBand && (
              <>
                <Line
                  dataKey="bandHigh"
                  stroke={COLOR_OPTIMISTIC}
                  strokeWidth={1.5}
                  strokeDasharray="1 4"
                  dot={false}
                  isAnimationActive={animate}
                  animationDuration={MOTION_ASSUME_MS}
                />
                <Line
                  dataKey="bandLow"
                  stroke={COLOR_PESSIMISTIC}
                  strokeWidth={1.5}
                  strokeDasharray="1 4"
                  dot={false}
                  isAnimationActive={animate}
                  animationDuration={MOTION_ASSUME_MS}
                />
              </>
            )}

            {/* Bản chiếu: nhánh trung tâm, nét đứt `6 4`. */}
            <Line
              dataKey="projected"
              stroke={COLOR_PROJECTED}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={animate}
              animationDuration={MOTION_ASSUME_MS}
            />

            {/* Lịch sử thật: liền nét. Chấm nhỏ vì lịch sử thưa (vài mốc), không dot
                sẽ vô hình hoàn toàn với người mới bật Lifetime (mới có 1 snapshot).
                ẨN hẳn khi historyCurrency !== currency (xem showHistory ở trên) — không
                vẽ số của một đơn vị tiền lên trục của đơn vị khác. */}
            {showHistory && (
              <Line
                dataKey="actual"
                stroke={COLOR_ACTUAL}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls={false}
                isAnimationActive={animate}
                animationDuration={MOTION_ASSUME_MS}
              />
            )}

            {/* So sánh: nét đứt `2 3` — khác hẳn `6 4` của đường chính, phân biệt được
                không cần màu. ẨN hẳn khi kịch bản so sánh dùng đơn vị tiền khác (xem
                `showCompare`): trục tung chỉ mang MỘT đơn vị, vẽ chuỗi số của đơn vị
                khác lên đó là sai im lặng — cùng lý do đã ẩn đường lịch sử ở trên. */}
            {showCompare && (
              <Line
                dataKey="compare"
                stroke={COLOR_COMPARE}
                strokeWidth={1.5}
                strokeDasharray="2 3"
                dot={false}
                isAnimationActive={animate}
                animationDuration={MOTION_ASSUME_MS}
              />
            )}

            {/* `interval={0}` + `ticks`: vẽ ĐÚNG bộ mốc đã chọn, không để Recharts tự bỏ
                bớt lần nữa (nó sẽ bỏ trên chính bộ đã thưa). 10px là SÀN cỡ chữ của app
                (§C.2) và fill là --fg-muted — cặp này đã qua contrast. */}
            <XAxis
              dataKey="year"
              ticks={yearTicks}
              // `preserveStartEnd`, KHÔNG phải `interval={0}` như trước. Lý do cũ ("vẽ
              // đúng bộ mốc đã chọn, không để Recharts bỏ bớt trên chính bộ đã thưa")
              // đúng khi nhãn còn là bốn chữ số; nay nhãn là "2026 · 32t" — đo trên máy
              // ở 375px thì 2060 và 2070 đè lên nhau 1px, và ở cỡ chữ "Rất lớn" thì đè
              // hẳn. `capTicks` cắt theo một con số ĐOÁN TRƯỚC (5), còn Recharts đo bề
              // rộng THẬT của từng nhãn sau khi dựng khung — nó là thứ duy nhất ở đây
              // biết chữ có vừa hay không. `preserveStartEnd` giữ nguyên hai đầu, tức
              // phạm vi của cả đồ thị không bao giờ mất.
              interval="preserveStartEnd"
              // Năm KÈM TUỔI. Cả màn này nói bằng hai đơn vị — thẻ kết luận ghi "tuổi 47",
              // mốc trên đồ thị ghi năm — và trước đây trục chỉ có năm, nên nối hai thứ
              // lại là một phép trừ nhẩm mà người đọc phải tự làm ở mỗi lần liếc.
              tickFormatter={(y: number) =>
                birthYear === null ? `${y}` : `${y} · ${y - birthYear}t`
              }
              tick={{ fontSize: 10, fill: COLOR_AXIS }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => formatCompact(v, currency)}
              tick={{ fontSize: 11, fill: COLOR_AXIS }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              // Năm có mốc sự kiện thì đọc luôn TÊN sự kiện mới của năm đó — mốc trên
              // đồ thị chỉ là một vạch đứt, tooltip là chỗ duy nhất nói vạch đó là gì
              // mà không phải rời đồ thị đi mở Bảng theo năm.
              labelFormatter={(l) => {
                const names = eventLabels.get(Number(l))
                return names
                  ? `Năm ${l} · ${names.map((e) => e.label).join(', ')}`
                  : `Năm ${l}`
              }}
              formatter={(value, name) => {
                if (name === 'band' && Array.isArray(value)) {
                  return [
                    `${formatMoney(Number(value[0]), currency)} – ${formatMoney(Number(value[1]), currency)}`,
                    'Dải dao động',
                  ]
                }
                // Đường so sánh mang ĐƠN VỊ RIÊNG của kịch bản nó (`compareCurrency`).
                // Dán nhãn ¥ lên một con số đô là nói dối đúng ở chỗ người dùng đang
                // đọc số. Chỉ tới nhánh compare khi `showCompare` (cùng đơn vị) nên hai
                // giá trị này trùng nhau hôm nay — vẫn viết đúng nguồn để lần sau nới
                // câu rào (vd thêm quy đổi thật) thì nhãn không lệch theo.
                if (name === 'compare') {
                  return [
                    formatMoney(Number(value), compareCurrency ?? currency),
                    'Kịch bản so sánh',
                  ]
                }
                const label = name === 'actual' ? 'Lịch sử thật' : 'Chiếu (trung tâm)'
                return [formatMoney(Number(value), currency), label]
              }}
              // Nền/viền/chữ tooltip do index.css xử lý theo dark mode (.recharts-default-tooltip)
              contentStyle={{ borderRadius: 8, fontSize: 12 }}
              cursor={{ stroke: 'rgba(148,163,184,0.4)' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend là CHỮ, không bấm được — đánh đổi có ý thức (xem task-8-report.md):
          legend bấm được cần cao 44px, ba dòng ăn một phần ba chiều cao đồ thị trên
          điện thoại. Bật đường thứ hai đẩy sang nút "So sánh" ở LifetimePage. */}
      {/* text-2xs, không phải một giá trị px tuỳ ý: cỡ chữ viết bằng px ĐỨNG YÊN khi
          người dùng phóng chữ ở Cài đặt → Cỡ chữ, vì --app-font-scale chỉ co giãn được
          cái tính theo rem (§13). Đây từng là chỗ cuối cùng trong repo còn sót. */}
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-2xs text-fg-muted">
        {showHistory ? (
          <span className="flex items-center gap-1">
            <LegendSwatch color={COLOR_ACTUAL} /> Lịch sử thật
          </span>
        ) : (
          <span className="text-fg-warn">
            Lịch sử ẩn — khác đơn vị tiền ({historyCurrency} ≠ {currency})
          </span>
        )}
        {/* Chú giải mang luôn CON SỐ CUỐI ĐỜI của từng nhánh (mock turn 31). Trước đây
            nó chỉ đặt tên cho ba nét, mà "nét xanh là nhánh trung tâm" thì nhìn đồ thị
            cũng đoán ra — thứ không đoán được là ba nhánh đó kết thúc ở đâu, và đó đúng
            là câu người ta hỏi khi nhìn một bản chiếu cả đời. Đọc `endRow`, không tự
            chiếu lại. */}
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
        {showCompare && (
          <span className="flex items-center gap-1">
            <LegendSwatch color={COLOR_COMPARE} dash="2 3" /> Kịch bản so sánh
          </span>
        )}
        {/* Đường so sánh bị ẩn vì lệch đơn vị — cùng khuôn với câu "Lịch sử ẩn" ở trên
            (chữ amber, nói ra hai đơn vị). Không có nó thì bật "So sánh" xong không thấy
            đường nào và cũng không biết vì sao. */}
        {compareMismatch && (
          <span className="text-fg-warn">
            Đường so sánh ẩn — khác đơn vị tiền ({compareCurrency} ≠ {currency})
          </span>
        )}
        {/* Bản chiếu của kịch bản so sánh rỗng — cùng lý do phải NÓI RA như hai câu trên:
            im lặng thì bật "So sánh" xong không thấy đường nào và tưởng đồ thị hỏng. */}
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
              . Hai kịch bản dùng đơn vị tiền khác nhau ({currency} và {compareCurrency}) nên không trừ
              trực tiếp được, và cũng không vẽ chung một trục được — đồ thị trên chỉ có kịch bản
              này, tự so hai số này.
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
  )
}
