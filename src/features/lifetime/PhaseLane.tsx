// HÀNG 8 của bản vẽ: dải KHỐI CHẶNG ĐỜI, kéo được. Đây là "đồ thị chính là bàn sửa" —
// chặng đời không có form nào để mở, người dùng kéo thẳng cái khối trên trục.
//
// BỐN THỨ ĐÃ GHI SẴN, ĐỪNG LÀM NGƯỢC LẠI
//
// 1. KÍN TRỤC, KHÔNG HỞ, KHÔNG CHỒNG. Hình học nằm ở `laneBlocks` (plotFrame.ts) và bất
//    biến đó có phép thử riêng. Đây là thứ người dùng đọc ra "các chặng nối tiếp nhau phủ
//    kín cả đời" — mà đó chính là điều phân biệt CHẶNG với MỐC (README, bảng đầu file).
//
// 2. MÉP PHẢI DỜI CHẶNG KẾ TIẾP, không dời chặng này. Một chặng không có "năm kết thúc"
//    riêng: năm kết thúc của nó LÀ năm bắt đầu của chặng sau trừ 1. Cho nó một trường
//    riêng là mở đường cho hở/chồng ngay trong dữ liệu.
//
// 3. HAI MÉP LÀ PHẦN TỬ RIÊNG, KHÔNG LỒNG TRONG KHỐI. Bản vẽ lồng chúng vào trong (nó
//    dùng `<div>` cho tất cả), ở đây khối là `<button>` thật để Tab tới được — mà phần tử
//    bấm được lồng trong phần tử bấm được là HTML không hợp lệ và trình đọc màn hình đọc
//    ra một nút có hai nút bên trong. Nên chúng là ba phần tử ngang hàng, đặt tuyệt đối
//    theo cùng một hình học.
//
// 4. TẮT TRANSITION LÚC KÉO. Bản vẽ ghi thẳng lý do (`.tl-block:active { transition:none }`):
//    không tắt thì khối trượt sau con trỏ. Ở đây tắt bằng cách BỎ class `motion-block` chứ
//    không đè thời lượng — xem lời ghi ở chỗ dùng class đó.
//
// AI LÀM VIỆC GÌ (đổi 2026-09-10, người dùng chọn — đừng gộp lại làm một)
//
//   · HAI MÉP 9px → NĂM. Kéo mép trái đổi năm bắt đầu của khối này, mép phải đổi năm bắt
//     đầu của khối kế. Chặn cứng tại hàng xóm, KHÔNG BAO GIỜ đổi thứ tự (review
//     2026-09-09; ←/→ và ô năm trong dock cũng vậy).
//   · GIỮA KHỐI → THỨ TỰ. Cầm giữa rồi trượt qua một chặng khác là ĐỔI CHỖ hai chặng, mỗi
//     chặng giữ đúng số năm của mình. Phép tính ở `phaseOrder.ts`; cử chỉ ở `onDrag` dưới.
//
// Trước bản này, kéo GIỮA khối làm đúng cái việc mà mép trái làm (cùng ghi `startYear` của
// chính nó, chỉ khác là theo độ lệch chứ theo vị trí tuyệt đối) — một bản trùng, và là chỗ
// trống tự nhiên để nhận việc đổi chỗ. Hệ quả đã biết và đã cân: khối HẸP dưới
// `EDGE_MIN_BLOCK_W` không vẽ mép, nên nó không còn đường đổi năm bằng con trỏ; năm đó vẫn
// sửa được bằng ←/→ trên chính khối hoặc bằng ô năm trong dock — đúng lời ghi đã có ở
// `EDGE_MIN_BLOCK_W`, không phải một miễn trừ mới.
//
// KHÔNG CÓ HOÀN TÁC cho việc sửa ở màn này (`undoStack.ts` chỉ lo việc XOÁ), nên đường thoát
// của một cú đổi chỗ lỡ tay là kéo VỀ chỗ cũ trước khi nhả — và điều đó chỉ đúng nhờ ảnh
// chụp lúc nhấn, xem đầu `phaseOrder.ts`.
//
// VÙNG CHẠM: khối cao 46px và hai mép chỉ rộng 9px, dưới hẳn sàn 44px của app. Miễn trừ
// theo đúng tiền lệ đã ghi ở `AppRail.tsx`: sàn 44px là sàn cho NGÓN TAY, còn màn này bị
// `xl:hidden` chặn dưới 1280px (spec §1 — "chỉ máy tính") nên con trỏ ở đây là chuột hoặc
// bút, thứ trỏ đúng điểm. Và mọi năm hai cái mép sửa được đều sửa được bằng bàn phím qua
// chính các khối (←/→) hoặc bằng ô năm trong dock, nên không có thao tác nào chỉ tồn tại
// ở một vùng 9px.
import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Money } from '../../components/ui'
import type { CurrencyCode } from '../../lib/currencies'
import { makeXScale, xToYear } from './chartGeom'
import { isActivationKey } from './keyboardActivation'
import { blockPhaseStartYearAtNeighbours } from './phaseYear'
import {
  phaseDropIndex,
  phaseSpans,
  reorderPhaseStarts,
  type PhaseSpan,
  type PhaseStart,
} from './phaseOrder'
import { PhaseIcon } from './PlanDockParts'
import { phaseColorKey } from './planColors'
import { PLOT_LEFT, laneBlocks, plotRightOf, type LaneBlock } from './plotFrame'
import { TAG_CHIP_CLASS, TAG_HEX, type TagColorKey } from '../tags/colors'
import { useBoxSize } from './useBoxSize'
import { useYearDrag } from './useYearDrag'

