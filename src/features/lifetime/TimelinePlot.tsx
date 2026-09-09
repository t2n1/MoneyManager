// Vùng vẽ của console Tương lai: một <svg> cho các LỚP, và lớp phủ HTML cho mọi thứ
// có CHỮ hoặc bắt được con trỏ.
//
// BA QUYẾT ĐỊNH ĐÃ GHI SẴN TRONG BẢN VẼ, ĐỪNG LÀM NGƯỢC LẠI
//
// 1. Nhãn trục là PHẦN TỬ HTML phủ lên, KHÔNG phải <text> trong SVG. Bản vẽ ghi lý do
//    của nó (runtime của môi trường thiết kế bọc lại <text> động và nó không hiện);
//    trong app này còn một lý do mạnh hơn: <text> nhận cỡ chữ qua thuộc tính nên nó
//    ĐỨNG YÊN khi người dùng phóng chữ ở Cài đặt → Cỡ chữ, còn một <span> thì co giãn
//    theo `rem`. Và vì là HTML, số tiền trên trục đi được qua <Money> — tức qua chế độ
//    riêng tư, đúng luật của cả repo. Cả hai lớp nhãn đều `pointer-events-none`, nếu
//    không chúng ăn mất cú rê chuột ngay giữa vùng vẽ.
//
// 2. Hàng caption và hàng chú giải KHÔNG ở trong file này. Chúng là HÀNG TĨNH nằm ngoài
//    vùng vẽ (xem TuongLaiPage) — bản vẽ ghi lại một bug thật từ việc đặt chúng thành
//    lớp phủ tuyệt đối: chữ chồng lên chip FIRE.
//
// 3. Đường phải là đường CONG, không phải đường gấp khúc → `curvePath` (chartGeom.ts),
//    Catmull-Rom có chặn control point. Không chặn thì ở chỗ đổi chiều đường vồng ra
//    ngoài dữ liệu, tức vẽ ra một mức tài sản chưa từng có trong phép chiếu.
//
// HÌNH HỌC ĐO THẬT, KHÔNG GÕ CỨNG 1824×560. Bản vẽ khoá khung 1920px nên nó viết được
// `W = 1824`. Repo thì không (spec §5). Bề ngang VÀ chiều cao vùng vẽ đều đo bằng
// ResizeObserver từ một hộp khai `h-[35rem]`, nên khi `rem` to ra vì Cỡ chữ thì hình
// học đi theo thay vì bị cắt.
import { useCallback, useMemo, useRef, useState } from 'react'
import { EmptyState, Money, Num } from '../../components/ui'
import { CHART_TEXT_3XS } from '../../lib/chartText'
import type { CurrencyCode } from '../../lib/currencies'
import { TAG_HEX, tagColor } from '../tags/colors'
import {
  bandPath,
  curvePath,
  logYTicks,
  makeXScale,
  makeYScale,
  niceYTicks,
  symlogUnit,
  xTickStep,
  xToYear,
} from './chartGeom'
import { DEFAULT_SWR_BPS, fireYear } from './insights'
// Lề vùng vẽ và hàng icon mốc: `plotFrame.ts`. Chúng KHÔNG ở trong file này vì dải chặng
// đời (`PhaseLane`) phải khớp đúng cùng bộ lề — một bản chép thứ hai là một chỗ để dải
// lệch trục năm nửa năm, thứ không có phép thử nào thấy.
import { EventPins } from './EventPins'
import {
  PIN_GAP,
  PIN_ROW_H,
  PIN_TOP,
  PLOT_BOTTOM_GAP,
  PLOT_LEFT,
  pinRowCount,
  pinRowsOf,
  plotRightOf,
  viewRange,
  type PlotZoom,
} from './plotFrame'
import type { YearRow } from './project'
import { useBoxSize } from './useBoxSize'

/** Nhãn trục tiền đặt BÊN TRONG vùng vẽ, ngay phải trục và TRÊN đường kẻ (bản vẽ:
 *  `left: 58px`, `top: y − 16`). Đặt trong nên bề rộng nhãn không cần lề trái — đó là
 *  cách bản vẽ giữ được lề trái 52px kể cả với nhãn "1,65 tỷ". */
