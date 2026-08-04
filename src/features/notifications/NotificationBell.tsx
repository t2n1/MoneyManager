import { lazy, Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useNotifications } from './useNotifications'
import type { AppNotification } from './types'

/**
 * Tham số mở tấm trượt từ bên ngoài. Push gộp nhiều việc không trỏ được vào một
 * trang cụ thể (nó nói về 3 chuyện ở 3 chỗ), nên nó trỏ về đây — xem PUSH_LIST_ROUTE
 * trong pushPlan.ts.
 */
const OPEN_PARAM = 'notif'

// Tấm trượt chỉ cần khi người dùng thực sự mở chuông → tách chunk riêng, không
// nằm trong bundle khởi động (cùng ý tưởng lazy các trang phụ trong App.tsx).
const NotificationSheet = lazy(() =>
  import('./NotificationSheet').then((m) => ({ default: m.NotificationSheet })),
)

export function NotificationBell({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  // Vào app từ một thông báo đẩy gộp: mở sẵn tấm trượt, rồi DỌN tham số khỏi URL.
  // Không dọn thì đóng tấm trượt xong bấm Back (hoặc mở lại app từ lịch sử) là nó
  // bật lên lần nữa, và người dùng không hiểu vì sao.
  useEffect(() => {
    if (!searchParams.has(OPEN_PARAM)) return
    setOpen(true)
    const next = new URLSearchParams(searchParams)
    next.delete(OPEN_PARAM)
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const {
    actions,
    actionsAll,
    infos,
    infosAll,
    unreadCount,
    readKeys,
    isReady,
    markAllRead,
    markRead,
    dismiss,
  } = useNotifications()

  // Mở tấm trượt = đánh dấu đã đọc tất cả đang hiện. Nhưng danh sách phải GIỮ
  // NGUYÊN trước mắt tới khi đóng, để còn kịp bấm vào (mục D.2 của spec).
  //
  // Vì vậy phải CHỤP LẠI hai thứ ngay lúc mở:
  //  - readAtOpen: mã nào đã đọc TRƯỚC lúc mở → quyết định dòng nào hiện mờ.
  //    Nếu dùng readKeys trực tiếp thì đánh dấu đọc xong là mọi dòng mờ hết.
  //  - infosAtOpen: useNotifications LỌC BỎ tin-để-biết đã đọc. Không chụp lại thì
  //    đánh dấu đọc xong là mấy tin đó biến mất ngay trước mắt — đúng cái phải tránh.
  //    Việc-cần-làm không cần chụp: hook giữ chúng trong danh sách dù đã đọc.
  //    Chụp cả bản ĐẦY ĐỦ (infosAllAtOpen) vì tấm trượt xổ được phần bị cắt trần, và
  //    xổ ra là đánh dấu đã đọc — không chụp thì mấy tin vừa xổ biến mất ngay.
  const [readAtOpen, setReadAtOpen] = useState<Set<string>>(new Set())
  const [infosAtOpen, setInfosAtOpen] = useState<AppNotification[]>([])
  const [infosAllAtOpen, setInfosAllAtOpen] = useState<AppNotification[]>([])
  useEffect(() => {
    if (!open) return
    setReadAtOpen(new Set(readKeys))
    setInfosAtOpen(infos)
    setInfosAllAtOpen(infosAll)
    markAllRead()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Bấm ✕ trên một tin để biết: bỏ khỏi CẢ HAI bản đã chụp để nó mất ngay trước mắt
  // (và không quay lại khi bấm xổ phần bị cắt trần).
  function dismissNow(key: string) {
    setInfosAtOpen((list) => list.filter((n) => n.key !== key))
    setInfosAllAtOpen((list) => list.filter((n) => n.key !== key))
    dismiss(key)
  }

  // Đóng bằng Esc — theo đúng quy ước của dialog.tsx (hộp thoại dùng chung toàn app).
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!isReady) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unreadCount > 0 ? `Thông báo, ${unreadCount} việc cần làm` : 'Thông báo'}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-surface px-3 shadow-sm active:scale-95 ${className}`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-3xs font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 lg:items-start lg:pt-20">
          <button
            type="button"
            aria-label="Đóng thông báo"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default"
          />
          {/* aria-modal không kèm bẫy focus (focus vẫn ở nút chuông phía sau) — giống hệt
              lib/dialog.tsx, cũng chỉ đóng bằng Esc, không bẫy. Cố tình nhất quán; nên
              sửa quy ước này ở một chỗ chung sau này thay vì lệch nhau giữa hai nơi. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Thông báo"
            className="relative w-full max-w-md rounded-t-2xl bg-gray-50 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-xl lg:rounded-2xl lg:pb-3 dark:bg-gray-900"
          >
            <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-gray-300 lg:hidden dark:bg-gray-600" />
            <Suspense
              fallback={
                <p className="py-6 text-center text-sm text-fg-muted">
                  Đang tải…
                </p>
              }
            >
              <NotificationSheet
                actions={actions}
                actionsAll={actionsAll}
                infos={infosAtOpen}
                infosAll={infosAllAtOpen}
                readKeys={readAtOpen}
                onReveal={markRead}
                onDismiss={dismissNow}
                onClose={() => setOpen(false)}
              />
            </Suspense>
          </div>
        </div>
      )}
    </>
  )
}
