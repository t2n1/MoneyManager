// ICON MỐC TRÊN ĐỒ THỊ — lớp phủ của bản vẽ 1c ("Icon mốc trên đồ thị"): vòng tròn 24px
// đặt đúng năm bắt đầu, một thanh 2px chạy tới năm kết thúc, và một chốt 18px ở đuôi thanh
// để kéo năm kết thúc.
//
// ĐÂY LÀ ĐƯỜNG VÀO CHÍNH của mốc cuộc đời: bấm mở bảng sửa trong dock, kéo dời năm. Không
// có form nào phải mở trước.
//
// BỐN THỨ ĐÃ GHI SẴN, ĐỪNG LÀM NGƯỢC LẠI
//
// 1. XẾP HÀNG BẰNG `packRows` (chartGeom.ts), không viết bản thứ hai — spec §10 dặn thẳng.
//    Bề rộng bơm vào là bề rộng CHỖ (`pinSpanWidth`), không phải bề rộng hình: một mốc
//    2031–2053 chiếm gần hết trục dù icon của nó chỉ 24px.
//
// 2. MỐC NGOÀI KHUNG NHÌN bị loại khỏi CẢ việc vẽ LẪN việc xếp hàng. Loại khỏi vẽ mà vẫn
//    tính vào xếp hàng thì zoom 10 năm vẫn chừa bốn hàng trống phía trên vùng vẽ. Phép lọc
//    nằm ở `TimelinePlot` (một chỗ, dùng cho cả vạch mốc và icon).
//
// 3. MỐC ĐANG TẮT (`enabled: false`, migration 0063) VẪN VẼ, chỉ mờ đi và có vạch gạch
//    ngang. Lời ghi này lấy nguyên từ `LifetimeChartCard.tsx:1340`: giấu hẳn thì "bật lại"
//    thành thao tác không có chỗ bấm, và người dùng mất luôn dấu hiệu rằng kế hoạch này
//    còn một mốc đang để ngoài.
//
// 4. MỐC "TỚI HẾT ĐỜI" (`endYear === null`) KHÔNG CÓ CHỐT. Bản vẽ vẽ chốt cho cả nó
//    (`hasSpan: true` vô điều kiện, dòng 1560) và đó là chỗ bản vẽ sai: tự đặt một năm khi
//    người dùng chạm vào là lặng lẽ biến "đến hết đời" thành một khoảng có hạn. Cùng quyết
//    định đã ghi ở `LifetimeChartCard.tsx:1177`.
import type { CSSProperties } from 'react'
import { EventIcon } from './eventIcons'
import { PIN_END_W, PIN_ROW_H, PIN_TOP, PIN_W, magnetToPhaseStart, pinEndX } from './plotFrame'
import { TAG_HEX, tagColor } from '../tags/colors'
import { useYearDrag } from './useYearDrag'

/**
 * Mốc ở dạng TỐI THIỂU mà lớp phủ này đọc — cùng hình dạng với `PlotEvent` của
 * `TimelinePlot`, và cố ý KHÔNG nhận `LifetimeEvent`/`DraftEvent`: cả hai thoả hình dạng
 * này về cấu trúc, nên bản đã lưu và bản nháp đều bơm thẳng vào được.
 */
export interface PinEvent {
  id: string
  label: string
  startYear: number
  endYear: number | null
  kind: 'income' | 'expense'
  color?: string
  icon?: string
  enabled?: boolean
}

interface Props {
  /** ĐÃ lọc theo khung nhìn và ĐÃ sắp theo `startYear` — `packRows` đòi vậy. */
  events: readonly PinEvent[]
  /** Hàng của từng mốc, cùng chỉ số với `events` (từ `pinRowsOf`). */
  rows: readonly number[]
  xs: (year: number) => number
  /** Năm cuối khung nhìn — thanh của mốc "tới hết đời" chạy tới đây. */
  x1: number
  /** `clientX` → năm. Chỗ gọi biết mình đo trong hộp nào, xem `useYearDrag`. */
  yearAt: (clientX: number) => number
  /** Các `startYear` của chặng — nam châm ±1 năm bám vào chúng (bản vẽ). */
  phaseStarts: readonly number[]
  selectedId?: string
  /** Bấm (không kéo) — bật/tắt lựa chọn, tức mở/đóng bảng sửa trong dock. */
  onToggle?: (id: string) => void
  /** Bắt đầu kéo — dock đi theo thứ đang kéo. */
  onSelect?: (id: string) => void
  /** Dời năm BẮT ĐẦU. Chỗ gọi giữ độ dài và chặn khoảng (xem TuongLaiPage). */
  onMoveStart?: (id: string, year: number) => void
  /** Đổi năm KẾT THÚC. Chỗ gọi chặn sàn `startYear + 1`. */
  onMoveEnd?: (id: string, year: number) => void
}

