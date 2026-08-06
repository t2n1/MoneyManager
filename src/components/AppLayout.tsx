import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ChartColumn, NotebookText, Plus, Settings, Target, Wallet } from 'lucide-react'
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
import { NotificationBell } from '../features/notifications/NotificationBell'
import { NotificationBoundary } from '../features/notifications/NotificationBoundary'
import { useNotifications } from '../features/notifications/useNotifications'
import { planNotificationCleanup } from '../features/notifications/state'
import { addDaysISO, toISODate } from '../lib/dates'

// 5 tab, gom theo câu hỏi người dùng đang hỏi (docs/information-architecture.md §2).
// Nhãn "Sổ" thay vì "Sổ GD": 5 tab thì mỗi ô hẹp hơn, mà "Ngân sách" là nhãn dài nhất
// nên phải nhường chỗ.
const TABS = [
  { to: '/', label: 'Sổ', Icon: NotebookText },
  { to: '/budget', label: 'Ngân sách', Icon: Target },
  { to: '/assets', label: 'Tài sản', Icon: Wallet },
  { to: '/reports', label: 'Báo cáo', Icon: ChartColumn },
  { to: '/settings', label: 'Cài đặt', Icon: Settings },
]

// Tiêu đề tab trình duyệt theo trang. Không đổi thì bookmark, lịch sử và hai tab mở
// cạnh nhau đều là "Sổ Chi Tiêu" — không phân biệt được đang ở đâu. Tiền tố khớp cả
// trang con (/settings/accounts → "Cài đặt"). Trang gốc "/" giữ nguyên tên app.
const PAGE_TITLES: [prefix: string, title: string][] = [
  ['/entry', 'Nhập giao dịch'],
  ['/search', 'Tìm kiếm'],
  ['/debts', 'Nợ / cho vay'],
  ['/recurring', 'Giao dịch định kỳ'],
  ['/budget', 'Ngân sách'],
  ['/assets', 'Tài sản'],
  ['/reports', 'Báo cáo'],
  ['/settings', 'Cài đặt'],
]

// Catch-up định kỳ chỉ chạy 1 lần mỗi lần mở app (module-level để sống qua
// StrictMode re-mount; bản thân engine cũng idempotent nên chạy lại vô hại)
let recurringCatchUpDone = false

// Dọn trạng thái thông báo — 1 lần mỗi lần mở app (module-level để sống qua StrictMode).
let notifCleanupDone = false

