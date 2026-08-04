// Ảnh hưởng của MỘT giao dịch lên số dư của MỘT tài khoản — một nguồn sự thật
// duy nhất cho mọi chỗ tính số dư ở tầng ứng dụng.
//
// Phải khớp từng nhánh với biểu thức `case` trong view account_balances
// (migration 0026). Trước đây engine tự-trả thẻ chép lại logic này và bỏ sót
// `is_refund`: hoàn tiền trên thẻ bị tính là chi (nợ TĂNG) trong khi view tính
// là giảm nợ — số app rút vào ngày đến hạn lệch khỏi số app hiển thị.

/** Phần của giao dịch cần để tính số dư (TransactionRow thỏa type này). */
export interface BalanceTxLike {
  type: 'expense' | 'income' | 'transfer'
  amount: number
  to_amount: number | null
  account_id: string
  to_account_id: string | null
  /** Hoàn tiền: chi mang dấu âm → cộng vào số dư. */
  is_refund?: boolean
}

/** Số cộng vào số dư của `accountId` do giao dịch `t` gây ra; 0 nếu không liên quan. */
export function txBalanceDelta(t: BalanceTxLike, accountId: string): number {
  if (t.account_id === accountId) {
    if (t.type === 'income') return t.amount
    if (t.type === 'expense') return t.is_refund ? t.amount : -t.amount
    return -t.amount // transfer đi
  }
  if (t.type === 'transfer' && t.to_account_id === accountId) return t.to_amount ?? t.amount
  return 0
}