/**
 * Chặng đời ở dạng TỐI THIỂU mà dải này thật sự đọc — cùng lối với `PlotEvent` của
 * `TimelinePlot`: `DraftPhase` thoả hình dạng này về cấu trúc nên `TuongLaiPage` bơm thẳng
 * bản nháp vào, không cần một hàm chuyển đổi ở giữa.
 */
export interface LanePhase {
  id: string
  label: string
  startYear: number
  /** Khoá màu (features/tags/colors.ts). `''` = tô theo THỨ TỰ chặng (migration 0069). */
  color: string
  /** Khoá icon (eventIcons.tsx). `''` = vòng nét đứt, xem `PhaseIcon`. */
  icon: string
  currency: CurrencyCode
  annualIncomeMinor: number
  annualExpenseMinor: number
}

/** Bộ xử lý con trỏ mà `useYearDrag` trả về, spread lên chính phần tử kéo được. */
type DragSurface = {
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void
  /**
   * Phát hiện review 2026-09-09, Finding 3: mép kéo tự ẩn dưới `EDGE_MIN_BLOCK_W` — nếu
   * chính mép đang cầm bị chặn (`blockPhaseStartYearAtNeighbours`) co khối xuống dưới
   * ngưỡng đó GIỮA LÚC kéo, nó unmount ngay dưới con trỏ, `pointerup`/`pointercancel`
   * không bao giờ tới được nó nữa, và `dragging` kẹt ở `true`. Trình duyệt tự nhả pointer
   * capture khi phần tử bị gỡ khỏi DOM và bắn `lostpointercapture` đúng lúc đó — nối sự
   * kiện này vào cùng đường `end()` (xem `useYearDrag.ts`) là chỗ chặn chung cho MỌI phần
   * tử kéo được, không riêng mép chặng. `end()` đã tự vệ bằng `press.current` nên bắn hai
   * lần (một lần `pointerup`/`pointercancel` bình thường, một lần `lostpointercapture` do
   * chính thao tác nhả capture đó gây ra) không làm gì thêm ở lần thứ hai.
   */
  onLostPointerCapture: (e: ReactPointerEvent<HTMLElement>) => void
}

