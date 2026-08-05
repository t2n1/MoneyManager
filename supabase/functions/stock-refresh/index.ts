// Edge function stock-refresh — chạy mỗi chiều sau khi sàn Việt Nam đóng cửa.
//
// Hai việc: (1) hút bảng giá SSI vào stock_prices, (2) tính lại giá trị thị trường cho
// từng tài khoản có sổ lệnh và ghi vào account_valuations. Việc (2) nối ở Task 8.
//
// Function này KHÔNG có phép tính riêng. Mọi phép tính gọi từ `_holdings.js` (gói từ
// src/features/assets/serverBundle.ts) — cùng lý do như push-notify: hai bản sao của
// một phép tính là chuyện sớm muộn lệch nhau.
//
// Chạy thử tại máy:  supabase functions serve stock-refresh
// Deploy:            npm run bundle:rules && supabase functions deploy stock-refresh --no-verify-jwt
// Xem thêm:          docs/co-phieu-viet-nam.md

import { createClient } from 'npm:@supabase/supabase-js@2'
import { fetchBoard, type Exchange, type PriceUpsert } from './prices.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
// Dùng lại bí mật cron của push: nó là "bí mật cho cron" nói chung, không riêng gì push.
// Không có nó thì bất kỳ ai biết URL cũng gọi được function và đốt hạn mức.
const CRON_SECRET = Deno.env.get('PUSH_CRON_SECRET') ?? ''

const EXCHANGES: Exchange[] = ['hose', 'hnx', 'upcom']

interface KetQua {
  /** Số mã đã ghi vào bảng giá, theo sàn. */
  giaTheoSan: Record<string, number>
  loi: string[]
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET || !CRON_SECRET) {
    return new Response('Sai bí mật cron', { status: 401 })
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const kq: KetQua = { giaTheoSan: {}, loi: [] }

  // Hút từng sàn độc lập: một sàn lỗi thì hai sàn còn lại vẫn được ghi. Bảng giá thiếu
  // một sàn còn dùng được; ném hết đi vì một sàn hỏng thì không.
  for (const ex of EXCHANGES) {
    try {
      const rows: PriceUpsert[] = await fetchBoard(ex)
      if (rows.length === 0) {
        kq.loi.push(`${ex}: bảng giá rỗng`)
        continue
      }
      // Chia lô: 400+ mã một câu upsert là payload to và dễ timeout.
      for (let i = 0; i < rows.length; i += 200) {
        const part = rows.slice(i, i + 200).map((r) => ({ ...r, updated_at: new Date().toISOString() }))
        const { error } = await sb.from('stock_prices').upsert(part, { onConflict: 'symbol' })
        if (error) throw error
      }
      kq.giaTheoSan[ex] = rows.length
    } catch (err) {
      kq.loi.push(`${ex}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log('stock-refresh', JSON.stringify(kq))
  return new Response(JSON.stringify(kq), {
    status: kq.loi.length > 0 && Object.keys(kq.giaTheoSan).length === 0 ? 500 : 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
