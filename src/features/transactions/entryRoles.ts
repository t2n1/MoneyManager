import type { DebtDirection, TransactionType } from '../../types/database.types'

/**
 * "Vai trò đặc biệt" của một lần nhập: ngoài giao dịch thường, form Nhập có thể
 * đóng vai Trả hộ / Cho vay-Nợ / Gửi về VN. Mỗi vai trò dùng chung field gốc
 * (số tiền, tài khoản, ngày, ghi chú) và chỉ thêm vài field riêng.
 */
export type EntryRole = 'none' | 'split' | 'debt' | 'remit'
export type SpecialRole = Exclude<EntryRole, 'none'>

/** Giá trị field riêng của từng vai trò (controlled — form gốc giữ state). */
export interface SplitValue {
  /** minor units — phần người khác nợ lại (đã bao trong Tổng đã trả). */
  others: number
  counterparty: string
  /** id khoản cho vay đang mở để cộng dồn (chọn người cũ); null = tạo khoản mới. */
  existingDebtId: string | null
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
}

export const SERVICES = ['Wise', 'SBI Remit', 'Brastel', 'DCOM', 'Khác'] as const

export const initialSplit = (): SplitValue => ({ others: 0, counterparty: '', existingDebtId: null })
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
})

/**
 * Loại giao dịch dùng để lọc lưới danh mục + màu số tiền theo vai trò.
 * - split: luôn Chi.
 * - debt: Cho vay (owed_to_me) = tiền ra = Chi; Mình nợ (i_owe) = tiền vào = Thu.
 * - remit: không dùng lưới danh mục (trả 'expense' cho màu, danh mục bị ẩn).
 */
export function roleTxType(role: EntryRole, debt: DebtValue): TransactionType {
  if (role === 'debt') return debt.direction === 'owed_to_me' ? 'expense' : 'income'
  return 'expense'
}

/** Nhãn ô số tiền theo vai trò (null = giữ nhãn mặc định của form). */
export function roleAmountLabel(role: EntryRole): string | null {
  switch (role) {
    case 'split':
      return 'Tổng đã trả'
    case 'debt':
      return 'Số tiền gốc'
    case 'remit':
      return 'Số gửi (JPY)'
    default:
      return null
  }
}

/** Vai trò tự khóa/tự chọn danh mục → ẩn lưới danh mục lớn của form. */
export function roleHidesCategoryGrid(role: EntryRole, debt: DebtValue): boolean {
  // Remit tự chọn danh mục "Gửi tiền về VN" (hoặc transfer không danh mục).
  if (role === 'remit') return true
  // Ghi sổ nợ không chuyển tiền thật → không cần danh mục.
  if (role === 'debt' && !debt.withTransaction) return true
  return false
}

/** Ép ?role= từ URL về EntryRole hợp lệ. */
export function parseRoleParam(v: string | null): EntryRole {
  return v === 'split' || v === 'debt' || v === 'remit' ? v : 'none'
}
