import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ChartColumn, NotebookText, Plus, Settings, Wallet } from 'lucide-react'
import { isDemoMode } from '../lib/demo'
import {
  useDeleteNotificationStates,
  usePruneNotificationState,
  useRunRecurringCatchUp,
} from '../hooks/queries'
import { usePrivacyMode } from '../lib/privacy'
import { runUndo, useUndoToast } from '../lib/undoToast'
import { DialogHost } from '../lib/dialog'
import { PrivacyToggle } from './PrivacyToggle'
import { NotificationBell, useUnreadCount } from '../features/notifications/NotificationBell'
import { NotificationBoundary } from '../features/notifications/NotificationBoundary'
import { useNotifications } from '../features/notifications/useNotifications'
import { splitStaleActionKeys } from '../features/notifications/state'
import { addDaysISO, toISODate } from '../lib/dates'

const TABS = [
  { to: '/', label: 'Sổ GD', Icon: NotebookText },
  { to: '/assets', label: 'Tài sản', Icon: Wallet },
  { to: '/reports', label: 'Báo cáo', Icon: ChartColumn },
  { to: '/settings', label: 'Cài đặt', Icon: Settings },
]

function isTypingTarget(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  return (
    !!el &&
    (el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT' ||
      el.isContentEditable)
  )
}

// Catch-up định kỳ chỉ chạy 1 lần mỗi lần mở app (module-level để sống qua
// StrictMode re-mount; bản thân engine cũng idempotent nên chạy lại vô hại)
let recurringCatchUpDone = false

// Dọn trạng thái thông báo — 1 lần mỗi lần mở app (module-level để sống qua StrictMode).
let notifCleanupDone = false

