import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AppFooter } from './AppFooter'
import { AppRail } from './AppRail'
import { AppTopBar } from './AppTopBar'
import { BottomNav } from './BottomNav'
import { MonthKeyProvider } from '../hooks/useMonthKey'
import { pageTitle } from './navItems'
import { LoadProgress } from './LoadProgress'
import { QueryErrorBanner } from './QueryErrorBanner'
import { useLoadProgress } from '../hooks/useLoadProgress'
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
import { useNotifications } from '../features/notifications/useNotifications'
import { planNotificationCleanup } from '../features/notifications/state'
import { addDaysISO, toISODate } from '../lib/dates'

// Đích điều hướng + tiêu đề trang đã chuyển sang ./navItems.ts — từ bản 1a có BA chỗ
// đọc chúng (rail desktop, thanh tab mobile, tiêu đề trên top bar) thay vì một.

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
  const location = useLocation()
  // Đăng ký chế độ riêng tư ở gốc cây: bật/tắt sẽ re-render toàn bộ trang con
  // (formatMoney là hàm thuần nên component hiển thị tiền cần được render lại).
  const privacyOn = usePrivacyMode()
  // Bơm "Cách trình bày" từ hồ sơ vào bản sao ở máy. Ở ĐÂY và chỉ ở đây: hook đọc chế
  // độ có ở hàng chục component, để effect trong đó thì mỗi lần hồ sơ đổi tham chiếu là
  // hàng chục lần đồng bộ cho cùng một giá trị. Xem src/hooks/useDensity.ts.
  useDensitySync()
  const undoToast = useUndoToast()
  // Lưới an toàn lỗi: query/mutation thất bại ở BẤT KỲ đâu cũng nổi một toast, thay vì
  // im lặng để người dùng tưởng đã lưu được. Lấy từ nhánh fix/toan-bo-audit.
  const errorToast = useErrorToast()
  // Đọc ở đây (không phải trong LoadProgress) vì toast định kỳ bên dưới phải né nó.
  const loadPercent = useLoadProgress()

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
    const hit = pageTitle(location.pathname)
    document.title = hit ? `${hit} — Sổ Gạo` : 'Sổ Gạo'
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

  return (
    // Khung "trạm điều khiển": rail dọc bên trái, rồi một cột dọc gồm top bar + phần
    // cuộn + thanh tab mobile. Cả rail lẫn top bar đứng NGOÀI phần cuộn nên chúng dính
    // sẵn, không cần `position:sticky` — và cách cuộn vẫn y như cũ (cuộn nằm trong
    // <main>, không phải cả trang), tức iOS vẫn không rubber-band kéo theo thanh dưới.
    <MonthKeyProvider>
      <div className="flex h-dvh overflow-hidden bg-surface-page">
        <AppRail />

        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopBar />

          {/* Nội dung — key theo chế độ riêng tư để bật/tắt render lại cây route
              (Outlet trả về element ổn định tham chiếu nên không tự re-render).

              KHÔNG chặn bề ngang. Bản 1a là một TRẠM ĐIỀU KHIỂN: mock vẽ console ở
              1280px và nó phủ hết khung, còn §1.4/§6 chỉ chốt bề ngang của CỘT PHỤ bên
              phải (380px; Sổ 420; Ngân sách/Tài sản 400) — tức cột chính được hiểu là
              nở ra lấp phần còn lại. Không chỗ nào trong bộ tài liệu đặt trần cho cả
              khung.

              Trước đây chỗ này chặn `max-w-6xl` (1152px). Ở đúng 1280px thì gần như
              không thấy, nên nó lọt; trên màn rộng hơn thì hiện ra ngay — ở 1679px, sau
              khi trừ rail 52px, còn ~475px bỏ trống chia hai bên, và một trạm điều khiển
              nằm giữa hai dải trống thì đọc thành một tờ tài liệu hẹp.

              Nở tự do vẫn an toàn vì cấu trúc đã lo: mỗi cặp panel là `flex-wrap` với
              `flex-1 min-w-0` cạnh một cột phụ có `basis` cố định, nên phần nở thêm rơi
              vào cột chính chứ không kéo giãn đều mọi thứ. Trang nào CẦN hẹp thì tự bọc
              `max-w-2xl` ở khối ngoài cùng của nó (Sổ GD, Nhập), và bề rộng đọc của
              từng khối văn xuôi do `PROSE_MAX` trong designSystem.test.ts canh.

              Không còn `pb-28`/`pb-40` chừa chỗ cho thứ nổi: thanh tab dưới giờ nằm
              TRONG luồng (xem BottomNav) nên nó tự trừ vào chiều cao phần cuộn, và nút
              "+" nổi đã bỏ — nút "+" đã có sẵn giữa thanh tab. */}
          <main
            key={privacyOn ? 'priv-on' : 'priv-off'}
            ref={mainRef}
            className="w-full min-h-0 flex-1 overflow-y-auto pb-6 pt-[env(safe-area-inset-top)] lg:pt-0"
          >
            {/* Lưới an toàn: query lỗi không được hiển thị như "không có dữ liệu" */}
            <QueryErrorBanner />
            <Outlet />
            {/* Chân trang nằm TRONG <main>: nó cuộn cùng nội dung và đứng ở cuối mỗi
                trang. Để ngoài <main> thì nó thành dải cố định, chen chỗ với nav dưới. */}
            <AppFooter />
          </main>

          {/* Ẩn ở trang nhập giao dịch để lấy tối đa không gian cho bàn số */}
          <BottomNav hidden={onEntry} />
        </div>

        <LoadProgress percent={loadPercent} />

      {/* Toast này dùng chung chỗ với viên thuốc tiến độ. Nút đang hiện thì toast tụt
          xuống một bậc, thay vì hai cái chồng lên nhau. */}
      {recurringToast && (
        <div
          className={`fixed inset-x-0 z-50 flex justify-center ${
            loadPercent === null
              ? 'top-[calc(1rem+env(safe-area-inset-top))]'
              : 'top-[calc(3.75rem+env(safe-area-inset-top))]'
          }`}
        >
          <div className="rounded-full bg-gray-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
            {recurringToast}
          </div>
        </div>
      )}

      {/* Toast hoàn tác sau khi xóa (mục AB). Đáy mobile hạ từ bottom-24 xuống
          bottom-16: thanh tab dưới không còn là thẻ nổi cách mép 12px mà dính hẳn mép,
          cao 46px + dải an toàn — toast chỉ cần né chừng đó. */}
      {undoToast && (
        <div className={`fixed inset-x-0 z-50 flex justify-center px-4 ${onEntry ? 'bottom-4' : 'bottom-16 lg:bottom-6'}`}>
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
        <div className={`fixed inset-x-0 z-50 flex justify-center px-4 ${onEntry ? 'bottom-20' : 'bottom-32 lg:bottom-20'}`}>
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
    </MonthKeyProvider>
  )
}
