// Phần của lớp ngôn ngữ CHỈ chạy trên trình duyệt: đọc/lưu lựa chọn, nạp từ điển tiếng Anh.
//
// main.tsx await `loadDictionary()` rồi mới import động phần còn lại của app — vì `tr()` được
// gọi cả ở hằng số cấp module, ngôn ngữ và từ điển phải sẵn trước khi module nào được đánh
// giá. Chế độ Việt không tải byte nào của từ điển.
import { initLang, setDictionary, type Dict, type Lang } from './index'

const STORAGE_KEY = 'sct-lang'

function readLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'vi'
  } catch {
    return 'vi'
  }
}

export async function loadDictionary() {
  const lang = readLang()
  initLang(lang)
  document.documentElement.lang = lang
  if (lang !== 'en') return
  const { EN } = await import('./en')
  setDictionary(EN as Dict)
}

/** Đổi ngôn ngữ = lưu rồi tải lại trang: ngôn ngữ chốt cho cả phiên trang (xem src/i18n/index.ts). */
export function setLang(next: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    return
  }
  location.reload()
}
