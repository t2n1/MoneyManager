// Khung lớp phủ cho màn Nhập giao dịch (xem src/lib/entryOverlay.ts để biết khi nào
// kiểu này được dùng). Bản thân nội dung vẫn là <EntryPage> — cùng một form, cùng một
// đường lưu; file này chỉ lo cái hộp và cách đóng nó.
import { useEffect, useRef } from 'react'
import { useNavigate, type Location } from 'react-router-dom'
import { useEscClose } from '../../hooks/useEscClose'
import { hasAppHistory } from '../../lib/appHistory'
import { EntryPage } from './EntryPage'

export function EntrySheet({ background }: { background: Location }) {
  const navigate = useNavigate()

  // Đóng = LÙI một bước, không phải điều hướng tới màn nền: lùi thì trả lại đúng mục
  // lịch sử cũ (giữ chỗ đã cuộn, và không bỏ lại một mục `/entry` chết trong lịch sử).
  // Trừ khi không lùi được — F5 lúc đang mở lớp phủ đưa `/entry` thành mục đầu tiên
  // của tab, lùi ở đó là ra khỏi app. Cùng cách phân biệt với <BackLink>.
  function close() {
    if (hasAppHistory(window.history.state)) navigate(-1)
    else navigate(`${background.pathname}${background.search}`, { replace: true })
  }

  useEscClose(close)

  // Focus MỘT LẦN lúc mở — không dùng ref callback, kẻo đang gõ trong form là bị giật
  // focus ra ngoài mỗi lần render (cùng lý do đã ghi ở EditTransactionSheet).
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6 animate-overlay-in"
      onClick={close}
    >
      {/* Chiều cao CỐ ĐỊNH, không phải `max-h`: <EntryPage> là một cột flex cao hết
          khung và tự ghim hàng nút + bàn số ở ĐÁY khung đó. Để hộp co theo nội dung thì
          đáy ghim trôi theo, và vùng cuộn của form không còn biết mình cao bao nhiêu.
          `max-h-[48rem]`: màn 1440px cao thì 90dvh thành một hộp gần 1300px — cao hơn
          cả trang đầy đủ cần, mà mắt vẫn phải quét từ đầu tới cuối.
          `max-w-5xl` (1024px) khớp trang đầy đủ và sheet Sửa giao dịch: từ lg
          TransactionForm chia HAI CỘT với cột phải cố định 20rem, hẹp hơn là cột trái
          bị bóp xuống dưới cả bản mobile. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Nhập giao dịch"
        tabIndex={-1}
        className="flex h-[90dvh] max-h-[48rem] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-surface-page outline-none animate-sheet-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <EntryPage onClose={close} />
      </div>
    </div>
  )
}
