// Nạp từ điển tiếng Anh TRƯỚC khi module nào của app được đánh giá (main.tsx await hàm
// này rồi mới import động phần còn lại) — vì `tr()` được gọi cả ở hằng số cấp module.
// Chế độ Việt không tải byte nào của từ điển.
import { getLang, setDictionary, type Dict } from './index'

export async function loadDictionary() {
  if (typeof document !== 'undefined') document.documentElement.lang = getLang()
  if (getLang() !== 'en') return
  const { EN } = await import('./en')
  setDictionary(EN as Dict)
}