export function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  // Đăng ký chế độ riêng tư ở gốc cây: bật/tắt sẽ re-render toàn bộ trang con
  // (formatMoney là hàm thuần nên component hiển thị tiền cần được render lại).
  const privacyOn = usePrivacyMode()
  const undoToast = useUndoToast()

  // Nút "+" nổi chỉ hiện ở trang Sổ Giao dịch
  const onLedger = location.pathname === '/' || location.pathname === '/transactions'
  // Trang nhập giao dịch: ẩn thanh nav dưới để có tối đa không gian
  const onEntry = location.pathname === '/entry'

  const catchUp = useRunRecurringCatchUp()
  const [recurringToast, setRecurringToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const unread = useUnreadCount()

  // Cuộn nằm trong <main> (không phải cả trang) để thanh nav cố định dưới không
  // bị "nhảy" khi rubber-band trên iOS. Đổi route → đưa main về đầu cho khớp
  // hành vi cuộn-theo-window trước đây.
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [location.pathname])

  // Sinh các kỳ định kỳ đến hạn kể từ lần mở trước; N > 0 → toast
  useEffect(() => {
    if (recurringCatchUpDone) return
    recurringCatchUpDone = true
    catchUp
      .mutateAsync()
      .then(({ recurring, autopay }) => {
        const parts: string[] = []
        if (recurring > 0) parts.push(`${recurring} giao dịch định kỳ`)
        if (autopay > 0) parts.push(`${autopay} lần tự trả thẻ`)
        if (parts.length === 0) return
        setRecurringToast(`Đã tạo ${parts.join(' · ')}`)
        toastTimer.current = setTimeout(() => setRecurringToast(null), 5000)
      })
      .catch(() => {}) // mở app không được chết vì catch-up lỗi (offline…)
    return () => clearTimeout(toastTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { allKeys, storedKeys, isReady: notifReady } = useNotifications()
  const deleteStates = useDeleteNotificationStates()
  const prune = usePruneNotificationState()

  // Mục E của spec: việc-cần-làm đã xong thì xóa luôn trạng thái, để lần sau tình
  // huống tái diễn là nó lại đỏ như mới. Trạng thái tin-để-biết không đụng tới.
  // Chỉ chạy khi đã tải xong, để không xóa nhầm lúc danh sách còn rỗng.
  useEffect(() => {
    if (notifCleanupDone || !notifReady) return
    notifCleanupDone = true

    const stale = splitStaleActionKeys(storedKeys, allKeys)
    if (stale.length > 0) deleteStates.mutate(stale)

    // Dọn rác: bỏ dòng cũ hơn 12 tháng. Một câu delete, không cần đặt lịch.
    prune.mutate(`${addDaysISO(toISODate(new Date()), -365)}T00:00:00.000Z`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifReady])

  // Phím tắt desktop: 1–4 chuyển tab, N mở màn nhập
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e) || e.ctrlKey || e.metaKey || e.altKey) return
      const index = Number(e.key) - 1
      if (index >= 0 && index < TABS.length) navigate(TABS[index].to)
      if (e.key === 'n' || e.key === 'N') navigate('/entry')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  const linkClass = (isActive: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
      isActive
        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
    }`

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-gray-50 lg:flex-row dark:bg-gray-950">
      {/* Sidebar desktop */}
      <aside className="hidden shrink-0 border-r border-gray-200 bg-white p-4 lg:flex lg:w-56 lg:flex-col dark:border-gray-800 dark:bg-gray-900 print:hidden">
        <div className="mb-6 flex items-center gap-2 px-2">
          <NotebookText className="h-6 w-6 text-green-600 dark:text-green-500" />
          <span className="flex-1 text-lg font-bold text-gray-800 dark:text-gray-100">Sổ Chi Tiêu</span>
          <PrivacyToggle className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800" />
          <NotificationBoundary>
            <NotificationBell className="hidden lg:inline-flex" />
          </NotificationBoundary>
        </div>
        <NavLink
          to="/entry"
          className="mb-3 flex items-center justify-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 active:scale-95"
        >
          <Plus className="h-5 w-5" />
          Nhập giao dịch
        </NavLink>
        <nav className="flex flex-col gap-1">
          {TABS.map((tab, i) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) => linkClass(isActive)}
            >
              <tab.Icon className="h-5 w-5" />
              <span className="flex-1">{tab.label}</span>
              <kbd className="rounded bg-gray-100 px-1.5 text-xs text-gray-400 dark:bg-gray-800 dark:text-gray-500">
                {i + 1}
              </kbd>
            </NavLink>
          ))}
        </nav>
        {isDemoMode && (
          <div className="mt-auto rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            Chế độ demo — dữ liệu chỉ lưu trên trình duyệt này
          </div>
        )}
      </aside>

      {/* Nội dung — key theo chế độ riêng tư để bật/tắt render lại cây route
          (Outlet trả về element ổn định tham chiếu nên không tự re-render). */}
      <main
        key={privacyOn ? 'priv-on' : 'priv-off'}
        ref={mainRef}
        className={`mx-auto w-full min-h-0 max-w-2xl flex-1 overflow-y-auto pt-[env(safe-area-inset-top)] lg:pt-0 lg:pb-6 ${onEntry ? '' : 'pb-20'}`}
      >
        <Outlet />
      </main>

      {/* Nút "+" nổi (mobile) → mở trang nhập; chỉ hiện ở Sổ GD */}
      {onLedger && (
        <button
          type="button"
          onClick={() => navigate('/entry')}
          aria-label="Nhập giao dịch"
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-green-600 leading-none text-white shadow-lg transition hover:bg-green-700 active:scale-95 lg:hidden print:hidden"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* Bottom tab bar mobile — ẩn ở trang nhập giao dịch để lấy thêm không gian */}
      <nav className={`fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-gray-800 dark:bg-gray-900 print:hidden ${onEntry ? 'hidden' : 'flex'}`}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                isActive
                ? 'font-semibold text-green-700 dark:text-green-400'
                : 'text-gray-500 dark:text-gray-400'
              }`
            }
          >
            <span className="relative">
              <tab.Icon className="h-6 w-6" />
              {tab.to === '/' && unread > 0 && (
                <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-red-600 ring-2 ring-white dark:ring-gray-900" />
              )}
            </span>
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {recurringToast && (
        <div className="fixed inset-x-0 top-[calc(1rem+env(safe-area-inset-top))] z-50 flex justify-center">
          <div className="rounded-full bg-gray-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
            {recurringToast}
          </div>
        </div>
      )}

      {/* Toast hoàn tác sau khi xóa (mục AB) */}
      {undoToast && (
        <div className={`fixed inset-x-0 z-50 flex justify-center px-4 ${onEntry ? 'bottom-4' : 'bottom-24 lg:bottom-6'}`}>
          <div className="flex items-center gap-3 rounded-full bg-gray-900/95 py-2 pl-4 pr-2 text-sm font-medium text-white shadow-lg">
            <span>{undoToast.message}</span>
            <button
              type="button"
              onClick={() => runUndo()}
              className="rounded-full bg-white/15 px-3 py-1 text-sm font-semibold text-white hover:bg-white/25 active:scale-95"
            >
              Hoàn tác
            </button>
          </div>
        </div>
      )}

      {/* Hộp thoại confirm/prompt + toast thông báo dùng chung (thay window.*) */}
      <DialogHost />
    </div>
  )
}
