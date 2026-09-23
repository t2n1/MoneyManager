// Dựng lại một giao dịch từ dòng đã có: cho nút "Hoàn tác" (xoá lẻ, xoá hàng loạt) và cho
// "Nhân bản sang hôm nay".
//
// Bỏ sót một cột ở đây thì hoàn tác ra một giao dịch KHÁC cái vừa xoá — bản chép tay cũ
// đã đánh rơi `is_refund`, `exclude_from_stats`, rồi `adjust_kind`: hoàn tác một khoản bù
// là nó mất dấu, người dùng sửa ghi chú là nó bị tính thành tiền quẹt. Nên mọi cột đi qua
// MỘT bảng khai theo `keyof TransactionRow`: thêm cột mới vào kiểu mà quên khai ở đây là
// tsc đỏ, không phải một bug im lặng.
//
// Hai chế độ khác nhau ở các dấu HỆ THỐNG đặt (không phải người dùng chọn):
//   · hoàn tác: giữ tất cả — phải ra đúng dòng vừa xoá.
//   · nhân bản: bỏ dấu khoản bù, liên kết lệnh cổ phiếu, liên kết quy tắc định kỳ. Bản sao
//     do người dùng tự tạo hôm nay: nó không phải khoản bù của nút nào, không phải dòng
//     tiền của lệnh nào (unique index cũng không cho hai dòng một lệnh), không do quy tắc
//     định kỳ nào sinh ra.
import type { NewTransaction } from '../../data'
import type { TransactionRow } from '../../types/database.types'

/**
 * 'giu'        chép ở cả hai chế độ
 * 'hoan-tac'   chỉ chép khi hoàn tác (dấu hệ thống)
 * 'khong'      không bao giờ chép (định danh / mốc thời gian của DB)
 */
type CachChep = 'giu' | 'hoan-tac' | 'khong'

export const CACH_CHEP: { [K in keyof Required<TransactionRow>]: CachChep } = {
  id: 'khong',
  user_id: 'khong',
  created_at: 'khong',
  updated_at: 'khong',
  type: 'giu',
  amount: 'giu',
  to_amount: 'giu',
  category_id: 'giu',
  account_id: 'giu',
  to_account_id: 'giu',
  occurred_on: 'giu',
  note: 'giu',
  is_remittance: 'giu',
  remit_service: 'giu',
  remit_fee_jpy: 'giu',
  remit_received_vnd: 'giu',
  remit_recipient_id: 'giu',
  is_debt_flow: 'giu',
  exclude_from_stats: 'giu',
  // Người dùng chọn trong sheet bù ("đây là tiền đã tiêu"), đi theo danh mục bù — giữ.
  adjust_is_spend: 'giu',
  is_refund: 'giu',
  // Ai chi — bản sao "cái hôm qua, lặp lại hôm nay" vẫn là của người đó.
  owner: 'giu',
  // Cổ tức/phí lưu ký của mã nào — người dùng gán, lặp lại hằng kỳ là chuyện thường.
  stock_symbol: 'giu',
  adjust_kind: 'hoan-tac',
  stock_trade_id: 'hoan-tac',
  recurring_rule_id: 'hoan-tac',
}

function chep(t: TransactionRow, tagIds: string[], hoanTac: boolean): NewTransaction {
  const out: Record<string, unknown> = {}
  for (const [k, cach] of Object.entries(CACH_CHEP) as [keyof TransactionRow, CachChep][]) {
    if (cach === 'khong' || (cach === 'hoan-tac' && !hoanTac)) continue
    // Dòng đọc từ DB chưa có cột thì không có khoá — không gửi khoá đó lên.
    if (t[k] !== undefined) out[k] = t[k]
  }
  // Chỉ gắn khi có: `tag_ids` rỗng vẫn là "ghi đè bằng danh sách rỗng", không sai ở đây
  // nhưng để trống thì payload gọn và ý cũng rõ hơn.
  if (tagIds.length > 0) out.tag_ids = tagIds
  return out as unknown as NewTransaction
}

/** Hoàn tác xoá: dựng lại ĐÚNG dòng vừa xoá (id mới). */
export function toNewTransaction(t: TransactionRow, tagIds: string[] = []): NewTransaction {
  return chep(t, tagIds, true)
}

/** Nhân bản: bản sao do người dùng tạo — bỏ các dấu hệ thống (xem đầu file). */
export function toDuplicateTransaction(t: TransactionRow, tagIds: string[] = []): NewTransaction {
  return chep(t, tagIds, false)
}