const Y_LABEL_LEFT_PX = 58
const Y_LABEL_LIFT_PX = 16

/** Ngưỡng FIRE = tài sản đủ để rút `DEFAULT_SWR_BPS` mỗi năm — 25× chi ở 4%. */
const FIRE_MUL = 10_000 / DEFAULT_SWR_BPS

/**
 * Mốc cuộc đời, ở dạng TỐI THIỂU mà vùng vẽ thật sự đọc.
 *
 * Cố ý không nhận `DraftEvent` cũng không nhận `LifetimeEvent`: cả hai đều THOẢ hình
 * dạng này về cấu trúc, nên `TuongLaiPage` bơm được bản đã lưu (`LifetimeInput.events`)
 * hôm nay và Task 12 bơm được bản nháp (`DraftEvent`) sau này, không cần một hàm chuyển
 * đổi ở giữa. Nhận kiểu rộng hơn thì file này biết về `amount_shape`, `replaces_minor`,
 * `loan_*`… những thứ nó không vẽ.
 */
export interface PlotEvent {
  id: string
  label: string
  startYear: number
  endYear: number | null
  kind: 'income' | 'expense'
  /**
   * Khoá màu (features/tags/colors.ts). Rỗng hoặc thiếu = tô theo Thu/Chi.
   *
   * TUỲ CHỌN, khớp `LifetimeEvent.color?` của engine — bắt buộc ở đây thì bản ĐÃ LƯU
   * không còn thoả hình dạng này và phải có một hàm chuyển đổi ở giữa, đúng thứ mà
   * kiểu tối thiểu này tồn tại để tránh.
   */
  color?: string
  /** `false` = mốc đang tắt, không tính vào phép chiếu (migration 0063). */
  enabled?: boolean
}

/** Một kịch bản đang được so sánh — một nét đứt `2 5` trên cùng trục. */
export interface ComparisonLine {
  id: string
  name: string
  rows: YearRow[]
  /** Màu nét. Truyền token (`var(--chart-slice-1)`), không truyền hex. */
  color: string
}

// `PlotZoom` sống ở `plotFrame.ts` cùng `viewRange` (dải chặng đời cần cả hai), và
// re-export ở đây để chỗ gọi cũ không phải đổi đường import.
export type { PlotZoom }

interface Props {
  /** Bản chiếu ĐANG XEM (nháp nếu có nháp, không thì bản đã lưu). */
  rows: YearRow[]
  currency: CurrencyCode
  /**
   * Bản chiếu ĐÃ LƯU — vẽ thành đường xám "trước khi đổi". `null` = đang xem đúng bản
   * đã lưu nên không có gì để so; vẽ nó lúc đó là hai đường trùng khít nhau.
   */
  saved?: YearRow[] | null
  compare?: readonly ComparisonLine[]
  events?: readonly PlotEvent[]
  zoom?: PlotZoom
  showBand?: boolean
  showFire?: boolean
  log?: boolean
  /** Năm đang rê chuột — Bảng theo năm sáng đúng dòng đó (liên kết hai chiều). */
  onHoverYear?: (year: number | null) => void

  // --- Icon mốc (`EventPins`) -------------------------------------------------------
  //
  // Vì sao lớp phủ icon mốc dựng TỪ TRONG file này chứ không phải một hàng riêng cạnh nó:
  // số HÀNG icon quyết định `plotTop` (chỗ chừa phía trên vùng vẽ), mà số hàng lại suy từ
  // `xs` — tức từ bề ngang đã đo ở đây. Đặt `EventPins` ra ngoài thì bề ngang phải đi
  // ngược lên rồi quay xuống, và giữa hai lượt đó `plotTop` nói một con số khác.
  //
  // Prop `pinRows` cũ (một con số bơm từ ngoài vào) đã bỏ: nay số hàng THẬT tính bằng
  // `pinRowsOf` ngay tại đây.

