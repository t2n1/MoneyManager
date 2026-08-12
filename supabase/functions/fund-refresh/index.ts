// Edge function fund-refresh — chạy mỗi tối sau khi quỹ Nhật công bố 基準価額.
//
// Hai việc: (1) hút NAV cho CẢ danh bạ quỹ (quỹ đang giữ được gọi trước, xem
// buildFundFetchOrder), ghi vào fund_prices; (2) tính lại giá trị thị trường cho từng tài
// khoản đầu tư JPY có sổ lệnh quỹ và ghi vào account_valuations.
//
// Function RIÊNG, không nhét vào stock-refresh: khác nguồn, khác cách giải mã, khác đơn
// vị đo, khác mô hình giá vốn, khác giờ chạy. Và nặng nhất — một lô Yahoo hỏng sẽ kéo cả
// lượt stock-refresh xuống 500, làm mất luôn phần quỹ Nhật vốn chẳng liên quan.
//
// Function này KHÔNG có phép tính riêng. Mọi phép tính gọi từ `_funds.js` (gói từ
// src/features/assets/serverBundleFunds.ts) — hai bản sao của một phép tính là chuyện
// sớm muộn lệch nhau.
//
// Deploy:   npm run bundle:rules && supabase functions deploy fund-refresh --no-verify-jwt
// Xem thêm: docs/quy-nhat.md

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildFundFetchOrder, fetchFundNavs, parseNavHistory, type NavUpsert } from './navs.ts'
import { fundHoldingsFromTrades, fundValue, sessionNavs } from './_funds.js'
import { loadFundAccounts, loadFundRegistry, loadHeldFundCodes } from './loadInput.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
// Dùng lại bí mật cron của push: nó là "bí mật cho cron" nói chung. Đây là job THỨ BA
// dùng chung nó — xem cảnh báo trong docs/co-phieu-viet-nam.md về việc đổi secret.
const CRON_SECRET = Deno.env.get('PUSH_CRON_SECRET') ?? ''

interface KetQua {
  /** Số quỹ ghi được NAV vào fund_prices ở lượt này. */
  soQuyCoGia: number
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
  // Thiếu biến môi trường thì phải nói RÕ thiếu cái gì — không để nó rơi xuống throw mù
  // mờ từ bên trong createClient().
  const thieu = [
    ['SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY],
    ['PUSH_CRON_SECRET', CRON_SECRET],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k)
  if (thieu.length > 0)
    return Response.json({ loi: `Thiếu biến môi trường: ${thieu.join(', ')}` }, { status: 500 })

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const body = await req.json().catch(() => ({} as any))

  // --- Chế độ kiểm mã: người dùng đăng nhập, KHÔNG phải cron ---
  //
  // Function deploy với --no-verify-jwt (cron không có JWT), nên cổng của Supabase đã
  // TẮT. Phải tự xác thực ở đây — trông cậy vào cổng đó là trông cậy vào một cái cổng đã
  // tắt. Chế độ này cố ý KHÔNG nhận x-cron-secret, và chế độ chạy đủ cố ý KHÔNG nhận JWT.
  if (body?.kiem) {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /i, '')
    const { data: nguoiDung, error: authErr } = await sb.auth.getUser(token)
    if (authErr || !nguoiDung?.user) return new Response('Chưa đăng nhập', { status: 401 })

    const { isinCd, associFundCd } = body.kiem as { isinCd?: string; associFundCd?: string }
    if (!isinCd || !associFundCd)
      return Response.json({ loi: 'Thiếu isinCd hoặc associFundCd' }, { status: 400 })

    const kq = await fetchFundNavs([{ assocFundCd: associFundCd, isinCd }])
    return Response.json({
      trangThai: kq.trangThai.get(associFundCd) ?? 'loi-mang',
      row: kq.rows[0] ?? null,
      loi: kq.errors,
    })
  }

