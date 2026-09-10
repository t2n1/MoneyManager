// ICON MỐC TRÊN ĐỒ THỊ — lớp phủ của bản vẽ 1c ("Icon mốc trên đồ thị"), vẽ theo kiểu
// "ghim cắm trục + nhãn khi chọn" (người dùng chọn giữa bốn bản mẫu, 2026-09-10). Một mốc
// gồm SÁU dấu, tất cả nằm trong file này: vòng 24px TÔ ĐẶC màu của mốc với icon đục ngược
// ra, một CUỐNG ngắn dưới vòng, một VẠCH ĐẶC ở chân vùng vẽ đúng năm đó, một VIÊN NANG chạy
// tới năm kết thúc, một NẮM KÉO ở đuôi nang, và NHÃN tên — chỉ ở mốc đang chọn.
//
// ĐÃ ĐỔI GÌ VÀ VÌ SAO (2026-09-10). Trước bản này: vòng tròn RỖNG (viền 1px trên nền đặc),
// thanh 2px, và một VẠCH GẠCH DỌC chạy suốt chiều cao vùng vẽ — vạch đó vẽ trong `<svg>`
// của `TimelinePlot` (lớp 9). Hai chỗ yếu người dùng chỉ ra khi xem ảnh màn hình thật:
//   · vòng RỖNG ở cỡ 24px chỉ còn là một nét viền mảnh, nên màu của mốc gần như không đọc
//     ra — mà màu chính là thứ phân biệt mốc này với mốc kia;
//   · vạch dọc CẮT NGANG đường tài sản, thứ người ta tới trang này để đọc, và một kế hoạch
//     mười mốc là mười vạch cắt. Cuống ngắn + vạch chân trục nói đúng một năm y như vậy mà
//     không một pixel nào đi qua chỗ đường chạy.
//
// HỆ QUẢ VỀ FILE: lớp 9 của `TimelinePlot` KHÔNG CÒN, và `plotBottom` bơm vào đây thay cho
// nó. Cả sáu dấu của một mốc giờ ở cùng một chỗ — chia dấu của cùng một mốc ra hai file đúng
// là cái đã làm hai lớp KỀ NHAU của cùng đồ thị trôi khỏi nhau về độ mờ (Finding 6, review
// cuối nhánh 2026-09-09).
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
//    nằm ở `TimelinePlot` (`visibleEvents`, một chỗ duy nhất).
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
//
// 5. NHÃN CHỈ HIỆN Ở MỐC ĐANG CHỌN. Bản mẫu C (nhãn ở MỌI mốc) đọc được tên mà không phải
//    trỏ chuột, nhưng mười mốc là mười nhãn chồng lên nhau và phải đẩy thêm hàng icon, tức
//    vùng vẽ tụt xuống. Người dùng chọn "B kết hợp C": lấy cái nhãn, nhưng đúng một cái tại
//    một thời điểm. Nhãn `aria-hidden` và `pointer-events-none` — tên đã nằm trong
//    `aria-label` của chính cái ghim, và nó không được đứng chắn cử chỉ kéo.
import type { CSSProperties } from 'react'
import { EventIcon } from './eventIcons'
import { isActivationKey } from './keyboardActivation'
import { eventTint } from './planColors'
import { PIN_END_W, PIN_ROW_H, PIN_TOP, PIN_W, magnetToPhaseStart, pinEndX } from './plotFrame'
import { useYearDrag } from './useYearDrag'

/**
 * HÌNH của các dấu, PIXEL — cùng hệ đo với `PIN_W`/`PIN_END_W` ở `plotFrame.ts` (lời ghi ở
 * đó nói vì sao bộ dấu trên đồ thị CỐ Ý không quy ra `rem`).
 *
 * Vì sao khai ở đây mà không ở `plotFrame.ts`: file đó giữ hình của cái KHUNG, tức những số
 * mà `TimelinePlot` và `PhaseLane` cũng phải đo để khớp với nhau. Sáu số dưới đây không ai
 * ngoài file này đọc; đẩy sang `plotFrame` là thêm sáu cái núm vào một file mà hai component
 * khác đang phải đọc, và `plotFrame` càng rộng thì càng khó thấy phần thật sự dùng chung.
 */
