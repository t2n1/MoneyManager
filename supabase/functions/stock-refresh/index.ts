// Edge function stock-refresh — chạy mỗi chiều sau khi sàn Việt Nam đóng cửa.
//
// Hai việc: (1) hút giá Yahoo cho CẢ sàn HOSE (mã đã giao dịch được gọi trước, xem
// buildFetchOrder trong prices.ts), ghi vào stock_prices, (2) tính lại giá trị thị
// trường cho từng tài khoản có sổ lệnh và ghi vào account_valuations.
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
import { buildFetchOrder, fetchYahooPrices, type PriceUpsert } from './prices.ts'
import { brokerCash, holdingsFromTrades, HOSE_SYMBOLS, portfolioValue, sessionPrices } from './_holdings.js'
import { loadPortfolioAccounts, loadTradedSymbols } from './loadInput.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
// Dùng lại bí mật cron của push: nó là "bí mật cho cron" nói chung, không riêng gì push.
// Không có nó thì bất kỳ ai biết URL cũng gọi được function và đốt hạn mức.
const CRON_SECRET = Deno.env.get('PUSH_CRON_SECRET') ?? ''

interface KetQua {
  /** Số mã đã ghi được giá vào stock_prices ở lượt này (Yahoo, chỉ HOSE). */
  soMaCoGia: number
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
  // Thiếu biến môi trường thì phải nói RÕ thiếu cái gì — không để nó rơi xuống throw
  // mù mờ từ bên trong createClient() (đúng cách push-notify/index.ts đã làm).
  const thieu = [
    ['SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY],
    ['PUSH_CRON_SECRET', CRON_SECRET],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (thieu.length > 0)
    return Response.json({ loi: `Thiếu biến môi trường: ${thieu.join(', ')}` }, { status: 500 })

  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Sai bí mật cron', { status: 401 })
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const kq: KetQua = { soMaCoGia: 0, daGhi: 0, boQua: {}, loi: [] }
  // Việc 2 (ghi account_valuations) throw trước cả vòng lặp tài khoản — tức KHÔNG
  // phải lỗi của riêng một tài khoản mà cả khối ghi giá trị bị gãy. Tách cờ riêng
  // với `kq.loi` vì lỗi của TỪNG tài khoản (bên trong vòng lặp) vẫn được gom vào
  // `loi` như bình thường mà không nên biến cả lượt chạy thành thất bại — một sàn
  // hỏng hay một tài khoản lỗi vẫn là "lượt chạy có ích", còn việc 2 gãy hoàn toàn
  // thì không.
  let viec2Gay = false

  // Hút giá cho CẢ sàn HOSE (HOSE_SYMBOLS), không chỉ mã trong sổ lệnh — một mã vừa mua
  // hôm nay nhờ vậy có giá ngay, không phải đợi lượt cron kế tiếp. Mã đang/đã giao dịch
  // (loadTradedSymbols) được xếp GỌI TRƯỚC (buildFetchOrder): hơn 20 lô gọi tuần tự, nếu
  // Yahoo giới hạn tốc độ giữa chừng thì lô gọi sau là lô hỏng, nên mã người dùng thực sự
  // đang giữ không được để may rủi theo thứ tự cả sàn.
  try {
    const daGiao = await loadTradedSymbols(sb)
    const symbols = buildFetchOrder(
      daGiao,
      HOSE_SYMBOLS.map(([ma]) => ma),
    )
    // Chia lô bên trong fetchYahooPrices; lô nào hỏng góp lỗi riêng vào `errors`. Hết
    // ngân sách thời gian (FETCH_BUDGET_MS) cũng dừng sạch giữa chừng thay vì throw —
    // cả hai loại đều góp dòng vào `errors`, nhưng `hetNganSach` tách riêng để log/đọc
    // không lẫn "một lô bị Yahoo từ chối" với "hết giờ, còn lô chưa kịp gọi".
    const { rows, errors, hetNganSach } = await fetchYahooPrices(symbols)
    for (const e of errors) kq.loi.push(`gia: ${e}`)

    if (rows.length > 0) {
      // Chia lô khi upsert: hàng trăm mã một câu là payload to và dễ timeout.
      for (let i = 0; i < rows.length; i += 200) {
        const part: (PriceUpsert & { updated_at: string })[] = rows
          .slice(i, i + 200)
          .map((r) => ({ ...r, updated_at: new Date().toISOString() }))
        const { error } = await sb.from('stock_prices').upsert(part, { onConflict: 'symbol' })
        if (error) throw error
      }
      kq.soMaCoGia = rows.length
    } else if (errors.length === 0 && !hetNganSach) {
      // Có mã cần hút nhưng Yahoo không trả giá cho mã nào (khác lỗi mạng/HTTP hay hết
      // ngân sách — cả hai đã nằm trong `errors` ở trên).
      kq.loi.push('gia: Yahoo không trả giá cho mã nào')
    }
  } catch (err) {
    kq.loi.push(`gia: ${err instanceof Error ? err.message : String(err)}`)
  }

  // --- Việc 2: tính lại giá trị thị trường và ghi vào account_valuations ---
  try {
    const { data: priceRows, error: priceErr } = await sb
      .from('stock_prices')
      .select('symbol, price, trading_date')
    if (priceErr) throw priceErr

    // fetchYahooPrices chia lô và một lô lỗi không làm mất các lô khác, nên sau một
    // lượt chạy, không phải mọi hàng của stock_prices chắc chắn cùng trading_date (ví
    // dụ lô của một mã bị lỗi hôm nay, giá của nó vẫn còn của phiên hôm qua).
    // sessionPrices gom về MỘT phiên (ngày lớn nhất, cũng là ngày mà snapshot này
    // thuộc về) và nêu tên mã nào còn kẹt ở phiên cũ hơn — lô của nó chưa hút được
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
    viec2Gay = true
    kq.loi.push(`ghi gia tri: ${err instanceof Error ? err.message : String(err)}`)
  }

  console.log('stock-refresh', JSON.stringify(kq))
  // 500 khi: (a) việc 1 hoàn toàn không ghi được giá cho mã nào dù có lỗi xảy ra
  // (soMaCoGia === 0 và kq.loi có gì đó — nếu chỉ vì "chưa ai ghi lệnh nào" thì kq.loi
  // rỗng, KHÔNG rơi vào đây, xem chỗ set kq.soMaCoGia ở trên), HOẶC (b) việc 2 gãy
  // TRƯỚC vòng lặp tài khoản (viec2Gay) — cả hai đều nghĩa là lượt chạy này không đáng
  // tin, không phải "chạy tốt nhưng vài chỗ lẻ tẻ bị bỏ qua". Một lô Yahoo lỗi, hết ngân
  // sách thời gian giữa chừng (còn lô đã gọi trước đó vẫn ghi được, nên soMaCoGia > 0),
  // hoặc một tài khoản lỗi riêng lẻ (đã có try/catch của nó trong vòng lặp) KHÔNG rơi
  // vào đây — đó vẫn là lượt chạy có ích.
  const chetHoanToan = kq.loi.length > 0 && kq.soMaCoGia === 0
  return new Response(JSON.stringify(kq), {
    status: chetHoanToan || viec2Gay ? 500 : 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