  // --- Từ đây trở xuống là cron ---
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Sai bí mật cron', { status: 401 })
  }

  // --- Chế độ lấp lịch sử: dựng lại account_valuations cho các phiên đã qua ---
  //
  // CSV tải về đã có đủ lịch sử từ ngày lập quỹ, nên việc này KHÔNG tốn thêm cuộc gọi nào
  // ngoài một lượt hút bình thường. Gọi tay, không nằm trong lượt cron hằng ngày.
  if (body?.lapLichSu?.accountId) {
    const accountId = body.lapLichSu.accountId as string
    const kqLap = { daGhi: 0, loi: [] as string[] }
    try {
      const accounts = await loadFundAccounts(sb)
      const a = accounts.find((x) => x.accountId === accountId)
      if (!a) return Response.json({ loi: 'Không tìm thấy tài khoản quỹ này' }, { status: 404 })

      const danhBa = await loadFundRegistry(sb)
      // Hút lịch sử của MỌI quỹ trong danh bạ: sáu trong tám quỹ của chủ app đã bán hết
      // từ lâu nhưng vẫn có mặt trong các phiên quá khứ.
      const lichSu = new Map<string, Map<string, number>>() // assocFundCd → (ngày → nav)
      for (const f of danhBa) {
        const url =
          `https://toushin-lib.fwg.ne.jp/FdsWeb/FDST030000/csv-file-download` +
          `?isinCd=${encodeURIComponent(f.isinCd)}&associFundCd=${encodeURIComponent(f.assocFundCd)}`
        try {
          const res = await fetch(url)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const diem = parseNavHistory(new Uint8Array(await res.arrayBuffer()))
          lichSu.set(f.assocFundCd, new Map(diem.map((d) => [d.navDate, d.nav])))
        } catch (err) {
          kqLap.loi.push(`${f.assocFundCd}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      // Mọi ngày phiên xuất hiện ở BẤT KỲ quỹ nào, từ lệnh đầu tiên trở đi.
      const lenhDauTien = a.trades.map((t) => t.tradedOn).sort()[0]
      const moiNgay = new Set<string>()
      for (const theoNgay of lichSu.values())
        for (const ngay of theoNgay.keys()) if (ngay >= lenhDauTien) moiNgay.add(ngay)

      // Trần: không vượt giới hạn wall-clock của edge function. Chạy lại lấp tiếp phần
      // còn trống vì bước dưới chỉ ghi ngày CHƯA có hàng nào.
      const cacNgay = [...moiNgay].sort().slice(0, 1_500)

      // Ngày đã có hàng (bất kể auto hay manual) thì KHÔNG đè: ảnh chụp cũ có thể đã được
      // ghi bằng giá đúng của ngày đó, và số gõ tay thì luôn thắng.
      const { data: daCo, error: docErr } = await sb
        .from('account_valuations')
        .select('valued_on')
        .eq('account_id', accountId)
      if (docErr) throw docErr
      const ngayDaCo = new Set((daCo ?? []).map((r: any) => r.valued_on as string))

      const hang: any[] = []
      for (const ngay of cacNgay) {
        if (ngayDaCo.has(ngay)) continue
        const denNgay = a.trades.filter((t) => t.tradedOn <= ngay)
        if (denNgay.length === 0) continue
        const { holdings, oversold } = fundHoldingsFromTrades(denNgay)
        // Sổ lệnh có lỗ hổng thì mọi ngày đều sai — dừng hẳn, đừng ghi 900 hàng sai.
        if (oversold.length > 0) {
          return Response.json(
            { loi: `Sổ lệnh có lỗ hổng ở ${oversold.join(', ')} — kiểm fund_aliases trước` },
            { status: 400 },
          )
        }
        // Chưa mua gì (hoặc đã bán sạch) → không có gì để chụp. Ca này CÓ THẬT: tài khoản
        // trống từ 2025-04-14 tới 2025-08-28.
        if (holdings.length === 0) continue

        const navNgayDo = new Map<string, number>()
        for (const h of holdings) {
          const nav = lichSu.get(h.assocFundCd)?.get(ngay)
          if (nav != null) navNgayDo.set(h.assocFundCd, nav)
        }
        const { marketValue } = fundValue(holdings, navNgayDo)
        if (marketValue === null) continue

        hang.push({
          user_id: a.userId,
          account_id: accountId,
          valued_on: ngay,
          market_value: marketValue,
          note: `Lấp lại theo 基準価額 phiên ${ngay}`,
          source: 'auto',
        })
      }

      for (let i = 0; i < hang.length; i += 200) {
        const { error } = await sb
          .from('account_valuations')
          .upsert(hang.slice(i, i + 200), { onConflict: 'account_id,valued_on' })
        if (error) throw error
      }

      kqLap.daGhi = hang.length
      console.log('fund-refresh lapLichSu', JSON.stringify(kqLap))
      return Response.json(kqLap)
    } catch (err) {
      return Response.json(
        { loi: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      )
    }
  }

  const kq: KetQua = { soQuyCoGia: 0, daGhi: 0, boQua: {}, loi: [] }
  // Việc 2 throw TRƯỚC cả vòng lặp tài khoản — tức không phải lỗi của riêng một tài khoản
  // mà cả khối ghi giá trị bị gãy. Tách cờ riêng vì lỗi của TỪNG tài khoản vẫn được gom
  // vào `loi` mà không nên biến cả lượt chạy thành thất bại.
  let viec2Gay = false

  // --- Việc 1: hút NAV cho cả danh bạ ---
  try {
    const [danhBa, dangGiu] = await Promise.all([loadFundRegistry(sb), loadHeldFundCodes(sb)])
    const thuTu = buildFundFetchOrder(dangGiu, danhBa)
    const { rows, trangThai, errors, hetNganSach } = await fetchFundNavs(thuTu)
    for (const e of errors) kq.loi.push(`gia: ${e}`)

    if (rows.length > 0) {
      const payload: (NavUpsert & { updated_at: string })[] = rows.map((r) => ({
        ...r,
        updated_at: new Date().toISOString(),
      }))
      const { error } = await sb
        .from('fund_prices')
        .upsert(payload, { onConflict: 'assoc_fund_cd' })
      if (error) throw error
      kq.soQuyCoGia = rows.length
    } else if (errors.length === 0 && !hetNganSach) {
      // Danh bạ rỗng (chưa seed) — khác hẳn "gọi lỗi" và khác hẳn "hết giờ giữa chừng",
      // nên nói rõ. Đọc `hetNganSach` tường minh thay vì tin rằng fetchFundNavs luôn
      // nhét một dòng vào `errors`: hợp đồng kiểu không hứa điều đó.
      kq.loi.push('gia: danh bạ quỹ rỗng, không có gì để hút')
    }

    // Ghi lại kết quả từng quỹ. Đây là chỗ DUY NHẤT lộ ra việc một mã quỹ bị sai — không
    // có nó thì một quỹ gõ nhầm mã sẽ im lặng thiếu giá mãi mãi.
    for (const [ma, tt] of trangThai) {
      const { error } = await sb
        .from('funds')
        .update({ last_status: tt, last_checked_at: new Date().toISOString() })
        .eq('assoc_fund_cd', ma)
      if (error) kq.loi.push(`trang thai ${ma}: ${error.message}`)
    }
  } catch (err) {
    kq.loi.push(`gia: ${err instanceof Error ? err.message : String(err)}`)
  }

  // --- Việc 2: tính lại giá trị thị trường và ghi vào account_valuations ---
  try {
    const { data: navRows, error: navErr } = await sb
      .from('fund_prices')
      .select('assoc_fund_cd, nav, nav_date')
    if (navErr) throw navErr

    // Mỗi quỹ được hút bằng một cuộc gọi riêng và một quỹ lỗi không kéo sập quỹ khác, nên
    // sau một lượt chạy không phải mọi hàng chắc chắn cùng nav_date. sessionNavs gom về
    // MỘT phiên (ngày lớn nhất) và nêu tên quỹ nào còn kẹt ở phiên cũ hơn.
    const { session: phien, navByFund, staleFunds } = sessionNavs(
      (navRows ?? []).map((p: any) => ({
        assoc_fund_cd: p.assoc_fund_cd as string,
        nav: Number(p.nav),
        nav_date: p.nav_date as string,
      })),
    )
    if (!phien) throw new Error('Bảng giá quỹ rỗng, không biết ngày phiên')

    const accounts = await loadFundAccounts(sb)
    for (const a of accounts) {
      // Một tài khoản lỗi KHÔNG được làm chết cả lượt — tài khoản khác vẫn phải được xét.
      try {
        // Trộn hai hệ đơn vị (口数 của quỹ và số cổ của cổ phiếu) là cộng sai; im lặng
        // cộng sai còn tệ hơn bỏ qua.
        if (a.coCaSoLenhCoPhieu) {
          demBoQua(kq, 'tron-hai-loai-so-lenh')
          continue
        }

        const { holdings, oversold } = fundHoldingsFromTrades(a.trades)
        // Sổ lệnh có lỗ hổng: giữ số cũ, không ghi số biết là sai. Với quỹ Nhật, lý do
        // thường gặp nhất là THIẾU MỘT DÒNG trong fund_aliases (quỹ đổi tên).
        if (oversold.length > 0) {
          demBoQua(kq, 'so-lenh-co-lo-hong')
          continue
        }
        // Quỹ đang giữ mà giá còn ở phiên cũ hơn: giá vẫn có và > 0 nên fundValue không
        // tự phát hiện được — phải chặn ở đây, kẻo ghi một số trông như mới nhưng dùng
        // giá hôm kia, đóng dấu "hôm nay".
        if (holdings.some((h: { assocFundCd: string }) => staleFunds.has(h.assocFundCd))) {
          demBoQua(kq, 'gia-le-phien-cu')
          continue
        }

        const { marketValue } = fundValue(holdings, navByFund)
        if (marketValue === null) {
          demBoQua(kq, 'thieu-gia-moi-quy')
          continue
        }

        // `where source = 'auto'` không biểu diễn được qua PostgREST, nên đọc trước rồi
        // mới quyết: hàng người dùng gõ tay của đúng ngày đó phải được giữ nguyên.
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
            note: `Tự tính theo 基準価額 phiên ${phien}`,
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

  console.log('fund-refresh', JSON.stringify(kq))
  // 500 khi: (a) việc 1 hoàn toàn không ghi được giá cho quỹ nào dù có lỗi xảy ra, HOẶC
  // (b) việc 2 gãy TRƯỚC vòng lặp tài khoản. Cả hai đều nghĩa là lượt chạy này không đáng
  // tin. Một quỹ lỗi hoặc một tài khoản lỗi riêng lẻ KHÔNG rơi vào đây — đó vẫn là lượt
  // chạy có ích.
  const chetHoanToan = kq.loi.length > 0 && kq.soQuyCoGia === 0
  return new Response(JSON.stringify(kq), {
    status: chetHoanToan || viec2Gay ? 500 : 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
