// Đo một hộp bằng ResizeObserver — dùng chung cho vùng vẽ (`TimelinePlot`) và dải chặng
// đời (`PhaseLane`), hai thứ BẮT BUỘC phải cùng bề ngang để trục năm của chúng khớp nhau.
//
// Tách ra khỏi `TimelinePlot` vì hai lời ghi dưới đây đều là bẫy đã bắt được trên app
// thật, và một bản chép thứ hai là một chỗ để chúng quay lại.
import { useCallback, useRef, useState } from 'react'

export interface BoxSize {
  w: number
  h: number
}

/**
 * `{ box, attachBox }` — gắn `attachBox` vào `ref` của hộp cần đo.
 *
 * ĐO BẰNG REF CALLBACK, KHÔNG BẰNG `useEffect(…, [])`.
 *
 * Bẫy thứ nhất, đã bắt được ở `LifetimeChartCard`: lượt bày ĐẦU tiên có thể chưa có node
 * (nhánh "chưa chiếu được" return sớm), effect chạy, thấy `null`, thoát — và với mảng deps
 * rỗng thì nó KHÔNG BAO GIỜ chạy lại, tức bề ngang kẹt ở giá trị khởi tạo mãi mãi. Ref
 * callback chạy đúng lúc node xuất hiện.
 *
 * Bẫy thứ hai: KHÔNG được thêm một `useEffect` dọn observer. <StrictMode> gắn hai lượt,
 * cleanup của lượt đầu chạy SAU lần gắn thứ hai nên nó ngắt đúng observer vừa tạo — im
 * lặng. React luôn gọi ref callback với `null` khi gỡ, nên nhánh `if (!el)` là chỗ dọn duy
 * nhất cần có.
 *
 * `init` là một cỡ hợp lý để lượt bày đầu không vẽ ra NaN; mọi hàm hình học của màn này tự
 * chịu được cỡ sai, và ResizeObserver sửa lại ngay trong cùng khung hình.
 */
export function useBoxSize(init: BoxSize) {
  const [box, setBox] = useState(init)
  const ref = useRef<HTMLDivElement | null>(null)
  const roRef = useRef<ResizeObserver | null>(null)

  const attachBox = useCallback((el: HTMLDivElement | null) => {
    ref.current = el
    roRef.current?.disconnect()
    roRef.current = null
    if (!el) return
    const doc = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (w > 0 && h > 0) {
        // Ngưỡng 1px: ResizeObserver bắn cả những lượt đổi dưới một pixel (thanh cuộn
        // hiện/ẩn, làm tròn của flex) và `setState` mỗi lượt là một vòng bày-lại vô ích.
        setBox((cu) => (Math.abs(cu.w - w) > 1 || Math.abs(cu.h - h) > 1 ? { w, h } : cu))
      }
    }
    const ro = new ResizeObserver(doc)
    ro.observe(el)
    roRef.current = ro
    doc()
  }, [])

  return { box, boxRef: ref, attachBox }
}
