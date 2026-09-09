// Cầm nắm dùng chung cho MỌI thứ kéo được trên trục năm của console Tương lai: khối
// chặng đời và hai mép của nó (`PhaseLane`), icon mốc và chốt kết thúc (`EventPins`).
//
// VÌ SAO KHÔNG DÙNG `src/hooks/useDragPointer.ts`. Hook đó là cầm nắm của KÉO–THẢ DANH
// SÁCH (DragList, Danh mục, Tài sản): nó tự cuộn khi con trỏ vào dải 72px sát mép cửa sổ,
// đo cả trục dọc, và đòi spread một bộ `surface` lên phần tử BỌC vì hàng đang kéo có thể
// bị React dựng lại ở chỗ khác. Ở đây không có thứ nào trong ba thứ đó: trục là NGANG, đối
// tượng không đổi cha khi năm đổi, và tự cuộn trang giữa lúc kéo một khối chặng là kéo cả
// đồ thị ra khỏi màn hình. Ngưỡng nhấc của nó cũng khác (4px cho chuột) — bản vẽ chốt 6px
// cho màn này.
//
// BA THỨ PHẢI CÓ, cả ba đều là lời ghi của bản vẽ (README "Khối chặng đời", spec §11):
//   1. `stopPropagation` ở mép — không thì khối ngoài giành mất cử chỉ.
//   2. `setPointerCapture` — kéo ra ngoài phần tử không rớt.
//   3. Gộp theo nhịp khung hình — chuột bắn ~120 sự kiện/giây, màn vẽ 60.
import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'

/**
 * Ngưỡng phân biệt BẤM với KÉO, đơn vị PIXEL và cố ý giữ nguyên px (spec §5, bảng quy
 * đổi: "ngưỡng phân biệt bấm/kéo 6px — giữ px, đây là khoảng cách con trỏ, không phải cỡ
 * layout"). Quy nó về `rem` là để Cài đặt → Cỡ chữ đổi độ nhạy của con chuột.
 *
 * MỘT con số cho mọi loại con trỏ, khác `useDragPointer` (4px chuột / 6px cảm ứng): màn
 * này bị `xl:` chặn dưới 1280px nên con trỏ ở đây là chuột hoặc bút, không có ngón tay
 * (xem lời ghi vùng chạm ở `PhaseLane`).
 */
export const DRAG_LIFT_PX = 6

interface Options<K> {
  /**
   * `clientX` → năm trên trục, ĐÃ kẹp trong khung nhìn. Chỗ gọi tự trừ gốc toạ độ của
   * hộp (`getBoundingClientRect().left`) vì chỉ nó biết mình đo trong hộp nào.
   *
   * Đọc qua ref ở mỗi khung hình, nên nó được phép đổi giữa lúc kéo (đổi zoom bằng bàn
   * phím, cửa sổ đổi bề ngang) mà không phải khởi động lại cử chỉ.
   */
  yearAt: (clientX: number) => number
  /**
   * Con trỏ vừa qua ngưỡng — đây là chỗ chọn đối tượng, không phải lúc NHẤN.
   *
   * Vì sao không chọn ngay lúc nhấn (bản vẽ chọn ở `startDrag`, dòng 1201): chọn lúc nhấn
   * thì một cú BẤM không còn tắt được lựa chọn — `onClick` bên dưới muốn bật/tắt, mà thứ
   * nó phải tắt thì đã bị chính cú nhấn bật lên. Chọn ở ngưỡng nhấc cho cả hai: kéo thì
   * dock đi theo thứ đang kéo, bấm thì bật/tắt.
   */
  onLift?: (key: K) => void
  /**
   * Kéo tới `year`. `grabYear` = năm dưới con trỏ lúc NHẤN, để chỗ gọi kéo được theo
   * ĐỘ LỆCH (dời cả khối chặng) chứ không chỉ theo vị trí tuyệt đối (kéo một mép).
   */
  onDrag: (key: K, year: number, grabYear: number) => void
  /** Nhấn rồi thả mà chưa qua ngưỡng — một cú BẤM, không phải một lượt kéo. */
  onClick?: (key: K) => void
}

interface Press<K> {
  id: number
  key: K
  x0: number
  grabYear: number
  lifted: boolean
}

