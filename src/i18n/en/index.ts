// Từ điển tiếng Anh = gộp mọi file cùng thư mục (mỗi vùng tính năng một file, để nhiều
// người sửa song song không đụng nhau). Khoá là câu tiếng Việt gốc truyền vào `tr()`.
import type { Dict } from '../index'

const parts = import.meta.glob<Dict>(['./*.ts', '!./index.ts'], { eager: true, import: 'default' })

export const EN: Dict = Object.assign({}, ...Object.values(parts))
