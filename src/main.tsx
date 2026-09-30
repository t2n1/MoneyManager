// Điểm vào: nạp từ điển ngôn ngữ TRƯỚC, rồi mới import app. `tr()` được gọi cả ở hằng số
// cấp module, nên mọi module của app phải được đánh giá sau khi từ điển đã sẵn — import
// tĩnh `./root` ở đây sẽ đánh giá chúng trước dòng await.
import { loadDictionary } from './i18n/load'

await loadDictionary()
await import('./root')
