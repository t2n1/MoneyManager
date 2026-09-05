// Helper thuần dùng chung cho các view của Sổ Giao dịch (Daily/Calendar/Monthly/Summary).
// Mọi số tiền quy đổi về base qua convertToBase; thiếu tỷ giá → trả null để caller fallback.

import { formatMoney, type CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'
import { expenseSign } from '../reports/aggregate'

export const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']
export const WEEKDAYS_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

export type CurrencyOf = (accountId: string) => CurrencyCode

/** 'YYYY-MM-DD' → "Thứ hai, 7/7" (tháng/ngày). */
export function formatDayHeader(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${m}/${d}`
}

/**
 * Hai NỬA của header ngày (redesign 2): số "9/5" đi bằng mono đậm, thứ đi bằng nhãn
 * chữ hoa — hai kiểu chữ khác nhau nên không ghép được thành một chuỗi như
 * formatDayHeader (bản đó còn dùng ở màn Tìm kiếm, giữ nguyên).
 */
export function splitDayHeader(dateISO: string): { date: string; weekday: string } {
  const [y, m, d] = dateISO.split('-').map(Number)
  return { date: `${m}/${d}`, weekday: WEEKDAYS[new Date(y, m - 1, d).getDay()] }
}

export interface Sum {
  value: number
  hasForeign: boolean
}

/**
 * Tổng thu/chi quy đổi về base. Trả về:
 * - {value, hasForeign} khi đủ tỷ giá
 * - null khi thiếu tỷ giá → caller fallback (tách loại tiền)
 * Chuyển khoản, dòng tiền nợ/cho vay (is_debt_flow) và giao dịch nội bộ
 * (exclude_from_stats) KHÔNG tính vào thu/chi — giống mọi module báo cáo.
 * Hoàn tiền là chi ÂM (`expenseSign`), cũng giống mọi module báo cáo: cộng dồn
 * nó vào chi thì ô "Chi" của Sổ cao hơn Báo cáo đúng hai lần khoản hoàn.
 */
export function sumInBase(
  txs: TransactionRow[],
  kind: 'income' | 'expense',
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates | undefined,
): Sum | null {
  let value = 0
  let hasForeign = false
  for (const t of txs) {
    if (t.type !== kind || t.is_debt_flow || t.exclude_from_stats) continue
    const cur = currencyOf(t.account_id)
    if (cur !== base) hasForeign = true
    const v = convertToBase(t.amount, cur, base, rates ?? {})
    if (v === null) return null
    value += kind === 'expense' ? v * expenseSign(t) : v
  }
  return { value, hasForeign }
}

/** Fallback khi thiếu tỷ giá: tổng theo từng loại tiền, ví dụ "¥3.280 · 1.500.000 ₫". */
export function sumPerCurrency(
  txs: TransactionRow[],
  kind: 'income' | 'expense',
  currencyOf: CurrencyOf,
): string {
  const sums = new Map<CurrencyCode, number>()
  for (const t of txs) {
    if (t.type !== kind || t.is_debt_flow || t.exclude_from_stats) continue
    const cur = currencyOf(t.account_id)
    sums.set(cur, (sums.get(cur) ?? 0) + (kind === 'expense' ? t.amount * expenseSign(t) : t.amount))
  }
  if (sums.size === 0) return '0'
  return [...sums.entries()].map(([cur, v]) => formatMoney(v, cur)).join(' · ')
}

/**
 * Phần thu/chi KHÔNG có danh mục = tổng thật − tổng đã gộp theo danh mục.
 *
 * `categoryBreakdown` bỏ giao dịch thiếu `category_id` (hàng nhập từ CSV/Zaim rất
 * hay thiếu), nên lấy `total` của nó làm "Tổng chi tháng này" là ra một số NHỎ HƠN
 * ô Chi ở tab Ngày, cùng một tháng, cùng một trang. Tab Ngân sách đã xử ca này
 * bằng `foldUncategorized`; đây là bản cho danh sách.
 *
 * Kẹp ≥ 0: tổng thật nhỏ hơn tổng theo danh mục là chuyện không nên xảy ra (chỉ
 * xảy ra khi một danh mục bị hoàn tiền âm và `categoryBreakdown` đã bỏ lát đó ra),
 * và khi đó thà không hiện dòng nào còn hơn hiện một số âm vô nghĩa.
 */
export function uncategorizedAmount(realTotal: number, categorizedTotal: number): number {
  return Math.max(0, Math.round(realTotal - categorizedTotal))
}

export interface AmountDisplay {
  sign: '+' | '-' | ''
  /** 'in' = màu thu · 'out' = màu chi · 'muted' = xám (không nằm trong Thu/Chi) */
  tone: 'in' | 'out' | 'muted'
}

/**
 * Dấu và màu của số tiền trên một dòng giao dịch.
 *
 * Quy ước một câu: **xám = khoản này KHÔNG nằm trong ô Thu/Chi**. Trước đây chỉ
 * chuyển khoản được xám, còn bút toán điều chỉnh số dư và dòng tiền nợ/cho vay
 * vẫn đỏ y hệt một khoản chi thật — người đọc cộng các dòng trong ngày lại thì
 * không ra con số ở đầu ngày, mà không có gì trên màn hình giải thích vì sao.
 * Ba loại đó bị `sumInBase` bỏ qua nên phải nhìn ra được là chúng đứng ngoài.
 *
 * Dấu vẫn giữ (trừ chuyển khoản) vì tiền có ra có vào thật — chỉ là không được
 * tính vào thu/chi.
 *
 * Hoàn tiền thì NGƯỢC LẠI: nó vẫn nằm trong Chi (dưới dạng số âm), và tiền quay
 * lại ví nên mang dấu +. Có vậy tổng đầu ngày mới bằng đúng tổng các dòng.
 */
export function amountDisplay(
  t: Pick<TransactionRow, 'type' | 'is_refund' | 'is_debt_flow' | 'exclude_from_stats'>,
): AmountDisplay {
  if (t.type === 'transfer') return { sign: '', tone: 'muted' }
  const sign = t.type === 'income' ? '+' : '-'
  if (t.is_debt_flow || t.exclude_from_stats) return { sign, tone: 'muted' }
  if (t.type === 'expense' && t.is_refund) return { sign: '+', tone: 'in' }
  return { sign, tone: t.type === 'income' ? 'in' : 'out' }
}

/** "≈ ¥123.456" nếu có ngoại tệ, ngược lại "¥123.456". */
export function approxLabel(r: Sum, base: CurrencyCode): string {
  return `${r.hasForeign ? '≈ ' : ''}${formatMoney(r.value, base)}`
}

/** Gộp giao dịch theo ngày (giữ nguyên thứ tự giảm dần từ repo). */
export function groupByDay(txs: TransactionRow[]): [string, TransactionRow[]][] {
  const map = new Map<string, TransactionRow[]>()
  for (const t of txs) {
    const list = map.get(t.occurred_on) ?? []
    list.push(t)
    map.set(t.occurred_on, list)
  }
  return [...map.entries()]
}
