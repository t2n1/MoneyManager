// Toast "Có bản mới" của PWA — store nhỏ ngoài React (cùng khuôn errorToast) để
// main.tsx đăng ký service worker được từ ngoài cây React, còn AppLayout chỉ việc đọc.
//
// Vì sao là 'prompt' chứ không 'autoUpdate': bản chất PWA là lượt mở đầu chạy bản CŨ
// trong lúc tải bản mới về nền. 'autoUpdate' đổi worker xong vẫn để trang cũ chạy —
// người dùng phải đóng-mở hai lần và không bao giờ chắc mình đang xem bản nào. Với
// 'prompt', bản mới về là `onNeedRefresh` bắn, toast nổi lên, một chạm "Tải lại" là
// đứng trên bản mới. Không chạm thì như cũ: lần đóng hẳn app tiếp theo tự lên bản mới.
import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

/** Tab mở lâu (PC cắm cả ngày) vẫn biết có bản mới: hỏi lại theo nhịp này. */
const CHECK_EVERY_MS = 60 * 60 * 1000

let coBanMoi = false
let capNhat: ((reloadPage?: boolean) => Promise<void>) | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

/** Gọi MỘT lần từ main.tsx. Trong dev không có service worker — registerSW tự thành no-op. */
export function initPwaUpdate() {
  capNhat = registerSW({
    onNeedRefresh() {
      coBanMoi = true
      emit()
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return
      setInterval(() => {
        reg.update().catch(() => {}) // offline thì thôi, lần sau hỏi tiếp
      }, CHECK_EVERY_MS)
    },
  })
}

/** Nạp bản mới ngay: kích hoạt worker đang chờ rồi tải lại trang. */
export function applyPwaUpdate() {
  void capNhat?.(true)
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function usePwaUpdate(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => coBanMoi,
    () => coBanMoi,
  )
}
