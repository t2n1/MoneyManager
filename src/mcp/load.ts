// Đọc dữ liệu từ Supabase → DuLieu. Đây là tầng IO duy nhất của MCP server; mọi luật nằm ở
// basket.ts và tools/*.
//
// CHỈ ĐỌC. Không insert/update/upsert/delete ở file này, và không ở đâu khác trong src/mcp.
//
// Mỗi bảng đọc qua fetchAllPages: PostgREST cắt ở 1.000 dòng và cắt IM LẶNG — sổ 9 năm nhập
// từ Zaim có ~14.000 giao dịch, nên truy vấn không phân trang trả về một phần mà không báo gì
// (xem src/data/paging.ts).
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllPages } from '../data/paging'
import type { DuLieu } from './basket'
import type { Database } from '../types/database.types'

/**
 * Tên bảng phải là một trong những bảng CÓ THẬT của `Database`, không phải `string`.
 * Client của Supabase gõ `from()` theo tên bảng hằng — để lỏng thành `string` thì gõ sai
 * tên bảng chỉ nổ lúc chạy, mà đây là chỗ duy nhất chạm DB nên nó nổ ở tận trong Vercel.
 */
type TenBang = keyof Database['public']['Tables']

export async function napDuLieu(
  sb: SupabaseClient<Database>,
  userId: string,
): Promise<DuLieu> {
  // Client của Supabase suy kiểu CỘT từ tên bảng hằng; đưa vào một tên bảng thuộc kiểu
  // hợp (union) thì mọi tham số cột sụp về `never` và `.eq('user_id', …)` không biên dịch
  // được. Nên bảng nào cũng đọc y một kiểu ở đây thì đọc qua client KHÔNG gõ schema, còn
  // cái được giữ chặt là tên bảng (`TenBang`) và kiểu dòng trả về (`T`).
  const bat = sb as unknown as SupabaseClient

  const doc = <T>(bang: TenBang, sapTheo: string) =>
    fetchAllPages<T>(async (from, to) => {
      const { data, error } = await bat
        .from(bang)
        .select('*')
        .eq('user_id', userId)
        // Thứ tự phải ĐƠN TRỊ, không thì hai trang liền nhau có thể trùng dòng và bỏ sót dòng.
        .order(sapTheo, { ascending: true })
        .range(from, to)
      return { data: data as T[] | null, error }
    })

  const [profile, txs, accounts, categories, tags, txTags, budgets, fx] = await Promise.all([
    sb.from('profiles').select('*').eq('user_id', userId).single(),
    doc<DuLieu['txs'][number]>('transactions', 'id'),
    doc<DuLieu['accounts'][number]>('accounts', 'id'),
    doc<DuLieu['categories'][number]>('categories', 'id'),
    doc<DuLieu['tags'][number]>('tags', 'id'),
    doc<DuLieu['txTags'][number]>('transaction_tags', 'transaction_id'),
    doc<DuLieu['budgets'][number]>('budgets', 'id'),
    doc<DuLieu['fx'][number]>('fx_history', 'on_date'),
  ])

  if (profile.error) {
    throw new Error(`Đọc bảng profiles lỗi: ${profile.error.message}`)
  }
  if (profile.data === null) {
    throw new Error(`Không có dòng profiles cho user ${userId} — kiểm lại SO_GAO_USER_ID.`)
  }

  return {
    txs, accounts, categories, tags, txTags, budgets, fx,
    base: profile.data.base_currency,
    monthStartDay: profile.data.month_start_day,
    tz: profile.data.push_tz,
  }
}
