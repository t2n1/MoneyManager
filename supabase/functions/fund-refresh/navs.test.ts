// Test cho parseNavCsv — chạy bằng vitest (Node), không cần Deno và không gọi mạng.
//
// Đọc file mẫu bằng node:fs nên file này nằm trong danh sách test của vitest gốc; nó KHÔNG
// import gì từ `npm:@supabase/supabase-js` hay `Deno.*`, chỉ import hàm thuần.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildFundFetchOrder, fetchFundNavs, parseNavCsv, parseNavHistory } from './navs'

// fileURLToPath, không phải `.pathname`: đường dẫn dự án có dấu cách ("Money Manager").
const HERE = fileURLToPath(new URL('.', import.meta.url))
const mau = (ten: string) => new Uint8Array(readFileSync(join(HERE, 'testdata', ten)))

const SP500 = '9I31223A'

describe('parseNavCsv', () => {
  it('đọc file Shift-JIS thật, ra phiên MỚI NHẤT', () => {
    const kq = parseNavCsv(mau('toushin-sp500.csv'), SP500)
    if (!kq.ok) throw new Error(`đáng lẽ đọc được, nhận lỗi ${kq.loi}`)
    expect(kq.row.assoc_fund_cd).toBe(SP500)
    // File mẫu hút ngày 2026-08-12; phiên mới nhất khi đó là 2026-08-10, nav 20.053.
    // Hút lại file mẫu vào ngày khác thì hai con số này đổi — nên chỉ canh HÌNH DẠNG ở
    // đây, và canh giá trị chính xác ở bài dưới bằng chuỗi tự dựng.
    expect(kq.row.nav_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(kq.row.nav).toBeGreaterThan(0)
    expect(Number.isInteger(kq.row.nav)).toBe(true)
    expect(kq.row.net_assets_m).toBeGreaterThan(0)
  })

  it('lấy dòng CUỐI làm phiên hiện tại và dòng kế cuối làm prior_nav', () => {
    const csv = sjis(
      '年月日,基準価額(円),純資産総額（百万円）,分配金,決算期\r\n' +
        '2026年08月07日,20012,1172772,,\r\n' +
        '2026年08月10日,20053,1175583,,\r\n',
    )
    const kq = parseNavCsv(csv, SP500)
    if (!kq.ok) throw new Error(`đáng lẽ đọc được, nhận lỗi ${kq.loi}`)
    expect(kq.row).toEqual({
      assoc_fund_cd: SP500,
      nav: 20_053,
      prior_nav: 20_012,
      net_assets_m: 1_175_583,
      nav_date: '2026-08-10',
    })
  })

  it('chỉ có MỘT phiên → prior_nav null, không phải 0', () => {
    const csv = sjis(
      '年月日,基準価額(円),純資産総額（百万円）,分配金,決算期\r\n2023年10月27日,9888,1,,\r\n',
    )
    const kq = parseNavCsv(csv, SP500)
    if (!kq.ok) throw new Error('đáng lẽ đọc được')
    expect(kq.row.prior_nav).toBeNull()
    expect(kq.row.nav).toBe(9_888)
    expect(kq.row.nav_date).toBe('2023-10-27')
  })

  it('body {"statusCode":null} là ma-sai, KHÔNG phải "0 dòng"', () => {
    // Bẫy: thiếu một tham số thì server trả HTTP 200 kèm đúng 19 byte JSON này. Nhận
    // bằng mã trạng thái sẽ nghĩ là thành công rồi báo "không có giá quỹ nào" — sai hẳn
    // hướng debug so với "gọi sai URL".
    expect(parseNavCsv(mau('toushin-thieu-tham-so.txt'), SP500)).toEqual({
      ok: false,
      loi: 'ma-sai',
    })
  })

  it('KHÔNG nhận nếu decode bằng UTF-8 — bài canh chống bẫy Shift-JIS', () => {
    // Server khai `charset=utf-8` nhưng file là Shift-JIS. Nếu ai đó đổi hàm này sang
    // res.text()/TextDecoder('utf-8') thì cột SỐ vẫn đúng, chỉ cột NGÀY hỏng — nghĩa là
    // nav_date sai, valued_on sai, và lỗi rất khó thấy. Bài này ép hàm phải từ chối.
    const utf8 = new TextEncoder().encode(
      '年月日,基準価額(円),純資産総額（百万円）,分配金,決算期\r\n2026年08月10日,20053,1175583,,\r\n',
    )
    expect(parseNavCsv(utf8, SP500)).toEqual({ ok: false, loi: 'ma-sai' })
  })

  it('file rỗng / chỉ có header → khong-co-dong-nao, không nổ', () => {
    expect(parseNavCsv(mau('toushin-rong.csv'), SP500)).toEqual({
      ok: false,
      loi: 'ma-sai',
    })
    expect(parseNavCsv(mau('toushin-chi-header.csv'), SP500)).toEqual({
      ok: false,
      loi: 'khong-co-dong-nao',
    })
  })

  it('bỏ dòng có nav không phải số dương, lấy dòng hợp lệ cuối cùng', () => {
    const csv = sjis(
      '年月日,基準価額(円),純資産総額（百万円）,分配金,決算期\r\n' +
        '2026年08月07日,20012,1172772,,\r\n' +
        '2026年08月10日,0,1175583,,\r\n' +
        '2026年08月11日,,1175583,,\r\n',
    )
    const kq = parseNavCsv(csv, SP500)
    if (!kq.ok) throw new Error('đáng lẽ đọc được')
    expect(kq.row.nav).toBe(20_012)
    expect(kq.row.nav_date).toBe('2026-08-07')
    expect(kq.row.prior_nav).toBeNull()
  })

  it('ngày hỏng → bỏ dòng đó, KHÔNG rơi về new Date()', () => {
    // 'khong-phai-ngay' thay vì một câu tiếng Việt có dấu: dấu (ô, ơ, ...) không có
    // trong bảng mã Shift-JIS (JIS X 0208) nên sjis() dưới không mã hoá được — ý định
    // bài test chỉ cần một chuỗi KHÔNG khớp regex ngày, không cần đúng là tiếng Việt.
    const csv = sjis(
      '年月日,基準価額(円),純資産総額（百万円）,分配金,決算期\r\n' +
        '2026年08月07日,20012,1172772,,\r\n' +
        'khong-phai-ngay,20053,1175583,,\r\n',
    )
    const kq = parseNavCsv(csv, SP500)
    if (!kq.ok) throw new Error('đáng lẽ đọc được')
    expect(kq.row.nav_date).toBe('2026-08-07')
  })

  it('cột 純資産総額 thiếu hoặc hỏng → net_assets_m null, hàng giá vẫn giữ', () => {
    const csv = sjis('年月日,基準価額(円)\r\n2026年08月10日,20053\r\n')
    const kq = parseNavCsv(csv, SP500)
    if (!kq.ok) throw new Error('đáng lẽ đọc được')
    expect(kq.row.nav).toBe(20_053)
    expect(kq.row.net_assets_m).toBeNull()
  })

  it('dòng hỏng nằm GIỮA: nav lấy dòng hợp lệ cuối, prior_nav lấy dòng hợp lệ kế cuối', () => {
    // Khác bài "bỏ dòng có nav không phải số dương" ở trên: ở đó dòng hỏng nằm cuối nên
    // chỉ cần bỏ qua là xong. Ở đây dòng hỏng chen GIỮA hai dòng tốt — nếu code lấy
    // `dong[n-2]` thay vì "dòng HỢP LỆ kế cuối" thì prior_nav sẽ là số của dòng hỏng.
    const csv = sjis(
      '年月日,基準価額(円),純資産総額（百万円）,分配金,決算期\r\n' +
        '2026年08月06日,19940,1167910,,\r\n' +
        '2026年08月07日,0,1172772,,\r\n' +
        '2026年08月10日,20053,1175583,,\r\n',
    )
    const kq = parseNavCsv(csv, SP500)
    if (!kq.ok) throw new Error('đáng lẽ đọc được')
    expect(kq.row.nav).toBe(20_053)
    expect(kq.row.nav_date).toBe('2026-08-10')
    expect(kq.row.prior_nav).toBe(19_940)
  })
})

describe('buildFundFetchOrder', () => {
  const A = { assocFundCd: 'A', isinCd: 'JP-A' }
  const B = { assocFundCd: 'B', isinCd: 'JP-B' }
  const C = { assocFundCd: 'C', isinCd: 'JP-C' }

  it('quỹ đang giữ xếp TRƯỚC, phần còn lại của danh bạ xếp sau, không trùng', () => {
    // Vì sao thứ tự quan trọng: mỗi quỹ là một cuộc gọi riêng (endpoint không nhận nhiều
    // quỹ một lần). Hết ngân sách giữa chừng thì quỹ gọi SAU là quỹ thiếu giá — không thể
    // để quỹ người dùng thực sự giữ may rủi theo thứ tự danh bạ.
    expect(buildFundFetchOrder(['C'], [A, B, C])).toEqual([C, A, B])
  })

  it('không giữ gì → giữ nguyên thứ tự danh bạ', () => {
    expect(buildFundFetchOrder([], [A, B])).toEqual([A, B])
  })

  it('giữ một mã KHÔNG có trong danh bạ → bỏ qua, không bịa ISIN', () => {
    // Khác cổ phiếu (buildFetchOrder vẫn xếp mã lạ lên đầu vì Yahoo tự bỏ qua mã nó không
    // biết). Ở đây phải có ISIN mới gọi được, nên mã không có trong `funds` là không gọi
    // được — FK của fund_trades đã chặn ca này, nhưng đừng để hàm tự nổ nếu nó xảy ra.
    expect(buildFundFetchOrder(['Z'], [A])).toEqual([A])
  })

  it('mã giữ trùng nhau chỉ xuất hiện một lần', () => {
    expect(buildFundFetchOrder(['B', 'B'], [A, B])).toEqual([B, A])
  })
})

describe('fetchFundNavs', () => {
  const CSV_OK = (nav: number, ngay: string) =>
    sjis(`年月日,基準価額(円),純資産総額（百万円）,分配金,決算期\r\n${ngay},${nav},1000,,\r\n`)

  /** fetch giả: trả body theo assocFundCd đọc từ query string. */
  function fetchGia(
    theoMa: Record<string, { status?: number; body?: Uint8Array; nem?: string }>,
  ): typeof fetch {
    return (async (url: string) => {
      const ma = new URL(url).searchParams.get('associFundCd') ?? ''
      const cai = theoMa[ma]
      if (!cai) throw new Error(`test chưa dựng phản hồi cho ${ma}`)
      if (cai.nem) throw new Error(cai.nem)
      return {
        ok: (cai.status ?? 200) < 400,
        status: cai.status ?? 200,
        arrayBuffer: async () => (cai.body ?? new Uint8Array()).buffer,
      }
    }) as unknown as typeof fetch
  }

  it('hút được nhiều quỹ, mỗi quỹ một hàng, trạng thái ok', async () => {
    const kq = await fetchFundNavs(
      [
        { assocFundCd: 'A', isinCd: 'JP-A' },
        { assocFundCd: 'B', isinCd: 'JP-B' },
      ],
      {
        fetchImpl: fetchGia({
          A: { body: CSV_OK(20_053, '2026年08月10日') },
          B: { body: CSV_OK(18_855, '2026年08月10日') },
        }),
      },
    )
    expect(kq.rows.map((r) => [r.assoc_fund_cd, r.nav])).toEqual([
      ['A', 20_053],
      ['B', 18_855],
    ])
    expect(kq.trangThai.get('A')).toBe('ok')
    expect(kq.errors).toEqual([])
    expect(kq.hetNganSach).toBe(false)
  })

  it('một quỹ mã sai KHÔNG kéo mất quỹ khác; trạng thái ghi ma-sai', async () => {
    const kq = await fetchFundNavs(
      [
        { assocFundCd: 'A', isinCd: 'JP-A' },
        { assocFundCd: 'B', isinCd: 'JP-B' },
      ],
      {
        fetchImpl: fetchGia({
          A: { body: new TextEncoder().encode('{"statusCode":null}') },
          B: { body: CSV_OK(18_855, '2026年08月10日') },
        }),
      },
    )
    expect(kq.rows.map((r) => r.assoc_fund_cd)).toEqual(['B'])
    expect(kq.trangThai.get('A')).toBe('ma-sai')
    expect(kq.trangThai.get('B')).toBe('ok')
    expect(kq.errors.join(' ')).toContain('A')
  })

  it('HTTP 500 → loi-mang, không phải ma-sai', async () => {
    // Phân biệt được hai chuyện: mã sai thì sửa mã, mạng lỗi thì đợi lượt sau.
    const kq = await fetchFundNavs([{ assocFundCd: 'A', isinCd: 'JP-A' }], {
      fetchImpl: fetchGia({ A: { status: 500, body: new Uint8Array() } }),
    })
    expect(kq.rows).toEqual([])
    expect(kq.trangThai.get('A')).toBe('loi-mang')
    expect(kq.errors.join(' ')).toContain('HTTP 500')
  })

  it('fetch ném lỗi (mạng đứt) → loi-mang, cả lượt không chết', async () => {
    const kq = await fetchFundNavs(
      [
        { assocFundCd: 'A', isinCd: 'JP-A' },
        { assocFundCd: 'B', isinCd: 'JP-B' },
      ],
      {
        fetchImpl: fetchGia({
          A: { nem: 'mang dut' },
          B: { body: CSV_OK(18_855, '2026年08月10日') },
        }),
      },
    )
    expect(kq.trangThai.get('A')).toBe('loi-mang')
    expect(kq.rows.map((r) => r.assoc_fund_cd)).toEqual(['B'])
  })

  it('hết ngân sách thời gian → DỪNG SẠCH trước quỹ tiếp theo, báo hetNganSach', async () => {
    // Đồng hồ giả nhảy 20s mỗi lần đọc, ngân sách 30s. Lần đọc thứ nhất là `start`
    // (t=20s); vòng của quỹ A đọc lần thứ hai (t=40s) → mới trôi 20s, còn ngân sách nên A
    // được gọi; vòng của quỹ B đọc lần thứ ba (t=60s) → đã trôi 40s, hết ngân sách.
    //
    // Bước nhảy 40s (bản đầu) làm ngay vòng ĐẦU TIÊN đã quá hạn, nên A không bao giờ được
    // gọi — bài test khi đó mâu thuẫn với chính kỳ vọng của nó.
    let t = 0
    const kq = await fetchFundNavs(
      [
        { assocFundCd: 'A', isinCd: 'JP-A' },
        { assocFundCd: 'B', isinCd: 'JP-B' },
      ],
      {
        budgetMs: 30_000,
        now: () => (t += 20_000),
        fetchImpl: fetchGia({ A: { body: CSV_OK(20_053, '2026年08月10日') } }),
      },
    )
    expect(kq.hetNganSach).toBe(true)
    expect(kq.rows.map((r) => r.assoc_fund_cd)).toEqual(['A'])
    // Khẳng định CẢ HAI phía, không chỉ has('B') === false: nếu trangThai lỡ là Map rỗng
    // ở mọi trường hợp (một lỗi khác hẳn), riêng has('B') === false sẽ vẫn đúng một cách
    // vô nghĩa. Quỹ ĐÃ gọi (A) phải có mặt với đúng trạng thái 'ok'.
    expect(kq.trangThai.get('A')).toBe('ok')
    // Quỹ chưa kịp gọi KHÔNG được ghi trạng thái: 'ma-sai' cho nó là vu oan.
    expect(kq.trangThai.has('B')).toBe(false)
    expect(kq.errors.join(' ')).toContain('hết ngân sách')
  })

  it('URL gọi có ĐỦ hai tham số — thiếu một cái là rơi vào bẫy ②', async () => {
    const daGoi: string[] = []
    const ghiLai = (async (url: string) => {
      daGoi.push(url)
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => CSV_OK(1, '2026年08月10日').buffer,
      }
    }) as unknown as typeof fetch
    await fetchFundNavs([{ assocFundCd: '9I31223A', isinCd: 'JP90C000Q2U6' }], {
      fetchImpl: ghiLai,
    })
    expect(daGoi[0]).toContain('isinCd=JP90C000Q2U6')
    expect(daGoi[0]).toContain('associFundCd=9I31223A')
  })
})

