import { useEffect, useRef } from 'react'

/**
 * Bấm Esc để đóng sheet/overlay — dùng chung cho mọi sheet tự dựng
 * (`fixed inset-0 …`), thay vì mỗi sheet tự chép tay (trước đây chỉ nhóm
 * lifetime có, 13 sheet còn lại quên).
 *
 * Lớp phủ CON nằm trên sheet (AccountPicker, hộp thoại confirm/prompt…) phải
 * được đóng TRƯỚC mà không kéo sập sheet mẹ — nếu không, người dùng đang điền
 * form, mở picker, bấm Esc là mất sạch dữ liệu. Quy ước: handler của lớp phủ
 * con nghe ở pha CAPTURE và gọi `e.preventDefault()`; hook này nghe ở pha nổi
 * bọt (mặc định) và bỏ qua sự kiện đã bị chặn.
 */
export function useEscClose(onClose: () => void, enabled = true) {
  const ref = useRef(onClose)
  ref.current = onClose
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) ref.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled])
}
