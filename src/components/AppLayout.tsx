import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ChartColumn, NotebookText, Plus, Settings, Target, Wallet } from 'lucide-react'
import { isDemoMode } from '../lib/demo'
import { useAuth } from '../features/auth/AuthProvider'
import { AppLogo } from './AppLogo'
import {
  useDeleteNotificationStates,
  usePruneNotificationState,
  useRunRecurringCatchUp,
} from '../hooks/queries'
import { usePrivacyMode } from '../lib/privacy'
import { useDensitySync } from '../hooks/useDensity'
import { runUndo, useUndoToast } from '../lib/undoToast'
import { dismissErrorToast, useErrorToast } from '../lib/errorToast'
import { DialogHost } from '../lib/dialog'
import { PrivacyToggle } from './PrivacyToggle'
import { QueryErrorBanner } from './QueryErrorBanner'
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
// cạnh nhau đều là "Sổ Gạo" — không phân biệt được đang ở đâu. Tiền tố khớp cả
// trang con (/settings/accounts → "Cài đặt"). Trang gốc "/" giữ nguyên tên app.
const PAGE_TITLES: [prefix: string, title: string][] = [
  ['/entry', 'Nhập giao dịch'],
  ['/search', 'Tìm kiếm'],
  ['/debts', 'Nợ / cho vay'],
  ['/recurring', 'Giao dịch định kỳ'],
  ['/planned', 'Sắp chi'],
  ['/invest', 'Đầu tư'],
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

/** Nút trong toast (Hoàn tác / Đóng): nằm trên nền toast ĐẶC nên không dùng được
 *  <ActionButton> — hai dáng của nó đều tính trên nền thẻ. Gom một hằng số ở đây để
 *  hai toast không trôi khác nhau, và để `active:scale-95` chỉ viết một lần. */
const TOAST_BTN =
  'rounded-full bg-white/15 px-3 py-1 text-sm font-semibold text-white transition hover:bg-white/25 active:scale-95'

export function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  // Đăng ký chế độ riêng tư ở gốc cây: bật/tắt sẽ re-render toàn bộ trang con
  // (formatMoney là hàm thuần nên component hiển thị tiền cần được render lại).
  const privacyOn = usePrivacyMode()
  // Bơm "Cách trình bày" từ hồ sơ vào bản sao ở máy. Ở ĐÂY và chỉ ở đây: hook đọc chế
  // độ có ở hàng chục component, để effect trong đó thì mỗi lần hồ sơ đổi tham chiếu là
  // hàng chục lần đồng bộ cho cùng một giá trị. Xem src/hooks/useDensity.ts.
  useDensitySync()
  const undoToast = useUndoToast()
  // Email cho chân sidebar desktop (demo thì không có phiên → hiện chú thích demo)
  const { session } = useAuth()
  const email = session?.user?.email
  // Lưới an toàn lỗi: query/mutation thất bại ở BẤT KỲ đâu cũng nổi một toast, thay vì
  // im lặng để người dùng tưởng đã lưu được. Lấy từ nhánh fix/toan-bo-audit.
  const errorToast = useErrorToast()

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
    document.title = hit ? `${hit[1]} — Sổ Gạo` : 'Sổ Gạo'
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
    `relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
      isActive
        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
    }`

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface-page lg:flex-row ">
      {/* Sidebar desktop — thẻ nổi: tách khỏi mép màn hình, bo góc lớn, bóng đổ nhẹ */}
      <aside className="hidden shrink-0 rounded-2xl border border-border-subtle bg-surface p-3 shadow-lg shadow-gray-950/5 lg:m-3 lg:mr-0 lg:flex lg:w-60 lg:flex-col dark:shadow-black/40 print:hidden">
        {/* Một hàng đủ logo + tên + 2 nút tiện ích: "Sổ Gạo" ngắn (~60px ở text-lg bold)
            nên khác với tên cũ "Sổ Chi Tiêu" (~95px), không còn cảnh rớt 3 dòng.
            Lòng trong 216px − logo 32 − mắt 32 − chuông 44 − 3 khe ≈ 84px > 60px. */}
        <div className="mb-3 flex items-center gap-2 px-1 pt-1">
          <AppLogo className="h-8 w-8 shrink-0" />
          <span className="min-w-0 flex-1 truncate whitespace-nowrap text-lg font-bold text-fg-primary">
            Sổ Gạo
          </span>
          <PrivacyToggle className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted hover:bg-gray-100 dark:hover:bg-gray-800" />
          <NotificationBoundary>
            <NotificationBell className="hidden lg:inline-flex" />
          </NotificationBoundary>
        </div>
        <NavLink
          to="/entry"
          className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-green-700 px-3 py-2.5 text-sm font-semibold text-white shadow-md shadow-green-700/25 transition hover:bg-green-800 active:scale-95"
        >
          <Plus className="h-5 w-5" />
          Nhập giao dịch
        </NavLink>
        <div className="mb-1.5 px-3 text-2xs font-semibold uppercase tracking-widest text-fg-muted">
          Menu
        </div>
        <nav className="flex flex-col gap-1">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) => linkClass(isActive)}
            >
              {({ isActive }) => (
                <>
                  {/* Vạch xanh sát mép trái thẻ (-left-3 = ăn hết p-3) đánh dấu mục đang mở */}
                  {isActive && (
                    <span
                      aria-hidden
                      className="absolute -left-3 bottom-2 top-2 w-1 rounded-r-full bg-accent"
                    />
                  )}
                  <tab.Icon className="h-5 w-5" />
                  <span className="flex-1">{tab.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-border-subtle px-1 pb-1 pt-3">
          {isDemoMode ? (
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              Chế độ demo — dữ liệu chỉ lưu trên trình duyệt này
            </div>
          ) : (
            email && (
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-300">
                  {email[0].toUpperCase()}
                </div>
                <span className="min-w-0 truncate text-xs text-fg-muted">{email}</span>
              </div>
            )
          )}
        </div>
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
        className={`mx-auto w-full min-h-0 max-w-6xl flex-1 overflow-y-auto pt-[env(safe-area-inset-top)] lg:pt-0 lg:pb-6 ${onEntry ? '' : 'pb-28'}`}
      >
        {/* Lưới an toàn: query lỗi không được hiển thị như "không có dữ liệu" */}
        <QueryErrorBanner />
        <Outlet />
      </main>

      {/* Nút "+" nổi (mobile) → mở trang nhập; chỉ hiện ở Sổ GD */}
      {onLedger && (
        <button
          type="button"
          onClick={() => navigate('/entry')}
          aria-label="Nhập giao dịch"
          className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-green-700 leading-none text-white shadow-lg transition hover:bg-green-800 active:scale-95 lg:hidden print:hidden"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* Bottom tab bar mobile — thẻ nổi tách khỏi mép như sidebar desktop; ẩn ở trang
          nhập giao dịch để lấy thêm không gian. bottom = max(12px, dải an toàn iPhone). */}
      <nav className={`fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 gap-1 rounded-2xl border border-border-subtle bg-surface p-1.5 shadow-lg shadow-gray-950/10 lg:hidden dark:shadow-black/50 print:hidden ${onEntry ? 'hidden' : 'flex'}`}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-xs transition ${
                isActive
                ? 'bg-green-100 font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-300'
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
              className={TOAST_BTN}
            >
              Hoàn tác
            </button>
          </div>
        </div>
      )}

      {/* Toast lỗi mutation toàn cục (main.tsx MutationCache.onError) — lưu hỏng
          không bao giờ được im lặng. Đặt trên toast hoàn tác một bậc để không đè nhau. */}
      {errorToast && (
        <div className={`fixed inset-x-0 z-50 flex justify-center px-4 ${onEntry ? 'bottom-20' : 'bottom-40 lg:bottom-20'}`}>
          <div className="flex items-center gap-3 rounded-full bg-red-700/95 py-2 pl-4 pr-2 text-sm font-medium text-white shadow-lg">
            <span className="max-w-[70vw] truncate">{errorToast.message}</span>
            <button
              type="button"
              onClick={dismissErrorToast}
              className={TOAST_BTN}
            >
              Đóng
            </button>
          </div>
        </div>
      )}

      {/* Hộp thoại confirm/prompt + toast thông báo dùng chung (thay window.*) */}
      <DialogHost />
    </div>
  )
}
