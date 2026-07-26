// Quản lý cỡ chữ toàn app (Nhỏ / Vừa / Lớn / Rất lớn).
// - Lưu lựa chọn vào localStorage (key 'font-scale').
// - Đặt biến CSS --app-font-scale lên <html>; index.css dùng nó để tính
//   font-size gốc, nên mọi cỡ chữ/khoảng cách theo rem của Tailwind co giãn theo.
// - App khóa pinch-zoom (viewport user-scalable=no) nên đây là cách duy nhất
//   để người dùng phóng to chữ.

export type FontScalePref = 'sm' | 'md' | 'lg' | 'xl'

const STORAGE_KEY = 'font-scale'

export const FONT_SCALES: Record<FontScalePref, number> = {
  sm: 0.9,
  md: 1,
  lg: 1.1,
  xl: 1.25,
}

export function getFontScalePref(): FontScalePref {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'sm' || saved === 'md' || saved === 'lg' || saved === 'xl') return saved
  return 'md'
}

export function applyFontScale(pref: FontScalePref) {
  document.documentElement.style.setProperty('--app-font-scale', String(FONT_SCALES[pref]))
}

export function setFontScalePref(pref: FontScalePref) {
  localStorage.setItem(STORAGE_KEY, pref)
  applyFontScale(pref)
}
