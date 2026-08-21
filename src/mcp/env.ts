// Biến môi trường của MCP server. KHÔNG dùng import.meta.env (Vite-only) — file này chạy
// trên Node trong Vercel function.
//
// `.trim()` không phải làm đẹp: đặt secret từ PowerShell trên Windows hay để lọt một ký tự
// xuống dòng vào cuối giá trị — cùng cái bẫy đã làm push-notify ném lỗi vô hình
// (xem supabase/functions/push-notify/index.ts).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

export interface Cauhinh {
  supabaseUrl: string
  serviceRoleKey: string
  userId: string
  token: string
}

/** Độ dài tối thiểu của bearer token. Nó là hàng rào DUY NHẤT nên không cho ngắn. */
const TOKEN_TOI_THIEU = 32

export function docCauhinh(env: Record<string, string | undefined>): Cauhinh {
  const doc = (ten: string): string => {
    const v = (env[ten] ?? '').trim()
    if (v === '') {
      throw new Error(
        `Thiếu biến môi trường ${ten}. Đặt nó trong Vercel (Settings → Environment Variables) ` +
          'rồi deploy lại.',
      )
    }
    return v
  }
  const token = doc('MCP_BEARER_TOKEN')
  if (token.length < TOKEN_TOI_THIEU) {
    throw new Error(
      `MCP_BEARER_TOKEN phải dài ít nhất ${TOKEN_TOI_THIEU} ký tự — nó là hàng rào duy nhất ` +
        'của server này. Sinh bằng: openssl rand -hex 32',
    )
  }
  return {
    supabaseUrl: doc('SUPABASE_URL'),
    serviceRoleKey: doc('SUPABASE_SERVICE_ROLE_KEY'),
    userId: doc('SO_GAO_USER_ID'),
    token,
  }
}

export function taoClient(c: Cauhinh): SupabaseClient<Database> {
  // service-role đi VÒNG QUA RLS. Chấp nhận được vì server không có đường ghi nào và bearer
  // token chặn ở cửa; đổi lại, mọi truy vấn dưới đây PHẢI tự lọc user_id.
  return createClient<Database>(c.supabaseUrl, c.serviceRoleKey, {
    auth: { persistSession: false },
  })
}
