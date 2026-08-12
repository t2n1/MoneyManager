// Test cho parseNavCsv — chạy bằng vitest (Node), không cần Deno và không gọi mạng.
//
// Đọc file mẫu bằng node:fs nên file này nằm trong danh sách test của vitest gốc; nó KHÔNG
// import gì từ `npm:@supabase/supabase-js` hay `Deno.*`, chỉ import hàm thuần.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseNavCsv } from './navs'

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
