// Lọc khoản nợ + lọc ví cho hai dạng trả nợ (repay / collect) — thuần, test được.
// Chỗ dễ sai của dạng này KHÔNG phải JSX mà là hai phép lọc dưới đây; rút ra module
// riêng để component chỉ còn việc bày ra (xem DebtPickerField.tsx).

import { overpayOf, remainingOf } from '../debts/aggregate'
import type { AccountRow, DebtDirection, DebtPaymentRow, DebtRow } from '../../types/database.types'
import type { PaymentValue } from './roleSave'

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

/** Một dòng của ô "Khoản nợ nào": `paidOff` = đã tất toán (còn ≤ 0 hoặc đã đóng). */
export type PickerDebt = OpenDebt & { paidOff: boolean }

/**
 * Danh sách cho ô chọn khoản nợ. Mặc định CHỈ khoản đang mở còn > 0 (openDebtsFor) —
 * khoản đã trả hết không còn gì để trả, bày ra chỉ mời ghi trả vượt.
 *
 * Ngoại lệ: khoản ĐANG ĐƯỢC CHỌN mà đã tất toán (dữ liệu vừa cập nhật dưới chân, ví dụ
 * một lần trả ở tab khác) thì vẫn giữ, đánh dấu `paidOff`. Bỏ nó đi thì <Select> mất
 * dòng đang chọn và hiện "— chọn —" trong khi `debtId` vẫn còn — người dùng tưởng
 * chưa chọn gì mà nút Lưu vẫn sáng. Khoản sai chiều thì không kéo vào, dù đang chọn.
 * Còn lại ≤ 0 thì `remaining` kẹp về 0 (số "còn" hiển thị không được âm).
 */
export function debtsForPicker(
  debts: DebtRow[],
  payments: DebtPaymentRow[],
  direction: DebtDirection,
  selectedId: string,
): PickerDebt[] {
  const list: PickerDebt[] = openDebtsFor(debts, payments, direction).map((d) => ({
    ...d,
    paidOff: false,
  }))
  if (selectedId && !list.some((d) => d.id === selectedId)) {
    const d = debts.find((x) => x.id === selectedId && x.direction === direction)
    if (d) list.push({ ...d, remaining: Math.max(remainingOf(d, payments), 0), paidOff: true })
  }
  return list
}

/**
 * Lần trả này vượt số còn lại bao nhiêu, tính theo TỆ KHOẢN NỢ.
 *
 * Cùng tệ: số xoá nợ chính là ô tiền lớn (`amount`). Khác tệ (nợ ¥, ví ₫): số xoá nợ
 * là ô "Xoá bao nhiêu nợ" (`payment.debtAmount`) — KHÔNG so ô tiền lớn, vì đó là tiền
 * của ví (4.000.000 ₫ không "vượt" một khoản nợ ¥20.000). Ô đó chưa gieo (null) thì coi
 * như 0: mượn số của tệ ví để báo thừa là báo sai.
 */
export function paymentOverpay(
  remaining: number,
  payment: Pick<PaymentValue, 'debtAmount'>,
  amount: number,
  cross: boolean,
): number {
  return overpayOf(remaining, paymentDebtSide(payment, amount, cross))
}

/** Số xoá nợ của lần trả (tệ khoản nợ) — xem paymentOverpay. */
export function paymentDebtSide(
  payment: Pick<PaymentValue, 'debtAmount'>,
  amount: number,
  cross: boolean,
): number {
  return cross ? (payment.debtAmount ?? 0) : amount
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
