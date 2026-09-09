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
// VÙNG CHẠM: khối cao 46px và hai mép chỉ rộng 9px, dưới hẳn sàn 44px của app. Miễn trừ
// theo đúng tiền lệ đã ghi ở `AppRail.tsx`: sàn 44px là sàn cho NGÓN TAY, còn màn này bị
// `xl:hidden` chặn dưới 1280px (spec §1 — "chỉ máy tính") nên con trỏ ở đây là chuột hoặc
// bút, thứ trỏ đúng điểm. Và mọi năm hai cái mép sửa được đều sửa được bằng bàn phím qua
// chính các khối (←/→) hoặc bằng ô năm trong dock, nên không có thao tác nào chỉ tồn tại
// ở một vùng 9px.
import { useCallback, useMemo, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Money } from '../../components/ui'
import type { CurrencyCode } from '../../lib/currencies'
import { makeXScale, xToYear } from './chartGeom'
import { blockPhaseStartYearAtNeighbours } from './phaseYear'
import { PhaseIcon } from './PlanDockParts'
import { PLOT_LEFT, laneBlocks, plotRightOf, type LaneBlock } from './plotFrame'
import { TAG_CHIP_CLASS, TAG_COLOR_KEYS, TAG_HEX, tagColor, type TagColorKey } from '../tags/colors'
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
}

interface Props {
  phases: readonly LanePhase[]
  /** Khung nhìn hiện tại của đồ thị (zoom) — dải phải khớp đúng trục năm đó. */
  x0: number
  x1: number
  selectedId?: string
  /** Bấm (không kéo) — bật/tắt lựa chọn, tức mở/đóng bảng sửa trong dock. */
  onToggle: (id: string) => void
  /** Bắt đầu kéo — dock đi theo thứ đang kéo. */
  onSelect: (id: string) => void
  /**
   * Đặt `startYear` của chặng `id`. Dải này KHÔNG tự chặn: `clampPhaseStartYear`
   * (phaseYear.ts) là chỗ duy nhất khai luật đó và chỗ gọi đã đi qua nó — viết một phép
   * chặn thứ hai ở đây là hai luật cho cùng một cột dữ liệu.
   */
  onMoveStart: (id: string, year: number) => void
}

/**
 * Màu rơi về khi chặng chưa chọn màu (`color === ''`, default của migration 0069).
 *
 * Xoay theo THỨ TỰ chặng, đúng chữ trong migration ("`''` = tô theo thứ tự chặng như hiện
 * nay") — nhờ vậy dữ liệu cũ hiện ra ổn định chứ không thành một dải xám đều. Sáu khoá,
 * khớp số màu của `PHCOLORS` trong bản vẽ; `gray` để ngoài vì nó là màu của "không màu".
 */
const FALLBACK_KEYS: readonly TagColorKey[] = TAG_COLOR_KEYS.filter((k) => k !== 'gray')

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
}

