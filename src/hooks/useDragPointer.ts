import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'

/**
 * Ngưỡng "đã nhấc lên": phải đi quá chừng này mới coi là kéo. Không có ngưỡng thì
 * chạm hụt vào tay nắm cũng làm cả danh sách nhúc nhích một cái.
 *
 * Chuột trỏ đúng điểm nên 4px là đủ; ngón tay bao giờ cũng rê vài pixel lúc đặt
 * xuống nên phải nới ra 6px, không thì vuốt để cuộn trang lại hoá thành kéo.
 */
const LIFT_PX: Record<string, number> = { mouse: 4, pen: 4, touch: 6 }

/** Dải sát mép mà kéo vào đó thì tự cuộn, và tốc độ cuộn ở ngay sát mép (px/khung). */
const EDGE_BAND = 72
const EDGE_SPEED = 16

interface DragPointerOptions<K> {
  /** Con trỏ đã đi quá ngưỡng — kéo bắt đầu từ đây, không phải từ lúc nhấn. */
  onLift: (key: K, x: number, y: number) => void
  /**
   * Gọi tối đa MỘT lần mỗi khung hình, kèm vị trí con trỏ hiện tại. Cũng được gọi
   * khi ngón tay đứng yên mà trang đang tự cuộn — lúc đó vị trí tương đối vẫn đổi.
   */
  onMove: (x: number, y: number) => void
  /**
   * Thả tay (kể cả bị huỷ). `lifted` = đã thực sự kéo, phân biệt với chạm hụt; `key`
   * là thứ đã nhấn xuống — có cả khi KHÔNG nhấc lên, nên nhánh "bấm chứ không kéo"
   * vẫn biết mình vừa bấm vào cái gì.
   */
  onDrop: (lifted: boolean, key: K) => void
  /**
   * Phần tử bọc danh sách — chính là nơi spread `surface`. Dùng vào hai việc: giữ con
   * trỏ trong suốt lượt kéo (xem `start`), và làm điểm xuất phát để dò ngược lên tìm
   * vùng cuộn thật, nên nơi gọi không phải biết mình đang nằm trong khung cuộn riêng
   * hay chỉ cuộn cả trang.
   */
  withinRef?: RefObject<HTMLElement | null>
}

interface Press<K> {
  id: number
  key: K
  x0: number
  y0: number
  x: number
  y: number
  need: number
  lifted: boolean
}

/**
 * Phần "cầm nắm" dùng chung của mọi chỗ kéo–thả: ngưỡng nhấc, gộp theo khung hình,
 * và tự cuộn khi kéo tới mép. Cố ý KHÔNG biết gì về danh sách hay thứ tự — chỗ nào
 * kéo dọc một cột, chỗ nào kéo xuyên nhóm là việc của nơi gọi.
 *
 * Vì sao phải gộp theo khung hình: chuột bắn ra ~120 sự kiện/giây (chuột cao cấp còn
 * hơn) mà màn hình chỉ vẽ 60 — xử lý từng sự kiện là tính bỏ đi quá nửa, và mỗi lần
 * tính lại kéo theo một lượt đọc bố cục. Gộp lại còn đúng một lượt mỗi khung.
 */
