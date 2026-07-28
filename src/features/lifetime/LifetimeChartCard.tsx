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
import type { CurrencyCode } from '../../lib/currencies'
import { formatCompact, formatMoney } from '../../lib/money'
import type { NetWorthSnapshotRow } from '../../types/database.types'
import { compareAtEnd, firstNegativeYear } from './insights'
import type { YearRow } from './project'

interface Props {
  rows: YearRow[]
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
// thẻ. Đổi sang sky-500, đủ sáng ở cả hai nền như các thẻ report khác đang dùng
// (#16a34a/#ef4444/#0ea5e9 đều đã qua thực chiến dark mode trong features/reports/).
const COLOR_ACTUAL = '#0ea5e9'
const COLOR_PROJECTED = '#16a34a'
const COLOR_COMPARE = '#6b7280'
const COLOR_NEGATIVE = '#ef4444'
const COLOR_AXIS = '#9ca3af'

// Tham chiếu ỔN ĐỊNH cho "không có lịch sử" — `[]` viết trực tiếp trong JSX/useMemo sẽ
// tạo mảng MỚI mỗi lần render (oxlint react-hooks/exhaustive-deps bắt đúng ca này), làm
// các useMemo phụ thuộc nó chạy lại vô ích dù nội dung không đổi.
const EMPTY_HISTORY: NetWorthSnapshotRow[] = []

interface ChartPoint {
  year: number
  actual: number | null
  projected: number | null
  band: [number, number] | null
  compare: number | null
}

/** Gộp dữ liệu lịch sử + bản chiếu (+ bản so sánh) về một mảng theo năm cho Recharts. */
function buildChartData(
  rows: YearRow[],
  historyRows: NetWorthSnapshotRow[],
  compareRows: YearRow[] | null,
): ChartPoint[] {
  // Lịch sử ghi theo NGÀY (nhiều snapshot/năm) nhưng trục hoành của đồ thị này theo NĂM
  // như bản chiếu — gộp về một điểm/năm, giữ bản ghi MỚI NHẤT trong năm đó (historyRows
  // đã sắp theo snapshot_on tăng dần từ repo, nên gán đè tuần tự là đủ).
  const historyByYear = new Map<number, number>()
  for (const s of historyRows) {
    historyByYear.set(Number(s.snapshot_on.slice(0, 4)), s.net_worth)
  }

  const rowByYear = new Map(rows.map((r) => [r.year, r]))
  const compareByYear = compareRows ? new Map(compareRows.map((r) => [r.year, r])) : null

  // Hợp cả năm có lịch sử lẫn năm có bản chiếu — lịch sử thường lùi về trước năm hiện
  // tại, nên KHÔNG được chỉ lấy years của `rows` (sẽ cắt mất phần lịch sử thật).
  const years = Array.from(new Set([...historyByYear.keys(), ...rows.map((r) => r.year)])).sort(
    (a, b) => a - b,
  )

  return years.map((year) => {
    const row = rowByYear.get(year)
    const cRow = compareByYear?.get(year)
    return {
      year,
      actual: historyByYear.get(year) ?? null,
      projected: row ? row.assetsEndMinor : null,
      band: row ? [row.assetsPessimisticMinor, row.assetsOptimisticMinor] : null,
      compare: cRow ? cRow.assetsEndMinor : null,
    }
  })
}

/**
 * Năm sự kiện MỚI xuất hiện so với năm liền trước — đánh dấu mốc trên trục hoành.
 * `YearEvent` (project.ts) không mang `startYear` (bị lược khi build YearRow), nên đây
 * là suy luận từ chênh lệch tập id sự kiện giữa hai năm liền kề, không đọc thẳng được.
 * Năm đầu tiên (rows[0]) không bao giờ sinh mốc — không có "năm trước" để so, và đó là
 * điểm bắt đầu bản chiếu chứ không phải một sự kiện giữa đời.
 */
function eventStartYears(rows: YearRow[]): number[] {
  const years: number[] = []
  let prevIds = new Set((rows[0]?.events ?? []).map((e) => e.id))
  for (let i = 1; i < rows.length; i++) {
    const ids = new Set(rows[i].events.map((e) => e.id))
    let isNew = false
    for (const id of ids) {
      if (!prevIds.has(id)) {
        isNew = true
        break
      }
    }
    if (isNew) years.push(rows[i].year)
    prevIds = ids
  }
  return years
}

/** Câu mô tả cho `aria-label` — sinh từ dữ liệu THẬT, không phải câu trang trí cố định
 * (đồ thị Recharts một mình không đọc được bằng screen reader).
 *
 * `historyHiddenNote`: khác `null` khi lịch sử bị ẨN vì lệch đơn vị tiền (xem
 * `historyCurrency` trên `Props`) — lúc đó câu này thay hẳn cho câu "có N điểm lịch sử",
 * vì không có điểm nào được VẼ ra dù `historyRows` vẫn có dữ liệu. Người dùng screen
 * reader cũng cần biết TẠI SAO thiếu, không chỉ là thiếu. */
function buildAriaLabel(
  rows: YearRow[],
  historyRows: NetWorthSnapshotRow[],
  currency: CurrencyCode,
  historyHiddenNote: string | null,
): string {
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
    negYear
      ? `Biên dưới của dải dao động âm từ năm ${negYear}.`
      : 'Biên dưới của dải dao động không xuống dưới 0.',
  ]
  if (historyHiddenNote) {
    sentences.push(historyHiddenNote)
  } else if (historyRows.length > 0) {
    sentences.push(`Có ${historyRows.length} điểm lịch sử thật ghi nhận trước năm ${startYear}.`)
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
 */
export function LifetimeChartCard({
  rows,
  historyRows,
  currency,
  compare,
  compareCurrency,
  historyCurrency,
}: Props) {
  // CSS `prefers-reduced-motion` toàn cục (index.css) không chặn được animation của
  // Recharts vì nó vẽ bằng JS, không bằng CSS transition — phải tự đọc matchMedia.
  // `features/reports/SpendClassificationCard.tsx` đã có đúng pattern này; các thẻ
  // report khác (NetCashflowCard, SavingsRateTrendCard, MonthlyBarsCard, SpendVsBudgetCard)
  // thì CHƯA — xem task-8-report.md, không tự sửa các thẻ đó ở đây (ngoài phạm vi Task 8).
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const animate = !reducedMotion

  // Lịch sử (`networth_snapshots`) luôn ở `historyCurrency` (base currency của profile),
  // ĐỘC LẬP với `currency` (display_currency của kịch bản đang xem). Lệch nhau thì KHÔNG
  // vẽ — không có tỷ giá giả định nào cho chuỗi lịch sử để tự quy đổi, và vẽ thẳng số của
  // một đơn vị tiền lên trục của đơn vị khác là sai im lặng (đúng lớp lỗi C1 mà Task 3 đã
  // vá cho phases/events). Nói RÕ lý do ẩn thay vì im lặng — im lặng thì người dùng tưởng
  // chưa có dữ liệu lịch sử và đi tìm hiểu tại sao.
  const showHistory = historyCurrency === currency
  const effectiveHistoryRows = showHistory ? historyRows : EMPTY_HISTORY
  const historyHiddenNote = showHistory
    ? null
    : `Lịch sử thật đang ẩn vì kịch bản này hiển thị bằng ${currency} còn lịch sử ghi theo ${historyCurrency} — chưa quy đổi được nên không vẽ để tránh sai đơn vị.`

  // Mọi useMemo phải gọi KHÔNG điều kiện (rules of hooks) — nhánh rows rỗng return ở
  // dưới, sau khi các hook này đã chạy; cả ba hàm build đều tự chịu được rows = [].
  const data = useMemo(
    () => buildChartData(rows, effectiveHistoryRows, compare),
    [rows, effectiveHistoryRows, compare],
  )
  const markerYears = useMemo(() => eventStartYears(rows), [rows])
  const ariaLabel = useMemo(
    () => buildAriaLabel(rows, effectiveHistoryRows, currency, historyHiddenNote),
    [rows, effectiveHistoryRows, currency, historyHiddenNote],
  )
  const minY = useMemo(() => {
    let min = 0
    for (const d of data) {
      if (d.actual != null) min = Math.min(min, d.actual)
      if (d.projected != null) min = Math.min(min, d.projected)
      if (d.compare != null) min = Math.min(min, d.compare)
      // Dải bị ẨN khi đang so sánh (compare khác null) nên không tính vào miền âm lúc đó
      // — không thì vùng đỏ có thể trải rộng hơn cả những gì đang thật sự hiển thị.
      if (!compare && d.band) min = Math.min(min, d.band[0])
    }
    return min
  }, [data, compare])

  if (rows.length === 0) {
    return (
      <section className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
        <p className="text-center text-sm text-gray-400 dark:text-gray-500">
          Chưa chiếu được — kiểm tra lại tuổi kết thúc của kịch bản.
        </p>
      </section>
    )
  }

  // compareAtEnd KHÔNG hề quy đổi tỷ giá (chỉ trừ thẳng hai assetsEndMinor) — nếu hai
  // kịch bản khác display_currency thì hiệu đó là hai đơn vị KHÁC NHAU trừ thẳng vào
  // nhau (kiểu lấy số yên trừ số cent đô), một con số RÁC chứ không phải "chưa quy đổi
  // nhưng còn đọc được". Một con số rác có nhãn giải thích vẫn bị đọc thành kết luận —
  // nên khi lệch tiền tệ, KHÔNG tính/hiện hiệu số này; hiện hai giá trị cuối đời riêng,
  // mỗi cái đúng đơn vị của nó, để người dùng tự so bằng mắt. Chỉ tính compareDiff khi
  // chắc chắn cùng đơn vị (compareCurrency trùng currency).
  const compareEndRow = compare && compare.length > 0 ? compare[compare.length - 1] : null
  const currencyMismatch = compareCurrency != null && compareCurrency !== currency
  const compareDiff = compare && compareEndRow && !currencyMismatch ? compareAtEnd(rows, compare) : null

  return (
    <section className="rounded-xl bg-white dark:bg-gray-900 p-3 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">Tài sản ròng cả đời</h2>

      <div role="img" aria-label={ariaLabel} className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            {minY < 0 && <ReferenceArea y1={minY} y2={0} fill={COLOR_NEGATIVE} fillOpacity={0.1} />}
            <ReferenceLine y={0} stroke={COLOR_AXIS} strokeDasharray="4 3" />
            {markerYears.map((y) => (
              <ReferenceLine key={y} x={y} stroke={COLOR_AXIS} strokeDasharray="3 3" />
            ))}

            {/* Dải dao động — ẨN khi đang so sánh, hai dải chồng nhau không đọc được. */}
            {!compare && (
              <Area
                dataKey="band"
                stroke="none"
                fill={COLOR_PROJECTED}
                fillOpacity={0.13}
                isAnimationActive={animate}
              />
            )}

            {/* Bản chiếu: nhánh trung tâm, nét đứt `6 4`. */}
            <Line
              dataKey="projected"
              stroke={COLOR_PROJECTED}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={animate}
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
              />
            )}

            {/* So sánh: nét đứt `2 3` — khác hẳn `6 4` của đường chính, phân biệt được
                không cần màu. */}
            {compare && (
              <Line
                dataKey="compare"
                stroke={COLOR_COMPARE}
                strokeWidth={1.5}
                strokeDasharray="2 3"
                dot={false}
                isAnimationActive={animate}
              />
            )}

            <XAxis dataKey="year" tick={{ fontSize: 11, fill: COLOR_AXIS }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={(v: number) => formatCompact(v, currency)}
              tick={{ fontSize: 11, fill: COLOR_AXIS }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              labelFormatter={(l) => `Năm ${l}`}
              formatter={(value, name) => {
                if (name === 'band' && Array.isArray(value)) {
                  return [
                    `${formatMoney(Number(value[0]), currency)} – ${formatMoney(Number(value[1]), currency)}`,
                    'Dải dao động',
                  ]
                }
                const label =
                  name === 'actual' ? 'Lịch sử thật' : name === 'compare' ? 'Kịch bản so sánh' : 'Chiếu (trung tâm)'
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
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
        {showHistory ? (
          <span className="flex items-center gap-1">
            <LegendSwatch color={COLOR_ACTUAL} /> Lịch sử thật
          </span>
        ) : (
          <span className="text-amber-600 dark:text-amber-400">
            Lịch sử ẩn — khác đơn vị tiền ({historyCurrency} ≠ {currency})
          </span>
        )}
        <span className="flex items-center gap-1">
          <LegendSwatch color={COLOR_PROJECTED} dash="6 4" /> Chiếu (trung tâm)
        </span>
        {!compare && (
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-5 rounded-sm"
              style={{ backgroundColor: COLOR_PROJECTED, opacity: 0.35 }}
            />
            Dải dao động
          </span>
        )}
        {compare && (
          <span className="flex items-center gap-1">
            <LegendSwatch color={COLOR_COMPARE} dash="2 3" /> Kịch bản so sánh
          </span>
        )}
      </div>

      {compare && compareEndRow && (
        <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
          {currencyMismatch ? (
            <>
              Cuối đời — kịch bản này:{' '}
              <span className="font-semibold text-gray-700 dark:text-gray-200">
                {formatMoney(rows[rows.length - 1].assetsEndMinor, currency)}
              </span>
              {' · '}kịch bản so sánh:{' '}
              <span className="font-semibold text-gray-700 dark:text-gray-200">
                {formatMoney(compareEndRow.assetsEndMinor, compareCurrency as CurrencyCode)}
              </span>
              . Hai kịch bản dùng đơn vị tiền khác nhau ({currency} và {compareCurrency}) nên không trừ
              trực tiếp được — tự so hai số này.
            </>
          ) : (
            compareDiff !== null && (
              <>
                So kịch bản này với kịch bản đã chọn: cuối đời{' '}
                <span
                  className={
                    compareDiff >= 0
                      ? 'font-semibold text-green-600 dark:text-green-400'
                      : 'font-semibold text-red-600 dark:text-red-400'
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
    </section>
  )
}
