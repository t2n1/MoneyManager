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

/**
 * Cột của `transactions` thêm sau (migration 0054 → 0072) mà một DB chưa chạy migration có
 * thể chưa có. Bỏ cột đi thì dòng vẫn đúng hình dạng: vắng mặt = hành vi trước migration
 * (owner vắng = 'mine', adjust_kind vắng = nhận khoản bù bằng ghi chú…).
 */
export const COT_GIAO_DICH_MOI = [
  'adjust_kind',
  'adjust_is_spend',
  'owner',
  'stock_symbol',
  'stock_trade_id',
  'remit_recipient_id',
  // KHÔNG có `fund_part_id` (0073): bỏ nó đi là khoản góp quỹ chung lưu xong mà mất phần
  // góp — đúng thông tin duy nhất làm nó thành khoản góp. Thà báo lỗi. Form chỉ gửi cột
  // này khi đang ghi khoản góp, nên DB chưa chạy 0073 không làm hỏng chuyển khoản thường.
] as const

function carries(payload: object, column: string): boolean {
  if (Array.isArray(payload)) return payload.some((r) => carries(r as object, column))
  return Object.prototype.hasOwnProperty.call(payload, column)
}

function omitColumn<P extends object>(payload: P, column: string): P {
  if (Array.isArray(payload)) return payload.map((r) => omitColumn(r as object, column)) as P
  const { [column]: _bo, ...rest } = payload as Record<string, unknown>
  return rest as P
}

/**
 * Chạy `run(payload)`; lỗi đúng là "DB thiếu cột X" với X trong `columns` VÀ payload đang
 * mang X thì bỏ X ra rồi chạy lại. Lỗi khác trả nguyên cho nơi gọi xử.
 *
 * Mỗi cột bỏ tối đa một lần, nên vòng lặp luôn dừng. `payload` là một dòng hoặc một mảng
 * dòng (chèn theo lô) — mảng thì bỏ cột ở mọi dòng.
 */
export async function runDropMissingColumns<P extends object, R extends { error: ErrorLike | null }>(
  payload: P,
  columns: readonly string[],
  run: (payload: P) => PromiseLike<R>,
): Promise<R> {
  let current = payload
  const dropped = new Set<string>()
  for (;;) {
    const res = await run(current)
    const col = columns.find(
      (c) => !dropped.has(c) && carries(current, c) && isMissingColumnError(res.error, c),
    )
    if (!col) return res
    dropped.add(col)
    current = omitColumn(current, col)
  }
}
