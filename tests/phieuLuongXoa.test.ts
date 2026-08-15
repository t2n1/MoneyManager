// Ruling 1 (soát Task 8, 2026-08-14): `xoaPhieuLuong()` phải xoá theo ĐÚNG MỘT
// tiền tố cố định `給与 `, không được quay lại nhánh lọc theo từng dấu riêng qua
// `.or()` của PostgREST. Dấu (vd '給与 2026/08K') chứa dấu cách và `·`, mà `.or()`
// tách điều kiện theo dấu phẩy — ghép dấu vào đó là kiểu lỗi KHÔNG báo lỗi, chỉ
// âm thầm xoá thiếu trên dữ liệu tài chính thật.
//
// Không test được bằng cách gọi thật (cần Supabase thật + phiên đăng nhập), nên
// chặn ở mức nguồn — cùng cách tests/backupCompleteness.test.ts đang làm cho
// importAll. Không có luật này thì không gì ngăn một lần sửa sau tái lập nhánh
// .or() mà Ruling 1 đã bỏ.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = join(fileURLToPath(new URL('..', import.meta.url)), 'src')
const supabaseRepo = readFileSync(join(SRC, 'data', 'supabaseRepo.ts'), 'utf8')

/**
 * Thân của `async xoaPhieuLuong() { … }` trong supabaseRepo.ts.
 *
 * Cắt lấy đúng khối này chứ không quét cả file: `.or(` hay `'給与 %'` có thể xuất
 * hiện ở chỗ khác trong tương lai (vd một hàm khác lọc theo dấu), quét cả file
 * thì luật thành vô nghĩa — nó phải soi đúng thân hàm này.
 */
const xoaPhieuLuongBody = (() => {
  // `\s*` giữa tên hàm và `{`: repo đặt core.autocrlf=true nên xuống dòng ra \n
  // hay \r\n tuỳ file đã bị git viết lại hay chưa — không so khớp cứng khoảng trắng.
  const marker = /async\s+xoaPhieuLuong\s*\(\s*\)\s*\{/
  const m = marker.exec(supabaseRepo)
  expect(m, 'không tìm thấy `async xoaPhieuLuong()` trong supabaseRepo.ts').not.toBeNull()
  const open = supabaseRepo.indexOf('{', m!.index)
  let depth = 0
  for (let i = open; i < supabaseRepo.length; i++) {
    if (supabaseRepo[i] === '{') depth++
    else if (supabaseRepo[i] === '}') {
      depth--
      if (depth === 0) return supabaseRepo.slice(open, i + 1)
    }
  }
  throw new Error('thân xoaPhieuLuong không đóng')
})()

/**
 * Bỏ comment dòng (`//…`) trước khi soát `.or(`: chú thích ngay trong thân hàm
 * này TỰ NÓ nhắc tới `.or()` bằng lời (giải thích vì sao không dùng) — soát
 * chuỗi thô trên cả thân hàm thì chính câu giải thích đó làm test đỏ giả, dù
 * code không hề gọi `.or()`. Heuristic đơn giản là đủ: thân hàm này không có
 * `//` nằm trong chuỗi ký tự nào.
 *
 * `[^\r\n]*` chứ không `.*$` theo từng dòng: repo checkout ra CRLF (core.autocrlf
 * true), và `.` của JS regex KHÔNG khớp `\r` — tách bằng `\n` rồi so `.*$` trên
 * từng mảnh để lại `\r` cuối mỗi dòng chưa tiêu thụ, `$` không khớp được ở đó
 * nên replace lặng lẽ KHÔNG xoá gì (đã đo thấy — bài test đỏ dù code không có
 * `.or()` thật). Khớp thẳng "không phải xuống dòng" thì bất kể CRLF hay LF.
 */
const maNguon = xoaPhieuLuongBody.replace(/\/\/[^\r\n]*/g, '')

describe('supabaseRepo.xoaPhieuLuong — xoá theo ĐÚNG MỘT tiền tố cố định (Ruling 1)', () => {
  it('xoá theo tiền tố `給与 %`', () => {
    expect(maNguon).toContain(".like('note', '給与 %')")
  })

  it('KHÔNG còn nhánh `.or()` lọc theo từng dấu riêng', () => {
    expect(maNguon).not.toContain('.or(')
  })
})
