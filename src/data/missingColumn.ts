// Nhận ra lỗi "DB chưa có cột này" để code mới chạy được trên DB chưa chạy migration.
//
// Migration trong repo phải dán tay vào Supabase — code lên Vercel trước SQL là chuyện
// có thật. Insert kèm một cột DB chưa có thì PostgREST trả PGRST204 ("Could not find the
// 'x' column of 'y' in the schema cache"); Postgres trả 42703 ("column ... does not exist").
//
// Thuần, không phụ thuộc Supabase client, để unit-test được.

interface ErrorLike {
  code?: string | null
  message?: string | null
}

/** true = lỗi đúng là thiếu cột `column` (không phải lỗi nào khác cùng mã). */
export function isMissingColumnError(error: ErrorLike | null | undefined, column: string): boolean {
  if (!error) return false
  if (error.code !== 'PGRST204' && error.code !== '42703') return false
  return (error.message ?? '').includes(column)
}
