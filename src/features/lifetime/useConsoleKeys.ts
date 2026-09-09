// Lớp bàn phím của console Tương lai — chỉ NỐI DÂY. Mọi quyết định "phím này làm gì"
// nằm ở `consoleKeys.ts` (thuần, có phép thử bằng số); đây chỉ là chỗ gắn nghe sự kiện.
//
// BA THỨ ĐÃ CÂN NHẮC, ĐỪNG LÀM NGƯỢC LẠI
//
// 1. NGHE Ở `window`, không phải trên một hộp có `tabIndex`. Bấm nền đồ thị không đặt
//    tiêu điểm vào đâu cả (`TimelinePlot` là một `<div>` không focus được — và cho nó
//    `tabIndex` là thêm một điểm dừng Tab không đọc ra được gì), nên một listener theo
//    tiêu điểm sẽ im lặng đúng lúc người dùng vừa bấm xong.
//
// 2. `e.defaultPrevented` LÀ đường phân chia với các phần tử tự lo phím. Khối chặng
//    (`PhaseLane`) và icon mốc (`EventPins`) đã tự bắt ←/→ và Enter/Space trên CHÍNH
//    chúng, và cả hai gọi `preventDefault()`. React gắn listener ở gốc cây (một phần tử
//    con của `document`), nên handler của chúng chạy TRƯỚC listener ở `window` trong pha
//    nổi bọt — tới đây thì `defaultPrevented` đã bật, và một cú → trên khối chặng đang có
//    tiêu điểm chỉ dời MỘT năm chứ không phải hai. Không có cờ này thì mỗi phím đi qua hai
//    đường và không có phép thử nào ở repo này thấy được (không có công cụ test DOM).
//
// 3. `preventDefault` cho mọi phím ĐÃ NHẬN. Không có nó thì ←/→ cuộn trang ngang trong lúc
//    dời mốc, Backspace lùi lịch sử trên vài trình duyệt, và `⌘Z` gọi luôn lệnh hoàn tác
//    của chính trình duyệt lên ô nhập vừa gõ.
import { useEffect, useRef } from 'react'
import { consoleKeyAction, isEditableTarget } from './consoleKeys'

export interface ConsoleKeyHandlers {
  /** `Esc` — chỗ gọi tự quyết đóng cái gì trước (bảng nhanh → gợi ý → bỏ chọn). */
  onClose: () => void
  /** `Delete`/`Backspace` — xoá thứ đang chọn. Chỗ gọi phải chụp bản hoàn tác TRƯỚC. */
  onDelete: () => void
  onUndo: () => void
  /** `←`/`→` — dời thứ đang chọn một năm, hoặc vạch rê chuột khi không chọn gì. */
  onNudge: (step: -1 | 1) => void
}

export function useConsoleKeys(handlers: ConsoleKeyHandlers): void {
  // Đọc qua ref: bộ handler dựng lại mỗi lần render (chúng đóng gói `working`, `sel`…),
  // và gỡ–gắn lại listener ở mỗi lần render là một cửa sổ nhỏ không nghe gì — vừa đủ để
  // mất một cú bấm phím ngay sau một thao tác. Cùng idiom với `useYearDrag`.
  const cb = useRef(handlers)
  cb.current = handlers

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Xem lời ghi 2 ở đầu file: phần tử tự lo phím đã gọi `preventDefault`.
      if (e.defaultPrevented) return
      const action = consoleKeyAction({
        key: e.key,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        editable: isEditableTarget(e.target),
      })
      if (action.type === 'none') return
      e.preventDefault()
      if (action.type === 'close') cb.current.onClose()
      else if (action.type === 'delete') cb.current.onDelete()
      else if (action.type === 'undo') cb.current.onUndo()
      else cb.current.onNudge(action.step)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
