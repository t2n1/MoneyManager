// Tài khoản ưu đãi thuế Nhật (NISA / iDeCo): hạn mức nạp tính theo NĂM DƯƠNG LỊCH
// và không dồn sang năm sau — không nạp là mất. Thuần, không phụ thuộc React.
import type { TaxShelter, TransactionRow } from '../../types/database.types'

export const TAX_SHELTER_LIST: TaxShelter[] = ['nisa_tsumitate', 'nisa_growth', 'ideco']

export const TAX_SHELTER_LABELS: Record<TaxShelter, string> = {
  nisa_tsumitate: 'NISA tích lũy (つみたて投資枠)',
  nisa_growth: 'NISA tăng trưởng (成長投資枠)',
  ideco: 'iDeCo (個人型確定拠出年金)',
}

/**
 * Hạn mức pháp định mặc định (JPY, minor units) để điền sẵn cho đỡ phải tra.
 * NISA mới từ 2024. iDeCo lấy mức phổ biến nhất của nhân viên công ty không có
 * 企業年金 (23.000/tháng) — người dùng sửa lại theo trường hợp của mình.
 */
export const SHELTER_DEFAULT_LIMIT_JPY: Record<TaxShelter, number> = {
  nisa_tsumitate: 1_200_000,
  nisa_growth: 2_400_000,
  ideco: 276_000,
}

export interface ShelterUsage {
  /** đã nạp trong năm (minor units theo currency tài khoản) */
  used: number
  /** hạn mức năm; null = chưa đặt */
  limit: number | null
  /** còn lại (≥ 0); null khi chưa đặt hạn mức */
  remaining: number | null
  /** tỷ lệ đã dùng (0..1+); null khi chưa đặt hạn mức */
  ratio: number | null
  /** số lần nạp trong năm */
  count: number
}

/**
 * Đã nạp bao nhiêu vào tài khoản này trong năm `year`.
 *
 * "Nạp" = CHUYỂN KHOẢN vào tài khoản (to_account_id trỏ tới nó). Tiền rút ra
 * KHÔNG được trừ lại: hạn mức NISA tính trên số tiền đã mua trong năm, bán ra
 * giữa năm cũng không hoàn lại phần hạn mức đó.
 *
 * Số tiền lấy `to_amount` khi chuyển xuyên tệ (đó mới là số thực nhận ở tài khoản đích).
 */
export function shelterUsage(
  accountId: string,
  txs: TransactionRow[],
  year: number,
  limit: number | null,
): ShelterUsage {
  let used = 0
  let count = 0
  const prefix = `${year}-`
  for (const t of txs) {
    if (t.type !== 'transfer' || t.to_account_id !== accountId) continue
    if (!t.occurred_on.startsWith(prefix)) continue
    used += t.to_amount ?? t.amount
    count++
  }
  return {
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    ratio: limit && limit > 0 ? used / limit : null,
    count,
  }
}
