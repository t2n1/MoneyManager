import type { Dict } from '../index'

// Tên tiếng Anh của các danh mục MẶC ĐỊNH (seed trong supabase/migrations, và danh mục app tự
// tạo như Cho vay / Gửi tiền về VN / Thuế & An sinh). Khoá `cat|<tên trong DB>`, tra bằng
// categoryLabel() — xem src/i18n/index.ts. Thêm danh mục mặc định mới thì thêm dòng ở đây.
const d: Dict = {}

export default d