  /** Các `startYear` của chặng — nam châm ±1 năm khi kéo mốc bám vào chúng. */
  phaseStarts?: readonly number[]
  selectedEventId?: string
  /** Bấm một icon (không kéo) — bật/tắt lựa chọn. */
  onToggleEvent?: (id: string) => void
  /** Bắt đầu kéo một icon — dock đi theo thứ đang kéo. */
  onSelectEvent?: (id: string) => void
  /** Dời năm BẮT ĐẦU của một mốc. Chỗ gọi giữ độ dài và chặn khoảng. */
  onMoveEvent?: (id: string, year: number) => void
  /** Đổi năm KẾT THÚC. Chỗ gọi chặn sàn `startYear + 1`. */
  onMoveEventEnd?: (id: string, year: number) => void
}

/** Tham chiếu ỔN ĐỊNH cho "không có" — `[]` trong JSX tạo mảng mới mỗi lần render. */
const EMPTY_EVENTS: readonly PlotEvent[] = []
const EMPTY_COMPARE: readonly ComparisonLine[] = []
const EMPTY_YEARS: readonly number[] = []

/** Câu mô tả cho `aria-label` — sinh từ dữ liệu THẬT, không phải câu trang trí. */
function plotAriaLabel(rows: YearRow[], fire: number | null, eventCount: number): string {
  if (rows.length === 0) return 'Chưa có dữ liệu để chiếu tài sản ròng.'
  const dau = rows[0]
  const cuoi = rows[rows.length - 1]
  const cau = [
    `Tài sản ròng theo năm, từ ${dau.year} (tuổi ${dau.age}) đến ${cuoi.year} (tuổi ${cuoi.age}).`,
    fire === null
      ? 'Bản chiếu không đạt ngưỡng tự do tài chính năm nào.'
      : `Đạt ngưỡng tự do tài chính năm ${fire}.`,
  ]
  if (eventCount > 0) cau.push(`Có ${eventCount} mốc cuộc đời trên trục.`)
  cau.push('Bảng theo năm bên dưới là bản đọc được bằng bàn phím của cùng dữ liệu này.')
  return cau.join(' ')
}