interface Props {
  phases: readonly LanePhase[]
  /** Khung nhìn hiện tại của đồ thị (zoom) — dải phải khớp đúng trục năm đó. */
  x0: number
  x1: number
  /**
   * Năm CUỐI của bản chiếu — dùng để biết chặng cuối dài bao nhiêu năm (nó không có năm
   * kết thúc riêng, xem lời ghi 2 ở đầu file), thứ mà việc đổi chỗ bắt buộc phải biết.
   *
   * KHÔNG lấy `x1` thay cho nó: `x1` là mép khung nhìn và co lại khi phóng to, mà số năm
   * của một chặng thì không được phụ thuộc mức phóng — phóng to rồi đổi chỗ sẽ ra một bố
   * cục khác với lúc phóng nhỏ.
   */
  lastYear: number
  selectedId?: string
  /** Bấm (không kéo) — bật/tắt lựa chọn, tức mở/đóng bảng sửa trong dock. */
  onToggle: (id: string) => void
  /** Bắt đầu kéo — dock đi theo thứ đang kéo. */
  onSelect: (id: string) => void
  /**
   * Đặt `startYear` của chặng `id`.
   *
   * Dải này TỰ CHẶN, ở bốn chỗ (mép trái · mép phải trên chặng kế · kéo giữa · `←`/`→`),
   * tất cả bằng CÙNG một hàm `blockPhaseStartYearAtNeighbours` — nên năm đi ra khỏi đây đã
   * nằm trong khoảng mở giữa hai chặng liền kề. Nó cần thế: hình học của khối (`laneBlocks`)
   * phải khớp với năm mà nó vừa xin, không thì khối trượt tới một chỗ rồi bị đẩy về chỗ khác.
   *
   * Chỗ gọi chặn LẠI bằng ĐÚNG hàm đó, trên mảng chặng của chính bản nháp (`dragPhase.ts`) —
   * không phải "hai luật cho cùng một cột" mà là cùng một luật, tính lại trên dữ liệu mới
   * nhất: lượt kéo gộp theo nhịp khung hình nên prop `phases` ở đây có thể chậm một khung.
   * Điều BỊ CẤM là chặn lần thứ hai bằng một hàm KHÁC — `clampPhaseStartYear` (luật của ô
   * năm gõ tay trong dock) từng nằm đúng chỗ đó và giành lấy kết quả của dải này (phát hiện
   * review cuối nhánh 2026-09-09, Finding 1).
   */
  onMoveStart: (id: string, year: number) => void
  /**
   * Ghi TRỌN một bố cục mới sau khi đổi chỗ — năm bắt đầu của TẤT CẢ các chặng, một lần.
   *
   * Không phải "đặt năm cho chặng id" như `onMoveStart`, và cố tình không dùng lại nó: đổi
   * chỗ dời nhiều chặng cùng lúc, mà `onMoveStart` đi qua phép chặn tại hàng xóm — gọi nó
   * từng chặng một thì chặng thứ hai bị chặn bởi chỗ mà chặng thứ nhất vừa dời tới. Lý do
   * đầy đủ ở đầu `phaseOrder.ts`. Mảng RỖNG = không có gì để tính, chỗ ghi tự bỏ qua; còn
   * "kéo về đúng chỗ cũ" thì KHÔNG rỗng — nó là bố cục gốc, và phải được ghi lại.
   */
  onReorder: (starts: readonly PhaseStart[]) => void
}

/** Bề rộng một mép kéo (bản vẽ: 9px). Vạch grip bên trong là 2×16px. */
const EDGE_W = 9

/**
 * Dưới bề rộng này thì KHÔNG vẽ mép kéo. Hai mép 9px trên một khối 20px là cả khối chỉ
 * còn 2px để cầm vào giữa — tức mất luôn đường "kéo cả chặng", mà người dùng thì không có
 * cách nào biết mình đang trỏ vào cái nào. Năm đó vẫn sửa được: chọn khối rồi ←/→, hoặc gõ
 * vào ô năm trong dock.
 */
const EDGE_MIN_BLOCK_W = 40

/** Cái gì đang bị kéo. Mang theo `from` = năm bắt đầu LÚC NHẤN — xem `onDrag`. */
interface DragKey {
  id: string
  mode: 'left' | 'right' | 'body'
  from: number
  /**
   * Bố cục các chặng LÚC NHẤN — ảnh chụp, không phải mảng sống, và `mode: 'body'` (đổi chỗ)
   * tính hoàn toàn trên nó. Vì sao bắt buộc phải là ảnh chụp: xem đầu `phaseOrder.ts`.
   */
  spans: readonly PhaseSpan[]
}