export function EventPins({
  events,
  rows,
  xs,
  x1,
  yearAt,
  phaseStarts,
  selectedId,
  onToggle,
  onSelect,
  onMoveStart,
  onMoveEnd,
}: Props) {
  const drag = useYearDrag<{ id: string; mode: 'pin' | 'end' }>({
    yearAt,
    onLift: (k) => onSelect?.(k.id),
    onClick: (k) => onToggle?.(k.id),
    onDrag: (k, year) => {
      // NAM CHÂM ±1 NĂM vào ranh giới chặng, cho CẢ hai đầu (bản vẽ áp `snapYear` cho cả
      // `event` và `eventEnd`, dòng 1262). Mốc cuộc đời gần như luôn muốn dính vào chỗ đổi
      // chặng — "về nước rồi mua nhà" — mà một pixel lệch trên trục 40 năm là một năm lệch
      // trong dữ liệu.
      const y = magnetToPhaseStart(year, phaseStarts)
      if (k.mode === 'end') onMoveEnd?.(k.id, y)
      else onMoveStart?.(k.id, y)
    },
  })

  return (
    <>
      {events.map((e, i) => {
        const top = PIN_TOP + (rows[i] ?? 0) * PIN_ROW_H
        const cx = xs(e.startYear)
        const off = e.enabled === false
        // Màu riêng của mốc thắng màu theo Thu/Chi (migration 0067). Tô TƯƠI — màu đặc của
        // bảng biểu đồ — trong khi chặng tô TRẦM (spec §8): hai cách tô từ cùng bảy khoá
        // màu là cách người dùng phân biệt mốc với chặng chỉ bằng mắt.
        const mau = e.color
          ? TAG_HEX[tagColor(e.color)]
          : e.kind === 'income'
            ? 'var(--money-in)'
            : 'var(--money-out)'
        // Chỉ mốc có năm kết thúc THẬT mới có CHỐT — xem lời ghi 4 ở đầu file.
        const coChot = e.endYear !== null && e.endYear > e.startYear
        // `xs(x1)` LÀ mép phải vùng vẽ (thang chiếu x1 vào đó) — xem `pinEndX` về lý do
        // phải kẹp: mốc kết thúc ngoài khung nhìn vẫn được vẽ vì nó BẮT ĐẦU trong khung.
        const rightEdge = xs(x1)
        const endX = coChot ? pinEndX(cx, xs(e.endYear as number), rightEdge) : cx
        const khoang =
          e.endYear === null
            ? `${e.startYear} → hết đời`
            : e.endYear > e.startYear
              ? `${e.startYear}–${e.endYear}`
              : `${e.startYear}`
        const moTa = `Mốc "${e.label}" · ${khoang}${off ? ' · ĐANG TẮT, không tính vào phép chiếu' : ''}`

        return (
          <div key={e.id}>
            {/* Thanh độ dài. `aria-hidden` vì khoảng năm đã nằm trong tên của chính icon —
                đọc lại bằng một phần tử riêng là nghe hai lần cùng một thứ.
                Vẽ cho CẢ mốc tới hết đời (chạy tới mép phải), chỉ cái CHỐT là không có. */}
            {(coChot || e.endYear === null) && (
              <div
                aria-hidden
                className="absolute z-10"
                style={{
                  top: top + PIN_W / 2 - 1,
                  left: cx + PIN_W / 2 + 1,
                  width: Math.max(
                    2,
                    (e.endYear === null ? rightEdge : endX) -
                      cx -
                      PIN_W / 2 -
                      (coChot ? PIN_END_W / 2 : 0),
                  ),
                  height: 2,
                  background: mau,
                  opacity: off ? 0.2 : 0.45,
                  ...(e.endYear === null && {
                    // Mờ dần ở mép phải: một đầu cắt vuông ở đúng mép vùng vẽ đọc như "kết
                    // thúc ở năm cuối đồ thị", mà không phải (LifetimeChartCard:1207).
                    maskImage: 'linear-gradient(to right, #000 55%, transparent)',
                    WebkitMaskImage: 'linear-gradient(to right, #000 55%, transparent)',
                  }),
                }}
              />
            )}

            {/* Icon mốc — `<button>` thật: Tab tới được, Enter/Space bấm được, ←/→ dời năm.
                Một `<circle>` trong SVG thì không có thứ nào trong ba thứ đó. */}
            <button
              type="button"
              aria-pressed={selectedId === e.id}
              title={`${moTa} · bấm để sửa, kéo để dời năm, ←/→ dời một năm`}
              aria-label={moTa}
              style={
                {
                  top,
                  left: cx,
                  width: PIN_W,
                  height: PIN_W,
                  borderColor: mau,
                  color: mau,
                  // Bắt buộc cho bút và cảm ứng: không có nó thì cử chỉ kéo bị trình duyệt
                  // nuốt thành cuộn trang trước khi `pointermove` kịp chạy.
                  touchAction: 'none',
                } as CSSProperties
              }
              // Nền ĐẶC (`bg-surface-chrome`) chứ không phải màu của mốc pha 14% như bản
              // vẽ: bảng màu của app lưu KHOÁ rồi tra ra biến CSS, mà `var()` thì không
              // ghép được alpha vào — và pha alpha lên đường đồ thị đang chạy ngay dưới sẽ
              // cho ra một màu thứ ba không ai đo. Viền và icon mang màu của mốc, đủ để
              // nhận ra nó là mốc nào.
              //
              // `motion-block` chỉ khi KHÔNG kéo: bỏ class chứ không đè thời lượng, nên nó
              // không đá nhau với `prefers-reduced-motion` (xem index.css và PhaseLane).
              className={`absolute z-20 flex -translate-x-1/2 items-center justify-center rounded-full border bg-surface-chrome shadow-sm ${
                drag.dragging ? '' : 'motion-block'
              } ${selectedId === e.id ? 'ring-2 ring-accent' : ''} ${off ? 'opacity-50' : ''}`}
              onPointerDown={(ev) => drag.start({ id: e.id, mode: 'pin' }, ev)}
              {...drag.surface}
              onKeyDown={(ev) => {
                // Bàn phím phải làm được đúng việc mà chuột làm bằng cách kéo — repo này
                // coi một tương tác chỉ-dùng-chuột là một lỗi (LifetimeChartCard.tsx:1358).
                if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return
                ev.preventDefault()
                onMoveStart?.(e.id, e.startYear + (ev.key === 'ArrowLeft' ? -1 : 1))
              }}
            >
              <EventIcon icon={e.icon} kind={e.kind} className="h-3.5 w-3.5 shrink-0" />
              {/* Mốc đang TẮT: một vạch gạch ngang qua icon. Bản vẽ gạch ngang cái NHÃN,
                  mà icon ở đây không có nhãn hiện ra (nhãn nằm trong tooltip và trong
                  dock) — nên dấu gạch đi lên chính cái hình. Chỉ mờ đi thôi thì không đủ:
                  mờ cũng là dấu của "ngoài khung nhìn" ở nhiều chỗ khác trong app. */}
              {off && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-fg-muted"
                />
              )}
            </button>

            {/* Chốt năm kết thúc. CÓ trong vòng Tab, khác hai mép của khối chặng
                (`PhaseLane` để chúng `aria-hidden`) — và lý do khác nhau thật: mép của chặng
                ghi vào một năm mà một khối khác đã sở hữu và Tab tới được, còn năm kết thúc
                của mốc thì không có phần tử nào khác trên trục sửa được. */}
            {coChot && (
              <button
                type="button"
                title={`Năm kết thúc của "${e.label}" — đang là ${e.endYear}. Kéo để đổi, ←/→ đổi một năm.`}
                aria-label={`Năm kết thúc của mốc "${e.label}": ${e.endYear}`}
                style={
                  {
                    top: top + (PIN_W - PIN_END_W) / 2,
                    left: endX,
                    width: PIN_END_W,
                    height: PIN_END_W,
                    borderColor: mau,
                    color: mau,
                    touchAction: 'none',
                    cursor: 'ew-resize',
                  } as CSSProperties
                }
                className={`absolute z-20 flex -translate-x-1/2 items-center justify-center rounded-full border bg-surface-chrome ${
                  drag.dragging ? '' : 'motion-block'
                } ${off ? 'opacity-50' : ''}`}
                onPointerDown={(ev) => drag.start({ id: e.id, mode: 'end' }, ev)}
                {...drag.surface}
                onKeyDown={(ev) => {
                  if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return
                  ev.preventDefault()
                  onMoveEnd?.(e.id, (e.endYear as number) + (ev.key === 'ArrowLeft' ? -1 : 1))
                }}
              >
                {/* Vạch dọc 2×9px giữa chốt — đúng hình của bản vẽ, và nó nói "kéo ngang"
                    rõ hơn một vòng tròn rỗng. */}
                <span aria-hidden className="h-2 w-0.5 rounded-sm" style={{ background: mau }} />
              </button>
            )}
          </div>
        )
      })}
    </>
  )
}
