import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { contentTop, useDragPointer } from '../hooks/useDragPointer'
import type { PointerEvent as ReactPointerEvent } from 'react'

/** Props gắn vào phần tử "tay nắm" để bắt đầu kéo (nhấn giữ & kéo). */
export interface DragHandleProps {
  onPointerDown: (e: ReactPointerEvent) => void
  style: { touchAction: 'none' }
}

interface DragListProps {
  /** Thứ tự id hiện tại (nguồn sự thật khi KHÔNG kéo). */
  ids: string[]
  /** Gọi khi thả và thứ tự đã đổi — trả về mảng id mới. */
  onReorder: (ids: string[]) => void
  /** Class cho container bọc danh sách. */
  className?: string
  /**
   * Vẽ một mục. `handle` phải được spread vào phần tử tay nắm; `dragging`=true
   * cho mục đang được kéo (để tô nổi bật).
   */
  render: (id: string, handle: DragHandleProps, dragging: boolean) => ReactNode
}

/** Vị trí nghỉ của một hàng, đo trong hệ toạ độ NỘI DUNG của container (xem `contentTop`). */
interface Slot {
  id: string
  top: number
  mid: number
}

/**
 * Danh sách kéo–thả sắp thứ tự theo chiều dọc, dùng Pointer Events nên chạy cả
 * chuột lẫn cảm ứng (HTML5 drag không hoạt động trên mobile). Chỉ ghi khi thả và
 * thứ tự thực sự đổi.
 *
 * Hai chuyển động, cố ý khác nhau:
 *
 *   Hàng đang cầm  đi theo ngón tay 1:1, KHÔNG transition. Cho nó chạy 120ms là bắt
 *                  nó lết sau ngón tay đúng 120ms — đó chính là cảm giác giật.
 *   Hàng còn lại   nhường chỗ bằng FLIP 120ms (`--motion-drag`): đổi thứ tự là đổi
 *                  DOM, nên không có gì để nội suy — hàng nhảy sang chỗ mới trong
 *                  một khung hình và mắt không theo được hàng nào vừa đi đâu.
 */
