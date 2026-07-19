// Chế độ riêng tư (mục AK): ẩn mọi số tiền thành ••• khi mở app nơi công cộng.
// Store nhỏ ngoài React để formatMoney (hàm thuần, gọi khắp nơi) đọc được tập trung;
// component đăng ký qua usePrivacyMode() để re-render khi bật/tắt. Lưu localStorage.
import { useSyncExternalStore } from 'react'

const KEY = 'sct-privacy-mode'

function readInitial(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let enabled = readInitial()
const listeners = new Set<() => void>()

/** Đọc trạng thái tức thời (dùng trong hàm thuần như formatMoney). */
export function isPrivacyEnabled(): boolean {
  return enabled
}

export function setPrivacyEnabled(value: boolean) {
  enabled = value
  try {
    localStorage.setItem(KEY, value ? '1' : '0')
  } catch {
    // bỏ qua nếu localStorage không khả dụng
  }
  for (const l of listeners) l()
}

export function togglePrivacy() {
  setPrivacyEnabled(!enabled)
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Hook React: trả về true nếu đang bật chế độ riêng tư (tự re-render khi đổi). */
export function usePrivacyMode(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => enabled,
    () => enabled,
  )
}
