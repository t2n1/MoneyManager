// Chi từng ngày trong tháng + ngày đỉnh + mấy khoản lớn nhất của mỗi ngày.
//
// Vì sao KHÔNG mở rộng `dailyExpenseTotals` trong aggregate.ts, dù nó cũng lặp qua đúng
// từng giao dịch này: `impact` cho ra 7 caller trực tiếp, trong đó `sixMonthDaily` chạy
// trên 180 ngày và `rhythm` (màn Sức khoẻ) trên cả năm. Bắt chúng gom top-3 mỗi ngày cho
// một thẻ duy nhất cần là phí, và `DailyExpensePoint` phình ra ở mọi chỗ dùng. Thà một
// file thuần riêng, blast radius bằng 0.
//
// Luật loại trừ ở đây phải TRÙNG KHÍT với aggregate.ts — hai chỗ đếm chi tháng 8 ra hai
// con số là lỗi tệ nhất mà một app tiền có thể mắc.

import { formatMoney, type CurrencyCode } from '../../lib/money'
import { convertToBase, type Rates } from '../../lib/rates'
import type { TransactionRow } from '../../types/database.types'
import { expenseSign, type CurrencyOf, type TransferIds } from './aggregate'

/** Một khoản chi trong ngày — id thô, KHÔNG phải tên: tra tên danh mục là việc của UI. */
export interface DayTopExpense {
  categoryId: string | null
  note: string | null
  /** base minor, dương */
  amount: number
}

export interface DaySpend {
  /** ISO yyyy-mm-dd */
  date: string
  /** base minor; có thể ÂM nếu ngày đó hoàn tiền nhiều hơn chi */
  total: number
  /** tối đa 3 khoản, giảm dần theo số tiền; không gồm khoản hoàn tiền */
  top: DayTopExpense[]
}

export interface DailySpendSeries {
  /** trọn khoảng ngày, 0 cho ngày trống */
  days: DaySpend[]
  /** Mức chi một ngày "thường" — TRUNG VỊ các ngày CÓ chi, base minor; 0 khi không có ngày nào. */
  typical: number
  /** Chỉ số ngày chi cao nhất trong `days`; -1 khi cả khoảng không chi. Bằng nhau → ngày sớm hơn. */
  peakIndex: number
  /** Có khoản chưa quy đổi được → mọi số ở đây là ước chừng */
  hasMissingRate: boolean
}

/** Số khoản hiện trong tooltip. Ba là đủ để biết "hôm đó có gì" mà không thành một danh sách. */
const TOP_N = 3

/**
 * Trung vị chứ không trung bình. Một tháng có 30 ngày lẻ tẻ và MỘT ngày trả tiền nhà thì
 * trung bình bị chính ngày tiền nhà kéo lên — mà đường này tồn tại để so với ngày đó.
 * Chỉ đếm ngày CÓ chi: ngày không tiêu gì không phải một mức chi, nó là không có số.
 */
function medianOf(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

/**
 * Chi từng ngày (base minor) từ startISO tới lastISO, đều gồm, kèm mấy khoản lớn nhất
 * mỗi ngày để trả lời "ngày đó có biến động gì".
 *
 * Loại trừ giống aggregate.ts: chỉ `type='expense'`, bỏ `is_debt_flow` và
 * `exclude_from_stats`, bỏ danh mục `kind='transfer'` (chuyển tài sản không phải tiêu),
 * `is_refund` là chi ÂM. Thiếu tỷ giá thì LOẠI khoản đó và bật `hasMissingRate` — không
 * bao giờ quy 1:1.
 */
export function dailySpendSeries(
  txs: TransactionRow[],
  startISO: string,
  lastISO: string,
  currencyOf: CurrencyOf,
  base: CurrencyCode,
  rates: Rates,
  transferIds: TransferIds,
): DailySpendSeries {
  const totals = new Map<string, number>()
  const tops = new Map<string, DayTopExpense[]>()
  let hasMissingRate = false

  for (const t of txs) {
    if (t.type !== 'expense' || t.is_debt_flow || t.exclude_from_stats) continue
    if (t.category_id !== null && transferIds.has(t.category_id)) continue
    const v = convertToBase(t.amount, currencyOf(t.account_id), base, rates)
    if (v === null) {
      hasMissingRate = true
      continue
    }
    const day = t.occurred_on
    totals.set(day, (totals.get(day) ?? 0) + v * expenseSign(t))
    // Hoàn tiền KHÔNG vào danh sách "khoản lớn nhất": nó là tiền quay về, xếp cạnh mấy
    // khoản đã tiêu là đọc ngược hẳn dấu.
    if (t.is_refund) continue
    const list = tops.get(day)
    if (list) list.push({ categoryId: t.category_id, note: t.note, amount: v })
    else tops.set(day, [{ categoryId: t.category_id, note: t.note, amount: v }])
  }

  const days: DaySpend[] = []
  const cur = new Date(startISO + 'T00:00:00Z')
  const last = new Date(lastISO + 'T00:00:00Z')
  while (cur <= last) {
    const date = cur.toISOString().slice(0, 10)
    const top = (tops.get(date) ?? []).sort((a, b) => b.amount - a.amount).slice(0, TOP_N)
    days.push({ date, total: totals.get(date) ?? 0, top })
    cur.setUTCDate(cur.getUTCDate() + 1)
  }

  let peakIndex = -1
  for (let i = 0; i < days.length; i++) {
    // `>` chứ không `>=`: bằng nhau thì giữ ngày SỚM hơn, để nhãn đỉnh không nhảy chỗ
    // mỗi lần thêm một ngày trùng số.
    if (days[i].total > 0 && (peakIndex === -1 || days[i].total > days[peakIndex].total)) {
      peakIndex = i
    }
  }

  return {
    days,
    typical: medianOf(days.filter((d) => d.total > 0).map((d) => d.total)),
    peakIndex,
    hasMissingRate,
  }
}

/** Nhãn ngày ngắn "20/08" — dùng chung cho trục x, tooltip và nhãn đỉnh. */
export function dayLabel(iso: string): string {
  return `${iso.slice(8)}/${iso.slice(5, 7)}`
}

/** Nhãn đỉnh trên biểu đồ: "20/08 · ¥84.200". */
export function peakLabel(day: DaySpend, base: CurrencyCode): string {
  return `${dayLabel(day.date)} · ${formatMoney(day.total, base)}`
}