export function PhaseLane({
  phases,
  x0,
  x1,
  lastYear,
  selectedId,
  onToggle,
  onSelect,
  onMoveStart,
  onReorder,
}: Props) {
  // Đo hộp THẬT, cùng khuôn với vùng vẽ: dải này là `w-full` trong đúng cột chứa
  // `TimelinePlot`, nên hai phép đo ra cùng một bề ngang và hai trục năm khớp nhau ở mọi
  // cỡ chữ. Khai lề bằng `rem` rồi trộn với px của SVG mới là chỗ lệch (xem plotFrame.ts).
  const { box, boxRef, attachBox } = useBoxSize({ w: 900, h: 46 })

  const plotRight = plotRightOf(box.w)
  const xs = useMemo(() => makeXScale(x0, x1, PLOT_LEFT, plotRight), [x0, x1, plotRight])
  const blocks = useMemo(() => laneBlocks(phases, x0, x1, xs), [phases, x0, x1, xs])

  /** Thứ tự theo năm — chỗ duy nhất trả lời "chặng kế tiếp của chặng này là ai". */
  const sorted = useMemo(() => [...phases].sort((a, b) => a.startYear - b.startYear), [phases])
  const rank = useMemo(() => new Map(sorted.map((p, i) => [p.id, i])), [sorted])
  const byId = useMemo(() => new Map(phases.map((p) => [p.id, p])), [phases])
  /** Bố cục "mỗi chặng chiếm bao nhiêu năm" — nguồn duy nhất cho cả hai đường đổi chỗ
   *  (kéo giữa khối, và Alt+←/→). Giá trị của LƯỢT RENDER lúc nhấn chính là ảnh chụp mà
   *  `DragKey.spans` giữ suốt lượt kéo. */
  const spans = useMemo(() => phaseSpans(phases, lastYear), [phases, lastYear])

  /**
   * Cái đang được NHẤC, để hai chỗ dùng: (a) chỉ lượt kéo MÉP mới tắt transition — lượt đổi
   * chỗ thì cần transition, nó là thứ làm cú tráo hai khối ĐỌC RA ĐƯỢC thay vì nhấp một
   * cái; (b) tô nổi đúng khối đang cầm. `useYearDrag` chỉ trả một cờ `dragging` chung nên
   * chỗ này phải tự giữ. Không cần dọn khi kéo xong: mọi chỗ đọc đều đi qua `drag.dragging`.
   */
  const [nhac, setNhac] = useState<DragKey | null>(null)

  const yearAt = useCallback(
    (clientX: number) => {
      const el = boxRef.current
      const px = clientX - (el?.getBoundingClientRect().left ?? 0)
      // `xToYear` (chartGeom.ts, có phép thử) — nó kẹp luôn trong [x0, x1], nên kéo ra
      // ngoài mép đồ thị dừng ở mép chứ không nhảy sang một năm không có trên trục.
      return xToYear(px, x0, x1, PLOT_LEFT, plotRight)
    },
    [boxRef, plotRight, x0, x1],
  )

  const drag = useYearDrag<DragKey>({
    yearAt,
    // Mép phải ghi vào chặng KẾ, nên dock cũng phải nhắm vào chặng kế: không thì người
    // dùng kéo một mép rồi thấy bảng sửa của một chặng có năm đứng yên.
    onLift: (k) => {
      setNhac(k)
      onSelect((k.mode === 'right' ? nextIdOf(sorted, k.id) : null) ?? k.id)
    },
    onClick: (k) => onToggle(k.id),
    onDrag: (k, year, grabYear) => {
      // GIỮA KHỐI = ĐỔI CHỖ, không đổi năm (người dùng chọn 2026-09-10). Phép tính thuần ở
      // `phaseOrder.ts`, và nó chạy trên ẢNH CHỤP lúc nhấn (`k.spans`) chứ không trên
      // `phases` của khung hình này: mỗi khung hình đều GHI vào nháp, nên đọc lại bố cục mà
      // chính mình vừa dời là để con trỏ đứng yên gần một ranh giới mà hai chặng nhảy qua
      // nhau liên tục.
      if (k.mode === 'body') {
        const to = phaseDropIndex(k.spans, k.id, year - grabYear)
        // `-1` = chặng không còn trong ảnh chụp. Không ghi gì — đừng dựa vào việc
        // `reorderPhaseStarts` cũng tự bỏ qua id lạ: một con số âm bơm vào chỗ nhận
        // "vị trí" là thứ chỉ tình cờ vô hại.
        if (to >= 0) onReorder(reorderPhaseStarts(k.spans, k.id, to))
        return
      }
      // CHẶN tại chặng liền kề, không dò-năm-trống-rồi-nhảy: `blockPhaseStartYearAtNeighbours`
      // (phaseYear.ts) — khác `clampPhaseStartYear` mà ô năm trong dock dùng, xem JSDoc ở đó
      // cho lý do. Kéo quá tay dừng SÁT chặng bên cạnh, không đổi thứ tự hai chặng.
      if (k.mode === 'right') {
        // Mép phải = biên giữa chặng này và chặng kế, và biên đó LÀ `startYear` của chặng
        // kế. Kéo nó là ghi vào chặng kế, không vào chặng đang cầm — nên khoảng chặn cũng
        // đọc theo HÀNG XÓM của chặng kế (chính chặng đang cầm, và chặng sau chặng kế),
        // không phải hàng xóm của chặng đang cầm.
        //
        // Năm TUYỆT ĐỐI (năm dưới con trỏ), không cộng 1 như bản vẽ (dòng 1284): mép được
        // vẽ đúng tại `xs(chặng kế.startYear)` nên `+1` làm chính cú cầm vào mép đã dời
        // biên một năm trước khi người dùng kéo đi đâu cả.
        const next = nextIdOf(sorted, k.id)
        if (next !== null) onMoveStart(next, blockPhaseStartYearAtNeighbours(phases, next, year))
        return
      }
      // Chỉ còn MÉP TRÁI tới được đây (mép phải đã `return` ở trên, giữa khối cũng vậy).
      onMoveStart(k.id, blockPhaseStartYearAtNeighbours(phases, k.id, year))
    },
  })

  // Chỉ lượt kéo MÉP mới tắt transition (lời ghi 4 ở đầu file): mép phải trượt SÁT con
  // trỏ. Lượt ĐỔI CHỖ thì ngược lại — khối không đi theo con trỏ mà nhảy vào ô của nó, nên
  // 180ms của `motion-block` là thứ duy nhất cho người dùng thấy hai khối vừa tráo nhau chứ
  // không phải màn hình vừa nhấp một cái.
  const keoMep = drag.dragging && nhac !== null && nhac.mode !== 'body'
  const dangDoiCho = drag.dragging && nhac?.mode === 'body' ? nhac.id : null

  return (
    // `h-[2.875rem]` = 46px của bản vẽ ở cỡ chữ Vừa (spec §5), dạng `rem` nên nó co theo
    // Cài đặt → Cỡ chữ. Chiều CAO là rem, còn toạ độ NGANG là px đo được — xem plotFrame.
    <div
      ref={attachBox}
      className="relative h-[2.875rem] w-full select-none"
      role="group"
      aria-label="Dải chặng đời — bấm một khối để sửa, kéo giữa khối để đổi chỗ hai chặng, kéo mép để đổi năm"
    >
      {blocks.map((b) => {
        const p = byId.get(b.id)
        if (!p) return null
        const i = rank.get(b.id) ?? 0
        // `phaseColorKey` (planColors.ts) — CÙNG hàm mà bảng chọn màu trong dock dùng để
        // vẽ ô màu của chặng này. Trước đây luật rơi-về-màu chỉ nằm ở file này, nên dock
        // hiện một vòng nét đứt "không màu" cho đúng cái chặng mà dải đang tô bằng một màu
        // thật (review cuối nhánh 2026-09-09, Finding 7).
        const k = phaseColorKey(p.color, i)
        const showEdges = b.width >= EDGE_MIN_BLOCK_W
        return (
          <div key={b.id}>
            <PhaseBlock
              block={b}
              phase={p}
              colorKey={k}
              selected={selectedId === b.id}
              dragging={drag.dragging}
              snap={keoMep}
              carrying={dangDoiCho === b.id}
              onPointerDown={(e) =>
                // `spans` của LƯỢT RENDER này = ảnh chụp lúc nhấn, thứ mà cả lượt kéo sẽ
                // tính trên đó (xem `DragKey.spans`).
                drag.start({ id: b.id, mode: 'body', from: b.startYear, spans }, e)
              }
              surface={drag.surface}
              onToggle={onToggle}
              // Phát hiện review 2026-09-09, Finding 2: cộng thẳng `step` rồi gọi
              // `onMoveStart` từng đi qua một writer ở `TuongLaiPage` chặn bằng
              // `clampPhaseStartYear` (DÒ-NĂM-TRỐNG, đúng cho ô năm gõ tay — xem JSDoc
              // `blockPhaseStartYearAtNeighbours`), KHÔNG qua phép CHẶN mà cả ba đường kéo
              // đã dùng từ bản sửa finding trước (nay writer đó là `dragPhase.ts`). Hệ quả:
              // hai chặng liền năm (p2=2035, p3=2036) — một cú → duy nhất trên p2 xin 2036,
              // thấy đã có người, NHẢY qua thành 2037: p2 xếp SAU p3, đổi thứ tự, mà một cú
              // bấm phím còn CHỦ Ý hơn một cú kéo lỡ tay. Đi qua cùng hàm CHẶN với đường kéo
              // thì một bước ←/→ sát hàng xóm là NO-OP (đứng yên), không nhảy qua.
              onNudge={(step) =>
                onMoveStart(b.id, blockPhaseStartYearAtNeighbours(phases, b.id, b.startYear + step))
              }
              // Đường BÀN PHÍM của việc đổi chỗ. Bắt buộc phải có: repo này coi một tương
              // tác chỉ-dùng-chuột là một lỗi (lời ghi ở LifetimeChartCard.tsx:1358), và
              // `onNudge` ngay trên chỉ đổi NĂM — sau bản này nó không còn là đường bàn phím
              // của việc kéo giữa khối nữa, vì kéo giữa khối đã đổi việc.
              //
              // Đọc `spans` SỐNG (không ảnh chụp): một cú bấm là một việc rời, xong ngay,
              // không có chuỗi khung hình nào để trôi — khác hẳn lượt kéo. Và `i + step` đúng
              // là con số `reorderPhaseStarts` chờ: nó rút chặng ra rồi chèn lại ở vị trí đó.
              onSwap={(step) => {
                const i = spans.findIndex((sp) => sp.id === b.id)
                if (i !== -1) onReorder(reorderPhaseStarts(spans, b.id, i + step))
              }}
            />
            {showEdges && !b.first && (
              <EdgeHandle
                left={b.left}
                colorKey={k}
                snap={keoMep}
                title={`Kéo mép để đổi năm bắt đầu của "${p.label}" — đang là ${b.startYear}`}
                onPointerDown={(e) => drag.start({ id: b.id, mode: 'left', from: b.startYear, spans }, e)}
                surface={drag.surface}
              />
            )}
            {showEdges && !b.last && (
              <EdgeHandle
                left={b.left + b.width - EDGE_W}
                colorKey={k}
                snap={keoMep}
                title={`Kéo mép để đổi năm kết thúc của "${p.label}" — đang là ${b.endYear}. Mép này dời năm bắt đầu của chặng kế tiếp.`}
                onPointerDown={(e) => drag.start({ id: b.id, mode: 'right', from: b.startYear, spans }, e)}
                surface={drag.surface}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Chặng đứng ngay sau `id` theo năm; `null` = đây là chặng cuối. */
function nextIdOf(sorted: readonly LanePhase[], id: string): string | null {
  const i = sorted.findIndex((p) => p.id === id)
  return i >= 0 && i + 1 < sorted.length ? sorted[i + 1].id : null
}

interface BlockProps {
  block: LaneBlock
  phase: LanePhase
  colorKey: TagColorKey
  selected: boolean
  /** Có LƯỢT KÉO nào đang chạy trên dải — chỉ dùng cho con trỏ (`grabbing`). */
  dragging: boolean
  /**
   * Tắt transition. CHỈ bật cho lượt kéo MÉP (lời ghi 4 ở đầu file: mép phải trượt sát con
   * trỏ). Lượt ĐỔI CHỖ để nguyên transition — khối không đi theo con trỏ mà nhảy vào ô của
   * nó, nên 180ms đó là thứ duy nhất cho thấy hai khối vừa TRÁO NHAU.
   */
  snap: boolean
  /** Chính khối này đang được nhấc để đổi chỗ — tô nổi lên. */
  carrying: boolean
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
  surface: DragSurface
  /** Bấm (chuột) HOẶC Enter/Space (bàn phím) — bật/tắt lựa chọn. Xem Finding 1 ở `onKeyDown`. */
  onToggle: (id: string) => void
  /** ←/→ — đổi NĂM một bước, chặn tại hàng xóm. */
  onNudge: (step: number) => void
  /** Alt+←/→ — ĐỔI CHỖ một bậc trong thứ tự các chặng. */
  onSwap: (step: number) => void
}

function PhaseBlock({
  block,
  phase,
  colorKey,
  selected,
  dragging,
  snap,
  carrying,
  onPointerDown,
  surface,
  onToggle,
  onNudge,
  onSwap,
}: BlockProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={`Chặng "${phase.label}" · ${block.startYear}–${block.endYear} · bấm để sửa · kéo giữa khối để đổi chỗ với chặng khác · ←/→ dời một năm · Alt+←/→ đổi chỗ`}
      style={
        {
          left: block.left,
          width: block.width,
          // Bắt buộc cho bút và cảm ứng: không có nó thì cử chỉ kéo bị trình duyệt nuốt
          // thành cuộn trang trước khi `pointermove` kịp chạy.
          touchAction: 'none',
          cursor: dragging ? 'grabbing' : 'grab',
        } as CSSProperties
      }
      // `rounded-md` (6px) chứ không 8px: đây là CONTROL, và §1.3 xếp control vào 6px —
      // `tests/designSystem.test.ts` ban cứng bán kính panel trên `<button>`. Bản vẽ cũng
      // ghi `border-radius:6px` ở chính khối này; con số 8px trong README là chỗ lệch.
      //
      // `motion-block` CHỈ khi không kéo: đó là cách tắt transition của bản vẽ, làm bằng
      // cách bỏ class chứ không đè `duration-0`. Nhờ vậy nó không đá nhau với block
      // `prefers-reduced-motion` trong index.css — block đó đè `!important` xuống 0,01ms
      // cho MỌI transition, kể cả cái này, nên "giảm chuyển động" vẫn thắng.
      //
      // Tô TRẦM (`TAG_CHIP_CLASS`, spec §8): nền nhạt ở Sáng, nền đậm mờ ở Tối. Mốc thì tô
      // TƯƠI — hai cách tô từ cùng bảy khoá màu là cách giữ đúng ý bản vẽ ("hai dải phải
      // khác nhau rõ rệt") mà không mở rộng bảng màu dùng chung của app.
      className={`absolute inset-y-0 flex flex-col justify-center overflow-hidden rounded-md border px-2.5 text-left ${
        snap ? '' : 'motion-block'
      } ${TAG_CHIP_CLASS[colorKey]} ${
        selected ? 'border-accent ring-2 ring-accent' : 'border-border-strong'
      } ${
        // Đang được nhấc để đổi chỗ: nâng lên trên hai cái mép (`z-10`) và đổ bóng. Cùng
        // dấu hiệu mà `DragList` ở Danh mục đã dùng cho hàng đang kéo (`shadow-md` + nâng
        // lớp) — không phát minh một dấu hiệu thứ hai cho cùng một việc.
        carrying ? 'z-20 shadow-md' : ''
      }`}
      onPointerDown={onPointerDown}
      {...surface}
      onKeyDown={(e) => {
        // Bàn phím phải làm được đúng việc mà chuột làm bằng cách bấm/kéo — repo này coi
        // một tương tác chỉ-dùng-chuột là một lỗi (lời ghi ở LifetimeChartCard.tsx:1358).
        //
        // Enter/Space TRƯỚC nhánh ←/→ (Finding 1, review 2026-09-09, CRITICAL): khối này
        // bấm/kéo qua `useYearDrag`, không có `onClick` React, nên một `<button>` bấm bằng
        // phím (dispatch `click`, không phải `pointerdown`/`pointerup`) không gọi được gì
        // nếu không tự bắt ở đây — Tab tới rồi Enter/Space từng không làm gì cả.
        if (isActivationKey(e.key)) {
          e.preventDefault()
          onToggle(phase.id)
          return
        }
        // ←/→ dời chặng đang chọn một năm, đúng bảng "Bàn phím" của README.
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        const buoc = e.key === 'ArrowLeft' ? -1 : 1
        // Alt = ĐỔI CHỖ (một bậc trong thứ tự), không Alt = đổi NĂM (một năm). Cùng cặp
        // phím vì cùng một trục: người dùng đã ở trong đầu "sang trái / sang phải", chỉ
        // khác cái được dời là THỨ TỰ hay là NĂM. Chọn Alt chứ không Shift: Shift+←/→ là
        // bôi đen của hệ điều hành, và chọn Ctrl thì đá vào phím cuộn/thu-phóng của trình
        // duyệt trên một số bàn phím.
        if (e.altKey) {
          onSwap(buoc)
          return
        }
        onNudge(buoc)
      }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0">
          <PhaseIcon icon={phase.icon} />
        </span>
        <span className="min-w-0 truncate text-xs font-semibold">{phase.label}</span>
      </span>
      {/* Phụ đề: thu / chi. "Để dành" KHÔNG lên đây (bản vẽ có) — ở 1280px một khối 14 năm
          rộng khoảng 300px, ba con số cùng hàng thì cả ba bị cắt, tức đọc được ít hơn hai
          con số nguyên vẹn; nó đã có trong bảng sửa ở dock. Và không nhét tiền vào `title`:
          chữ trong `title` không đi qua <Money> nên nó lọt qua chế độ riêng tư. */}
      <span className="flex min-w-0 items-center gap-1 truncate text-2xs">
        <Money amount={phase.annualIncomeMinor} currency={phase.currency} compact tone="muted" />
        <span aria-hidden className="opacity-60">
          /
        </span>
        <Money amount={-phase.annualExpenseMinor} currency={phase.currency} compact tone="muted" />
      </span>
    </button>
  )
}

/**
 * Một mép kéo: 9px rộng, cao hết khối, vạch grip 2×16 ở giữa (bản vẽ).
 *
 * `aria-hidden` và KHÔNG focus được, có chủ đích: nó không mang thông tin nào mà một người
 * dùng trình đọc màn hình có thể dùng, và MỌI năm nó sửa được đều sửa được bằng bàn phím
 * qua chính các khối (mép trái = năm của khối này; mép phải = năm của khối kế, tới bằng
 * Tab). Cho nó vào vòng Tab là thêm hai điểm dừng không đọc ra được gì.
 *
 * `cursor-ew-resize` là dấu hiệu duy nhất nói "cái này kéo ngang được", nên nó ở đây chứ
 * không ở khối (khối là `grab`).
 */
function EdgeHandle({
  left,
  colorKey,
  snap,
  title,
  onPointerDown,
  surface,
}: {
  left: number
  colorKey: TagColorKey
  /** Tắt transition trong lúc kéo mép — xem `snap` ở `BlockProps`. */
  snap: boolean
  title: string
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
  surface: DragSurface
}) {
  return (
    <span
      aria-hidden
      title={title}
      style={{ left, width: EDGE_W, touchAction: 'none' } as CSSProperties}
      className={`absolute inset-y-0 z-10 flex cursor-ew-resize items-center justify-center ${
        snap ? '' : 'motion-block'
      }`}
      onPointerDown={onPointerDown}
      {...surface}
    >
      {/* Vạch grip `h-4 w-0.5` = 16×2px. Màu ĐẶC của chặng (`TAG_HEX`, cùng lối với
          `Swatch` ở PlanDockParts) để mép đọc ra là mép CỦA khối này, không phải một vạch
          trang trí rơi vào giữa hai khối. `style` chứ không class: bảng màu lưu KHOÁ rồi
          tra ra biến CSS/hex, không có class Tailwind tương ứng. */}
      <span className="h-4 w-0.5 rounded-sm opacity-75" style={{ backgroundColor: TAG_HEX[colorKey] }} />
    </span>
  )
}
