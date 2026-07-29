// Hộp thoại dùng chung toàn app: confirm (xác nhận) + prompt (nhập 1 dòng) +
// toast thông báo — thay cho window.confirm/prompt/alert (không theo theme, xấu
// trên PWA mobile). Store ngoài React (giống undoToast) để gọi imperative bất kỳ đâu;
// <DialogHost/> render ở AppLayout hiển thị đúng 1 hộp thoại + 1 toast tại một thời điểm.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AlertTriangle, Check } from 'lucide-react'

// ---- Dialog (confirm / prompt) ----

interface ConfirmReq {
  kind: 'confirm'
  id: number
  title: string
  message?: string
  confirmLabel: string
  cancelLabel: string
  danger: boolean
  resolve: (ok: boolean) => void
}
interface PromptReq {
  kind: 'prompt'
  id: number
  title: string
  message?: string
  placeholder?: string
  defaultValue: string
  confirmLabel: string
  resolve: (value: string | null) => void
}
type DialogReq = ConfirmReq | PromptReq

let current: DialogReq | null = null
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function finish(value: boolean | string | null) {
  const req = current
  current = null
  emit()
  if (!req) return
  // resolve theo đúng kiểu của từng loại
  if (req.kind === 'confirm') req.resolve(Boolean(value))
  else req.resolve(value === false ? null : (value as string | null))
}

/** Xác nhận hành động. Trả về true nếu người dùng đồng ý. */
export function confirmDialog(opts: {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}): Promise<boolean> {
  return new Promise((resolve) => {
    current = {
      kind: 'confirm',
      id: ++seq,
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel ?? 'Xác nhận',
      cancelLabel: opts.cancelLabel ?? 'Hủy',
      danger: opts.danger ?? false,
      resolve,
    }
    emit()
  })
}

/** Nhập 1 dòng văn bản. Trả về chuỗi đã trim, hoặc null nếu hủy/để trống. */
export function promptDialog(opts: {
  title: string
  message?: string
  placeholder?: string
  defaultValue?: string
  confirmLabel?: string
}): Promise<string | null> {
  return new Promise((resolve) => {
    current = {
      kind: 'prompt',
      id: ++seq,
      title: opts.title,
      message: opts.message,
      placeholder: opts.placeholder,
      defaultValue: opts.defaultValue ?? '',
      confirmLabel: opts.confirmLabel ?? 'Lưu',
      resolve,
    }
    emit()
  })
}

function useDialog(): DialogReq | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
    () => current,
  )
}

// ---- Toast thông báo (thay window.alert) ----

export type ToastKind = 'info' | 'success' | 'error'
interface ToastState {
  id: number
  message: string
  kind: ToastKind
}

let toast: ToastState | null = null
let toastSeq = 0
let toastTimer: ReturnType<typeof setTimeout> | undefined
const toastListeners = new Set<() => void>()
const emitToast = () => toastListeners.forEach((l) => l())

/** Hiện toast thông báo ngắn (tự ẩn). kind='error' cho lỗi. */
export function showToast(message: string, kind: ToastKind = 'info', duration = 3500) {
  clearTimeout(toastTimer)
  toast = { id: ++toastSeq, message, kind }
  emitToast()
  toastTimer = setTimeout(() => {
    toast = null
    emitToast()
  }, duration)
}

function useToast(): ToastState | null {
  return useSyncExternalStore(
    (cb) => {
      toastListeners.add(cb)
      return () => toastListeners.delete(cb)
    },
    () => toast,
    () => toast,
  )
}

// ---- Host component (render ở AppLayout) ----

export function DialogHost() {
  const req = useDialog()
  const toastState = useToast()

  return (
    <>
      {req && <DialogModal req={req} />}
      {toastState && <MessageToast toast={toastState} />}
    </>
  )
}

function DialogModal({ req }: { req: DialogReq }) {
  const [value, setValue] = useState(req.kind === 'prompt' ? req.defaultValue : '')
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset khi đổi hộp thoại + đóng bằng Esc
  useEffect(() => {
    if (req.kind === 'prompt') {
      setValue(req.defaultValue)
      // autoFocus + chọn sẵn để sửa nhanh
      requestAnimationFrame(() => inputRef.current?.select())
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') finish(req.kind === 'confirm' ? false : null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [req])

  const onConfirm = () => {
    if (req.kind === 'confirm') finish(true)
    else {
      const trimmed = value.trim()
      finish(trimmed === '' ? null : trimmed)
    }
  }
  const onCancel = () => finish(req.kind === 'confirm' ? false : null)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 lg:items-center"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={req.title}
        className="w-full max-w-md rounded-t-2xl bg-white dark:bg-gray-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">{req.title}</h2>
        {req.message && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{req.message}</p>
        )}

        {req.kind === 'prompt' && (
          <input
            ref={inputRef}
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onConfirm()
            }}
            placeholder={req.placeholder}
            className="mt-3 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-base outline-green-500 dark:bg-gray-900 dark:text-gray-100"
          />
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-95"
          >
            {req.kind === 'confirm' ? req.cancelLabel : 'Hủy'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={req.kind === 'prompt' && value.trim() === ''}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-50 ${
              req.kind === 'confirm' && req.danger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-green-700 hover:bg-green-800'
            }`}
          >
            {req.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageToast({ toast: t }: { toast: ToastState }) {
  const tone =
    t.kind === 'error'
      ? 'bg-red-600'
      : t.kind === 'success'
        ? 'bg-green-700'
        : 'bg-gray-900/95'
  const Icon = t.kind === 'error' ? AlertTriangle : t.kind === 'success' ? Check : null

  return (
    <div
      className="fixed inset-x-0 top-[calc(1rem+env(safe-area-inset-top))] z-50 flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <div
        className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg ${tone}`}
      >
        {Icon && <Icon className="h-4 w-4 shrink-0" />}
        <span>{t.message}</span>
      </div>
    </div>
  )
}
