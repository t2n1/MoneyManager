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
import type { DateOrder } from './csvImport'

export interface StatementFormat {
  id: string
  /** Tên hiện cho người dùng thấy: "Đã nhận ra sao kê …" */
  label: string
  negativeIsExpense: boolean
  dateOrder: DateOrder
}

/**
 * Quy chữ rộng (ＡＢＣ) về chữ hẹp, bỏ khoảng trắng, hạ chữ thường. Sao kê Nhật
 * trộn hai bề rộng chữ tùy nơi xuất file, so thô là trượt.
 */
const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase()

interface FormatSpec extends StatementFormat {
  /** Dòng tiêu đề phải chứa ĐỦ các mẩu này thì mới nhận — một mẩu là quá lỏng. */
  needles: string[]
}

const FORMATS: FormatSpec[] = [
  {
    id: 'paypay',
    label: 'PayPay Card',
    // Khoản mua = số dương.
    negativeIsExpense: false,
    dateOrder: 'ymd',
    needles: ['利用日/キャンセル日', '決済方法'],
  },
]

/** Nhận dạng sao kê từ dòng tiêu đề; null = file lạ, giữ nguyên lựa chọn của người dùng. */
export function detectStatementFormat(rows: string[][]): StatementFormat | null {
  const header = rows[0]
  if (!header) return null
  const joined = header.map(norm).join('|')
  for (const f of FORMATS) {
    if (f.needles.every((n) => joined.includes(norm(n)))) {
      return {
        id: f.id,
        label: f.label,
        negativeIsExpense: f.negativeIsExpense,
        dateOrder: f.dateOrder,
      }
    }
  }
  return null
}
