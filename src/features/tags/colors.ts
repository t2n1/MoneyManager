// Bảng màu cho nhãn. Lưu KHÓA màu trong DB (không lưu mã hex) để đổi bảng màu
// hay thêm dark mode về sau không phải migrate dữ liệu.

export const TAG_COLOR_KEYS = [
  'gray',
  'red',
  'amber',
  'green',
  'sky',
  'indigo',
  'pink',
] as const

export type TagColorKey = (typeof TAG_COLOR_KEYS)[number]

/** Lớp Tailwind cho chip nhãn (nền nhạt + chữ đậm màu), có bản dark. */
export const TAG_CHIP_CLASS: Record<TagColorKey, string> = {
  gray: 'bg-surface-sunken text-gray-700 dark:text-gray-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  pink: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
}

/** Tên màu tiếng Việt — cho aria-label của nút chọn màu (nút chỉ là chấm tròn). */
export const TAG_COLOR_LABELS: Record<TagColorKey, string> = {
  gray: 'xám',
  red: 'đỏ',
  amber: 'vàng',
  green: 'xanh lá',
  sky: 'xanh dương',
  indigo: 'tím than',
  pink: 'hồng',
}

/** Mã hex cho biểu đồ (recharts không nhận class Tailwind). */
export const TAG_HEX: Record<TagColorKey, string> = {
  gray: '#9ca3af',
  red: '#ef4444',
  amber: '#f59e0b',
  green: '#16a34a',
  sky: '#0ea5e9',
  indigo: '#6366f1',
  pink: '#ec4899',
}

/** Màu lưu trong DB là text tự do → ép về khóa hợp lệ, không rõ thì dùng xám. */
export function tagColor(raw: string): TagColorKey {
  return (TAG_COLOR_KEYS as readonly string[]).includes(raw) ? (raw as TagColorKey) : 'gray'
}
