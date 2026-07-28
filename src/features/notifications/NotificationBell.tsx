import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { useNotifications } from './useNotifications'
import { NotificationSheet } from './NotificationSheet'
import type { AppNotification } from './types'

/** Số việc-cần-làm chưa đọc — cho chấm đỏ trên tab "Sổ GD". */
export function useUnreadCount(): number {
  return useNotifications().unreadCount
}

export function NotificationBell({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const { actions, infos, hiddenCount, unreadCount, readKeys, isReady, markAllRead, dismiss } =
    useNotifications()

  // Mở tấm trượt = đánh dấu đã đọc tất cả đang hiện. Nhưng danh sách phải GIỮ
  // NGUYÊN trước mắt tới khi đóng, để còn kịp bấm vào (mục D.2 của spec).
  //
  // Vì vậy phải CHỤP LẠI hai thứ ngay lúc mở:
  //  - readAtOpen: mã nào đã đọc TRƯỚC lúc mở → quyết định dòng nào hiện mờ.
  //    Nếu dùng readKeys trực tiếp thì đánh dấu đọc xong là mọi dòng mờ hết.
  //  - infosAtOpen: useNotifications LỌC BỎ tin-để-biết đã đọc. Không chụp lại thì
  //    đánh dấu đọc xong là mấy tin đó biến mất ngay trước mắt — đúng cái phải tránh.
  //    Việc-cần-làm không cần chụp: hook giữ chúng trong danh sách dù đã đọc.
  const [readAtOpen, setReadAtOpen] = useState<Set<string>>(new Set())
  const [infosAtOpen, setInfosAtOpen] = useState<AppNotification[]>([])
  useEffect(() => {
    if (!open) return
    setReadAtOpen(new Set(readKeys))
    setInfosAtOpen(infos)
    markAllRead()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Bấm ✕ trên một tin để biết: bỏ khỏi bản đã chụp để nó mất ngay trước mắt.
  function dismissNow(key: string) {
    setInfosAtOpen((list) => list.filter((n) => n.key !== key))
    dismiss(key)
  }

  if (!isReady) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unreadCount > 0 ? `Thông báo, ${unreadCount} việc cần làm` : 'Thông báo'}
        className={`relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white px-3 shadow-sm active:scale-95 dark:bg-gray-900 ${className}`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[0.625rem] font-bold text-white">
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
          <div className="relative w-full max-w-md rounded-t-2xl bg-gray-50 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-xl lg:rounded-2xl lg:pb-3 dark:bg-gray-900">
            <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-gray-300 lg:hidden dark:bg-gray-600" />
            <NotificationSheet
              actions={actions}
              infos={infosAtOpen}
              hiddenCount={hiddenCount}
              readKeys={readAtOpen}
              onDismiss={dismissNow}
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  )
}
