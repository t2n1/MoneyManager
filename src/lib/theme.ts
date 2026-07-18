// Quản lý giao diện Sáng / Tối / Theo hệ thống.
// - Lưu lựa chọn vào localStorage (key 'theme').
// - Áp class 'dark' lên <html> để Tailwind (@custom-variant dark) đổi màu.
// - Khi chọn 'system', tự đổi theo cài đặt thiết bị.

export type ThemePref = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme'

export function getThemePref(): ThemePref {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  return 'system'
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Chế độ thực tế đang áp dụng (sau khi giải nghĩa 'system'). */
export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return pref
}

/** Áp class 'dark' và cập nhật màu thanh trạng thái trình duyệt. */
export function applyTheme(pref: ThemePref) {
  const mode = resolveTheme(pref)
  const root = document.documentElement
  root.classList.toggle('dark', mode === 'dark')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', mode === 'dark' ? '#0a0a0a' : '#16a34a')
}

export function setThemePref(pref: ThemePref) {
  localStorage.setItem(STORAGE_KEY, pref)
  applyTheme(pref)
}