export function DragList({ ids, onReorder, className, render }: DragListProps) {
  // order != null trong lúc kéo (bản nháp cục bộ); null = bám theo props.ids.
  const [order, setOrder] = useState<string[] | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const nodes = useRef(new Map<string, HTMLElement>())
  const slots = useRef<Slot[]>([])
  // Điểm cầm: vị trí con trỏ và vị trí nghỉ của hàng, đều lúc vừa nhấc lên.
  const grab = useRef<{ y: number; top: number } | null>(null)
  const at = useRef(0)
  // Mỗi lượt đo là một "đời". requestAnimationFrame của đời cũ nổ sau khi đời mới đã
  // gán transform mới sẽ xoá luôn transform đó — hàng đứng im giữa lúc phải trôi.
  const gen = useRef(0)

  const list = order ?? ids

  function setNode(id: string, el: HTMLElement | null) {
    if (el) nodes.current.set(id, el)
    else nodes.current.delete(id)
  }

  /** Dán lại thế bám ngón tay cho hàng đang cầm. Ghi thẳng DOM, không qua React. */
  function follow() {
    const root = rootRef.current
    const g = grab.current
    if (!root || !g || dragId == null) return
    const el = nodes.current.get(dragId)
    const slot = slots.current.find((s) => s.id === dragId)
    if (!el || !slot) return
    // Trừ đi phần ô đã tự dịch: hàng đổi chỗ thì ô của nó cũng đi, không trừ ra thì
    // mỗi lần đổi thứ tự hàng lại nhảy thêm một khoảng bằng chiều cao một dòng.
    const dy = at.current - contentTop(root) - g.y - (slot.top - g.top)
    el.style.transition = 'none'
    el.style.transform = `translateY(${dy}px)`
  }

  // Chạy sau MỌI lần render: đo lại vị trí nghỉ, rồi cho các hàng vừa đổi chỗ trôi
  // từ chỗ mắt đang thấy về chỗ mới. Không khai mảng phụ thuộc là cố ý — hiệu ứng tự
  // thoát khi không có gì đổi chỗ, mà điều kiện thật ("thứ tự vừa đổi") thì cả `ids`
  // từ ngoài lẫn `order` trong lúc kéo đều gây ra được.
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const g = ++gen.current

    // 1) Chỗ mắt ĐANG THẤY — tính cả hiệu ứng còn chạy dở. FLIP từ đây chứ không từ
    //    vị trí nghỉ cũ: hàng bị đổi chỗ lần nữa giữa chừng sẽ đi tiếp từ chỗ nó đang
    //    ở, thay vì giật ngược về điểm xuất phát cũ rồi mới chạy.
    const seen = new Map<string, number>()
    for (const [id, el] of nodes.current) seen.set(id, el.getBoundingClientRect().top)

    // 2) Gỡ hết transform để bước 3 đo được bố cục thật.
    for (const [, el] of nodes.current) {
      el.style.transition = 'none'
      el.style.transform = ''
    }

    // 3) Đo vị trí NGHỈ. Mốc chèn sẽ đọc từ đây chứ không đo lại lúc kéo: đo giữa lúc
    //    các hàng đang trôi thì trung điểm nhấp nhô theo hiệu ứng, và danh sách rung
    //    qua rung lại giữa hai vị trí.
    const base = contentTop(root)
    const next: Slot[] = []
    for (const id of list) {
      const el = nodes.current.get(id)
      if (!el) continue
      const r = el.getBoundingClientRect()
      const top = r.top - base
      next.push({ id, top, mid: top + r.height / 2 })
    }
    slots.current = next
    const restById = new Map(next.map((s) => [s.id, s.top + base]))

    // 4) Dịch ngược về chỗ vừa thấy, rồi thả cho chạy về 0.
    for (const [id, el] of nodes.current) {
      if (id === dragId) continue
      const from = seen.get(id)
      const to = restById.get(id)
      if (from === undefined || to === undefined || Math.abs(from - to) < 0.5) continue
      el.style.transform = `translateY(${from - to}px)`
      requestAnimationFrame(() => {
        if (gen.current !== g) return
        el.style.transition = 'transform var(--motion-drag) var(--ease-out)'
        el.style.transform = ''
      })
    }

    // 5) Hàng đang cầm: bước 2 vừa xoá thế bám ngón tay của nó, dán lại ngay trong
    //    cùng một lượt bố cục nên mắt không kịp thấy nó nhấp nháy về ô.
    if (dragId != null) follow()
  })

  const drag = useDragPointer<string>({
    withinRef: rootRef,
    onLift(id, _x, y) {
      const root = rootRef.current
      if (!root) return
      // Đo lại tại chỗ: có thể vừa thả xong lượt trước và hiệu ứng trôi về còn chạy,
      // hoặc bố cục đã đổi mà không kèm lần render nào (ảnh vừa tải xong chẳng hạn).
      for (const [, el] of nodes.current) {
        el.style.transition = 'none'
        el.style.transform = ''
      }
      const base = contentTop(root)
      slots.current = ids.flatMap((k) => {
        const el = nodes.current.get(k)
        if (!el) return []
        const r = el.getBoundingClientRect()
        const top = r.top - base
        return [{ id: k, top, mid: top + r.height / 2 }]
      })
      at.current = y
      grab.current = {
        y: y - base,
        top: slots.current.find((s) => s.id === id)?.top ?? 0,
      }
      setDragId(id)
      setOrder([...ids])
    },
    onMove(_x, y) {
      const root = rootRef.current
      if (!root || dragId == null) return
      at.current = y
      follow()
      const cur = order ?? ids
      const py = y - contentTop(root)
      const others = slots.current.filter((s) => s.id !== dragId)
      // Vị trí chèn = số hàng khác có trung điểm nằm trên con trỏ.
      let to = others.length
      for (let i = 0; i < others.length; i++) {
        if (py < others[i].mid) {
          to = i
          break
        }
      }
      const next = cur.filter((id) => id !== dragId)
      next.splice(to, 0, dragId)
      if (next.some((id, i) => id !== cur[i])) setOrder(next)
    },
    onDrop(lifted) {
      grab.current = null
      if (!lifted) return
      const final = order ?? ids
      const changed = final.length === ids.length && final.some((id, i) => id !== ids[i])
      // Xoá dragId là đủ để hàng trôi về chỗ: lượt bố cục ngay sau đó thấy nó không
      // còn được miễn FLIP nữa, đo được nó đang lệch, và cho nó chạy về 0.
      setDragId(null)
      setOrder(null)
      if (changed) onReorder(final)
    },
  })

  return (
    <div ref={rootRef} className={className} {...drag.surface}>
      {list.map((id) => (
        <div
          key={id}
          ref={(el) => setNode(id, el)}
          // scale 1.01 nằm ở ĐÂY chứ không ở ba nơi gọi: §12 gán nó cho "dòng đang kéo"
          // chứ cho một loại nội dung nào, mà `dragging` thì cả ba nơi gọi đều đã dùng
          // để tô shadow — thêm một phần trăm phóng vào từng nơi là ba lần chép cùng một
          // luật. 1% là ngưỡng "cầm lên rồi" mà không phóng to đến mức chữ nhoè.
          className={id === dragId ? 'relative z-10 scale-[1.01] will-change-transform' : undefined}
        >
          {render(
            id,
            { onPointerDown: (e) => drag.start(id, e), style: { touchAction: 'none' } },
            id === dragId,
          )}
        </div>
      ))}
    </div>
  )
}
