// Chọn khoản nợ mà 立替経費精算 trên phiếu lương trừ vào — THUẦN, không React.
//
// Trước đây trang nhập chỉ nhận khoản tên ĐÚNG TỪNG KÝ TỰ `KOME` (nhap.ts TEN_NO_CONG_TY):
// đặt tên lệch một chữ là phiếu lặng lẽ không trừ nợ. Không chuyển sang khớp "chứa" được —
// sổ thật có `Minh KOME`, một NGƯỜI khác. Nên để người dùng CHỌN, lưu theo ID khoản nợ;
// tên đúng `KOME` chỉ còn là gợi ý chọn sẵn, không bao giờ tự chọn một tên gần giống.
import type { DebtPaymentRow, DebtRow } from '../../types/database.types'
import { remainingOf } from '../debts/aggregate'
import { TEN_NO_CONG_TY, type NoCongTy } from './nhap'

/** Giá trị lưu khi người dùng chọn "Không trừ vào nợ". */
export const KHONG_TRU_NO = 'none'

/** Các khoản có thể nhận 立替経費精算: người ta nợ mình, còn mở. */
export function khoanNoCoTheChon(debts: DebtRow[]): DebtRow[] {
  return debts.filter((d) => d.direction === 'owed_to_me' && d.status === 'open')
}

/**
 * ID khoản nợ chọn sẵn; null = không trừ vào nợ.
 * `daLuu`: lựa chọn đã lưu (id, KHONG_TRU_NO, hoặc null = chưa từng chọn).
 * Khoản đã lưu không còn mở thì quay về luật mặc định: tên đúng `KOME`, không thì không trừ.
 */
export function chonNoMacDinh(debts: DebtRow[], daLuu: string | null): string | null {
  if (daLuu === KHONG_TRU_NO) return null
  const ds = khoanNoCoTheChon(debts)
  if (daLuu && ds.some((d) => d.id === daLuu)) return daLuu
  return ds.find((d) => d.counterparty === TEN_NO_CONG_TY)?.id ?? null
}

/** Khoản đã chọn kèm số còn nợ, đúng hình dạng dungKeHoach cần. */
export function noDaChon(debts: DebtRow[], payments: DebtPaymentRow[], id: string | null): NoCongTy | null {
  if (!id) return null
  const d = debts.find((x) => x.id === id)
  if (!d) return null
  return { id: d.id, conLai: remainingOf(d, payments), ten: d.counterparty }
}

/** Tên gần giống `KOME` (không phân biệt hoa/thường) — để nhắc người dùng xem có phải khoản đó không. */
export function tenGanGiong(debts: DebtRow[]): string[] {
  const k = TEN_NO_CONG_TY.toLowerCase()
  return khoanNoCoTheChon(debts)
    .filter((d) => d.counterparty !== TEN_NO_CONG_TY && d.counterparty.toLowerCase().includes(k))
    .map((d) => d.counterparty)
}

/**
 * Khoá localStorage giữ lựa chọn khoản nợ — GẮN THEO NGƯỜI DÙNG. Khoá chung cho cả máy thì
 * demo (hoặc người khác đăng nhập cùng trình duyệt) thừa hưởng lựa chọn của chủ sổ: một id
 * khoản nợ không có ở sổ của họ. `chonNoMacDinh` vẫn rơi về mặc định được, nhưng lựa chọn
 * "Không trừ vào nợ" thì đi xuyên qua mọi sổ.
 */
export function khoaLuuNo(userId: string): string {
  return `phieu-luong:no-lap-theo:${userId}`
}

/** Khoá cũ không gắn người dùng (trước 09/2026) — chỉ để dọn, không đọc. */
export const KHOA_LUU_NO_CU = 'phieu-luong:no-lap-theo'
