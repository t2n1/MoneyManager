// "Số rút gọn" (Cài đặt): nhãn ngắn của YÊN theo 万/億 hay theo nghìn/triệu.
//
// Store nhỏ ngoài React, cùng khuôn với lib/privacy.ts: `formatCompact` là hàm thuần gọi
// khắp nơi (nhãn trục, ô lịch…) nên phải đọc được giá trị TỨC THỜI mà không cần hook.
// Component đăng ký qua useCompactStyle() — AppLayout dùng nó làm key của <main>, nên đổi
// lựa chọn là cả trang vẽ lại, kể cả tickFormatter của biểu đồ.
//
// Riêng từng máy (localStorage), như Sáng/Tối và Cỡ chữ: đây là "ý thích khi nhìn", và
// lưu vào hồ sơ thì phải đổi schema.
import { useSyncExternalStore } from 'react'

/** `ja` = 万/億 (mặc định, hành vi cũ) · `vi` = nghìn/triệu/tỷ (k/tr/tỷ). */
export type CompactStyle = 'ja' | 'vi'

const KEY = 'sct-compact-style'

function readInitial(): CompactStyle {
  try {
    return localStorage.getItem(KEY) === 'vi' ? 'vi' : 'ja'
  } catch {
    return 'ja'
  }
}

let style: CompactStyle = readInitial()
const listeners = new Set<() => void>()

/** Đọc lựa chọn tức thời (dùng trong hàm thuần như formatCompact). */
export function getCompactStyle(): CompactStyle {
  return style
}

export function setCompactStyle(value: CompactStyle) {
  style = value
  try {
    localStorage.setItem(KEY, value)
  } catch {
    // bỏ qua nếu localStorage không khả dụng
  }
  for (const l of listeners) l()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Hook React: lựa chọn hiện tại (tự re-render khi đổi). */
export function useCompactStyle(): CompactStyle {
  return useSyncExternalStore(
    subscribe,
    () => style,
    () => style,
  )
}
