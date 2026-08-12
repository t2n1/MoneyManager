// Canh ô nhập 口数 (FundTradeFormSheet) và ô nhập Số cổ (TradeFormSheet) không quay lại
// <input type="number">.
//
// Vì sao có luật này: chuẩn HTML bắt browser tự lọc giá trị theo "valid floating-point
// number" TRƯỚC khi bắn onChange. Một dấu "-" đơn lẻ không khớp chuẩn đó, nên browser trả
// e.target.value = '' ngay từ ký tự đầu. Gõ "-500" theo thứ tự tự nhiên (-, 5, 0, 0) thì
// onChange nhận lần lượt '', '5', '50', '500' — dấu trừ không bao giờ tới tay code, và ô
// này lại đứng ngay cạnh dòng hướng dẫn "nhập số âm" để gộp 口/gộp cổ. Kết quả: ĐẢO DẤU
// một số tài chính mà không có cảnh báo nào.
//
// Bản sửa (xem src/lib/signedInt.ts) đổi hai ô này sang type="text" inputMode="numeric",
// giữ chuỗi thô trong state, lọc bằng sanitizeSignedIntText. Repo không có jsdom/
// @testing-library/react (vite.config.ts không khai test.environment), nên
// signedInt.test.ts chỉ canh được hàm thuần — không canh việc JSX có THẬT gọi chúng. Một
// bản soát đã thực nghiệm: tạm đổi type="number" lại ở TradeFormSheet.tsx, giữ nguyên
// onChange, rồi chạy tsc/lint/mọi test — không có bài nào đỏ. Bài test này đọc thẳng
// nguồn để bắt đúng chỗ mù đó.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// fileURLToPath, không phải `.pathname`: đường dẫn dự án có dấu cách ("Money Manager").
const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Cắt ra đúng thẻ <input> gắn với một `id` cho trước — từ chỗ xuất hiện `idMau` tới `/>`
 * đóng thẻ gần nhất theo sau. Không so trên toàn file: mỗi file còn 3-4 input/select khác
 * (mã quỹ/mã cổ phiếu, ghi chú...) — so bừa `toContain('type="text"')` trên cả file thì
 * dù ô 口数/Số cổ có lỡ đổi thành type="number", một ô KHÁC còn type="text" cũng đủ làm
 * bài test xanh nhầm.
 */
function catThe(noiDung: string, idMau: string): string {
  const viTri = noiDung.indexOf(idMau)
  expect(viTri, `không tìm thấy "${idMau}" — component đã đổi tên thuộc tính id?`).toBeGreaterThan(-1)
  const ketThuc = noiDung.indexOf('/>', viTri)
  expect(ketThuc, `không tìm thấy "/>" đóng thẻ sau "${idMau}"`).toBeGreaterThan(-1)
  return noiDung.slice(viTri, ketThuc)
}

const O_CAN_CANH = [
  {
    file: 'src/features/assets/FundTradeFormSheet.tsx',
    idMau: 'id={`${uid}-units`}',
    ten: '口数 (FundTradeFormSheet)',
  },
  {
    file: 'src/features/assets/TradeFormSheet.tsx',
    idMau: 'id={`${uid}-qty`}',
    ten: 'Số cổ (TradeFormSheet)',
  },
] as const

describe('ô nhập số nguyên có dấu — không được quay về type="number"', () => {
  for (const { file, idMau, ten } of O_CAN_CANH) {
    const noiDung = readFileSync(join(ROOT, file), 'utf8')
    const the = catThe(noiDung, idMau)

    it(`${ten}: vẫn type="text" inputMode="numeric", chưa quay về type="number"`, () => {
      expect(the, `${file} — ô ${ten} không còn type="text"`).toContain('type="text"')
      expect(the, `${file} — ô ${ten} thiếu inputMode="numeric"`).toContain(
        'inputMode="numeric"',
      )
      // Đây là dòng đỏ thật: <input type="number"> vẫn có type="text" là false nên bài
      // trên đã bắt được, nhưng ghi thêm dòng này để thông báo đúng tên thuộc tính hỏng.
      expect(the, `${file} — ô ${ten} đã quay về type="number"`).not.toContain(
        'type="number"',
      )
    })

    it(`${ten}: onChange vẫn lọc qua sanitizeSignedIntText trước khi vào state`, () => {
      expect(
        the,
        `${file} — ô ${ten} không còn gọi sanitizeSignedIntText trong onChange (mất lọc ⇒ dấu "-" lại lọt qua browser trước, quay lại lỗi đảo dấu)`,
      ).toContain('sanitizeSignedIntText(e.target.value)')
    })
  }

  // Tự chứng minh catThe() PHÂN BIỆT được ô đang canh với input đứng ngay sau nó, không
  // lem quá thẻ. Nếu catThe lỡ lấy luôn tới thẻ kế tiếp (ví dụ đổi indexOf('/>', ...)
  // thành lastIndexOf, hoặc quét cả file), một input GIẢ ngay sau — có type="text" thật —
  // sẽ lẫn vào kết quả và làm hai bài test trên xanh dù ô đang canh đã hỏng thành
  // type="number". Dựng đúng tình huống đó để chứng minh không xảy ra.
  it('catThe() không lem sang input khác — không xanh nhầm khi ô đang canh đã hỏng', () => {
    const jsxGia = [
      '<input',
      '  id={`${uid}-units`}',
      '  type="number"',
      '  onChange={(e) => setUnitsText(e.target.value)}',
      '/>',
      '<input id={`${uid}-note`} type="text" value={note} onChange={(e) => setNote(e.target.value)} />',
    ].join('\n')

    const the = catThe(jsxGia, 'id={`${uid}-units`}')

    // Thẻ cắt ra phải là đúng ô 口数 (thấy type="number" hỏng) — không được lem sang ô
    // ghi chú đứng sau (có type="text" và chữ "note").
    expect(the).toContain('type="number"')
    expect(the).not.toContain('type="text"')
    expect(the).not.toContain('note')
  })
})