export function TimelinePlot({
  rows,
  currency,
  saved = null,
  compare = EMPTY_COMPARE,
  events = EMPTY_EVENTS,
  zoom = 'all',
  showBand = true,
  showFire = true,
  log = false,
  onHoverYear,
  phaseStarts = EMPTY_YEARS,
  selectedEventId,
  onToggleEvent,
  onSelectEvent,
  onMoveEvent,
  onMoveEventEnd,
}: Props) {
  // Khởi tạo bằng một cỡ hợp lý rồi để ResizeObserver sửa ngay ở lượt bày đầu: mọi hàm
  // hình học dưới đây tự chịu được cỡ sai, còn `rows` rỗng thì chúng cũng đã canh. Hai lời
  // ghi về cách đo (ref callback, và vì sao KHÔNG dọn observer bằng useEffect) đã chuyển
  // sang `useBoxSize.ts` — dải chặng đời đo bằng đúng hook đó nên hai bề ngang khớp nhau.
  const { box, boxRef, attachBox } = useBoxSize({ w: 900, h: 560 })
  const [hoverYear, setHoverYear] = useState<number | null>(null)
  /** Nhịp khung hình đang chờ cho lượt rê chuột — spec §11 đòi throttle bằng rAF. */
  const rafRef = useRef<number | null>(null)
  /**
   * `clientX` MỚI NHẤT, và năm ĐÃ báo ra ngoài lần gần nhất.
   *
   * Bản đầu của throttle này chỉ có `if (rafRef.current !== null) return` mà không lưu lại
   * `clientX`: nó giữ MẪU ĐẦU TIÊN của khung hình rồi bỏ hết các mẫu sau, nên ở tốc độ
   * chuột cao (~120 sự kiện/giây trên 60 khung) vạch dọc chạy sau con trỏ một quãng thấy
   * được. Lưu mẫu mới nhất rồi đọc trong callback thì mỗi khung vẽ đúng vị trí hiện tại.
   */
  const lastXRef = useRef(0)
  const sentYearRef = useRef<number | null>(null)

  // --- Khoảng năm đang xem ---------------------------------------------------------
  const currentYear = rows.length > 0 ? rows[0].year : new Date().getFullYear()
  const lastYear = rows.length > 0 ? rows[rows.length - 1].year : currentYear
  const [x0, x1] = viewRange(currentYear, lastYear, zoom)
  const inX = useCallback((y: number) => y >= x0 && y <= x1, [x0, x1])

  const dRows = useMemo(() => rows.filter((r) => inX(r.year)), [rows, inX])
  const dSaved = useMemo(() => (saved ? saved.filter((r) => inX(r.year)) : null), [saved, inX])
  const dCompare = useMemo(
    () => compare.map((c) => ({ ...c, rows: c.rows.filter((r) => inX(r.year)) })),
    [compare, inX],
  )

  // --- Hình học -------------------------------------------------------------------
  const plotLeft = PLOT_LEFT
  const plotRight = plotRightOf(box.w)
  const xs = useMemo(() => makeXScale(x0, x1, plotLeft, plotRight), [x0, x1, plotLeft, plotRight])

  /**
   * Mốc ĐANG THẤY — dùng cho CẢ vạch mốc trong `<svg>` LẪN lớp phủ icon, một phép lọc chứ
   * không hai. SẮP theo năm vì `pinRowsOf`/`packRows` đòi thứ tự đó.
   *
   * Lọc theo `startYear`: khung nhìn luôn bắt đầu ở năm hiện tại và chỉ cắt ngắn ở đầu
   * PHẢI (xem `viewRange`), nên "ngoài khung nhìn" ở đây có nghĩa là "bắt đầu sau năm cuối
   * khung". Cùng phép lọc mà vạch mốc đã dùng từ trước.
   */
  const visibleEvents = useMemo(
    () => events.filter((e) => inX(e.startYear)).sort((a, b) => a.startYear - b.startYear),
    [events, inX],
  )
  /** Hàng của từng icon, và số hàng phải chừa chỗ. Mốc ngoài khung nhìn không có mặt ở
   *  đây, nên nó cũng không chiếm một hàng trống phía trên vùng vẽ. */
  const pinRowIdx = useMemo(() => pinRowsOf(visibleEvents, xs, x1), [visibleEvents, xs, x1])
  const plotTop = PIN_TOP + pinRowCount(pinRowIdx) * PIN_ROW_H + PIN_GAP
  const plotBottom = Math.max(plotTop + 10, box.h - PLOT_BOTTOM_GAP)

  const { yMin, yMax } = useMemo(() => {
    let lo = 0
    let hi = 0
    for (const r of dRows) {
      lo = Math.min(lo, showBand ? r.assetsPessimisticMinor : r.assetsEndMinor)
      hi = Math.max(hi, showBand ? r.assetsOptimisticMinor : r.assetsEndMinor)
      // Ngưỡng FIRE là một ĐƯỜNG được vẽ nên nó phải nằm trong miền; không thì nó dán
      // vào mép trên và câu "còn thiếu bao nhiêu" mất chỗ dựa bằng mắt.
      if (showFire) hi = Math.max(hi, r.expenseMinor * FIRE_MUL)
    }
    // Chỉ đếm những chuỗi ĐANG ĐƯỢC VẼ: một chuỗi không vẽ vẫn kéo miền là vùng âm đỏ
    // và cả trục tiền nói theo một bản chiếu không có trên màn.
    for (const r of dSaved ?? []) {
      lo = Math.min(lo, r.assetsEndMinor)
      hi = Math.max(hi, r.assetsEndMinor)
    }
    for (const c of dCompare) {
      for (const r of c.rows) {
        lo = Math.min(lo, r.assetsEndMinor)
        hi = Math.max(hi, r.assetsEndMinor)
      }
    }
    return { yMin: lo, yMax: hi * 1.04 || 1 }
  }, [dRows, dSaved, dCompare, showBand, showFire])

  const unit = symlogUnit(yMin, yMax)
  const ys = makeYScale({ min: yMin, max: yMax, log, unit, plotTop, plotBottom })

  const yTicks = useMemo(
    () => (log ? logYTicks(yMin, yMax, unit) : niceYTicks(yMin, yMax, 5)),
    [log, yMin, yMax, unit],
  )
  const xTicks = useMemo(() => {
    const step = xTickStep(x1 - x0, plotRight - plotLeft)
    const out: number[] = []
    for (let y = Math.ceil(x0 / step) * step; y <= x1; y += step) out.push(y)
    return out
  }, [x0, x1, plotLeft, plotRight])

  const pt = useCallback(
    (r: YearRow, pick: (row: YearRow) => number): [number, number] => [xs(r.year), ys(pick(r))],
    [xs, ys],
  )

  const centerPath = curvePath(dRows.map((r) => pt(r, (r2) => r2.assetsEndMinor)))
  const highPts = dRows.map((r) => pt(r, (r2) => r2.assetsOptimisticMinor))
  const lowPts = dRows.map((r) => pt(r, (r2) => r2.assetsPessimisticMinor))
  const savedPath = dSaved ? curvePath(dSaved.map((r) => pt(r, (r2) => r2.assetsEndMinor))) : null
  const firePath = showFire
    ? curvePath(dRows.map((r) => [xs(r.year), ys(r.expenseMinor * FIRE_MUL)]))
    : null

  const zeroY = ys(0)
  const negHeight = yMin < 0 ? ys(yMin) - zeroY : 0
  const birthYear = rows.length > 0 ? rows[0].year - rows[0].age : null

  const fire = useMemo(() => fireYear(rows), [rows])
  const fireRow = fire !== null && inX(fire) ? dRows.find((r) => r.year === fire) : undefined

  const hoverRow = hoverYear === null ? undefined : dRows.find((r) => r.year === hoverYear)

  const ariaLabel = useMemo(
    () => plotAriaLabel(rows, fire, visibleEvents.length),
    [rows, fire, visibleEvents.length],
  )

  /**
   * `clientX` → năm trên trục. MỘT phép đổi cho cả lượt rê chuột và lượt kéo icon mốc:
   * hai bản riêng là hai chỗ để lệch gốc toạ độ, mà lệch gốc toạ độ nghĩa là icon nhảy
   * một quãng ngay lúc cầm vào.
   */
  const yearAt = useCallback(
    (clientX: number) => {
      const el = boxRef.current
      const px = clientX - (el?.getBoundingClientRect().left ?? 0)
      return xToYear(px, x0, x1, plotLeft, plotRight)
    },
    [boxRef, x0, x1, plotLeft, plotRight],
  )

  /** Đổi năm đang rê, gộp vào MỘT nhịp khung hình (spec §11). */
  const trackHover = useCallback(
    (clientX: number) => {
      lastXRef.current = clientX
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const el = boxRef.current
        if (!el) return
        const y = xToYear(
          lastXRef.current - el.getBoundingClientRect().left,
          x0,
          x1,
          plotLeft,
          plotRight,
        )
        setHoverYear(y)
        // Chỉ báo ra ngoài khi NĂM đổi thật. Rê chuột trong lòng một năm bắn ra vài chục
        // sự kiện mà năm không đổi; gọi `onHoverYear` mỗi khung hình ở đó là bắt Bảng theo
        // năm (và mọi thứ khác nghe nó) bày lại 60 lần/giây để tô lại đúng một dòng.
        if (sentYearRef.current !== y) {
          sentYearRef.current = y
          onHoverYear?.(y)
        }
      })
    },
    [boxRef, x0, x1, plotLeft, plotRight, onHoverYear],
  )

  const clearHover = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setHoverYear(null)
    if (sentYearRef.current !== null) {
      sentYearRef.current = null
      onHoverYear?.(null)
    }
  }, [onHoverYear])

  return (
    // `h-[35rem]` = 560px của bản vẽ ở cỡ chữ Vừa (spec §5). Là `rem` nên nó co giãn
    // theo Cài đặt → Cỡ chữ, và vì chiều cao được ĐO nên hình học đi theo.
    <div
      ref={attachBox}
      className="relative h-[35rem] w-full cursor-crosshair select-none"
      onPointerMove={(e) => trackHover(e.clientX)}
      onPointerLeave={clearHover}
    >
      {rows.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <EmptyState compact>
            Chưa chiếu được năm nào — kiểm chặng đời và tuổi kết thúc của kịch bản.
          </EmptyState>
        </div>
      ) : (
        <>
          <svg width="100%" height="100%" role="img" aria-label={ariaLabel} className="block">
            {/* THỨ TỰ VẼ, từ dưới lên, đúng bảng "Vùng vẽ" của dsg-handoff/README.md:
                lưới ngang · vùng âm · dải lạc quan–bi quan · đường bản đã lưu · đường so
                sánh · ngưỡng FIRE · đường chính · chấm FIRE · vạch mốc.
                Trong SVG thứ tự trong DOM LÀ thứ tự lớp, nên đừng sắp lại cho gọn mắt. */}

            {/* 1. Lưới ngang + đường 0 */}
            {yTicks.map((v) => (
              <line
                key={`y${v}`}
                x1={plotLeft}
                y1={ys(v)}
                x2={plotRight}
                y2={ys(v)}
                stroke="var(--border-subtle)"
                strokeWidth={1}
              />
            ))}
            <line
              x1={plotLeft}
              y1={zeroY}
              x2={plotRight}
              y2={zeroY}
              stroke="var(--fg-muted)"
              strokeDasharray="4 3"
              strokeWidth={1}
            />

            {/* 2. Vùng âm */}
            {negHeight > 0 && (
              <rect
                x={plotLeft}
                y={zeroY}
                width={plotRight - plotLeft}
                height={negHeight}
                fill="var(--money-out)"
                opacity={0.1}
              />
            )}

            {/* 3. Dải lạc quan – bi quan. Nền dùng `bandPath` (đa giác khép kín, hàm
                đã có test); hai MÉP dùng `curvePath` để chúng cong như đường chính.
                Sai lệch giữa hai phép nội suy chỉ vài pixel ở chỗ đổi chiều và nằm
                dưới chính nét 1,5px đang vẽ lên nó. */}
            {showBand && highPts.length > 0 && (
              <>
                <path d={bandPath(highPts, lowPts)} fill="var(--money-in)" opacity={0.13} />
                <path
                  d={curvePath(highPts)}
                  fill="none"
                  stroke="var(--money-in)"
                  strokeWidth={1.5}
                  strokeDasharray="1 4"
                />
                <path
                  d={curvePath(lowPts)}
                  fill="none"
                  stroke="var(--money-out)"
                  strokeWidth={1.5}
                  strokeDasharray="1 4"
                />
              </>
            )}

            {/* 4. Đường bản đã lưu — chỉ có khi đang vặn một bản nháp */}
            {savedPath && (
              <path
                d={savedPath}
                fill="none"
                stroke="var(--fg-muted)"
                strokeWidth={1.5}
                opacity={0.6}
              />
            )}

            {/* 5. Đường so sánh */}
            {dCompare.map((c) => (
              <path
                key={c.id}
                d={curvePath(c.rows.map((r) => pt(r, (r2) => r2.assetsEndMinor)))}
                fill="none"
                stroke={c.color}
                strokeWidth={1.5}
                strokeDasharray="2 5"
                opacity={0.85}
              />
            ))}

            {/* 6. Ngưỡng FIRE. Nhãn của nó là <text> TĨNH nên nó không rơi vào cái bẫy
                mà nhãn trục rơi vào; cỡ chữ vẫn qua hằng số rem để co theo Cỡ chữ. */}
            {firePath && (
              <>
                <path
                  d={firePath}
                  fill="none"
                  stroke="var(--money-in)"
                  strokeWidth={1}
                  strokeDasharray="8 4"
                  opacity={0.7}
                />
                <text
                  x={plotRight - 4}
                  y={ys((dRows[dRows.length - 1]?.expenseMinor ?? 0) * FIRE_MUL) - 5}
                  fontSize={CHART_TEXT_3XS}
                  fill="var(--money-in)"
                  textAnchor="end"
                >
                  Ngưỡng tự do tài chính
                </text>
              </>
            )}

            {/* 7. Đường chính. Nét đứt `6 4` là quy ước của cả app cho SỐ CHIẾU (đường
                liền dành cho số đã xảy ra) — bản vẽ vẽ nó đứt đúng vì thế. */}
            <path
              d={centerPath}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2.5}
              strokeDasharray="6 4"
            />
            {/* Điểm khởi hành = tài sản ròng hôm nay: điểm DUY NHẤT trên đường không
                phải số chiếu, nên nó mang màu "số thật" của app (sky-600). */}
            <circle
              cx={xs(dRows[0].year)}
              cy={ys(dRows[0].assetsEndMinor)}
              r={3.5}
              fill="var(--color-sky-600)"
            />

            {/* 8. Chấm FIRE */}
            {fireRow && (
              <circle cx={xs(fireRow.year)} cy={ys(fireRow.assetsEndMinor)} r={5} fill="var(--money-in)" />
            )}

            {/* 9. Vạch mốc — vạch dọc mảnh tại `startYear` từng mốc, màu của mốc */}
            {visibleEvents.map((e) => (
              <line
                key={`m${e.id}`}
                x1={xs(e.startYear)}
                y1={0}
                x2={xs(e.startYear)}
                y2={plotBottom}
                stroke={
                  e.color
                    ? TAG_HEX[tagColor(e.color)]
                    : e.kind === 'income'
                      ? 'var(--money-in)'
                      : 'var(--money-out)'
                }
                strokeDasharray="3 3"
                strokeWidth={1}
                opacity={e.enabled === false ? 0.22 : 0.5}
              />
            ))}
          </svg>

          {/* Icon mốc — lớp phủ HTML trên vùng vẽ. Nằm SAU `</svg>` nên nó vẽ lên trên
              đường, và là HTML nên mỗi icon là một `<button>` thật (Tab, Enter, ←/→). */}
          <EventPins
            events={visibleEvents}
            rows={pinRowIdx}
            xs={xs}
            x1={x1}
            yearAt={yearAt}
            phaseStarts={phaseStarts}
            selectedId={selectedEventId}
            onToggle={onToggleEvent}
            onSelect={onSelectEvent}
            onMoveStart={onMoveEvent}
            onMoveEnd={onMoveEventEnd}
          />

          {/* Nhãn trục tiền — HTML, qua <Money> nên nó đi qua chế độ riêng tư */}
          {yTicks.map((v) => (
            <span
              key={`yl${v}`}
              className="pointer-events-none absolute z-10 whitespace-nowrap"
              style={{ top: ys(v) - Y_LABEL_LIFT_PX, left: Y_LABEL_LEFT_PX }}
            >
              <Money amount={v} currency={currency} compact tone="muted" className="text-2xs" />
            </span>
          ))}

          {/* Nhãn trục năm — "2040 · 46t". Năm và tuổi là SỐ ĐẾM, không phải tiền, nên
              <Num>: che một trục thời gian ở chế độ riêng tư là con số bên cạnh nó hết
              nghĩa (docs/design-system.md bước 5). */}
          {xTicks.map((y) => (
            <span
              key={`xl${y}`}
              className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap"
              style={{ top: plotBottom + 6, left: xs(y) }}
            >
              <Num tone="muted" className="text-3xs">
                {birthYear === null ? y : `${y} · ${y - birthYear}t`}
              </Num>
            </span>
          ))}

          {/* Vạch rê chuột + chấm + chip đọc số. Lớp phủ HTML chứ không phải SVG: chip
              mang CHỮ, và chữ trong SVG không co theo Cỡ chữ. */}
          {hoverRow && (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute top-0 z-20 w-px bg-accent opacity-45"
                style={{ left: xs(hoverRow.year), height: plotBottom }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute z-20 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface-page bg-accent"
                style={{ top: ys(hoverRow.assetsEndMinor), left: xs(hoverRow.year) }}
              />
              <div
                className="pointer-events-none absolute z-30 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-border-strong bg-surface-chrome px-3 py-1"
                style={{
                  top: plotTop + 6,
                  // Kẹp chip trong lòng vùng vẽ: ở hai mép trục nó bị `translateX(-50%)`
                  // đẩy một nửa ra ngoài thẻ, và ở mép phải nó chui xuống dưới dock.
                  left: Math.min(Math.max(xs(hoverRow.year), plotLeft + 90), plotRight - 90),
                }}
              >
                <Num tone="muted" className="text-2xs">
                  {hoverRow.year} · {hoverRow.age}t
                </Num>
                <Money
                  amount={hoverRow.assetsEndMinor}
                  currency={currency}
                  compact
                  className="text-2xs font-semibold"
                />
                <span className="text-3xs text-fg-muted">{hoverRow.phaseLabel}</span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
