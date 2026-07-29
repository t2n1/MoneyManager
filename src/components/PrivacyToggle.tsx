import { Eye, EyeOff } from 'lucide-react'
import { togglePrivacy, usePrivacyMode } from '../lib/privacy'

/** Nút mắt bật/tắt chế độ riêng tư (ẩn số tiền). Icon-only, dùng ở header/sidebar. */
export function PrivacyToggle({ className }: { className?: string }) {
  const on = usePrivacyMode()
  const label = on ? 'Hiện số tiền' : 'Ẩn số tiền'
  return (
    <button
      type="button"
      onClick={togglePrivacy}
      aria-label={label}
      aria-pressed={on}
      title={label}
      className={
        className ??
        'flex h-9 w-9 items-center justify-center rounded-lg bg-surface text-gray-500 shadow-sm active:scale-95 dark:text-gray-400'
      }
    >
      {on ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
    </button>
  )
}
