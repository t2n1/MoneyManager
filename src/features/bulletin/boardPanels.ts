// Dữ liệu cho bốn module "ngoài Bản tin cũ" — Sắp tới phải chi, Nợ / cho vay, Mục tiêu
// tiết kiệm, Gửi tiền về nhà. Thuần, không JSX.
//
// Như boardCharts.ts: KHÔNG có phép tính tiền mới. Cam kết đi qua `collectCommitments`
// (cùng hàm với tab Ngân sách và khối Hôm nay), nợ qua `debtBalance`, gửi tiền qua
// `remittanceStats`. File này chỉ lọc, xếp thứ tự và cắt theo tháng.
import { calendarYearOf, monthKeyForDate, type MonthKey } from '../../lib/dates'
import type { DebtPaymentRow, DebtRow, TransactionRow } from '../../types/database.types'
import type { Commitment } from '../budgets/commitments'
import { debtBalance, disbursedOf, repaidOf } from '../debts/aggregate'
import { remittanceStats, type RemittanceStats } from '../remittance/aggregate'
import { monthId } from '../reports/aggregate'
import { shortMonth } from './boardCharts'

/** Cửa sổ "sắp tới" — một tháng lịch kể từ hôm nay, không phụ thuộc ngày bắt đầu tháng. */
export const UPCOMING_DAYS = 30

/**
 * Cam kết xếp theo NGÀY (gần nhất trước), không theo tiền như tab Ngân sách: câu hỏi ở
 * đây là "sắp phải trả gì", không phải "khoản nào to". Khoản chỉ biết tháng (`'month'`)
 * xuống sau khoản có ngày cùng tháng — nó không có ngày để chen vào giữa.
 */
export function upcomingRows(items: readonly Commitment[]): Commitment[] {
  return [...items].sort((a, b) => {
    if (a.dueISO !== b.dueISO) return a.dueISO < b.dueISO ? -1 : 1
    if (a.duePrecision !== b.duePrecision) return a.duePrecision === 'day' ? -1 : 1
    return b.amount - a.amount
  })
}

// ---- Nợ / cho vay --------------------------------------------------------------------

export interface DebtRowView {
  id: string
  counterparty: string
  direction: DebtRow['direction']
  currency: DebtRow['currency']
  /** còn lại, theo tiền gốc của khoản nợ */
  remaining: number
  /** 0..1 — đã trả THỰC (bỏ lần giải ngân thêm) trên tổng đã giải ngân, cùng cặp số trang Nợ in */
  paidRatio: number
  dueOn: string | null
}

/**
 * Khoản nợ MỞ còn > 0, hạn gần nhất trước (khoản không hạn xuống cuối, to trước). Cùng
 * tập với `debtSummary`: khoản `settled` hay đã trả hết không còn là việc phải lo.
 */
export function debtRows(debts: readonly DebtRow[], payments: DebtPaymentRow[]): DebtRowView[] {
  const out: DebtRowView[] = []
  for (const d of debts) {
    if (d.status !== 'open') continue
    const b = debtBalance(d, payments)
    if (b.paidOff) continue
    const total = disbursedOf(d, payments)
    out.push({
      id: d.id,
      counterparty: d.counterparty,
      direction: d.direction,
      currency: d.currency,
      remaining: b.remaining,
      paidRatio: total > 0 ? Math.min(1, repaidOf(d.id, payments) / total) : 0,
      dueOn: d.due_on,
    })
  }
  return out.sort((a, b) => {
    if (a.dueOn && b.dueOn && a.dueOn !== b.dueOn) return a.dueOn < b.dueOn ? -1 : 1
    if (a.dueOn && !b.dueOn) return -1
    if (!a.dueOn && b.dueOn) return 1
    return b.remaining - a.remaining
  })
}

// ---- Gửi tiền về nhà -----------------------------------------------------------------

export interface RemitMonthRow {
  label: string
  /** số gửi gốc (đã trừ phí), minor JPY */
  sent: number
  /** phí, minor JPY */
  fee: number
  count: number
}

/** Mỗi tháng trong `months` một hàng — tháng không gửi là 0, không bị bỏ khỏi trục. */
export function remittanceMonths(
  txs: readonly TransactionRow[],
  months: readonly MonthKey[],
  monthStartDay: number,
): RemitMonthRow[] {
  const by = new Map<string, TransactionRow[]>()
  for (const t of txs) {
    if (!t.is_remittance) continue
    const id = monthId(monthKeyForDate(t.occurred_on, monthStartDay))
    const list = by.get(id)
    if (list) list.push(t)
    else by.set(id, [t])
  }
  return months.map((k) => {
    const s = remittanceStats(by.get(monthId(k)) ?? [])
    return { label: shortMonth(k), sent: s.totalSentJpy, fee: s.totalFeeJpy, count: s.count }
  })
}

/** Tổng NĂM DƯƠNG LỊCH — năm của hạn mức 38万 người phụ thuộc là năm dương lịch. */
export function remittanceYear(txs: readonly TransactionRow[], year: number): RemittanceStats {
  return remittanceStats(txs.filter((t) => calendarYearOf(t.occurred_on) === year) as TransactionRow[])
}

// ---- Nhập sao kê thẻ -----------------------------------------------------------------

/** Ngày giao dịch MỚI NHẤT của từng tài khoản (tài khoản nguồn). */
export function lastEntryByAccount(txs: readonly TransactionRow[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const t of txs) {
    const cur = out.get(t.account_id)
    if (!cur || t.occurred_on > cur) out.set(t.account_id, t.occurred_on)
  }
  return out
}