const SPAN_H = 10
const GRIP_W = 6
const GRIP_H = 16
const STEM_H = 14
const ANCHOR_W = 2
const ANCHOR_H = 8
/**
 * Bề rộng TỐI ĐA của nhãn mốc đang chọn — và cũng là ngưỡng lật nhãn sang bên trái.
 *
 * Hai việc CÙNG một con số là cố ý: hộp vẽ không `overflow-hidden` (xem `pinEndX` ở
 * `plotFrame.ts`), nên một nhãn dài ở mốc sát mép phải sẽ hiện đè lên cột dock. Nhãn bị cắt
 * ở đúng con số dùng để quyết định lật thì phép lật ĐÚNG TUYỆT ĐỐI, không phải một phỏng
 * đoán về chiều dài chữ — thứ vốn không đo được trước khi trình duyệt vẽ, và còn đổi theo
 * Cỡ chữ ở Cài đặt.
 */
const LABEL_MAX_W = 160

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
  /**
   * Đáy vùng vẽ, PIXEL trong hộp đã đo — vạch chân trục của mỗi mốc dựng lên từ đây.
   *
   * Bơm vào chứ không tự tính lại: `plotBottom` suy từ SỐ HÀNG ICON, mà số hàng lại do
   * chính lớp phủ này quyết định, nên `TimelinePlot` là chỗ duy nhất biết cả hai đầu (xem
   * lời ghi "Icon mốc" trong `Props` của nó).
   */
  plotBottom: number
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
  plotBottom,
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
        // Màu VÀ độ mờ đều từ `eventTint` (planColors.ts) — chỗ DUY NHẤT khai luật "màu
        // riêng của mốc thắng màu theo Thu/Chi" (migration 0067) cùng cặp độ mờ bật/tắt
        // (0063). Tô TƯƠI — màu đặc của bảng biểu đồ — trong khi chặng tô TRẦM (spec §8):
        // hai cách tô từ cùng bảy khoá màu là cách người dùng phân biệt mốc với chặng chỉ
        // bằng mắt. Ba bản chép của phép này từng lệch nhau về ĐỘ MỜ ngay giữa hai lớp kề
        // nhau của cùng đồ thị (phát hiện review cuối nhánh 2026-09-09, Finding 6).
        const tint = eventTint(e.color, e.kind, e.enabled)
        const mau = tint.color
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
            {/* CUỐNG GHIM — nét 1px thõng xuống dưới vòng tròn, dài `STEM_H`, không chạm tới
                đâu cả. Việc của nó là làm cái ghim trông như đang CẮM vào trục chứ không
                phải nổi lơ lửng; mắt tự nối tiếp xuống vạch chân cùng màu bên dưới.

                Cuống của một mốc hàng trên có thể đi ngang qua chỗ icon của mốc hàng dưới
                (hai hàng chỉ cách nhau `PIN_ROW_H` = 26px cho icon 24px, nên mọi cuống đều
                lấn sang hàng sau). Không sao: từ bản này icon là vòng TÔ ĐẶC và nằm ở
                `z-20`, còn cuống ở `z-10` — nó bị che, không lòi ra giữa icon.

                `motion-block` (và `drag.dragging ? '' :`) giống HỆT cái ghim, và bốn dấu
                dưới đây đều phải mang nó. Đo được lúc kiểm bản này: ghim có chuyển động
                180ms trên `left`, nên khi dời năm bằng ←/→ nó TRƯỢT tới chỗ mới, còn cuống
                /vạch chân/nang không có `transition` thì NHẢY — giữa hai thứ đó là 180ms
                mà một cái mốc bị xé làm hai chỗ. (Thanh 2px cũ cũng đã sai như vậy, chỉ là
                một sợi chỉ mảnh thì không ai thấy.) */}
            <div
              aria-hidden
              className={`absolute z-10 ${drag.dragging ? '' : 'motion-block'}`}
              style={{
                top: top + PIN_W,
                left: cx,
                marginLeft: -0.5,
                width: 1,
                height: STEM_H,
                background: mau,
                opacity: tint.opacity,
              }}
            />

            {/* VẠCH CHÂN TRỤC — dấu DUY NHẤT nói chính xác "mốc này ở năm nào" sau khi vạch
                gạch dọc suốt chiều cao bị bỏ. Vì thế nó tô ĐẶC (`anchorOpacity`), khác mọi
                dấu còn lại: 8 pixel mà còn mờ nữa, lại nằm trên vùng màu chặng ở chân đồ
                thị, thì không đọc được.

                Dựng LÊN từ `plotBottom` chứ không thõng xuống từ vùng vẽ: `plotBottom` là
                đúng đường trục, nên vạch nằm gọn TRONG vùng vẽ và không bao giờ đè lên nhãn
                năm phía dưới. */}
            <div
              aria-hidden
              className={`absolute z-10 ${drag.dragging ? '' : 'motion-block'}`}
              style={{
                top: plotBottom - ANCHOR_H,
                left: cx,
                marginLeft: -ANCHOR_W / 2,
                width: ANCHOR_W,
                height: ANCHOR_H,
                background: mau,
                opacity: tint.anchorOpacity,
              }}
            />

            {/* Thanh độ dài. `aria-hidden` vì khoảng năm đã nằm trong tên của chính icon —
                đọc lại bằng một phần tử riêng là nghe hai lần cùng một thứ.
                Vẽ cho CẢ mốc tới hết đời (chạy tới mép phải), chỉ cái CHỐT là không có. */}
            {(coChot || e.endYear === null) && (
              <div
                aria-hidden
                className={`absolute z-10 rounded-full ${drag.dragging ? '' : 'motion-block'}`}
                style={{
                  top: top + (PIN_W - SPAN_H) / 2,
                  // BẮT ĐẦU ở `cx`, tức LUỒN vào dưới cái ghim (ghim `z-20`, nang `z-10`)
                  // chứ không nối vào mép phải của nó như thanh 2px cũ. Nang dày 10px thì
                  // một khe hở 1px giữa nó và ghim đọc thành hai vật rời nhau; luồn vào
                  // dưới thì ghim và nang là MỘT hình, đúng ý "ghim có đuôi".
                  left: cx,
                  width: Math.max(
                    SPAN_H,
                    (e.endYear === null ? rightEdge : endX) - cx,
                  ),
                  height: SPAN_H,
                  background: mau,
                  opacity: tint.spanOpacity,
                  ...(e.endYear === null && {
                    // Mờ dần ở mép phải: một đầu cắt vuông ở đúng mép vùng vẽ đọc như "kết
                    // thúc ở năm cuối đồ thị", mà không phải (LifetimeChartCard:1207).
                    maskImage: 'linear-gradient(to right, #000 55%, transparent)',
                    WebkitMaskImage: 'linear-gradient(to right, #000 55%, transparent)',
                  }),
                }}
              />
            )}

            {/* Icon mốc — `<button>` thật: Tab tới được, ←/→ dời năm. Một `<circle>` trong
                SVG thì không có thứ nào trong hai thứ đó.

                Enter/Space "bấm được" KHÔNG PHẢI miễn phí từ chính `<button>`: bấm/kéo ở
                đây đi qua `useYearDrag` (`onPointerDown`/`{...drag.surface}`), không có
                `onClick` React nào cả, nên phím Enter/Space (dispatch `click` gốc, không
                phải `pointerdown`/`pointerup`) không tự gọi tới `onToggle`. Phát hiện
                review 2026-09-09, Finding 1 (CRITICAL): dòng comment này từng khẳng định
                sai — Enter/Space thật ra không làm gì. Sửa bằng nhánh `isActivationKey`
                đầu `onKeyDown` bên dưới; dòng comment này giờ mới đúng với code thật. */}
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
                  background: mau,
                  color: tint.ink,
                  // Bắt buộc cho bút và cảm ứng: không có nó thì cử chỉ kéo bị trình duyệt
                  // nuốt thành cuộn trang trước khi `pointermove` kịp chạy.
                  touchAction: 'none',
                } as CSSProperties
              }
              // TÔ ĐẶC bằng chính màu của mốc, icon ĐỤC NGƯỢC ra bằng `tint.ink` (2026-09-10).
              // Bản trước là vòng RỖNG: viền 1px màu mốc trên nền `bg-surface-chrome`, và ở
              // 24px cái viền đó mảnh tới mức màu gần như không đọc ra — chỗ yếu người dùng
              // chỉ thẳng ra khi xem ảnh màn hình. Không dùng "màu mốc pha 14%" như bản vẽ vì
              // bảng màu của app lưu KHOÁ rồi tra ra biến CSS, mà `var()` không ghép được
              // alpha vào; pha alpha lên đường đồ thị chạy ngay dưới thì ra một màu thứ ba
              // không ai đo. Nền đặc thì không có màu thứ ba nào, và `tint.ink` đã được đo
              // tương phản cho CẢ bảy màu ở cả hai chế độ (xem `planColors.ts`).
              //
              // `motion-block` chỉ khi KHÔNG kéo: bỏ class chứ không đè thời lượng, nên nó
              // không đá nhau với `prefers-reduced-motion` (xem index.css và PhaseLane).
              className={`absolute z-20 flex -translate-x-1/2 items-center justify-center rounded-full shadow-sm ${
                drag.dragging ? '' : 'motion-block'
              } ${selectedId === e.id ? 'ring-2 ring-accent' : ''} ${off ? 'opacity-50' : ''}`}
              onPointerDown={(ev) => drag.start({ id: e.id, mode: 'pin' }, ev)}
              {...drag.surface}
              onKeyDown={(ev) => {
                // Bàn phím phải làm được đúng việc mà chuột làm bằng cách bấm/kéo — repo
                // này coi một tương tác chỉ-dùng-chuột là một lỗi
                // (LifetimeChartCard.tsx:1358).
                //
                // Enter/Space TRƯỚC nhánh ←/→ (Finding 1, review 2026-09-09, CRITICAL):
                // xem lời ghi ở `isActivationKey` và ở comment ngay trên icon này —
                // `useYearDrag` chỉ nhận pointer, không có `onClick` React nào để phím Enter
                // /Space rơi vào.
                if (isActivationKey(ev.key)) {
                  ev.preventDefault()
                  onToggle?.(e.id)
                  return
                }
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
                  className="pointer-events-none absolute inset-x-1 top-1/2 h-px -translate-y-1/2"
                  // Cùng MỰC với icon, không phải `bg-fg-muted` như trước: nền của vòng nay
                  // là màu đặc của mốc, và một vạch xám trên nền đó thì chìm mất.
                  style={{ background: tint.ink }}
                />
              )}
            </button>

            {/* NHÃN — chỉ ở mốc ĐANG CHỌN (luật 5 ở đầu file). Nền `bg-surface-chrome` đặc
                vì nó nằm ngay trên đường tài sản và trên viên nang; nền trong suốt thì chữ
                11px đọc trên một cái đường gạch đứt là không đọc được.

                LẬT sang trái khi nhãn (rộng tối đa `LABEL_MAX_W`) không còn đủ chỗ tới mép
                phải vùng vẽ — xem lời ghi ở `LABEL_MAX_W` về việc vì sao cắt chữ và ngưỡng
                lật phải là CÙNG một con số. */}
            {selectedId === e.id &&
              (() => {
                const traiPhai = cx + PIN_W / 2 + 4
                const lat = traiPhai + LABEL_MAX_W > rightEdge
                return (
                  <span
                    aria-hidden
                    className={`pointer-events-none absolute z-20 overflow-hidden text-ellipsis whitespace-nowrap rounded-full bg-surface-chrome px-1.5 py-0.5 text-2xs ${
                      drag.dragging ? '' : 'motion-block'
                    }`}
                    style={{
                      top: top + PIN_W / 2,
                      left: lat ? cx - PIN_W / 2 - 4 : traiPhai,
                      maxWidth: LABEL_MAX_W,
                      transform: lat ? 'translate(-100%, -50%)' : 'translateY(-50%)',
                      color: mau,
                    }}
                  >
                    {e.label} · {khoang}
                  </span>
                )
              })()}

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
                    touchAction: 'none',
                    cursor: 'ew-resize',
                  } as CSSProperties
                }
                // HỘP BẤM vẫn 18×18 và vẫn trong suốt hoàn toàn — chỉ cái NẮM 6×16 bên
                // trong là thấy được. Giữ hộp to hơn hình là cố ý: một mục tiêu 6px ngang
                // thì gần như không kéo nổi bằng bút hay ngón tay, mà 18×18 đúng bằng vùng
                // bấm đã có từ trước nên không ai mất cái gì.
                className={`absolute z-20 flex -translate-x-1/2 items-center justify-center ${
                  drag.dragging ? '' : 'motion-block'
                } ${off ? 'opacity-50' : ''}`}
                onPointerDown={(ev) => drag.start({ id: e.id, mode: 'end' }, ev)}
                {...drag.surface}
                onKeyDown={(ev) => {
                  // Enter/Space TRƯỚC nhánh ←/→ (Finding 1, cùng lý do ở icon mốc phía
                  // trên). QUYẾT ĐỊNH cho chốt này cụ thể: bật/tắt lựa chọn của CHÍNH mốc
                  // (`onToggle(e.id)`), không phải "không làm gì" — đây không phải một lựa
                  // chọn tuỳ ý, nó khớp đúng hành vi CHUỘT đã có từ trước: `drag` ở trên là
                  // MỘT instance `useYearDrag` dùng chung cho cả icon lẫn chốt
                  // (`mode: 'pin' | 'end'`), và `onClick: (k) => onToggle?.(k.id)` của nó
                  // gọi `onToggle` theo `id` bất kể `mode` — tức BẤM CHUỘT (không kéo) vào
                  // chốt đã luôn mở/đóng bảng sửa của mốc, y hệt bấm vào icon. Không có khái
                  // niệm "chốt đang được chọn" tách khỏi "mốc đang được chọn" (`selectedId`
                  // so theo `id` của mốc, không so theo `mode`), nên Enter ở đây khớp đúng
                  // với cùng một điểm chọn mà bàn phím đã tới qua icon.
                  if (isActivationKey(ev.key)) {
                    ev.preventDefault()
                    onToggle?.(e.id)
                    return
                  }
                  if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return
                  ev.preventDefault()
                  onMoveEnd?.(e.id, (e.endYear as number) + (ev.key === 'ArrowLeft' ? -1 : 1))
                }}
              >
                {/* NẮM KÉO 6×16px tô đặc — bản trước là một vòng tròn rỗng 18px có vạch
                    2×9 ở giữa. Cùng lý do với cái ghim: viền 1px không đọc ra màu. Hình dẹt
                    và dựng đứng nói "kéo ngang" rõ hơn một vòng tròn, và nó ngồi đúng lên
                    đuôi viên nang nên hai thứ đọc thành một. */}
                <span
                  aria-hidden
                  className="rounded-full"
                  style={{ width: GRIP_W, height: GRIP_H, background: mau }}
                />
              </button>
            )}
          </div>
        )
      })}
    </>
  )
}
