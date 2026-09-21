// Nhận ra sao kê quen mặt ngay từ dòng tiêu đề, để đặt sẵn CHIỀU TIỀN cho đúng.
//
// VÌ SAO CẦN: mặc định của trang nhập là "số âm là chi" — đúng với sao kê ngân
// hàng, nhưng SAI với PayPay. PayPay ghi khoản mua là số DƯƠNG, chỉ hoàn tiền
// mới là số âm. Đặt nhầm chiều thì toàn bộ khoản mua biến thành khoản THU và
// không có dòng cảnh báo nào bật lên: đo trên 13 file thật của người dùng là
// 229 khoản chi hóa thành 229 khoản thu, ~¥41.600/tháng thu nhập ảo.
//
// Bảng FORMATS cố tình để rỗng chỗ mở rộng: thêm sao kê mới = thêm một dòng,
// không phải sửa logic.
//
// NƠI DUY NHẤT trả lời "file này của nhà thẻ nào". Trước đây câu đó được trả lời ở BA
// chỗ: file này, `paypayStatement.ts` và `rakutenStatement.ts` của màn Đối chiếu. Phần
// PayPay ba chỗ giống nhau từng ký tự; phần Rakuten thì hai luật KHÁC NHAU cho cùng một
// câu hỏi, nên một file enavi kiểu mới có thể được màn này nhận và màn kia không. Hai bộ
// đọc kia nay gọi `detectIssuerFromHeader` thay vì giữ bảng chữ riêng.
//
// SO KHỚP TUYỆT ĐỐI TỪNG CỘT, không phải tìm chuỗi con trong cả dòng tiêu đề. Cột ngày
// của PayPay tên `利用日/キャンセル日`, của Rakuten tên `利用日`: tìm chuỗi con thì hai
// cái dính nhau, phải lôi thêm một cột thứ ba vào làm trọng tài (luật cũ ở đây dùng
// `繰越残高` đúng vì lẽ đó). Khớp tuyệt đối tách được ngay, nên bảng dưới chỉ cần đúng
// những cột đặc trưng của mỗi nhà thẻ.
import type { DateOrder } from './csvImport'

/** Nhà thẻ mà repo này biết đọc sao kê. */
export type IssuerId = 'paypay' | 'rakuten'

export interface StatementFormat {
  id: IssuerId
  /** Tên hiện cho người dùng thấy: "Đã nhận ra sao kê …" */
  label: string
  negativeIsExpense: boolean
  dateOrder: DateOrder
}

/**
 * Chuẩn hoá MỘT Ô tiêu đề: bỏ BOM, quy chữ rộng (ＡＢＣ) về chữ hẹp, bỏ khoảng trắng,
 * hạ chữ thường.
 *
 * BOM phải bỏ tường minh dù `\s` của JS đã nuốt `﻿`: cột đầu của mọi file enavi
 * tải về đều dính BOM, và đó đúng là cột `利用日` mà luật Rakuten đang soi — để nó phụ
 * thuộc vào một chi tiết ngoài lề của `\s` thì lần ai đó đổi `norm` là hỏng lặng lẽ.
 */
const normCol = (s: string) =>
  String(s ?? '')
    .replace(/^﻿/, '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase()

interface FormatSpec extends StatementFormat {
  /** Dòng tiêu đề phải có ĐỦ các cột này, khớp tuyệt đối sau khi chuẩn hoá. */
  columns: string[]
}

const FORMATS: FormatSpec[] = [
  {
    id: 'paypay',
    label: 'PayPay Card',
    // Khoản mua = số dương.
    negativeIsExpense: false,
    dateOrder: 'ymd',
    columns: ['利用日/キャンセル日', '決済方法'],
  },
  {
    id: 'rakuten',
    label: 'Rakuten Card (e-NAVI)',
    // Khoản mua = số dương, giống PayPay.
    negativeIsExpense: false,
    dateOrder: 'ymd',
    // Đủ cho cả ba bố cục enavi đã gặp (10, 11 và 12 cột): bản 12 cột bỏ `新規サイン`
    // nên không dùng cột đó được. PayPay không lọt vì cột ngày của nó là
    // `利用日/キャンセル日`, khác `利用日` khi so tuyệt đối.
    columns: ['利用日', '利用店名・商品名'],
  },
]

/**
 * Nhà thẻ đứng sau dòng tiêu đề này; null = file lạ.
 *
 * Nhận thẳng mảng ô tiêu đề (không phải cả bảng) để hai bộ đọc của màn Đối chiếu gọi
 * được sau khi chúng đã tự tách CSV.
 */
export function detectIssuerFromHeader(header: string[] | undefined): IssuerId | null {
  if (!header || header.length === 0) return null
  const cols = header.map(normCol)
  for (const f of FORMATS) {
    if (f.columns.every((c) => cols.includes(normCol(c)))) return f.id
  }
  return null
}

/** Nhận dạng sao kê từ dòng tiêu đề; null = file lạ, giữ nguyên lựa chọn của người dùng. */
export function detectStatementFormat(rows: string[][]): StatementFormat | null {
  const id = detectIssuerFromHeader(rows[0])
  const f = FORMATS.find((x) => x.id === id)
  if (!f) return null
  return {
    id: f.id,
    label: f.label,
    negativeIsExpense: f.negativeIsExpense,
    dateOrder: f.dateOrder,
  }
}
