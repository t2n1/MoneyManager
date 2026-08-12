// Seed quỹ Nhật trong migration 0045 phải đủ và khớp nhau.
//
// Vì sao cần luật này: bảng `fund_aliases` quyết định TIỀN được cộng vào quỹ nào. Một bí
// danh trỏ tới mã quỹ không có trong `funds` sẽ làm câu INSERT của migration nổ ngay —
// nhưng chỉ nổ trên máy người chạy migration, sau khi họ đã chạy 44 migration trước đó.
// Bắt ở đây rẻ hơn nhiều.
//
// Ở tests/ chứ không src/: đọc filesystem bằng `node:fs`.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// fileURLToPath, không phải `.pathname`: đường dẫn dự án có dấu cách ("Money Manager").
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const sql = readFileSync(
  join(ROOT, 'supabase', 'migrations', '0045_fund_prices_trades.sql'),
  'utf8',
)

/** 8 mã quỹ đã gọi thật ngày 2026-08-12 (200, phiên 2026-08-10). */
const MA_QUY = [
  '9I31223A',
  '9I314241',
  '9I312179',
  '0331418A',
  '03311187',
  '03319172',
  '03311182',
  '8931317C',
] as const

const ISIN = [
  'JP90C000Q2U6',
  'JP90C000QF22',
  'JP90C000FHD2',
  'JP90C000H1T1',
  'JP90C000GKC6',
  'JP90C000ENC5',
  'JP90C000FXV1',
  'JP90C000FSK4',
] as const

describe('migration 0045 — seed quỹ Nhật', () => {
  it('có đủ bốn bảng', () => {
    for (const t of ['funds', 'fund_aliases', 'fund_prices', 'fund_trades']) {
      expect(sql, `thiếu create table public.${t}`).toContain(`create table public.${t}`)
    }
  })

  it('seed đủ 8 mã quỹ và 8 ISIN', () => {
    for (const ma of MA_QUY) expect(sql, `seed thiếu mã quỹ ${ma}`).toContain(`'${ma}'`)
    for (const isin of ISIN) expect(sql, `seed thiếu ISIN ${isin}`).toContain(`'${isin}'`)
  })

  it('mỗi bí danh trỏ tới một mã quỹ CÓ trong seed', () => {
    // Khối `insert into public.fund_aliases ... values (...)`: lấy mọi cặp
    // ('<tên sao kê>', '<mã quỹ>') rồi soi phần tử thứ hai.
    const start = sql.indexOf('insert into public.fund_aliases')
    expect(start, 'không tìm thấy khối seed fund_aliases').toBeGreaterThan(-1)
    const block = sql.slice(start, sql.indexOf(';', start))
    const cap = [...block.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)]
    expect(cap.length, 'seed bí danh rỗng').toBeGreaterThanOrEqual(10)
    for (const [, ten, ma] of cap) {
      expect(MA_QUY as readonly string[], `bí danh "${ten}" trỏ tới mã lạ ${ma}`).toContain(ma)
    }
  })

  it('có bí danh cho CẢ HAI tên của quỹ đã đổi tên 2024-10-17', () => {
    // Đây là cái bẫy đã cho ra 口数 ÂM khi ghép theo tên một cách ngây thơ. Thiếu một
    // trong hai dòng này là lỗi thầm: sổ lệnh nhập vào sẽ có một vị thế âm 19.848 口.
    expect(sql).toContain('楽天・プラス・Ｓ＆Ｐ５００インデックス・ファンド')
    expect(sql).toContain('楽天・Ｓ＆Ｐ５００インデックス・ファンド')
    expect(sql).toContain('楽天・バンガード・ファンド')
  })

  it('fund_trades ràng buộc hình dạng theo kind', () => {
    expect(sql).toContain('fund_trades_shape')
  })

  it('KHÔNG có bảng nào cho phép user ghi vào bảng giá hay danh bạ', () => {
    // funds / fund_aliases / fund_prices là dữ liệu công khai do service role ghi.
    // Một policy ghi trên ba bảng đó là mở đường cho user sửa mã quỹ của người khác.

    // Hàm này tạo ra regex để bắt policy ghi trên một bảng. Nó phải khớp với cú pháp SQL
    // thật: "on public.TABLE" đứng TRƯỚC "for <lệnh>", không phải sau.
    // Bản đầu của test này viết ngược thứ tự nên nó LUÔN xanh, kể cả khi có policy ghi
    // thật — một chốt canh an ninh vô dụng. Chốt canh phải tự chứng minh là nó BẮT ĐƯỢC
    // thứ nó canh.
    //
    // Nhận CẢ BỐN lệnh ghi, không chỉ `for all`: một policy `for insert to authenticated`
    // trên `funds` cho user thêm mã quỹ rác vào danh bạ công khai — đúng thứ bài test này
    // mang tên là canh, mà bản chỉ bắt `for all` thì cho lọt.
    const luatGhi = (tenBang: string) =>
      new RegExp(`create policy[^;]*on public\\.${tenBang}[^;]*for (all|insert|update|delete)`, 'i')

    for (const t of ['funds', 'fund_aliases', 'fund_prices']) {
      expect(sql, `${t} không được có policy ghi`).not.toMatch(luatGhi(t))
    }

    // Chứng minh chốt canh hoạt động: nếu có một policy độc hại trên bảng thì regex phải
    // bắt được nó — thử cả `for all` lẫn một lệnh ghi lẻ.
    const policyDoHai = `create policy "leaky" on public.funds\n  for all\n  using (true);`
    expect(luatGhi('funds').test(policyDoHai)).toBe(true)
    const chiInsert = `create policy "leaky" on public.funds\n  for insert to authenticated\n  with check (true);`
    expect(luatGhi('funds').test(chiInsert)).toBe(true)
  })

  it('fund_trades chỉ cho chủ hàng đọc/ghi — auth.uid() = user_id', () => {
    // `fund_trades` là bảng DUY NHẤT của tính năng chứa dữ liệu RIÊNG (sổ lệnh, tức toàn bộ
    // tài sản của một người). Ba bảng kia là dữ liệu công khai. Nên policy "own rows" ở đây
    // là chốt bảo vệ dữ liệu riêng duy nhất mà tính năng có — thiếu điều kiện `auth.uid() =
    // user_id` thì mọi user đăng nhập đọc được sổ lệnh của nhau, và không có gì khác bù lại.
    const start = sql.indexOf('create policy "own rows" on public.fund_trades')
    expect(start, 'fund_trades thiếu policy "own rows"').toBeGreaterThan(-1)
    const policy = sql.slice(start, sql.indexOf(';', start))
    // CẢ HAI mệnh đề: `using` canh đường ĐỌC (và hàng được sửa/xoá), `with check` canh
    // hàng GHI VÀO. Chỉ có `using` thì user vẫn ghi được hàng mang user_id của người khác.
    expect(policy, 'thiếu using (auth.uid() = user_id)').toMatch(
      /using\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i,
    )
    expect(policy, 'thiếu with check (auth.uid() = user_id)').toMatch(
      /with check\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i,
    )
  })
})
