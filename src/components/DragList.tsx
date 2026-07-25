import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

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

/**
 * Danh sách kéo–thả sắp thứ tự theo chiều dọc, dùng Pointer Events nên chạy cả
 * chuột lẫn cảm ứng (HTML5 drag không hoạt động trên mobile). Các mục "trôi" theo
 * ô trống khi kéo (slot-reflow): đo trung điểm từng hàng khác để tìm chỗ chèn nên
 * ổn định, không rung. Chỉ ghi khi thả và thứ tự thực sự đổi.
 */
export function DragList({ ids, onReorder, className, render }: DragListProps) {
  // order != null trong lúc kéo (bản nháp cục bộ); null = bám theo props.ids.
  const [order, setOrder] = useState<string[] | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const nodes = useRef(new Map<string, HTMLElement>())
  const pointerRef = useRef<number | null>(null)

  const list = order ?? ids

  function setNode(id: string, el: HTMLElement | null) {
    if (el) nodes.current.set(id, el)
    else nodes.current.delete(id)
  }

  function onPointerDown(id: string, e: ReactPointerEvent) {
    // Bỏ qua chuột phải/giữa; cảm ứng & chuột trái thì kéo.
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    pointerRef.current = e.pointerId
    setDragId(id)
    setOrder([...ids])
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (dragId == null || e.pointerId !== pointerRef.current) return
    const cur = order ?? ids
    const others = cur.filter((id) => id !== dragId)
    const y = e.clientY
    // Vị trí chèn = số hàng khác có trung điểm nằm trên con trỏ.
    let to = others.length
    for (let i = 0; i < others.length; i++) {
      const el = nodes.current.get(others[i])
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (y < r.top + r.height / 2) {
        to = i
        break
      }
    }
    const next = [...others]
    next.splice(to, 0, dragId)
    if (next.some((id, i) => id !== cur[i])) setOrder(next)
  }

  function end(e: ReactPointerEvent) {
    if (dragId == null) return
    if (pointerRef.current != null && e.pointerId !== pointerRef.current) return
    const final = order ?? ids
    const changed = final.length === ids.length && final.some((id, i) => id !== ids[i])
    setDragId(null)
    setOrder(null)
    pointerRef.current = null
    if (changed) onReorder(final)
  }

  return (
    <div
      className={className}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {list.map((id) => (
        <div
          key={id}
          ref={(el) => setNode(id, el)}
          className={id === dragId ? 'relative z-10' : undefined}
        >
          {render(
            id,
            { onPointerDown: (e) => onPointerDown(id, e), style: { touchAction: 'none' } },
            id === dragId,
          )}
        </div>
      ))}
    </div>
  )
}