export function useDragPointer<K>({ onLift, onMove, onDrop, withinRef }: DragPointerOptions<K>) {
  const [lifted, setLifted] = useState(false)
  const press = useRef<Press<K> | null>(null)
  const dirty = useRef(false)
  // Vùng cuộn, dò một lần lúc nhấc lên: dò lại mỗi khung là 60 lần đọc style/giây.
  const scroller = useRef<HTMLElement | null>(null)

  // Ba callback được dựng lại mỗi lần render. Vòng lặp khung hình bên dưới đọc chúng
  // qua ref để không phải huỷ–dựng lại vòng lặp giữa chừng (dựng lại là mất một khung).
  const cb = useRef({ onLift, onMove, onDrop })
  useLayoutEffect(() => {
    cb.current = { onLift, onMove, onDrop }
  })

  useEffect(() => {
    if (!lifted) return
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const p = press.current
      if (!p) return
      const box = scroller.current
      const dy = edgeScroll(p.y, box)
      if (dy !== 0) {
        if (box) box.scrollTop += dy
        else window.scrollBy(0, dy)
        dirty.current = true
      }
      if (!dirty.current) return
      dirty.current = false
      cb.current.onMove(p.x, p.y)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [lifted])

  const start = useCallback((key: K, e: ReactPointerEvent) => {
    // Bỏ qua chuột phải/giữa; cảm ứng & chuột trái thì kéo.
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    // Bắt con trỏ vào PHẦN TỬ BỌC, không vào tay nắm: kéo một thẻ sang nhóm khác thì
    // React dựng lại cả dòng ở chỗ mới, tay nắm cũ biến mất giữa chừng — mà mất phần
    // tử đang giữ con trỏ là mất luôn `pointerup`, thả tay xong thẻ vẫn dính ngón.
    // Phần tử bọc thì không bao giờ bị thay.
    //
    // try/catch: ném NotFoundError nếu con trỏ đã rời đi trước khi tới đây (chạm rồi
    // nhấc thật nhanh). Không bắt thì cả lượt nhấn hỏng.
    try {
      const host = withinRef?.current ?? (e.currentTarget as HTMLElement)
      host.setPointerCapture?.(e.pointerId)
    } catch {
      /* không bắt được con trỏ thì vẫn kéo được, chỉ kém bền khi ra khỏi phần tử */
    }
    press.current = {
      id: e.pointerId,
      key,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      need: LIFT_PX[e.pointerType] ?? 4,
      lifted: false,
    }
  }, [withinRef])

  const move = useCallback((e: ReactPointerEvent) => {
    const p = press.current
    if (!p || e.pointerId !== p.id) return
    p.x = e.clientX
    p.y = e.clientY
    dirty.current = true
    if (p.lifted) return
    if (Math.hypot(p.x - p.x0, p.y - p.y0) < p.need) return
    p.lifted = true
    scroller.current = scrollerOf(withinRef?.current ?? null)
    cb.current.onLift(p.key, p.x, p.y)
    setLifted(true)
  }, [withinRef])

  const end = useCallback((e: ReactPointerEvent) => {
    const p = press.current
    if (!p || e.pointerId !== p.id) return
    press.current = null
    dirty.current = false
    setLifted(false)
    cb.current.onDrop(p.lifted, p.key)
  }, [])

  return {
    /** Gắn vào `onPointerDown` của tay nắm. */
    start,
    /** Spread vào phần tử bọc — nơi sự kiện con trỏ nổi lên tới. */
    surface: { onPointerMove: move, onPointerUp: end, onPointerCancel: end },
    /** true khi đã qua ngưỡng và đang thực sự kéo. */
    lifted,
  }
}

/**
 * Gốc toạ độ của phần NỘI DUNG trong `el`, tính theo hệ của màn hình.
 *
 * Mọi phép đo lúc kéo đều quy về hệ này để bất biến với cuộn — cả cuộn trang lẫn cuộn
 * ngay trong container. Trừ `scrollTop` ra là được cả hai: container cuộn trong lòng nó
 * thì `rect.top` đứng yên còn các hàng con đi, và hiệu số này bù đúng phần đó.
 */
export function contentTop(el: HTMLElement) {
  return el.getBoundingClientRect().top - el.scrollTop
}

/** Vùng cuộn gần nhất bọc `el`; null = không có, cuộn cả cửa sổ. */
function scrollerOf(el: HTMLElement | null): HTMLElement | null {
  for (let n = el; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY
    if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && n.scrollHeight > n.clientHeight)
      return n
  }
  return null
}

/** Số pixel cần cuộn ở khung này, 0 nếu con trỏ chưa vào dải mép. */
function edgeScroll(y: number, box: HTMLElement | null): number {
  let top = 0
  let bottom = window.innerHeight
  if (box) {
    const r = box.getBoundingClientRect()
    top = r.top
    bottom = r.bottom
  }
  // Càng sát mép càng cuộn nhanh: đi thẳng từ 0 tới EDGE_SPEED trong dải EDGE_BAND.
  if (y < top + EDGE_BAND) {
    const k = Math.min(1, (top + EDGE_BAND - y) / EDGE_BAND)
    return -Math.ceil(k * EDGE_SPEED)
  }
  if (y > bottom - EDGE_BAND) {
    const k = Math.min(1, (y - (bottom - EDGE_BAND)) / EDGE_BAND)
    return Math.ceil(k * EDGE_SPEED)
  }
  return 0
}
