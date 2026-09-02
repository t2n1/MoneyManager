import type { DebtDirection } from '../../types/database.types'

/**
 * "Vai trò đặc biệt" của một lần nhập: ngoài giao dịch thường, form Nhập có thể
 * đóng vai Trả hộ / Cho vay-Nợ / Gửi về VN. Mỗi vai trò dùng chung field gốc
 * (số tiền, tài khoản, ngày, ghi chú) và chỉ thêm vài field riêng.
 */
export type EntryRole = 'none' | 'split' | 'debt' | 'remit'

/** Người kia đã hoàn tiền chưa — quyết định có sinh khoản cho vay hay không. */
export type SplitSettle = 'now' | 'later'

/** Giá trị field riêng của từng vai trò (controlled — form gốc giữ state). */
export interface SplitValue {
  /** minor units — phần người khác trả lại / nợ lại (đã bao trong Tổng đã trả). */
  others: number
  counterparty: string
  /** id khoản cho vay đang mở để cộng dồn (chọn người cũ); null = tạo khoản mới. */
  existingDebtId: string | null
  /**
   * 'now' = đã đưa lại tiền ngay → KHÔNG có khoản nợ nào tồn tại, chỉ ghi phần
   * của mình + (nếu tiền về ví khác) một chuyển khoản. 'later' = còn nợ → tạo
   * hoặc cộng dồn khoản cho vay như trước.
   */
  settle: SplitSettle
  /**
   * Ví nhận lại tiền khi settle='now'. '' = về chính tài khoản đã trả → không
   * sinh chuyển khoản (tiền ra tiền vào cùng một chỗ, đã triệt tiêu).
   */
  receivedAccountId: string
}
export interface DebtValue {
  direction: DebtDirection
  counterparty: string
  /** id khoản nợ đang mở để cộng dồn (chọn người cũ); null = tạo khoản mới. */
  existingDebtId: string | null
  /** Có tạo giao dịch giải ngân thật (đổi số dư) hay chỉ ghi sổ nợ. */
  withTransaction: boolean
  dueOn: string
  /** %/năm dạng chuỗi người dùng gõ (vd "5.5"); '' = không. */
  interestPct: string
  /** số kỳ/tháng dạng chuỗi; '' = không. */
  termMonths: string
  /**
   * Phí giao dịch (minor units theo tài khoản nguồn); 0 = không có.
   * Lưu thành một giao dịch CHI riêng vào danh mục "Tài chính", không cộng vào gốc nợ.
   */
  fee: number
}
export interface RemitValue {
  /** expense = Hỗ trợ gia đình; transfer = Chuyển tài sản (JPY→VND). */
  kind: 'expense' | 'transfer'
  /** tài khoản VND đích (chỉ khi kind=transfer). */
  destId: string
  /** phí dịch vụ, minor units JPY. */
  fee: number
  /** số nhận, minor units VND. */
  received: number
  service: string
  /** Người thân nhận (relatives.id); '' = chưa chọn → ghi null. */
  recipientId: string
}

export const SERVICES = ['Wise', 'SBI Remit', 'Brastel', 'DCOM', 'Khác'] as const

// Mặc định 'now': ca thường ngày là người kia đưa lại tiền tại chỗ, lúc đó không
// có món nợ nào để theo dõi. Chọn 'later' khi tiền về sau.
export const initialSplit = (): SplitValue => ({
  others: 0,
  counterparty: '',
  existingDebtId: null,
  settle: 'now',
  receivedAccountId: '',
})
export const initialDebt = (): DebtValue => ({
  direction: 'i_owe',
  counterparty: '',
  existingDebtId: null,
  withTransaction: true,
  dueOn: '',
  interestPct: '',
  termMonths: '',
  fee: 0,
})
export const initialRemit = (): RemitValue => ({
  kind: 'expense',
  destId: '',
  fee: 0,
  received: 0,
  service: SERVICES[0],
  recipientId: '',
})

// Ba hàm dẫn xuất theo vai trò (loại giao dịch · nhãn ô số tiền · có ẩn lưới danh mục)
// đã chuyển thành BẢNG trong entryShape.ts (`txType`, `amountLabel`, `categoryPicker`).
// Chúng trả lời ba câu hỏi khác nhau về cùng một khoản, ở ba chỗ khác nhau — nên thêm
// một dạng là phải nhớ sửa cả ba, và quên một cái thì form hiện đúng mà ghi sai.

/** Ép ?role= từ URL về EntryRole hợp lệ. */
export function parseRoleParam(v: string | null): EntryRole {
  return v === 'split' || v === 'debt' || v === 'remit' ? v : 'none'
}