describe('parseNavHistory', () => {
  it('trả MỌI phiên hợp lệ, xếp theo ngày tăng dần', () => {
    const csv = sjis(
      '年月日,基準価額(円),純資産総額（百万円）,分配金,決算期\r\n' +
        '2026年08月10日,20053,1175583,,\r\n' +
        '2026年08月07日,20012,1172772,,\r\n',
    )
    expect(parseNavHistory(csv)).toEqual([
      { navDate: '2026-08-07', nav: 20_012 },
      { navDate: '2026-08-10', nav: 20_053 },
    ])
  })

  it('file thật có hàng nghìn phiên, phiên đầu là ngày lập quỹ', () => {
    const lich = parseNavHistory(mau('toushin-sp500.csv'))
    expect(lich.length).toBeGreaterThan(500)
    // 楽天・プラス・S&P500 lập ngày 2023-10-27, 基準価額 khởi điểm 9.888.
    expect(lich[0]).toEqual({ navDate: '2023-10-27', nav: 9_888 })
    // Xếp tăng dần, không có ngày lặp.
    for (let i = 1; i < lich.length; i++) {
      expect(lich[i].navDate > lich[i - 1].navDate).toBe(true)
    }
  })

  it('không phải CSV giá → mảng rỗng, không nổ', () => {
    expect(parseNavHistory(mau('toushin-thieu-tham-so.txt'))).toEqual([])
  })
})

/** Chuỗi UTF-16 của JS → byte Shift-JIS, để dựng file mẫu ngay trong test. */
function sjis(s: string): Uint8Array {
  // Node không có TextEncoder cho Shift-JIS (chỉ TextDecoder), nên mã hoá tay qua bảng
  // tra ngược dựng từ chính TextDecoder: đủ dùng vì bộ ký tự trong test rất nhỏ.
  const dec = new TextDecoder('shift_jis')
  const bang = new Map<string, number[]>()
  for (let hi = 0x81; hi <= 0xef; hi++) {
    for (let lo = 0x40; lo <= 0xfc; lo++) {
      const ky = dec.decode(new Uint8Array([hi, lo]))
      if (ky.length === 1 && !bang.has(ky)) bang.set(ky, [hi, lo])
    }
  }
  const out: number[] = []
  for (const ch of s) {
    const code = ch.codePointAt(0) as number
    if (code < 0x80) out.push(code)
    else {
      const cap = bang.get(ch)
      if (!cap) throw new Error(`không mã hoá được ký tự ${ch} sang Shift-JIS`)
      out.push(...cap)
    }
  }
  return new Uint8Array(out)
}