export function PhaseLane({ phases, x0, x1, selectedId, onToggle, onSelect, onMoveStart }: Props) {
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
    onLift: (k) => onSelect((k.mode === 'right' ? nextIdOf(sorted, k.id) : null) ?? k.id),
    onClick: (k) => onToggle(k.id),
    onDrag: (k, year, grabYear) => {
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
      if (k.mode === 'left') {
        onMoveStart(k.id, blockPhaseStartYearAtNeighbours(phases, k.id, year))
        return
      }
      // Kéo phần GIỮA: dời theo ĐỘ LỆCH so với chỗ đã cầm, không nhảy tới năm dưới con
      // trỏ. Bản vẽ nối `onDown` của khối vào cùng handler với mép trái (dòng 1529–1530),
      // tức cầm giữa một khối rộng 14 năm rồi nhích 1px là năm bắt đầu NHẢY tới giữa khối
      // — chặng co lại còn một nửa vì một cú nhích. Ở đây khối trượt theo con trỏ và giữ
      // đúng chỗ cầm; `from` là năm lúc NHẤN nên độ lệch không dồn sai qua từng khung. Vẫn
      // qua cùng phép chặn hàng xóm — kéo giữa một khối RỘNG tới sát chặng bên cạnh cũng
      // phải dừng, không co khối đó về 0 hay âm.
      onMoveStart(k.id, blockPhaseStartYearAtNeighbours(phases, k.id, k.from + (year - grabYear)))
    },
  })

  return (
    // `h-[2.875rem]` = 46px của bản vẽ ở cỡ chữ Vừa (spec §5), dạng `rem` nên nó co theo
    // Cài đặt → Cỡ chữ. Chiều CAO là rem, còn toạ độ NGANG là px đo được — xem plotFrame.
    <div
      ref={attachBox}
      className="relative h-[2.875rem] w-full select-none"
      role="group"
      aria-label="Dải chặng đời — bấm một khối để sửa, kéo để dời năm, kéo mép để dài hoặc ngắn"
    >
      {blocks.map((b) => {
        const p = byId.get(b.id)
        if (!p) return null
        const i = rank.get(b.id) ?? 0
        const k = colorKeyOf(p, i)
        const showEdges = b.width >= EDGE_MIN_BLOCK_W
        return (
          <div key={b.id}>
            <PhaseBlock
              block={b}
              phase={p}
              colorKey={k}
              selected={selectedId === b.id}
              dragging={drag.dragging}
              onPointerDown={(e) => drag.start({ id: b.id, mode: 'body', from: b.startYear }, e)}
              surface={drag.surface}
              onNudge={(step) => onMoveStart(b.id, b.startYear + step)}
            />
            {showEdges && !b.first && (
              <EdgeHandle
                left={b.left}
                colorKey={k}
                dragging={drag.dragging}
                title={`Kéo mép để đổi năm bắt đầu của "${p.label}" — đang là ${b.startYear}`}
                onPointerDown={(e) => drag.start({ id: b.id, mode: 'left', from: b.startYear }, e)}
                surface={drag.surface}
              />
            )}
            {showEdges && !b.last && (
              <EdgeHandle
                left={b.left + b.width - EDGE_W}
                colorKey={k}
                dragging={drag.dragging}
                title={`Kéo mép để đổi năm kết thúc của "${p.label}" — đang là ${b.endYear}. Mép này dời năm bắt đầu của chặng kế tiếp.`}
                onPointerDown={(e) => drag.start({ id: b.id, mode: 'right', from: b.startYear }, e)}
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

function colorKeyOf(p: LanePhase, index: number): TagColorKey {
  if (p.color !== '') return tagColor(p.color)
  const n = FALLBACK_KEYS.length
  return FALLBACK_KEYS[((index % n) + n) % n]
}

interface BlockProps {
  block: LaneBlock
  phase: LanePhase
  colorKey: TagColorKey
  selected: boolean
  dragging: boolean
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
  surface: DragSurface
  onNudge: (step: number) => void
}

function PhaseBlock({
  block,
  phase,
  colorKey,
  selected,
  dragging,
  onPointerDown,
  surface,
  onNudge,
}: BlockProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={`Chặng "${phase.label}" · ${block.startYear}–${block.endYear} · bấm để sửa, kéo để dời, ←/→ dời một năm`}
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
        dragging ? '' : 'motion-block'
      } ${TAG_CHIP_CLASS[colorKey]} ${
        selected ? 'border-accent ring-2 ring-accent' : 'border-border-strong'
      }`}
      onPointerDown={onPointerDown}
      {...surface}
      onKeyDown={(e) => {
        // Bàn phím phải làm được đúng việc mà chuột làm bằng cách kéo — repo này coi một
        // tương tác chỉ-dùng-chuột là một lỗi (lời ghi ở LifetimeChartCard.tsx:1358).
        // ←/→ dời chặng đang chọn một năm, đúng bảng "Bàn phím" của README.
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        onNudge(e.key === 'ArrowLeft' ? -1 : 1)
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
  dragging,
  title,
  onPointerDown,
  surface,
}: {
  left: number
  colorKey: TagColorKey
  dragging: boolean
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
        dragging ? '' : 'motion-block'
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