export function useYearDrag<K>({ yearAt, onLift, onDrag, onClick }: Options<K>) {
  /** Có đang kéo hay không — chỗ gọi TẮT TRANSITION khi nó bật (xem `PhaseLane`). */
  const [dragging, setDragging] = useState(false)
  const press = useRef<Press<K> | null>(null)
  /**
   * `clientX` MỚI NHẤT. Đây là chỗ khác biệt với một cái throttle rAF viết vội: giữ
   * nguyên sự kiện đầu tiên rồi bỏ hết các sự kiện sau (`if (raf) return` mà không lưu
   * lại x) là vẽ theo một mẫu CŨ — ở tốc độ chuột cao, đối tượng tụt lại sau con trỏ.
   * Lưu x mới nhất rồi đọc trong callback thì mỗi khung hình vẽ đúng vị trí hiện tại.
   */
  const lastX = useRef(0)
  const raf = useRef<number | null>(null)

  // Callback dựng lại mỗi lần render; vòng khung hình đọc qua ref để không phải huỷ–dựng
  // lại giữa cử chỉ (cùng lý do đã ghi ở `useDragPointer`).
  const cb = useRef({ yearAt, onLift, onDrag, onClick })
  useLayoutEffect(() => {
    cb.current = { yearAt, onLift, onDrag, onClick }
  })

  const flush = useCallback(() => {
    const p = press.current
    if (!p || !p.lifted) return
    cb.current.onDrag(p.key, cb.current.yearAt(lastX.current), p.grabYear)
  }, [])

  const start = useCallback((key: K, e: PointerEvent<HTMLElement>) => {
    // Bỏ qua chuột phải/giữa: menu ngữ cảnh không được biến thành một lượt kéo.
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // `stopPropagation` là điều kiện sống của hai cái mép: không có nó thì khối chặng bọc
    // ngoài cũng nhận `pointerdown` và giành mất cử chỉ (README "Khối chặng đời").
    e.stopPropagation()
    // Chặn bôi đen lúc kéo. Hệ quả: trình duyệt không tự đặt tiêu điểm nữa, nên phải gọi
    // `focus()` tay — thiếu bước này là mất luôn đường bàn phím ngay bên dưới.
    e.preventDefault()
    const el = e.currentTarget
    try {
      el.setPointerCapture?.(e.pointerId)
    } catch {
      /* con trỏ đã rời đi trước khi tới đây (chạm rồi nhấc rất nhanh) — vẫn kéo được */
    }
    el.focus?.()
    lastX.current = e.clientX
    press.current = { id: e.pointerId, key, x0: e.clientX, grabYear: cb.current.yearAt(e.clientX), lifted: false }
  }, [])

  const move = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const p = press.current
      if (!p || e.pointerId !== p.id) return
      lastX.current = e.clientX
      if (!p.lifted) {
        // Chỉ đo trục NGANG, khác `useDragPointer` (đo cả hai trục). Ở đây kéo dọc không
        // đổi được gì, nên coi một cú rê dọc là "đã kéo" chỉ để rồi không làm gì cả —
        // và mất luôn cú bấm mà người dùng đang định làm.
        if (Math.abs(e.clientX - p.x0) < DRAG_LIFT_PX) return
        p.lifted = true
        setDragging(true)
        cb.current.onLift?.(p.key)
      }
      if (raf.current !== null) return
      raf.current = requestAnimationFrame(() => {
        raf.current = null
        flush()
      })
    },
    [flush],
  )

  const end = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const p = press.current
      if (!p || e.pointerId !== p.id) return
      if (raf.current !== null) {
        cancelAnimationFrame(raf.current)
        raf.current = null
      }
      // Vẽ nốt vị trí CUỐI trước khi quên cử chỉ: khung hình đang chờ vừa bị huỷ, và nếu
      // không chốt lại thì lượt kéo dừng ở mẫu của khung trước — lệch tới một năm.
      flush()
      press.current = null
      setDragging(false)
      if (!p.lifted) cb.current.onClick?.(p.key)
    },
    [flush],
  )

  return {
    /** Gắn vào `onPointerDown` của thứ kéo được. */
    start,
    /**
     * Spread vào CHÍNH phần tử đó. Được, vì `setPointerCapture` gắn lên nó: mọi sự kiện
     * con trỏ sau đó đều đổi đích về đây, kể cả khi con trỏ đã ra ngoài màn hình.
     *
     * `onLostPointerCapture: end` (phát hiện review 2026-09-09, Finding 3): một phần tử
     * đang giữ pointer capture mà bị GỠ KHỎI DOM giữa lúc kéo (ví dụ mép chặng ở
     * `PhaseLane` tự ẩn khi khối co dưới `EDGE_MIN_BLOCK_W`, đúng lúc chính mép đó đang bị
     * kéo) thì `pointerup`/`pointercancel` không bao giờ tới được nó nữa — trình duyệt tự
     * nhả capture lúc gỡ và bắn `lostpointercapture` thay vào đó. Không bắt sự kiện này thì
     * `press.current` không được dọn, `dragging` kẹt ở `true` mãi tới lượt bấm/thả kế tiếp,
     * và `motion-block` bị khoá tắt (transition đứng yên) cho tới lúc đó. Dùng chung `end`
     * (không viết một nhánh "huỷ" riêng): `end` đã tự vệ bằng `press.current`/`pointerId`,
     * nên bắn thêm một lần nữa ở ca BÌNH THƯỜNG (trình duyệt cũng bắn
     * `lostpointercapture` ngay sau khi nhả capture ở cuối một lượt kéo hợp lệ) chỉ là một
     * lần gọi rơi vào guard đó, không làm gì thêm — không có `onDrag`/`onClick` gọi kép.
     * Gắn ở ĐÂY (một chỗ trong hook dùng chung) chứ không riêng từng mép: `surface` đã
     * spread lên MỌI phần tử kéo được ở cả `PhaseLane` lẫn `EventPins`, nên sửa một chỗ là
     * chặn được cả lớp lỗi này, không chỉ ca mép chặng đã đo được.
     */
    surface: { onPointerMove: move, onPointerUp: end, onPointerCancel: end, onLostPointerCapture: end },
    /** true trong lúc đang kéo thật (đã qua ngưỡng). */
    dragging,
  }
}
