// Lọc khoản nợ + lọc ví cho hai dạng trả nợ (repay / collect) — thuần, test được.
// Chỗ dễ sai của dạng này KHÔNG phải JSX mà là hai phép lọc dưới đây; rút ra module
// riêng để component chỉ còn việc bày ra (xem DebtPickerField.tsx).

import { remainingOf } from '../debts/aggregate'
import type { AccountRow, DebtDirection, DebtPaymentRow, DebtRow } from '../../types/database.types'

/** Khoản nợ kèm số CÒN LẠI đã tính sẵn — bày ra picker không cần tính lại. */
export type OpenDebt = DebtRow & { remaining: number }

/**
 * Khoản nợ ĐANG MỞ, ĐÚNG CHIỀU, còn > 0 (đã trả hết thì không còn gì để trả nữa).
 * Số còn lại lấy từ `remainingOf` (debts/aggregate) — KHÔNG tự tính lại
 * `principal - paidOf` ở đây, tránh hai công thức lệch nhau.
 */
export function openDebtsFor(
  debts: DebtRow[],
  payments: DebtPaymentRow[],
  direction: DebtDirection,
): OpenDebt[] {
  return debts
    .filter((d) => d.status === 'open' && d.direction === direction)
    .map((d) => ({ ...d, remaining: remainingOf(d, payments) }))
    .filter((d) => d.remaining > 0)
}

/**
 * Ví cho được trả nợ: mọi ví chưa lưu trữ, ví CÙNG TỆ với khoản nợ xếp lên trước.
 *
 * Bản v1 lọc thẳng theo `a.currency === debt.currency` ("tránh xuyên tệ"). Nhưng
 * xuyên tệ là ca THẬT, không phải ca hiếm: người ta nợ bằng Yên rồi trả bằng VNĐ vào
 * tài khoản Việt Nam. Lọc như cũ thì ví ₫ không hiện ra và không có đường nào ghi lần
 * trả đó — người dùng phải tự chẻ làm hai bút toán rời rồi mất luôn mối nối.
 *
 * Vì sao SẮP XẾP chứ không chỉ bỏ lọc: `pickerAccounts[0]` là ví mặc định của form
 * Nhập (TransactionForm), và `matchingAccounts[0]` là mặc định của DebtPaymentSheet.
 * Trả hết lượt theo thứ tự gốc thì một khoản nợ ¥ có thể mặc định vào ví ₫ — sai tệ
 * mà người dùng không bấm gì cả. Cùng tệ vẫn là ca thường, nên nó phải đứng đầu.
 *
 * Chưa chọn khoản nợ (`undefined`) → giữ nguyên thứ tự gốc, chưa có tệ nào để so.
 */
export function accountsForDebt(
  accounts: AccountRow[],
  debt: DebtRow | undefined,
): AccountRow[] {
  const active = accounts.filter((a) => !a.is_archived)
  if (debt === undefined) return active
  return [
    ...active.filter((a) => a.currency === debt.currency),
    ...active.filter((a) => a.currency !== debt.currency),
  ]
}

/**
 * Chọn một khoản nợ → điền sẵn TOÀN BỘ số còn lại (giống DebtPaymentSheet, đường
 * vào thứ nhất — hai đường vào cùng một vật thì phải cùng một nếp). Không tìm thấy
 * khoản nợ (đã bị xóa khỏi danh sách mở giữa lúc người dùng đang chọn) → không điền
 * gì, trả `null`.
 */
export function prefillFor(
  debts: DebtRow[],
  payments: DebtPaymentRow[],
  debtId: string,
): number | null {
  const debt = debts.find((d) => d.id === debtId)
  if (!debt) return null
  return remainingOf(debt, payments)
}
