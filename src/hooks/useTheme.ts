import { useEffect, useState } from 'react'
import { applyTheme, getThemePref, setThemePref, type ThemePref } from '../lib/theme'

/**
 * Đọc/ghi lựa chọn giao diện. Khi chọn 'system' sẽ lắng nghe thay đổi
 * cài đặt Sáng/Tối của thiết bị để tự cập nhật.
 */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(getThemePref)

  useEffect(() => {
    if (pref !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [pref])

  const update = (next: ThemePref) => {
    setThemePref(next)
    setPref(next)
  }

  return { pref, setTheme: update }
}
