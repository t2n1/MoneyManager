// Toast LỖI toàn cục — lưới an toàn cuối cùng cho mọi mutation thất bại.
//
// Vì sao cần: phần lớn chỗ ghi dữ liệu gọi `.mutate()` bắn-rồi-quên hoặc `await
// mutateAsync()` không try/catch. Trước đây lưu thất bại là im lặng tuyệt đối —
// người dùng tưởng đã lưu xong, dữ liệu thì không có. main.tsx gắn store này vào
// MutationCache.onError nên KHÔNG chỗ ghi nào có thể thất bại trong im lặng nữa;
// nơi gọi nào muốn thông điệp tinh hơn cứ tự catch/onError, toast này chỉ là sàn.
//
// Store nhỏ ngoài React (cùng kiểu undoToast) để main.tsx — nơi không có React
// context — gọi được showErrorToast(...); AppLayout hiển thị + tự ẩn.
import { useSyncExternalStore } from 'react'

export interface ErrorToastState {
  id: number
  message: string
}

/**
 * Đổi một lỗi bất kỳ thành câu đọc được.
 *
 * `error instanceof Error` KHÔNG đủ, và đây là lỗi đã thấy trên app đang chạy: lỗi của
 * Supabase là object thường (`PostgrestError` = { message, details, hint, code }), nên
 * `String(error)` ra đúng chữ `[object Object]`. Mà Supabase là nguồn lỗi ghi phổ biến
 * NHẤT của app này — tức lưới an toàn hiện một câu vô nghĩa ở đúng ca nó tồn tại để lo.
 *
 * Thứ tự đọc: message → details → mã lỗi. Hết cách thì nói "lỗi không rõ" chứ tuyệt đối
 * không để `[object Object]` lên màn hình.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object') {
    const o = error as { message?: unknown; details?: unknown; code?: unknown }
    if (typeof o.message === 'string' && o.message.trim()) return o.message
    if (typeof o.details === 'string' && o.details.trim()) return o.details
    if (typeof o.code === 'string' && o.code.trim()) return `mã lỗi ${o.code}`
  }
  if (typeof error === 'string' && error.trim()) return error
  // try/catch quanh String(): `String(Object.create(null))` NÉM TypeError vì object
  // không prototype thì không có toString. Hàm cuối đường của lưới an toàn mà tự ném
  // thì mất luôn cái toast — test errorToast.test.ts bắt đúng ca này.
  let s: string
  try {
    s = String(error)
  } catch {
    return 'lỗi không rõ'
  }
  return s === '[object Object]' || !s.trim() ? 'lỗi không rõ' : s
}

let current: ErrorToastState | null = null
let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

/** Hiện toast lỗi; toast mới đè toast cũ (lỗi dồn dập thì cái cuối là đủ). */
export function showErrorToast(message: string, duration = 6000) {
  clearTimeout(timer)
  current = { id: ++seq, message }
  emit()
  timer = setTimeout(() => {
    current = null
    emit()
  }, duration)
}

export function dismissErrorToast() {
  clearTimeout(timer)
  current = null
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useErrorToast(): ErrorToastState | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  )
}
