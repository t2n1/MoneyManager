// Quản lý giao diện Sáng / Tối / Theo hệ thống / E-ink.
// - Lưu lựa chọn vào localStorage (key 'theme').
// - Áp class 'dark' lên <html> để Tailwind (@custom-variant dark) đổi màu.
// - Khi chọn 'system', tự đổi theo cài đặt thiết bị.
// - 'eink' áp class 'eink' (KHÔNG kèm 'dark'): giấy sáng, mực đen, góc vuông, không
//   chuyển động — token nằm trong khối .eink của src/index.css.

export type ThemePref = 'light' | 'dark' | 'system' | 'eink'

const STORAGE_KEY = 'theme'

export function getThemePref(): ThemePref {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark' || saved === 'system' || saved === 'eink') return saved
  return 'system'
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Chế độ thực tế đang áp dụng (sau khi giải nghĩa 'system'). */
export function resolveTheme(pref: ThemePref): 'light' | 'dark' | 'eink' {
  if (pref === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return pref
}

// Màu thanh trạng thái trình duyệt. Sáng giữ màu nhấn như <meta> mặc định của
// index.html; Tối và E-ink lấy --surface-page của thang mình (script đầu index.html
// viết lại đúng mấy giá trị này, vì nó chạy trước khi CSS nạp).
const THEME_COLOR = { light: '#008236', dark: '#0b0d0c', eink: '#e6e4dd' } as const

/** Áp class 'dark' / 'eink' và cập nhật màu thanh trạng thái trình duyệt. */
export function applyTheme(pref: ThemePref) {
  const mode = resolveTheme(pref)
  const root = document.documentElement
  root.classList.toggle('dark', mode === 'dark')
  root.classList.toggle('eink', mode === 'eink')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLOR[mode])
}

export function setThemePref(pref: ThemePref) {
  localStorage.setItem(STORAGE_KEY, pref)
  applyTheme(pref)
}
