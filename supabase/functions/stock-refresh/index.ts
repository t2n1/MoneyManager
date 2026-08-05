// Edge function stock-refresh — chạy mỗi chiều sau khi sàn Việt Nam đóng cửa.
//
// Hai việc: (1) hút bảng giá SSI vào stock_prices, (2) tính lại giá trị thị trường cho
// từng tài khoản có sổ lệnh và ghi vào account_valuations.
//
// Function này KHÔNG có phép tính riêng. Mọi phép tính gọi từ `_holdings.js` (gói từ
// src/features/assets/serverBundle.ts) — cùng lý do như push-notify: hai bản sao của
// một phép tính là chuyện sớm muộn lệch nhau.
//
// Chạy thử tại máy:  supabase functions serve stock-refresh
// Deploy:            npm run bundle:rules && supabase functions deploy stock-refresh --no-verify-jwt
// Xem thêm:          docs/co-phieu-viet-nam.md

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2'
import { fetchBoard, type Exchange, type PriceUpsert } from './prices.ts'
import { brokerCash, holdingsFromTrades, portfolioValue, sessionPrices } from './_holdings.js'
import { loadPortfolioAccounts } from './loadInput.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
// Dùng lại bí mật cron của push: nó là "bí mật cho cron" nói chung, không riêng gì push.
// Không có nó thì bất kỳ ai biết URL cũng gọi được function và đốt hạn mức.
const CRON_SECRET = Deno.env.get('PUSH_CRON_SECRET') ?? ''

const EXCHANGES: Exchange[] = ['hose', 'hnx', 'upcom']

interface KetQua {
  /** Số mã đã ghi vào bảng giá, theo sàn. */
  giaTheoSan: Record<string, number>
  /** Số tài khoản đã ghi snapshot mới. */
  daGhi: number
  /** Vì sao những tài khoản còn lại bị bỏ qua — gom theo lý do để đọc log cho nhanh. */
  boQua: Record<string, number>
  loi: string[]
}

function demBoQua(kq: KetQua, lyDo: string) {
  kq.boQua[lyDo] = (kq.boQua[lyDo] ?? 0) + 1
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET || !CRON_SECRET) {
    return new Response('Sai bí mật cron', { status: 401 })
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const kq: KetQua = { giaTheoSan: {}, daGhi: 0, boQua: {}, loi: [] }

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

  // --- Việc 2: tính lại giá trị thị trường và ghi vào account_valuations ---
  try {
    const { data: priceRows, error: priceErr } = await sb
      .from('stock_prices')
      .select('symbol, price, trading_date')
    if (priceErr) throw priceErr

    // Ba sàn hút độc lập (một sàn lỗi thì hai sàn còn lại vẫn ghi) nên sau một lượt
    // chạy, không phải mọi hàng của stock_prices chắc chắn cùng trading_date.
    // sessionPrices gom về MỘT phiên (ngày lớn nhất, cũng là ngày mà snapshot này
    // thuộc về) và nêu tên mã nào còn kẹt ở phiên cũ hơn — sàn của nó chưa hút được
    // lần này.
    const { session: phien, priceBySymbol, staleSymbols } = sessionPrices(
      (priceRows ?? []).map((p: any) => ({
        symbol: p.symbol as string,
        price: Number(p.price),
        trading_date: p.trading_date as string,
      })),
    )
    if (!phien) throw new Error('Bảng giá rỗng, không biết ngày phiên')

    const accounts = await loadPortfolioAccounts(sb)
    for (const a of accounts) {
      // Một tài khoản lỗi (mạng chập chờn, hết kết nối pool) KHÔNG được làm chết cả
      // lượt — tài khoản khác vẫn phải được xét và ghi, giống cách push-notify cô lập
      // lỗi theo từng user.
      try {
        const { holdings, oversold } = holdingsFromTrades(a.trades)
        // Sổ lệnh có lỗ hổng: giữ số cũ, không ghi số biết là sai.
        if (oversold.length > 0) {
          demBoQua(kq, 'so-lenh-co-lo-hong')
          continue
        }
        // Mã đang giữ mà giá còn ở phiên cũ hơn (sàn của nó hụt lần hút này): giá vẫn
        // có và > 0 nên portfolioValue không tự phát hiện được — phải chặn ở đây, kẻo
        // ghi một số trông như mới nhưng thật ra dùng giá hôm qua, đóng dấu "hôm nay".
        if (holdings.some((h) => staleSymbols.has(h.symbol))) {
          demBoQua(kq, 'gia-le-phien-cu')
          continue
        }
        const cash = brokerCash(a.balance, a.trades)
        const { marketValue } = portfolioValue(holdings, priceBySymbol, cash)
        if (marketValue === null) {
          demBoQua(kq, cash < 0 ? 'tien-chua-dau-tu-am' : 'thieu-gia-moi-ma')
          continue
        }

        // `ignoreDuplicates: false` = do update. Mệnh đề `where source = 'auto'` không
        // biểu diễn được qua PostgREST, nên đọc trước rồi mới quyết: hàng người dùng gõ
        // tay của đúng ngày đó phải được giữ nguyên (quyết định 4).
        const { data: sanCo, error: docErr } = await sb
          .from('account_valuations')
          .select('id, source')
          .eq('account_id', a.accountId)
          .eq('valued_on', phien)
          .maybeSingle()
        if (docErr) throw docErr
        if (sanCo && sanCo.source === 'manual') {
          demBoQua(kq, 'nguoi-dung-da-go-tay')
          continue
        }

        const { error: ghiErr } = await sb.from('account_valuations').upsert(
          {
            user_id: a.userId,
            account_id: a.accountId,
            valued_on: phien,
            market_value: marketValue,
            note: `Tự tính theo giá phiên ${phien}`,
            source: 'auto',
          },
          { onConflict: 'account_id,valued_on' },
        )
        if (ghiErr) throw ghiErr
        kq.daGhi++
      } catch (err) {
        kq.loi.push(
          `tài khoản ${a.accountId.slice(0, 8)}…: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
  } catch (err) {
    kq.loi.push(`ghi gia tri: ${err instanceof Error ? err.message : String(err)}`)
  }

  console.log('stock-refresh', JSON.stringify(kq))
  return new Response(JSON.stringify(kq), {
    status: kq.loi.length > 0 && Object.keys(kq.giaTheoSan).length === 0 ? 500 : 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
