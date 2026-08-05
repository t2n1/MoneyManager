// Danh sách bảng dữ liệu người dùng và khoá sắp xếp khi phân trang.
//
// Tách khỏi supabaseRepo để test soi được: file này không import gì của Supabase nên
// test chạy không cần mạng, và có thể đối chiếu thẳng với SQL trong supabase/migrations.

/** Các bảng dữ liệu người dùng (không gồm view account_balances). */
export const DATA_TABLES = [
  'accounts',
  'categories',
  'transactions',
  'budgets',
  'asset_group_settings',
  'debts',
  'debt_payments',
  'recurring_rules',
  'account_valuations',
  'savings_goals',
  'networth_snapshots',
  'tags',
  'transaction_tags',
  'life_scenarios',
  'life_phases',
  'life_events',
  'stock_trades',
] as const

export type DataTable = (typeof DATA_TABLES)[number]

/**
 * Khoá sắp xếp riêng cho bảng KHÔNG có cột `id`.
 *
 * Vì sao cần: phân trang bắt buộc phải sắp xếp theo một khoá đơn trị, và mặc định là
 * `id` vì gần hết bảng đều dùng uuid làm khoá chính. `transaction_tags` là bảng nối
 * khoá kép `(transaction_id, tag_id)` — hỏi `.order('id')` thì PostgREST trả lỗi
 * "column transaction_tags.id does not exist" và **Xuất dữ liệu chết cả lượt**, vì
 * exportAll đọc mọi bảng trong cùng một Promise.all.
 *
 * Thêm bảng nối mới thì phải khai ở đây; `exportTables.test.ts` đọc SQL migration và
 * báo đỏ nếu khoá sắp xếp trỏ vào cột không tồn tại.
 */
const PAGE_ORDER: Partial<Record<DataTable, readonly string[]>> = {
  transaction_tags: ['transaction_id', 'tag_id'],
}

const DEFAULT_PAGE_ORDER = ['id'] as const

/** Các cột dùng làm khoá sắp xếp khi phân trang bảng `table`. */
export function pageOrderFor(table: DataTable): readonly string[] {
  return PAGE_ORDER[table] ?? DEFAULT_PAGE_ORDER
}