// Dọn rác 12 tháng — chốt RIÊNG, vì nó chạy được sớm hơn hẳn việc dọn trạng thái:
// không phụ thuộc bất cứ thứ gì bộ luật sinh ra.
let prunedThisOpen = false

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

  // Cuộn nằm trong <main> (không phải cả trang) để thanh nav cố định dưới không
  // bị "nhảy" khi rubber-band trên iOS. Đổi route → đưa main về đầu cho khớp
  // hành vi cuộn-theo-window trước đây.
  const mainRef = useRef<HTMLElement>(null)
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [location.pathname])

  useEffect(() => {
    const hit = PAGE_TITLES.find(
      ([p]) => location.pathname === p || location.pathname.startsWith(`${p}/`),
    )
    document.title = hit ? `${hit[1]} — Sổ Chi Tiêu` : 'Sổ Chi Tiêu'
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

  const {
    allKeys,
    storedKeys,
    inputsReady: notifInputsReady,
    engineFailed: notifEngineFailed,
  } = useNotifications()
  const deleteStates = useDeleteNotificationStates()
  const prune = usePruneNotificationState()

  // Mục E của spec: việc-cần-làm đã xong thì xóa luôn trạng thái, để lần sau tình
  // huống tái diễn là nó lại đỏ như mới. Trạng thái tin-để-biết không đụng tới.
  //
  // Cổng là `inputsReady` (mọi nguồn dữ liệu bộ luật đọc đã về), KHÔNG phải `isReady`
  // (chỉ chờ profile + trạng thái đã đọc). Quyết định nằm ở hàm thuần
  // planNotificationCleanup — trả null là lượt này ĐỪNG dọn, và chỉ khi khác null
  // mới được chốt notifCleanupDone, kẻo chốt ở một lượt trả về sớm rồi không bao
  // giờ dọn lại nữa.
  useEffect(() => {
    // Dọn rác 12 tháng đứng TRƯỚC cổng dọn trạng thái: nó là thu gom rác vô điều kiện,
    // không đọc gì của bộ luật (AppLayout chỉ mount sau RequireAuth nên đã có phiên
    // đăng nhập). Đặt nó sau `if (!plan) return` thì một query hỏng vĩnh viễn (RLS đổi,
    // migration lệch) là cả cái install đó không bao giờ dọn rác nữa.
    if (!prunedThisOpen) {
      prunedThisOpen = true
      prune.mutate(`${addDaysISO(toISODate(new Date()), -365)}T00:00:00.000Z`)
    }

    const plan = planNotificationCleanup({
      alreadyDone: notifCleanupDone,
      inputsReady: notifInputsReady,
      engineFailed: notifEngineFailed,
      storedKeys,
      allKeys,
    })
    if (!plan) return
    notifCleanupDone = true

    if (plan.staleKeys.length > 0) deleteStates.mutate(plan.staleKeys)
    // eslint-disable còn ở đây vì 4 mục: `storedKeys`, `allKeys` (mảng mới mỗi lần
    // render) và `deleteStates`, `prune` (object mutation của react-query). Liệt kê
    // chúng ra là effect chạy lại mỗi render — trong khi ý ở đây là CHẠY ĐÚNG MỘT
    // LẦN mỗi lần mở app, và tới lượt `notifInputsReady` bật thì storedKeys/allKeys
    // đã là bản cuối rồi. Quyết định thật nằm ở planNotificationCleanup (thuần, có
    // test), nên việc tắt lint ở đây không còn che giấu logic nào.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifInputsReady, notifEngineFailed])

  const linkClass = (isActive: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
      isActive
        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
    }`

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface-page lg:flex-row ">
      {/* Sidebar desktop */}
      <aside className="hidden shrink-0 border-r border-gray-200 bg-surface p-4 lg:flex lg:w-56 lg:flex-col dark:border-gray-800 print:hidden">
        {/* Tên app chiếm RIÊNG một hàng. Đặt chung hàng với hai nút tiện ích thì nó chỉ
            còn 51px mà cần ~95px mới đủ một dòng ở text-lg bold, nên rớt thành 3 dòng
            ("Sổ / Chi / Tiêu"). Đo trên preview 1280px: sidebar 224px → 175px lòng trong,
            trừ icon 24 + nút 32 + chuông 44 + 3 khoảng cách 24 = còn đúng 51px. */}
        <div className="mb-2 flex items-center gap-2 px-2">
          <NotebookText className="h-6 w-6 shrink-0 text-green-600 dark:text-green-500" />
          <span className="whitespace-nowrap text-lg font-bold text-fg-primary">Sổ Chi Tiêu</span>
        </div>
        <div className="mb-4 flex items-center justify-end gap-1 px-2">
          <PrivacyToggle className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted hover:bg-gray-100 dark:hover:bg-gray-800" />
          <NotificationBoundary>
            <NotificationBell className="hidden lg:inline-flex" />
          </NotificationBoundary>
        </div>
        <NavLink
          to="/entry"
          className="mb-3 flex items-center justify-center gap-2 rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800 active:scale-95"
        >
          <Plus className="h-5 w-5" />
          Nhập giao dịch
        </NavLink>
        <nav className="flex flex-col gap-1">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) => linkClass(isActive)}
            >
              <tab.Icon className="h-5 w-5" />
              <span className="flex-1">{tab.label}</span>
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
          (Outlet trả về element ổn định tham chiếu nên không tự re-render).

          max-w-6xl chứ không 2xl: 2xl (672px) là bề ngang của điện thoại, nên trên màn
          1440 sau khi trừ thanh bên vẫn còn hơn 500px bỏ trống. Trang nào CẦN hẹp thì
          tự bọc `max-w-2xl` ở khối ngoài cùng của nó (Sổ GD, Nhập, Cài đặt) — để mỗi
          trang tự khai bề ngang của mình thay vì layout đoán hộ cho tất cả. */}
      <main
        key={privacyOn ? 'priv-on' : 'priv-off'}
        ref={mainRef}
        className={`mx-auto w-full min-h-0 max-w-6xl flex-1 overflow-y-auto pt-[env(safe-area-inset-top)] lg:pt-0 lg:pb-6 ${onEntry ? '' : 'pb-20'}`}
      >
        <Outlet />
      </main>

      {/* Nút "+" nổi (mobile) → mở trang nhập; chỉ hiện ở Sổ GD */}
      {onLedger && (
        <button
          type="button"
          onClick={() => navigate('/entry')}
          aria-label="Nhập giao dịch"
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-green-700 leading-none text-white shadow-lg transition hover:bg-green-800 active:scale-95 lg:hidden print:hidden"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* Bottom tab bar mobile — ẩn ở trang nhập giao dịch để lấy thêm không gian */}
      <nav className={`fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-gray-800 print:hidden ${onEntry ? 'hidden' : 'flex'}`}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                isActive
                ? 'font-semibold text-green-700 dark:text-green-400'
                : 'text-fg-muted'
              }`
            }
          >
            {/* Không gắn chấm đỏ thông báo vào icon tab: chấm trên tab "Sổ" đọc thành
                "có gì mới trong Sổ" trong khi thật ra là thông báo của chuông — mà
                chuông (trong header trang Sổ và sidebar desktop) đã có badge số đếm. */}
            <tab.Icon className="h-6 w-6" />
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
