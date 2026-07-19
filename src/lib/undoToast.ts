// Toast "Đã xóa · Hoàn tác" toàn cục (mục AB). Store nhỏ ngoài React để mọi nơi
// gọi được showUndoToast(...) sau khi xóa; AppLayout hiển thị + đếm ngược ~5s.
import { useSyncExternalStore } from 'react'

export interface UndoToastState {
  id: number
  message: string
  onUndo: () => void | Promise<void>
}

let current: UndoToastState | null = null
let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

/** Hiện toast hoàn tác; tự ẩn sau `duration` ms nếu không bấm. */
export function showUndoToast(
  message: string,
  onUndo: () => void | Promise<void>,
  duration = 5000,
) {
  clearTimeout(timer)
  current = { id: ++seq, message, onUndo }
  emit()
  timer = setTimeout(() => {
    current = null
    emit()
  }, duration)
}

export function dismissUndoToast() {
  clearTimeout(timer)
  current = null
  emit()
}

/** Chạy callback hoàn tác rồi ẩn toast. */
export async function runUndo() {
  const c = current
  dismissUndoToast()
  if (c) await c.onUndo()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useUndoToast(): UndoToastState | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  )
}
